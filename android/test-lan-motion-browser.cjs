// Packaged Android UI in an isolated host. No tablet, printer, or real operations.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.EL_MUELLE_PLAYWRIGHT||'playwright');
const baseline=process.argv.includes('--baseline'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const root=fs.mkdtempSync(path.resolve(__dirname,'../.dev/lan-motion-')),token=crypto.randomBytes(32).toString('hex');
 const result={passed:false,baseline,physicalTabletVerified:false,physicalPrinterVerified:false};let child,browser;
 try{
  const bundle=process.env.ANDROID_UI_TEST_BUNDLE||path.join(__dirname,'app/src/main/assets/nodeapp');
  fs.cpSync(bundle,path.join(root,'bundle'),{recursive:true});fs.mkdirSync(path.join(root,'cache'));
  const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),origin='http://127.0.0.1:'+port,log=fs.openSync(path.join(root,'server.log'),'a');
  child=spawn(process.execPath,[path.join(__dirname,'test-host-runtime.cjs')],{env:{...process.env,ANDROID_PRIVATE_ROOT:root,ANDROID_NATIVE_LIB:root,ANDROID_HTTP_TOKEN:token,TMPDIR:path.join(root,'cache'),HOST:'127.0.0.1',PORT:String(port),NODE_ENV:'test'},windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);
  let ready=false;for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error('No inició el host aislado');try{if((await fetch(origin+'/api/health',{headers:{'X-Android-Access':token},signal:AbortSignal.timeout(1500)})).ok){ready=true;break;}}catch{}await sleep(200);}assert.ok(ready,'Host no disponible');
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1366,height:900},hasTouch:true});
  await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue({headers:{...route.request().headers(),'X-Android-Access':token}}):route.abort());
  await context.addInitScript(({token})=>{window.AndroidShell={token:()=>token,devices:()=>{},keyboard:()=>{},tourProgress:()=>JSON.stringify({status:'dismissed',chapter:0,step:0}),saveTourProgress:()=>{},installUpdate:()=>{}};window.__sessionEvents=0;window.addEventListener('elmuelle:session',()=>window.__sessionEvents++);},{token});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  let saved={transport:'bluetooth',address:'00:11:22:33:44:55'},statusRequests=0,apiRequests=0;
  page.on('request',request=>{const p=new URL(request.url()).pathname;if(p.startsWith('/api/')&&p!=='/api/android/scale'&&p!=='/api/access/events')apiRequests++;});
  await page.route('**/api/android/native',async route=>{
   const input=route.request().postDataJSON();let value;
   if(input.op==='printerStatus'){statusRequests++;await sleep(150);value={configured:true,profile:saved};}
   else if(input.op==='printerConfigure'){saved={...input.profile};value={configured:true,physicalCompatibilityVerified:false};}
   else if(input.op==='printerTestConnection')value={tcpConnected:true,paperOutputVerified:false};
   else return route.fallback();
   await route.fulfill({contentType:'application/json',body:JSON.stringify({value})});
  });
  await page.goto(origin);await page.locator('#setupOwnerNameInput').fill('Prueba LAN aislada');await page.locator('#setupOwnerPinInput').fill('731608');await page.locator('#setupOwnerPinConfirmInput').fill('731608');await page.locator('#setupOwnerSubmitBtn').click();
  await page.waitForFunction(()=>init.ready&&state.sessionAuthenticated&&window.AndroidMotion&&document.getElementById('thermalTransport')&&!document.getElementById('setupOwnerSubmitBtn').disabled&&document.getElementById('setupScreen').classList.contains('hidden')&&document.getElementById('accessScreen').classList.contains('hidden'));await sleep(700);
  await page.evaluate(()=>{setView('settings');setSettingsMode('peripherals');});if(baseline)await page.evaluate(()=>document.getElementById('androidPrinterPanel').open=true);else await page.locator('#androidPrinterPanel summary').click();await sleep(400);
  const chooseLan=async()=>{if(baseline)await page.evaluate(()=>{const s=document.getElementById('thermalTransport');s.value='lan';s.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('thermalHost').value='192.168.1.100';document.getElementById('thermalPort').value='9100';});else{await page.locator('#thermalTransport').selectOption('lan');await page.locator('#thermalHost').fill('192.168.1.100');await page.locator('#thermalPort').fill('9100');}};
  await chooseLan();await page.evaluate(()=>updateShellState());await sleep(400);
  result.lanSurvivesShellRefresh=await page.locator('#thermalTransport').inputValue()==='lan';
  await chooseLan();
  await page.evaluate(()=>window.dispatchEvent(new Event('elmuelle:session')));await sleep(400);
  result.lanSurvivesRepeatedSession=await page.locator('#thermalTransport').inputValue()==='lan'&&await page.locator('#thermalHost').inputValue()==='192.168.1.100';
  await chooseLan();if(baseline)await page.evaluate(()=>document.getElementById('saveThermalLan').onclick());else await page.locator('#saveThermalLan').click();await page.waitForFunction(()=>document.getElementById('thermalNotice').textContent.includes('guardada'));
  assert.equal(saved.transport,'lan');assert.equal(saved.host,'192.168.1.100');await page.locator('#testThermalLan').click();await page.waitForFunction(()=>document.getElementById('thermalNotice').textContent.includes('TCP disponible'));
  await page.evaluate(()=>{setView('pos');state.ticketCollapsed=true;state.sidebarCollapsed=false;updateShellState();});await sleep(800);
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const before=(await cdp.send('Performance.getMetrics')).metrics;apiRequests=0;statusRequests=0;
  result.motion=await page.evaluate(async()=>{
   window.__sessionEvents=0;let ghosts=0,maxNodes=0;const samples=[],frames=[];
   const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.classList.contains('android-ticket-ghost'))ghosts++;});observer.observe(document.body,{childList:true});
   let last=performance.now(),raf;function frame(now){frames.push(now-last);last=now;maxNodes=Math.max(maxNodes,document.getElementsByTagName('*').length);raf=requestAnimationFrame(frame);}raf=requestAnimationFrame(frame);
   for(let i=0;i<16;i++){const start=performance.now();if(i%2===0)toggleSidebar();else toggleTicketPanel();samples.push(performance.now()-start);await new Promise(r=>setTimeout(r,120));}
   await new Promise(r=>setTimeout(r,400));cancelAnimationFrame(raf);observer.disconnect();
   return {sessionEvents:window.__sessionEvents,ghostClones:ghosts,maxNodes,maxToggleMs:Math.max(...samples),totalToggleMs:samples.reduce((a,b)=>a+b,0),framesOver50ms:frames.filter(n=>n>50).length,frameCount:frames.length};
  });
  const after=(await cdp.send('Performance.getMetrics')).metrics,values=list=>Object.fromEntries(list.map(m=>[m.name,m.value])),a=values(before),b=values(after);
  for(const name of ['LayoutCount','RecalcStyleCount','LayoutDuration','ScriptDuration','TaskDuration'])result.motion[name]=b[name]-a[name];
  result.motion.apiRequests=apiRequests;result.motion.printerStatusRequests=statusRequests;result.pageErrors=errors;
  if(!baseline){assert.ok(result.lanSurvivesShellRefresh,'El shell pisa LAN');assert.ok(result.lanSurvivesRepeatedSession,'La sesión pisa el borrador LAN');assert.equal(result.motion.sessionEvents,0,'Abrir paneles no cambia sesión');assert.equal(statusRequests,0,'Abrir paneles no recarga la impresora');assert.equal(apiRequests,0,'Abrir paneles no debe consultar APIs');assert.equal(result.motion.ghostClones,0,'No duplicar la venta en cada cierre');assert.deepEqual(errors,[]);}
  if(!baseline){
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
   await page.evaluate(()=>{setView('settings');setSettingsMode('peripherals');});
   await page.locator('#thermalPaper').selectOption('58');await page.locator('#thermalTransport').selectOption('usb');
   await page.evaluate(()=>window.dispatchEvent(new Event('elmuelle:session')));await sleep(300);
   assert.equal(await page.locator('#thermalPaper').inputValue(),'58');assert.equal(await page.locator('#thermalTransport').inputValue(),'usb');
   await page.evaluate(()=>logoutToAccess());await sleep(350);
   assert.equal(await page.locator('#androidPrinterPanel').isHidden(),true);assert.equal(await page.locator('#thermalHost').inputValue(),'');
   result.unsavedFormatPreserved=true;result.logoutClearsConnection=true;
  }
  result.passed=true;
 }catch(error){result.error=error.stack;process.exitCode=1;}
 finally{if(browser)await browser.close();if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}fs.writeFileSync(path.resolve(__dirname,'../.dev/em003-lan-motion-'+(baseline?'baseline':'fixed')+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
})();
