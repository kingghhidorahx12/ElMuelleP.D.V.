const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const p=require('../src/mailbox-protocol'),root=path.resolve(__dirname,'..'),key=()=>crypto.randomBytes(32).toString('hex');
const wranglerRoot=process.env.MAILBOX_WRANGLER_ROOT;if(!wranglerRoot)throw Error('Define MAILBOX_WRANGLER_ROOT con la instalación oficial de Wrangler usada para compilar el Worker.');
const {Miniflare,convertV4MiniflareOptions}=require(path.join(wranglerRoot,'node_modules/miniflare'));
let mf,db,url,area,small,large,report,receipt,code;const master=key(),admin=key(),client=crypto.randomUUID(),secret=key(),other=crypto.randomUUID(),otherSecret=key();
async function request(route,method='GET',value,auth='admin',extra){const raw=value===undefined?'':JSON.stringify(value),headers=auth==='admin'?{Authorization:'Bearer '+admin,'Content-Type':'application/json'}:auth==='client'?p.signedHeaders({clientId:client,secret},method,route,raw):{'Content-Type':'application/json'};const response=await fetch(url+route,{method,headers:extra||headers,...(value===undefined?{}:{body:raw})});return {status:response.status,body:await response.json()};}
const packet=images=>({id:crypto.randomUUID(),kind:'error',description:'PRUEBA AISLADA de entrega cifrada, sin datos comerciales.',createdAt:new Date().toISOString(),attachments:images,attachmentsReviewed:images.length>0,consentRemote:true});
before(async()=>{
 area=fs.mkdtempSync(path.join(root,'.dev','em003-worker-test-'));require('../src/persistence').restrictPrivatePath(area,true);
 mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,modules:true,scriptPath:path.join(root,'services/mailbox-worker/.dev/mailbox-worker-dry/worker.js'),compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'isolated-mailbox'},d1Persist:path.join(area,'d1'),bindings:{MAILBOX_DATA_KEY:master,MAILBOX_ADMIN_TOKEN:admin,LOCAL_TEST:'1'},serviceBindings:{ASSETS:async req=>{const name=new URL(req.url).pathname==='/'?'index.html':path.basename(new URL(req.url).pathname);return new Response(fs.readFileSync(path.join(root,'services/mailbox-receiver/public',name)),{headers:{'Content-Type':name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'}});}}}));
 url=(await mf.ready).origin;db=await mf.getD1Database('DB');await db.exec(fs.readFileSync(path.join(root,'services/mailbox-worker/schema.sql'),'utf8').replace(/CREATE TRIGGER[\s\S]+$/,match=>match.replace(/\r?\n/g,' ')));
 const sharp=require('C:/Users/nexar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');small={mime:'image/png',data:(await sharp({create:{width:4,height:4,channels:4,background:'#2385baff'}}).png().toBuffer()).toString('base64')};large={mime:'image/png',data:(await sharp(crypto.randomBytes(512*480*4),{raw:{width:512,height:480,channels:4}}).png().toBuffer()).toString('base64')};assert.ok(Buffer.from(large.data,'base64').length<1048576);
});
test('D1: la cuota diaria se aplica dentro de la transacción y un exceso no guarda otro reporte',async()=>{
 const made=await request('/admin/api/enrollments','POST',{});assert.equal(made.status,201);const id=crypto.randomUUID(),key=crypto.randomBytes(32).toString('hex');assert.equal((await request('/v1/enroll','POST',{code:made.body.code,clientId:id,secret:key},'none')).status,200);
 for(let i=0;i<20;i++){const value=packet([]),raw=JSON.stringify(value),sent=await request('/v1/reports','POST',value,'none',p.signedHeaders({clientId:id,secret:key},'POST','/v1/reports',raw));assert.equal(sent.status,201);}
 const extra=packet([]),raw=JSON.stringify(extra),rejected=await request('/v1/reports','POST',extra,'none',p.signedHeaders({clientId:id,secret:key},'POST','/v1/reports',raw));assert.equal(rejected.status,429);assert.equal((await db.prepare('SELECT COUNT(*) n FROM reports WHERE client=?').bind(id).first()).n,20);
});
after(async()=>{if(mf)await mf.dispose();if(area){assert.ok(area.startsWith(path.join(root,'.dev')+path.sep));fs.rmSync(area,{recursive:true,force:true,maxRetries:5,retryDelay:100});}});
test('Worker: bandeja sin contenido público y autorización administrativa separada',async()=>{
 assert.equal((await fetch(url+'/admin/')).status,200);assert.equal((await request('/admin/api/reports','GET',undefined,'none')).status,401);assert.equal((await request('/admin/api/capabilities')).body.individualEnrollment,true);
});
test('D1: activación individual de un solo uso, reintento y aislamiento de credenciales',async()=>{
 const made=await request('/admin/api/enrollments','POST',{});assert.equal(made.status,201);code=made.body.code;assert.match(code,/^[a-f0-9]{32}$/);
 const value={code,clientId:client,secret};assert.equal((await request('/v1/enroll','POST',value,'none')).body.enrolled,true);assert.equal((await request('/v1/enroll','POST',value,'none')).body.enrolled,true);
 assert.equal((await request('/v1/enroll','POST',{code,clientId:other,secret:otherSecret},'none')).status,401);
 const row=await db.prepare('SELECT encrypted FROM clients WHERE id=?').bind(client).first();assert.ok(!row.encrypted.includes(secret));
 const expired=await request('/admin/api/enrollments','POST',{});await db.prepare('UPDATE enrollments SET expires=0 WHERE digest=?').bind(p.hash(expired.body.code)).run();assert.equal((await request('/v1/enroll','POST',{code:expired.body.code,clientId:other,secret:otherSecret},'none')).status,401);
});
test('Worker: firmas, consentimiento, integridad y repetición no autorizada',async()=>{
 const value=packet([]);assert.equal((await request('/v1/reports','POST',value,'none')).status,401);assert.equal((await request('/v1/reports','POST',{...value,consentRemote:false},'client')).status,400);
 report=packet([small]);const raw=JSON.stringify(report),signed=p.signedHeaders({clientId:client,secret},'POST','/v1/reports',raw);const first=await request('/v1/reports','POST',report,'client',signed);assert.equal(first.status,201);receipt=first.body.receipt;assert.match(receipt,/^[a-f0-9]{48}$/);assert.equal((await request('/v1/reports','POST',report,'client',signed)).status,401);assert.equal((await request('/v1/reports','POST',report,'client')).body.receipt,receipt);assert.equal((await request('/v1/reports','POST',{...report,description:'Contenido alterado después del acuse'},'client')).status,409);
});
test('D1: contenido y capturas cifrados; filas pequeñas y persistencia consultable',async()=>{
 const row=await db.prepare('SELECT * FROM reports WHERE id=?').bind(report.id).first();assert.ok(!row.encrypted.includes(report.description));const image=await db.prepare('SELECT encrypted FROM attachments WHERE report=?').bind(report.id).first();assert.notDeepEqual(Buffer.from(image.encrypted),Buffer.from(small.data,'base64'));
 const largeReport=packet([large,large]);assert.equal((await request('/v1/reports','POST',largeReport,'client')).status,201);const saved=await db.prepare('SELECT MAX(length(encrypted)) n,COUNT(*) c FROM attachments WHERE report=?').bind(largeReport.id).first();assert.equal(saved.c,2);assert.ok(saved.n<2000000);const read=await request('/admin/api/reports/'+largeReport.id);assert.equal(read.body.attachments[1].data,large.data);
});
test('Worker: bandeja lee, clasifica y responde; cliente recibe seguimiento sin capturas ni secretos',async()=>{
 const read=await request('/admin/api/reports/'+report.id);assert.equal(read.body.attachments[0].data,small.data);assert.equal(read.body.description,report.description);
 assert.equal((await request('/admin/api/reports/'+report.id,'PATCH',{status:'resuelto',classification:'operacion',reply:'Respuesta de la prueba aislada.'})).status,200);
 const tracked=await request('/v1/reports/'+report.id,'GET',undefined,'client');assert.equal(tracked.body.receipt,receipt);assert.equal(tracked.body.status,'resuelto');assert.equal(tracked.body.replies[0].text,'Respuesta de la prueba aislada.');assert.equal(tracked.body.attachments,undefined);assert.equal((await request('/admin/api/reports?status=resuelto&kind=error')).body.reports.length,1);
});
test('Worker: captura inválida y exceso de tamaño se rechazan antes de persistir',async()=>{
 assert.equal((await request('/v1/reports','POST',packet([{mime:'image/svg+xml',data:'PHN2Zz4='}]),'client')).status,400);
 const raw=JSON.stringify({padding:'x'.repeat(p.LIMITS.bodyBytes+1)}),big=await mf.dispatchFetch(url+'/v1/reports',{method:'POST',headers:p.signedHeaders({clientId:client,secret},'POST','/v1/reports',raw),body:raw});assert.equal(big.status,413);
});
test('POS real aislado: activación cifrada, reintento tras perder el acuse, envío y seguimiento D1',async()=>{
 const http=require('node:http'),net=require('node:net'),{spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const appRoot=path.join(area,'pos-app'),data=path.join(area,'pos-data');fs.mkdirSync(appRoot);fs.mkdirSync(data);fs.writeFileSync(path.join(data,'products.json'),'[]');fs.cpSync(path.join(root,'src'),path.join(appRoot,'src'),{recursive:true});fs.copyFileSync(path.join(root,'package.json'),path.join(appRoot,'package.json'));
 let loseReceipt=true,child,proxy,auth,startupError='';
 const api=async(route,method='GET',body,cookie=auth)=>{const response=await fetch(posBase+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};let posBase;
 try{
  proxy=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks),response=await fetch(url+req.url,{method:req.method,headers:req.headers,...(raw.length?{body:raw}:{})}),answer=await response.text();if(req.url==='/v1/enroll'&&loseReceipt&&response.ok){loseReceipt=false;res.destroy();return;}res.writeHead(response.status,{'Content-Type':'application/json'});res.end(answer);}catch{res.writeHead(503);res.end('{}');}});await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  fs.writeFileSync(path.join(appRoot,'src/mailbox-endpoint.json'),JSON.stringify({endpoint:'http://127.0.0.1:'+proxy.address().port}));
  const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});posBase='http://127.0.0.1:'+port;
  child=spawn(process.execPath,[path.join(appRoot,'src/server.js')],{cwd:appRoot,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',NODE_ENV:'test',MAILBOX_TEST_LOOPBACK:'1',EL_MUELLE_STORAGE_MODE:'',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,ENV_FILE:path.join(area,'missing.env'),ADMIN_PIN:'472908',EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',CORS_ORIGIN:'',REQUIRE_HTTPS:'false'},stdio:['ignore','ignore','pipe']});child.stderr.on('data',chunk=>startupError=(startupError+chunk).slice(-4000));
  for(let i=0;i<180;i++){if(child.exitCode!==null)throw Error('No inició el POS aislado: '+startupError);try{if((await fetch(posBase+'/api/health')).ok)break;}catch{}await pause(100);}
  auth=(await api('/api/auth/admin','POST',{pin:'472908'},null)).cookie;assert.ok(auth);assert.equal((await api('/api/support/enroll','POST',{code:'0'.repeat(32)},null)).status,401);
  const initial=await api('/api/support/config');assert.equal(initial.body.configured,false);assert.equal(initial.body.canEnroll,true);
  const made=await request('/admin/api/enrollments','POST',{});assert.equal(made.status,201);const code=made.body.code;
  assert.equal((await api('/api/support/enroll','POST',{code})).status,502);assert.equal((await api('/api/support/config')).body.configured,false);
  const activated=await api('/api/support/enroll','POST',{code});assert.equal(activated.status,200);assert.equal(activated.body.configured,true);assert.equal(activated.body.secret,undefined);assert.notEqual(activated.body.clientId,client);
  assert.equal((await api('/api/support/enroll','POST',{code})).status,409);
  const database=new DatabaseSync(path.join(data,'el-muelle-pos.sqlite'),{readOnly:true});try{const saved=database.prepare("SELECT payload FROM documents WHERE collection='support-config'").get().payload;assert.ok(JSON.parse(saved).encrypted.startsWith('enc:v1:'));assert.ok(!saved.includes(code));assert.ok(!saved.includes(activated.body.clientId));}finally{database.close();}
  const input={operationId:crypto.randomUUID(),kind:'sugerencia',description:'PRUEBA POS AISLADO: activación sin claves en el instalador.',attachments:[small],attachmentsReviewed:true,consentRemote:true};const sent=await api('/api/support/reports','POST',input);assert.equal(sent.status,201);assert.equal(sent.body.delivery,'recibido');assert.match(sent.body.receipt,/^[a-f0-9]{48}$/);
  assert.equal((await request('/admin/api/reports/'+sent.body.id)).body.description,input.description);assert.equal((await request('/admin/api/reports/'+sent.body.id,'PATCH',{status:'resuelto',classification:'operacion',reply:'Acuse y seguimiento comprobados desde POS aislado.'})).status,200);
  const tracked=await api('/api/support/reports/'+sent.body.id+'/refresh','POST',{});assert.equal(tracked.body.status,'resuelto');assert.equal(tracked.body.replies[0].text,'Acuse y seguimiento comprobados desde POS aislado.');
 }finally{if(child&&child.exitCode===null&&!child.signalCode){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}}
});
