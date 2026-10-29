// Medición repetible sobre datos sintéticos. No escribe informes ni utiliza datos del negocio.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),os=require('node:os');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),p=require('../src/persistence'),{PosDatabase}=require('../src/database');
const custody=require('./recovery-custody'),{chromium}=require(process.env.EL_MUELLE_PLAYWRIGHT||'playwright');
const root=path.resolve(__dirname,'..'),dev=path.join(root,'.dev'),prefix='em003-performance-';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
const representative=process.argv.includes('--representative'),affectedOnly=process.argv.includes('--affected-only');
function syntheticPhoto(size,seed){
 const zlib=require('node:zlib'),raw=Buffer.alloc((size*3+1)*size);let x=seed;
 for(let y=0;y<size;y++)for(let col=1;col<=size*3;col++){x^=x<<13;x^=x>>>17;x^=x<<5;raw[y*(size*3+1)+col]=x&255;}
 const crc=buffer=>{let n=0xffffffff;for(const value of buffer){n^=value;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
 const chunk=(type,body)=>{const tag=Buffer.from(type),result=Buffer.alloc(body.length+12);result.writeUInt32BE(body.length);tag.copy(result,4);body.copy(result,8);result.writeUInt32BE(crc(Buffer.concat([tag,body])),body.length+8);return result;};
 const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:0})),chunk('IEND',Buffer.alloc(0))]);
}
const photoBuffers=representative?[512,768,1024,1280].map((size,i)=>syntheticPhoto(size,12345+i)):[png,png,png,png];
assert.ok(photoBuffers.every(photo=>photo.length<=5*1024*1024));
(async()=>{
 const area=fs.mkdtempSync(path.join(dev,prefix));p.restrictPrivatePath(area,true);const rounds=[];let child,context;
 async function stop(){const running=child;child=null;if(running&&running.exitCode===null&&running.signalCode===null){const done=new Promise(r=>running.once('exit',r));running.kill();await done;}}
 try{
  for(let round=0;round<3;round++){
   const folder=path.join(area,'round-'+round),data=path.join(folder,'data');p.privateDirectory(folder);p.privateDirectory(data);p.privateDirectory(path.join(data,'product-photos'));
   const photos=photoBuffers.map((buffer,i)=>({name:crypto.createHash('sha256').update('synthetic-photo-'+i).digest('hex')+'.png',sha:crypto.createHash('sha256').update(buffer).digest('hex'),buffer}));for(const photo of photos)fs.writeFileSync(path.join(data,'product-photos',photo.name),photo.buffer);
   const products=Array.from({length:28},(_,i)=>({id:'synthetic-'+i,name:'Producto sintético '+i,category:'Pruebas',unit:i%2?'kg':'pieza',price:100,costPrice:40,stockQuantity:500,minStock:2,active:true,photoFile:photos[i%4].name,photoSHA256:photos[i%4].sha}));
   fs.writeFileSync(path.join(data,'products.json'),JSON.stringify(products));
   fs.writeFileSync(path.join(data,'cash-sessions.json'),JSON.stringify([{id:'C-OPEN',businessDate:new Date().toISOString().slice(0,10),status:'open',openingAmount:100,openedAt:new Date().toISOString(),movements:[]}]));
   fs.writeFileSync(path.join(data,'sales.json'),JSON.stringify(Array.from({length:120},(_,i)=>({id:'T-SYN-'+i,createdAt:new Date().toISOString(),status:'completada',operator:{id:'admin',role:'admin',name:'Sintético'},cashSessionId:'C-OPEN',paymentMethod:'efectivo',total:100,totalCost:40,grossProfit:60,items:[{productId:products[i%28].id,name:products[i%28].name,unit:products[i%28].unit,quantity:1,price:100,total:100,costPrice:40,lineCost:40}]}))));
   const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>r(n));});});assert.ok(![3000,3001].includes(port));const base='http://127.0.0.1:'+port,m={};let time=performance.now();
   child=spawn(process.execPath,['src/server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',NODE_ENV:'test',EL_MUELLE_STORAGE_MODE:'',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,ENV_FILE:path.join(folder,'missing.env'),ADMIN_PIN:'864209',EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',REQUIRE_HTTPS:'false',CORS_ORIGIN:''},stdio:'ignore'});
   for(let n=0;n<200;n++){if(child.exitCode!==null)throw Error('Synthetic startup failed');try{if((await fetch(base+'/api/health')).ok)break;}catch{}await pause(50);}m.startup=performance.now()-time;
   const auth=await fetch(base+'/api/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'864209'})});assert.equal(auth.status,200);const cookie=auth.headers.get('set-cookie').split(';')[0];
   for(const [metric,route]of (affectedOnly?[['catalog','/api/products'],['inventory','/api/inventory/entries']]:[['http','/api/health'],['catalog','/api/products'],['inventory','/api/inventory/entries'],['cash','/api/cash-shifts']])){const samples=[];for(let n=0;n<5;n++){time=performance.now();const r=await fetch(base+route,{headers:{Cookie:cookie}});assert.equal(r.status,200);await r.json();samples.push(performance.now()-time);}m[metric]=median(samples);}
   context=await chromium.launchPersistentContext(path.join(folder,'browser'),{channel:'msedge',headless:true,viewport:{width:1366,height:768}});await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:base}]);const page=context.pages()[0];
   const baselineStyle=process.argv.find(value=>value.startsWith('--baseline-style='));if(baselineStyle){const source=fs.readFileSync(path.resolve(baselineStyle.slice(17)),'utf8');await page.route('**/styles.css',route=>route.fulfill({contentType:'text/css',body:source}));}
   time=performance.now();await page.goto(base);await page.waitForFunction(()=>state.sessionAuthenticated&&init.ready);m.frontend=performance.now()-time;await page.evaluate(()=>{window.print=()=>{};});
   if(process.argv.includes('--visual-only')){await page.evaluate(async()=>{for(let i=0;i<5;i++){state.selectedProduct=state.products.find(p=>p.unit==='pieza');state.detectedQuantity=1;state.quantitySource='manual';addCurrentProductToTicket({nextStep:'product'});}await chargeSale(false);});await require('./final-visual-checks').capture(page,process.argv[2]);rounds.push(m);await context.close();context=null;await stop();break;}
   m.photos=await page.evaluate(async()=>{const time=performance.now();await Promise.all(state.products.slice(0,4).map(async p=>{const image=new Image();image.src=getPosProductImagePath(p);await image.decode();}));return performance.now()-time;});
   if(representative)m.photosReload=await page.evaluate(async()=>{const time=performance.now();await Promise.all(state.products.slice(0,4).map(async p=>{const response=await fetch(getPosProductImagePath(p),{cache:'reload'});if(!response.ok)throw Error('Synthetic image failed');const bitmap=await createImageBitmap(await response.blob());bitmap.close();}));return performance.now()-time;});
   m.search=await page.evaluate(async()=>{setView('pos');const samples=[];for(let i=0;i<5;i++){const t=performance.now();$('searchInput').value=i%2?'sintético':'Producto';$('searchInput').dispatchEvent(new Event('input'));await new Promise(requestAnimationFrame);samples.push(performance.now()-t);}return samples.sort((a,b)=>a-b)[2];});
   m.navigation=await page.evaluate(async()=>{const samples=[];for(const view of ['sales','inventory','cash','reports','pos']){const t=performance.now();setView(view);await new Promise(requestAnimationFrame);samples.push(performance.now()-t);}return samples.sort((a,b)=>a-b)[2];});
   m.modal=await page.evaluate(async()=>{setView('products');const samples=[];for(let i=0;i<5;i++){const t=performance.now();fillProductForm(state.products[0]);await new Promise(requestAnimationFrame);samples.push(performance.now()-t);setProductMode('list');}return samples.sort((a,b)=>a-b)[2];});
   m.cart=await page.evaluate(async()=>{setView('pos');const samples=[];for(let i=0;i<5;i++){const t=performance.now();state.selectedProduct=state.products.find(p=>p.unit==='pieza');state.detectedQuantity=1;state.quantitySource='manual';addCurrentProductToTicket({nextStep:'product'});await new Promise(requestAnimationFrame);samples.push(performance.now()-t);}return samples.sort((a,b)=>a-b)[2];});
   m.prepare=await page.evaluate(async()=>{const time=performance.now();await openInvoiceDecisionModal();closeInvoiceDecisionModal();return performance.now()-time;});
   time=performance.now();await page.evaluate(()=>chargeSale(false));m.checkout=performance.now()-time;assert.equal(await page.evaluate(()=>state.ticket.length),0);
   m.report=await page.evaluate(async()=>{setView('reports');await loadReports();const samples=[];for(let i=0;i<5;i++){const t=performance.now();getGeneratedReport();samples.push(performance.now()-t);}return samples.sort((a,b)=>a-b)[2];});
   if(affectedOnly)m.printPreparation=await page.evaluate(()=>{const samples=[];for(let i=0;i<5;i++){const t=performance.now();printGeneratedReport();samples.push(performance.now()-t);}return samples.sort((a,b)=>a-b)[2];});
   if(round===0&&process.argv.includes('--capture-visual'))await require('./final-visual-checks').capture(page,process.argv[2]);
   await context.close();context=null;await stop();
   if(affectedOnly){rounds.push(m);continue;}
   const db=new PosDatabase(data);try{const read=[],write=[];for(let i=0;i<5;i++){time=performance.now();db.read(path.join(data,'products.json'),[]);read.push(performance.now()-time);time=performance.now();db.transaction(()=>db.saveDocument('benchmark','synthetic',{id:'synthetic',round:i}));write.push(performance.now()-time);}m.sqliteRead=median(read);m.sqliteWrite=median(write);}finally{db.close();}
   const archive=path.join(folder,'synthetic.emrecovery');time=performance.now();custody.exportCustody({databaseFile:path.join(data,p.DATABASE_NAME),keyFile:path.join(data,'.secrets.json'),backupDirectory:path.join(data,'backups'),destination:archive,password:'synthetic-only'});m.backup=performance.now()-time;
   time=performance.now();const recovered=custody.restoreCustody({archive,destination:path.join(folder,'restored'),password:'synthetic-only'});m.restore=performance.now()-time;assert.equal(recovered.photos,4);rounds.push(m);
  }
  if(process.argv.includes('--visual-only')){console.log('VISUAL_ONLY_RESULT '+JSON.stringify({label:process.argv[2],passed:true,synthetic:true,performanceMeasured:false}));return;}
  const medians=Object.fromEntries(Object.keys(rounds[0]).map(k=>[k,median(rounds.map(r=>r[k]))]));console.log('PERFORMANCE_RESULT '+JSON.stringify({label:process.argv[2]||'measurement',node:process.version,rounds,medians,conditions:{products:28,photos:4,photoBytes:photoBuffers.map(p=>p.length),photoHashes:photoBuffers.map(p=>crypto.createHash('sha256').update(p).digest('hex')),sales:120,viewport:[1366,768],samples:3,innerSamples:5,synthetic:true,headlessEdge:true,affectedOnly,freeMemory:os.freemem(),peakNodeRss:process.resourceUsage().maxRSS*1024}}));
 }finally{await context?.close();await stop();assert.ok(p.inside(area,dev)&&path.basename(area).startsWith(prefix));p.rejectLinks(area);fs.rmSync(area,{recursive:true,force:true,maxRetries:10,retryDelay:100});assert.equal(fs.existsSync(area),false);}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
