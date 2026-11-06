const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),{spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const protocol=require('../src/mailbox-protocol'),{createReceiver}=require('../services/mailbox-receiver/server'),p=require('../src/persistence');
const root=path.resolve(__dirname,'..'),dev=path.join(root,'.dev'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),key=()=>crypto.randomBytes(32).toString('hex'),clientId='synthetic-client-one',clientTwo='synthetic-client-two',clientKey=key(),secondKey=key(),dataKey=key(),adminToken=key(),pin='902864';
let area,data,child,base,admin,employee,receiver,remoteServer,remoteBase,png,browser,localReport,employeeReport,remotePacket,remoteAck;
const config=()=>({endpoint:remoteBase,clientId,secret:clientKey});
function listen(app){return new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});}
async function api(route,method='GET',body,auth=admin){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(auth?{Cookie:auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function remote(route,method='GET',payload,client=clientId,secret=clientKey,headers){const body=payload===undefined?'':JSON.stringify(payload),response=await fetch(remoteBase+route,{method,headers:headers||protocol.signedHeaders({clientId:client,secret},method,route,body),...(payload===undefined?{}:{body})});return {status:response.status,body:await response.json()};}
async function privateApi(route,method='GET',body,token=adminToken){const response=await fetch(remoteBase+'/admin/api'+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};}
const packet=(description='Descripción sintética del problema de prueba')=>({id:crypto.randomUUID(),kind:'error',description,createdAt:new Date().toISOString(),attachments:[],attachmentsReviewed:false,consentRemote:true});
async function stop(){if(child&&child.exitCode===null&&!child.signalCode){const current=child,done=new Promise(resolve=>current.once('exit',resolve));current.kill();await done;}child=null;}
before(async()=>{
 fs.mkdirSync(dev,{recursive:true});area=fs.mkdtempSync(path.join(dev,'em003-mailbox-'));p.restrictPrivatePath(area,true);data=path.join(area,'pos-data');p.privateDirectory(data);fs.writeFileSync(path.join(data,'products.json'),'[]\n');
 const sharp=require('C:/Users/nexar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');png={mime:'image/png',data:(await sharp({create:{width:4,height:4,channels:4,background:'#2385baff'}}).png().toBuffer()).toString('base64')};
 receiver=createReceiver({dataDir:path.join(area,'receiver'),dataKey,adminToken,clients:{[clientId]:clientKey,[clientTwo]:secondKey}});remoteServer=await listen(receiver.app);remoteBase='http://127.0.0.1:'+remoteServer.address().port;
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});base='http://127.0.0.1:'+port;
 child=spawn(process.execPath,['src/server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',NODE_ENV:'test',MAILBOX_TEST_LOOPBACK:'1',EL_MUELLE_STORAGE_MODE:'',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,ENV_FILE:path.join(area,'missing.env'),ADMIN_PIN:pin,EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',CORS_ORIGIN:'',REQUIRE_HTTPS:'false'},stdio:'ignore'});
 for(let attempt=0;attempt<180;attempt++){if(child.exitCode!==null)throw Error('No inició el POS sintético');try{if((await fetch(base+'/api/health')).ok)break;}catch{}await pause(100);}
 admin=(await api('/api/auth/admin','POST',{pin},null)).cookie;assert.ok(admin);
 assert.equal((await api('/api/settings','PUT',{users:[{id:'admin',name:'Admin sintético',role:'admin',active:true},{id:'employee',name:'Empleado sintético',role:'employee',active:true}],employeePins:{employee:'135790'}})).status,200);
 employee=(await api('/api/auth/employee','POST',{userId:'employee',pin:'135790'},null)).cookie;assert.ok(employee);
});
after(async()=>{if(browser)await browser.close();await stop();if(remoteServer){remoteServer.closeAllConnections();await new Promise(resolve=>remoteServer.close(resolve));receiver.close();}if(area){assert.ok(p.inside(area,dev)&&path.basename(area).startsWith('em003-mailbox-'));fs.rmSync(area,{recursive:true,force:true,maxRetries:10,retryDelay:100});}});
test('Protocolo: tipos, consentimiento, imágenes y límites; SSRF y enlaces inseguros rechazados',()=>{
 const value=packet();assert.equal(protocol.normalizeReport({...value,attachments:[png],attachmentsReviewed:true}).attachments.length,1);
 for(const changed of [{kind:'otro'},{description:'corto'},{description:'x'.repeat(4001)},{createdAt:'ayer'},{attachments:[png,png,png],attachmentsReviewed:true},{attachments:[png],attachmentsReviewed:false},{attachments:[{mime:'image/svg+xml',data:'PHN2Zz4='}],attachmentsReviewed:true},{attachments:[{mime:'image/png',data:Buffer.from('not-an-image').toString('base64')}],attachmentsReviewed:true},{attachments:[{mime:'image/png',data:Buffer.alloc(1048577).toString('base64')}],attachmentsReviewed:true},{consentRemote:'yes'},{diagnostics:'not-allowed'}])assert.throws(()=>protocol.normalizeReport({...value,...changed}));
 const bomb=Buffer.from(png.data,'base64');bomb.writeUInt32BE(100000,16);assert.throws(()=>protocol.normalizeReport({...value,attachments:[{mime:'image/png',data:bomb.toString('base64')}],attachmentsReviewed:true}));
 for(const url of ['http://example.com','https://127.0.0.1','https://[::1]','https://10.1.1.1','https://example.com/private','https://user:secret@example.com','https://example.com/?secret=1','https://example.com:444'])assert.throws(()=>protocol.endpoint(url));
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','2001:db8::1','100.64.0.1','198.18.0.1'])assert.equal(protocol.publicAddress(address),false,address);
 assert.equal(protocol.publicAddress('8.8.8.8'),true);
});
test('Transporte: resolución privada y redirecciones no se siguen; plazo y respuesta acotados',async()=>{
 const send=protocol.transport({lookup:async()=>[{address:'127.0.0.1',family:4}]});await assert.rejects(()=>send({...config(),endpoint:'https://support.example.com'},'GET','/v1/reports/'+crypto.randomUUID()),/pública/);
 const redirected=await listen(require('express')().get('/v1/reports',(req,res)=>res.redirect('http://127.0.0.1/private')));
 try{await assert.rejects(()=>protocol.transport({allowLoopback:true})({...config(),endpoint:'http://127.0.0.1:'+redirected.address().port},'GET','/v1/reports'),/confirmó/);}finally{redirected.closeAllConnections();await new Promise(resolve=>redirected.close(resolve));}
});
test('Receptor: autenticación firmada, integridad de cuerpo, caducidad y repetición de solicitud',async()=>{
 remotePacket={...packet('REPORTE_SINTETICO_CIFRADO <script>window.mailboxInjected=true</script>'),attachments:[png],attachmentsReviewed:true};
 assert.equal((await remote('/v1/reports','POST',remotePacket,clientId,key())).status,401);
 assert.equal((await remote('/v1/reports','POST',remotePacket,'unknown-client',clientKey)).status,401);
 const body=JSON.stringify(remotePacket),headers=protocol.signedHeaders({clientId,secret:clientKey},'POST','/v1/reports',body);
 const first=await remote('/v1/reports','POST',remotePacket,clientId,clientKey,headers);assert.equal(first.status,201);remoteAck=first.body;assert.match(remoteAck.receipt,/^[a-f0-9]{48}$/);
 assert.equal((await remote('/v1/reports','POST',remotePacket,clientId,clientKey,headers)).status,401);
 const changed={...remotePacket,description:'Cuerpo distinto de la firma original'};assert.equal((await remote('/v1/reports','POST',changed,clientId,clientKey,protocol.signedHeaders({clientId,secret:clientKey},'POST','/v1/reports',body))).status,401);
 const expired=protocol.signedHeaders({clientId,secret:clientKey},'GET','/v1/reports/'+remotePacket.id,'');expired['X-Mailbox-Time']=String(Date.now()-600000);assert.equal((await remote('/v1/reports/'+remotePacket.id,'GET',undefined,clientId,clientKey,expired)).status,401);
 assert.equal((await remote('/v1/reports','POST',remotePacket)).body.receipt,remoteAck.receipt);
 assert.equal((await remote('/v1/reports','POST',{...remotePacket,description:'Otro contenido para la misma identidad'})).status,409);
 assert.equal((await remote('/v1/reports/'+remotePacket.id,'GET',undefined,clientTwo,secondKey)).status,404);
 assert.equal((await remote('/v1/reports','POST',{...packet(),consentRemote:false})).status,400);
});
test('Bandeja: autorización separada, clasificación, respuesta y consulta del cliente',async()=>{
 assert.equal((await privateApi('/reports','GET',undefined,clientKey)).status,401);
 assert.equal((await privateApi('/reports','GET',undefined,'invalid')).status,401);
 const list=await privateApi('/reports');assert.equal(list.status,200);assert.ok(list.body.reports.some(row=>row.id===remotePacket.id));assert.ok(!JSON.stringify(list.body).includes(png.data));
 assert.equal((await privateApi('/reports/'+remotePacket.id,'PATCH',{status:'en_revision',classification:'operacion',reply:'Respuesta sintética de soporte'})).status,200);
 const tracking=await remote('/v1/reports/'+remotePacket.id);assert.equal(tracking.body.status,'en_revision');assert.equal(tracking.body.replies[0].text,'Respuesta sintética de soporte');
 assert.equal((await privateApi('/reports?status=en_revision&kind=error')).body.reports.length,1);
 assert.equal((await privateApi('/reports/'+remotePacket.id,'PATCH',{status:'inventado',classification:'otro'})).status,400);
 assert.equal((await privateApi('/reports?cursor=-1')).status,400);
});
test('Receptor: persistencia tras reinicio, claves originales e historial cifrado',async()=>{
 const row=receiver.db.prepare('SELECT * FROM reports WHERE id=?').get(remotePacket.id);assert.ok(row.encrypted.startsWith('enc:v1:'));assert.ok(!row.encrypted.includes('REPORTE_SINTETICO_CIFRADO'));
 const route='/v1/reports/'+remotePacket.id,headers=protocol.signedHeaders({clientId,secret:clientKey},'GET',route,'');assert.equal((await remote(route,'GET',undefined,clientId,clientKey,headers)).status,200);
 remoteServer.closeAllConnections();await new Promise(resolve=>remoteServer.close(resolve));receiver.close();remoteServer=null;
 assert.throws(()=>createReceiver({dataDir:path.join(area,'receiver'),dataKey:key(),adminToken,clients:{[clientId]:clientKey,[clientTwo]:secondKey}}),/clave original/);
 receiver=createReceiver({dataDir:path.join(area,'receiver'),dataKey,adminToken,clients:{[clientId]:clientKey,[clientTwo]:secondKey}});remoteServer=await listen(receiver.app);remoteBase='http://127.0.0.1:'+remoteServer.address().port;
 assert.equal((await remote(route)).body.receipt,remoteAck.receipt);assert.equal((await remote(route)).body.replies[0].text,'Respuesta sintética de soporte');assert.equal((await remote(route,'GET',undefined,clientId,clientKey,headers)).status,401);
});
test('Protección contra abuso: cuota, límite HTTP y capturas inválidas',async()=>{
 const tiny=createReceiver({dataDir:path.join(area,'quota'),dataKey,adminToken,clients:{[clientId]:clientKey},maxReports:1,limitPerMinute:4});const server=await listen(tiny.app),url='http://127.0.0.1:'+server.address().port;
 try{const send=protocol.transport({allowLoopback:true}),cfg={...config(),endpoint:url};await send(cfg,'POST','/v1/reports',packet());await assert.rejects(()=>send(cfg,'POST','/v1/reports',packet()));const requests=[];for(let i=0;i<5;i++)requests.push((await fetch(url+'/admin/api/reports')).status);assert.ok(requests.includes(429));}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));tiny.close();}
 assert.equal((await remote('/v1/reports','POST',{...packet(),attachments:[{mime:'image/png',data:'aGVsbG8='}],attachmentsReviewed:true})).status,400);
 const response=await fetch(remoteBase+'/v1/reports',{method:'POST',headers:{'Content-Type':'application/json','X-Mailbox-Client':clientId},body:JSON.stringify({description:'x'.repeat(protocol.LIMITS.bodyBytes+1)})});assert.equal(response.status,413);
});
test('POS local: acceso, folios idempotentes, aislamiento de empleados y configuración privada',async()=>{
 assert.equal((await api('/api/support/reports','GET',undefined,null)).status,401);
 assert.equal((await api('/api/support/config','PUT',{endpoint:''},employee)).status,403);
 assert.equal((await api('/api/support/config')).body.configured,false);
 const input={operationId:crypto.randomUUID(),kind:'sugerencia',description:'DESCRIPCION_LOCAL_PRIVADA sintética',attachments:[png],attachmentsReviewed:true,consentRemote:false};
 localReport=(await api('/api/support/reports','POST',input)).body;assert.equal(localReport.delivery,'local');assert.equal(localReport.receipt,null);assert.match(localReport.folio,/^EM-[A-F0-9]{8}$/);
 assert.equal((await api('/api/support/reports','POST',input)).body.id,localReport.id);
 assert.equal((await api('/api/support/reports','POST',{...input,description:'Otra descripción para una identidad existente'})).status,409);
 const own={operationId:crypto.randomUUID(),kind:'queja',description:'Reporte exclusivo del empleado sintético',attachments:[],consentRemote:false};employeeReport=(await api('/api/support/reports','POST',own,employee)).body;
 const employeeList=(await api('/api/support/reports','GET',undefined,employee)).body;assert.deepEqual(employeeList.reports.map(item=>item.id),[employeeReport.id]);assert.equal((await api('/api/support/reports/'+localReport.id,'GET',undefined,employee)).status,404);
 assert.equal((await api('/api/support/config','PUT',config())).status,200);const publicValue=(await api('/api/support/config','GET',undefined,employee)).body;assert.ok(!publicValue.endpoint&&!publicValue.clientId&&!publicValue.secret);
 assert.ok(!JSON.stringify((await api('/api/support/config')).body).includes(clientKey));
 const db=new DatabaseSync(path.join(data,p.DATABASE_NAME),{readOnly:true});try{const rows=db.prepare("SELECT payload FROM documents WHERE collection IN ('support-config','support-reports')").all();for(const row of rows){assert.ok(JSON.parse(row.payload).encrypted.startsWith('enc:v1:'));assert.ok(!row.payload.includes('DESCRIPCION_LOCAL_PRIVADA'));assert.ok(!row.payload.includes(clientKey));}}finally{db.close();}
});
test('POS: envío sólo con consentimiento, acuse real, reintento y seguimiento',async()=>{
 assert.equal((await api('/api/support/reports/'+localReport.id+'/send','POST',{})).status,400);
 const sent=await api('/api/support/reports/'+localReport.id+'/send','POST',{consentRemote:true});assert.equal(sent.status,200);assert.ok(sent.body.receipt);assert.equal(sent.body.delivery,'recibido');assert.equal((await api('/api/support/reports/'+localReport.id+'/send','POST',{consentRemote:true})).body.receipt,sent.body.receipt);
 const received=await privateApi('/reports/'+localReport.id);assert.ok(!JSON.stringify(received.body).includes(pin));assert.deepEqual(Object.keys(received.body).sort(),['attachments','attachmentsReviewed','classification','consentRemote','createdAt','description','id','kind','receipt','receivedAt','replies','status','updatedAt'].sort());
 assert.equal((await privateApi('/reports/'+localReport.id,'PATCH',{status:'resuelto',classification:'interfaz',reply:'Ya revisamos tu sugerencia sintética.'})).status,200);
 const tracking=await api('/api/support/reports/'+localReport.id+'/refresh','POST',{});assert.equal(tracking.body.status,'resuelto');assert.equal(tracking.body.replies[0].text,'Ya revisamos tu sugerencia sintética.');
 assert.equal((await api('/api/support/reports/'+localReport.id+'/refresh','POST',{},employee)).status,404);
});
test('Fallo remoto: el reporte permanece local, sin acuse inventado ni pérdida',async()=>{
 assert.equal((await api('/api/support/config','PUT',{...config(),endpoint:'http://127.0.0.1:1'})).status,200);
 const response=await api('/api/support/reports','POST',{operationId:crypto.randomUUID(),kind:'error',description:'Prueba sintética con receptor fuera de servicio',attachments:[],consentRemote:true});assert.equal(response.status,201);assert.equal(response.body.receipt,null);assert.equal(response.body.delivery,'local');assert.match(response.body.notice,/No se obtuvo acuse/);
 assert.equal((await api('/api/support/config','PUT',config())).status,200);assert.equal((await api('/api/support/reports/'+response.body.id+'/send','POST',{consentRemote:true})).status,200);
});
test('Navegador POS y bandeja: formularios, seguimiento seguro y limpieza al salir',async()=>{
 const {chromium}=require('C:/Users/nexar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1366,height:768}});await context.addCookies([{name:admin.split('=')[0],value:admin.slice(admin.indexOf('=')+1),url:base}]);await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.waitForFunction(()=>state.sessionAuthenticated&&init.ready);await page.locator('#sessionSwitchBtn').click();await page.locator('#accountSupportBtn').click();await page.locator('#supportDialog').waitFor({state:'visible'});await page.locator('#supportDescription').fill('Interfaz sintética: el buzón conserva la posición del POS.');await page.locator('#supportSaveBtn').click();await page.waitForFunction(()=>document.getElementById('supportNotice').textContent.includes('Guardado'));assert.ok(await page.locator('#supportDetailReceipt').textContent());await page.evaluate(()=>logoutToAccess());assert.equal(await page.locator('#supportDialog').evaluate(element=>element.open),false);assert.equal(await page.locator('#supportDescription').inputValue(),'');assert.equal(await page.locator('#supportReports').textContent(),'');assert.deepEqual(errors,[]);
 const adminPage=await browser.newPage();await adminPage.route('**/*',route=>new URL(route.request().url()).origin===remoteBase?route.continue():route.abort());await adminPage.goto(remoteBase+'/admin/');await adminPage.locator('#token').fill(adminToken);await adminPage.locator('#login button').click();await adminPage.locator('#inbox').waitFor({state:'visible'});await adminPage.locator('#reports article button').first().click();await adminPage.locator('#detail').waitFor({state:'visible'});assert.equal(await adminPage.evaluate(()=>window.mailboxInjected),undefined);const img=adminPage.locator('#images img').first();await img.waitFor({state:'visible'});await adminPage.waitForFunction(()=>document.querySelector('#images img')?.naturalWidth===4);await adminPage.locator('#status').selectOption('en_revision');await adminPage.locator('#reply').fill('Respuesta desde la bandeja sintética.');await adminPage.locator('#respond button').click();await adminPage.waitForFunction(()=>document.getElementById('detailNotice').textContent==='Seguimiento guardado.');await adminPage.locator('#close').click();await adminPage.locator('#logout').click();assert.equal(await adminPage.locator('#description').textContent(),'');await browser.close();browser=null;
});
test('Recuperación cifrada: folios, configuración y respuestas se preservan con la clave original',async()=>{
 await stop();const custody=require('./recovery-custody'),backup=path.join(area,'support-synthetic.emrecovery'),destination=path.join(area,'recovered'),password='Synthetic-recovery-only-2026';const originalTemp=process.env.TEMP,originalTmp=process.env.TMP;process.env.TEMP=area;process.env.TMP=area;
 try{const original=new DatabaseSync(path.join(data,p.DATABASE_NAME),{readOnly:true});let expected;try{expected=original.prepare("SELECT collection,document_id,payload FROM documents WHERE collection LIKE 'support-%' ORDER BY collection,document_id").all();}finally{original.close();}custody.exportCustody({databaseFile:path.join(data,p.DATABASE_NAME),keyFile:path.join(data,'.secrets.json'),destination:backup,password});assert.throws(()=>custody.restoreCustody({archive:backup,destination:path.join(area,'wrong'),password:'Incorrect-synthetic-only'}));assert.equal(fs.existsSync(path.join(area,'wrong')),false);custody.restoreCustody({archive:backup,destination,password});const restored=new DatabaseSync(path.join(destination,p.DATABASE_NAME),{readOnly:true});try{assert.deepEqual(restored.prepare("SELECT collection,document_id,payload FROM documents WHERE collection LIKE 'support-%' ORDER BY collection,document_id").all(),expected);}finally{restored.close();}p.validateKey(p.readKeyFile(path.join(destination,'.secrets.json')),p.inspectDatabase(path.join(destination,p.DATABASE_NAME)));assert.ok(expected.length>=4);}finally{process.env.TEMP=originalTemp;process.env.TMP=originalTmp;}
});
