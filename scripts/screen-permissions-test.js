const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const vm=require('node:vm');
const {test,before,after}=require('node:test');
const {MODULES,EMPLOYEE_DEFAULTS}=require('../src/access');
const root=path.resolve(__dirname,'..'),dev=path.join(root,'.dev');
const adminPin='864209',employeePin='135790';
let directory,child,base,adminCookie,aliceCookie,bobCookie,pinSnapshot,commercialSnapshot;
const all=value=>Object.fromEntries(MODULES.map(id=>[id,value]));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(route,method='GET',body,cookie=adminCookie){const headers={'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})};if(route==='/api/sales'&&method==='POST')body=await require('./checkout-test-client').completeCheckout(base,body,headers);const response=await fetch(base+route,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function start(){const port=process.env.SCREEN_TEST_PORT||await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});base='http://127.0.0.1:'+port;child=spawn(process.execPath,['src/server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:directory,ENV_FILE:path.join(directory,'absent.env'),ADMIN_PIN:adminPin,EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',REQUIRE_HTTPS:'false',CORS_ORIGIN:''},stdio:'ignore'});for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error('No inició el servidor aislado');try{if((await fetch(base+'/api/health')).ok)return;}catch{}await pause(100);}throw Error('Tiempo de inicio agotado');}
async function stop(){if(child&&child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}}
async function login(role,id){const response=await request('/api/auth/'+role,'POST',role==='admin'?{pin:adminPin}:{userId:id,pin:employeePin},null);assert.equal(response.status,200);return response;}
async function setPermissions(id,permissions){const response=await request('/api/users/'+id+'/permissions','PUT',{permissions});assert.equal(response.status,200);return response.body;}
function readRows(collection){const db=new DatabaseSync(path.join(directory,'el-muelle-pos.sqlite'),{readOnly:true});try{return db.prepare('SELECT document_id,payload FROM documents WHERE collection=? ORDER BY document_id').all(collection);}finally{db.close();}}
function secrets(){const settings=JSON.parse(readRows('settings')[0].payload);return {admin:[settings.adminPinSalt,settings.adminPinHash],employees:Object.fromEntries(settings.users.filter(u=>u.role==='employee').map(u=>[u.id,[u.role,u.pinSalt,u.pinHash]]))};}
async function setup(){fs.mkdirSync(dev,{recursive:true});directory=fs.mkdtempSync(path.join(dev,'em003-permissions-test-'));const products=Array.from({length:28},(_,i)=>({id:'synthetic-'+i,name:'Producto sintético '+i,category:'Pruebas',unit:'kg',price:175,costPrice:80,stockQuantity:12,minStockQuantity:2,active:true}));fs.writeFileSync(path.join(directory,'products.json'),JSON.stringify(products));fs.writeFileSync(path.join(directory,'sales.json'),JSON.stringify(['alice','bob'].map((id,i)=>({id:'T-00000'+(i+1),createdAt:new Date().toISOString(),status:'completada',operator:{id,name:id},subtotal:175,total:175,items:[{productId:'synthetic-0',name:'Producto sintético 0',unit:'kg',quantity:1,price:175,total:175,lineCost:80}],invoice:{status:'no_solicitada'}}))));await start();adminCookie=(await login('admin')).cookie;const users=[{id:'admin',name:'Administrador sintético',role:'admin',active:true},{id:'alice',name:'Alice sintética',role:'employee',active:true},{id:'bob',name:'Bob sintético',role:'employee',active:true}];assert.equal((await request('/api/settings','PUT',{users,employeePins:{alice:employeePin,bob:employeePin}})).status,200);aliceCookie=(await login('employee','alice')).cookie;bobCookie=(await login('employee','bob')).cookie;pinSnapshot=secrets();}
async function cleanup(){await stop();if(directory&&path.resolve(directory).startsWith(path.resolve(dev)+path.sep))fs.rmSync(directory,{recursive:true,force:true});}
if(process.argv.includes('--serve-ui')){
  setup().then(()=>{console.log('Entorno sintético de permisos: '+base);process.on('SIGINT',()=>cleanup().then(()=>process.exit()));}).catch(error=>{console.error(error.message);cleanup().then(()=>process.exit(1));});
}else{
before(setup);after(cleanup);
test('Migración compatible: política anterior por empleado y acceso total del administrador',async()=>{
  assert.deepEqual(EMPLOYEE_DEFAULTS,{pos:true,sales:true,cash:true,billing:true,products:false,inventory:false,dashboard:false,reports:true,settings:false});
  commercialSnapshot={products:readRows('products'),sales:readRows('sales')};
  assert.deepEqual((await request('/api/auth/session','GET',undefined,aliceCookie)).body.user.permissions,EMPLOYEE_DEFAULTS);
  assert.deepEqual((await request('/api/auth/session')).body.user.permissions,all(true));
  assert.deepEqual((await request('/api/users/alice/permissions')).body.permissions,EMPLOYEE_DEFAULTS);
  assert.equal((await request('/api/users/alice/permissions','GET',undefined,null)).status,401);
  assert.ok((await request('/api/settings','GET',undefined,null)).body.users.every(user=>!Object.hasOwn(user,'permissions')));
});
test('Sólo administrador: deniega cambios propios, ajenos, identidad admin y entradas inválidas',async()=>{
  for(const id of ['alice','bob'])for(const method of ['GET','PUT'])assert.equal((await request('/api/users/'+id+'/permissions',method,method==='PUT'?{permissions:all(true)}:undefined,aliceCookie)).status,403);
  assert.equal((await request('/api/users/admin/permissions','PUT',{permissions:all(false)})).status,404);
  for(const body of [{permissions:{pos:true}},{permissions:{...all(true),unknown:true}},{permissions:{...all(true),pos:1}},{permissions:all(true),role:'admin'}])assert.equal((await request('/api/users/alice/permissions','PUT',body)).status,400);
});
test('Concesión de pantallas: consulta real, sin privilegios administrativos ni ventas ajenas',async()=>{
  await setPermissions('alice',all(true));
  assert.equal((await request('/api/inventory/entries','GET',undefined,aliceCookie)).status,200);
  for(const [route,method,body] of [['/api/configuration','GET'],['/api/configuration/integrity','GET'],['/api/audit-events','GET'],['/api/settings','PUT',{}],['/api/products','POST',{}],['/api/products/synthetic-0','PUT',{}],['/api/products/synthetic-0/inventory','PATCH',{}],['/api/inventory/entries','POST',{}],['/api/sales/T-000001/invoice','PATCH',{}],['/api/sales/T-000001/cancel','PATCH',{}]])assert.equal((await request(route,method,body,aliceCookie)).status,403,route);
  assert.equal((await request('/api/sales/T-000002','GET',undefined,aliceCookie)).status,403);
  assert.ok((await request('/api/sales','GET',undefined,aliceCookie)).body.every(s=>s.operator.id==='alice'&&s.invoice.customer===null));
  assert.equal((await request('/api/auth/session','GET',undefined,aliceCookie)).body.user.role,'employee');
});
test('Revocación total: APIs exclusivas 403, sesión y preferencias personales disponibles',async()=>{
  await setPermissions('alice',all(false));
  for(const route of ['/api/products','/api/products/','/api/Products','/api/sales','/api/inventory/entries','/api/Inventory/entries/','/api/cash-sessions','/api/cash-shifts'])assert.equal((await request(route,'GET',undefined,aliceCookie)).status,403,route);
  assert.equal((await request('/api/sales','POST',{},aliceCookie)).status,403);
  assert.equal((await request('/api/cash-sessions/open','POST',{},aliceCookie)).status,403);
  assert.equal((await request('/api/preferences','GET',undefined,aliceCookie)).status,200);
  assert.equal((await request('/api/auth/session','GET',undefined,aliceCookie)).body.authenticated,true);
  assert.deepEqual((await request('/api/auth/session','GET',undefined,bobCookie)).body.user.permissions,EMPLOYEE_DEFAULTS);
  assert.deepEqual({products:readRows('products'),sales:readRows('sales')},commercialSnapshot);
});
test('POS sin administración: catálogo y estado mínimo de caja; cobro y rechazo de servicios prohibidos',async()=>{
  await setPermissions('alice',{...all(false),pos:true});
  assert.equal((await request('/api/products','GET',undefined,aliceCookie)).status,200);
  assert.equal((await request('/api/sales','GET',undefined,aliceCookie)).status,403);
  const metadata=await request('/api/sales?context=pos','GET',undefined,aliceCookie);assert.equal(metadata.status,200);assert.deepEqual(Object.keys(metadata.body[0]).sort(),['createdAt','id','items','status']);
  assert.equal((await request('/api/cash-sessions/open','POST',{openingAmount:100})).status,201);
  const current=await request('/api/cash-sessions/current','GET',undefined,aliceCookie);assert.equal(current.status,200);assert.ok(current.body.session.id);assert.equal(current.body.session.openingAmount,undefined);
  const sale=await request('/api/sales','POST',{items:[{productId:'synthetic-0',quantity:1,source:'scale'}],paymentMethod:'efectivo',amountReceived:200},aliceCookie);assert.equal(sale.status,201);assert.equal(sale.body.total,175);
  assert.deepEqual(secrets(),pinSnapshot);
});
test('Sesión activa recibe revocación real por SSE; auditoría registra actor, empleado y cambio sin secretos',async()=>{
  const controller=new AbortController();
  const response=await fetch(base+'/api/access/events',{headers:{Cookie:aliceCookie},signal:controller.signal});assert.equal(response.status,200);
  const reader=response.body.getReader(),decoder=new TextDecoder();let stream='';
  async function event(){while(!stream.includes('\n\n')){const chunk=await Promise.race([reader.read(),pause(3000).then(()=>{throw Error('No llegó la actualización SSE');})]);assert.equal(chunk.done,false);stream+=decoder.decode(chunk.value);}const end=stream.indexOf('\n\n'),raw=stream.slice(0,end);stream=stream.slice(end+2);return JSON.parse(raw.split('\ndata: ')[1]);}
  try{assert.equal((await event()).permissions.pos,true);await setPermissions('alice',all(false));assert.equal((await event()).permissions.pos,false);assert.equal((await request('/api/products','GET',undefined,aliceCookie)).status,403);}finally{controller.abort();await reader.cancel().catch(()=>{});}
  const audit=(await request('/api/audit-events')).body.filter(row=>row.event_type==='screen_permission_changed'&&row.entity_id==='alice');
  assert.ok(audit.length);assert.ok(audit.every(row=>row.actor_id==='admin'&&row.created_at));
  const detail=typeof audit[0].details==='string'?JSON.parse(audit[0].details):audit[0].details;assert.ok(MODULES.includes(detail.module));assert.equal(typeof detail.previous,'boolean');assert.equal(typeof detail.next,'boolean');
  assert.ok(!JSON.stringify(audit).includes(employeePin));assert.deepEqual(secrets(),pinSnapshot);
});
test('Reinicio conserva accesos independientes, roles, PIN y operaciones comerciales confirmadas',async()=>{
  await stop();await start();adminCookie=(await login('admin')).cookie;aliceCookie=(await login('employee','alice')).cookie;bobCookie=(await login('employee','bob')).cookie;
  assert.deepEqual((await request('/api/users/alice/permissions')).body.permissions,all(false));
  assert.deepEqual((await request('/api/users/bob/permissions')).body.permissions,EMPLOYEE_DEFAULTS);
  assert.equal(readRows('sales').length,3);assert.equal(readRows('products').length,28);assert.deepEqual(secrets(),pinSnapshot);
});
test('La comprobación pasiva de sesiones no amplía su vencimiento por inactividad',()=>{
  const serverSource=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
  const getSession=serverSource.match(/^function getSessionUser\([^]*?^}/m)[0];
  const session={userId:'alice',expiresAt:1100},sessions=new Map([['synthetic-token',session]]);
  const context={getCookies:()=>({el_muelle_session:'synthetic-token'}),authSessions:sessions,readSettings:()=>({users:[{id:'alice',role:'employee',active:true}]}),Date:{now:()=>100},AUTH_SESSION_MS:5000};
  vm.createContext(context);vm.runInContext(getSession,context);assert.equal(context.getSessionUser({},false).id,'alice');assert.equal(session.expiresAt,1100);context.getSessionUser({},true);assert.equal(session.expiresAt,5100);
});
}
