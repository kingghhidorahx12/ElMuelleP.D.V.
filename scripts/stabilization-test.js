// EM-003: servidor, datos, claves y usuarios exclusivamente sintéticos.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const p=require('../src/persistence');
const root=path.resolve(__dirname,'..'),dev=path.join(root,'.dev');
let area,data,child,base,admin,worker,cashId,confirmedBody,confirmedSale;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function stop(){if(child&&child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}}
async function start(){
  const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
  assert.ok(![3000,3001].includes(port));base='http://127.0.0.1:'+port;
  child=spawn(process.execPath,['--require',path.join(area,'clock-hook.js'),'src/server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',NODE_ENV:'test',EL_MUELLE_STORAGE_MODE:'',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,ENV_FILE:path.join(area,'absent.env'),ADMIN_PIN:'',EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',REQUIRE_HTTPS:'false',CORS_ORIGIN:''},stdio:'ignore'});
  for(let i=0;i<200;i++){if(child.exitCode!==null)throw Error('Falló el servidor aislado.');try{if((await fetch(base+'/api/health')).ok)return;}catch{}await pause(100);}throw Error('Timeout del servidor sintético.');
}
async function api(route,method='GET',body,cookie=admin){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(require('./checkout-test-client').completeCatalogOperation(route,method,body))})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],backup:response.headers.get('X-ElMuelle-Backup')};}
const intent=()=>crypto.randomUUID();
function sale(extra={}){return {checkoutIntentId:intent(),cashSessionId:cashId,items:[{productId:'piece',quantity:1,source:'manual'}],paymentMethod:'efectivo',...extra};}
function snapshot(){const db=new DatabaseSync(path.join(data,p.DATABASE_NAME),{readOnly:true});try{return {documents:db.prepare('SELECT * FROM documents ORDER BY collection,document_id').all(),audit:db.prepare('SELECT * FROM audit_events ORDER BY id').all()};}finally{db.close();}}
before(async()=>{area=fs.mkdtempSync(path.join(dev,'em003-stabilization-'));p.restrictPrivatePath(area,true);fs.writeFileSync(path.join(area,'clock-offset'),'0');fs.writeFileSync(path.join(area,'clock-hook.js'),"const fs=require('node:fs'),path=require('node:path'),now=Date.now;Date.now=()=>now()+Number(fs.readFileSync(path.join(__dirname,'clock-offset'),'utf8'));\n");data=path.join(area,'data');fs.mkdirSync(data);fs.writeFileSync(path.join(data,'products.json'),JSON.stringify([{id:'piece',name:'Producto sintético',category:'Pruebas',unit:'pieza',price:100,costPrice:40,stockQuantity:100,minStock:2,active:true},{id:'kg',name:'Kg sintético',category:'Pruebas',unit:'kg',price:200,costPrice:80,stockQuantity:100,minStock:1,active:true}]));await start();});
after(async()=>{await stop();if(area){assert.ok(p.inside(area,dev)&&path.basename(area).startsWith('em003-stabilization-'));p.rejectLinks(area);fs.rmSync(area,{recursive:true,force:true});}});

test('Primer inicio: sólo propietario, PIN, colaborador nominal y rechazo de segunda configuración',async()=>{
  assert.deepEqual((await api('/api/settings')).body.users,[]);
  const setup=await api('/api/setup/owner','POST',{name:'Propietario sintético',pin:'864209'});assert.equal(setup.status,201);admin=setup.cookie;
  assert.deepEqual(setup.body.settings.users.map(user=>user.role),['admin']);
  assert.equal((await api('/api/setup/owner','POST',{name:'Otro',pin:'135790'})).status,409);
  const users=[{id:'admin',name:'Propietario sintético',role:'admin',active:true},{id:'worker',name:'Colaborador sintético',role:'employee',active:true}];
  assert.equal((await api('/api/settings','PUT',{users,employeePins:{worker:'135790'}})).status,200);
  const login=await api('/api/auth/employee','POST',{userId:'worker',pin:'135790'});assert.equal(login.status,200);worker=login.cookie;
});

test('Productos: rechaza números no finitos, negativos, vacíos, fracciones por pieza y estructuras inválidas',async()=>{
  const valid={name:'Alta sintética',category:'Pruebas',unit:'pieza',price:10,costPrice:0,minStock:1};
  const before=snapshot();
  for(const patch of [{price:1e308},{price:null},{price:''},{price:'abc'},{costPrice:-1},{stockQuantity:-5},{minStock:-1},{stockQuantity:1.5},{unit:'otro'},{active:'false'},{name:{}},{category:[]},{price:true}])assert.equal((await api('/api/products','POST',{...valid,...patch})).status,400,JSON.stringify(patch));
  assert.equal((await api('/api/products','POST',[])).status,400);
  assert.deepEqual(snapshot(),before);
  const created=await api('/api/products','POST',valid);assert.equal(created.status,201);
  const id=created.body.id;
  assert.equal((await api('/api/products/'+id,'PUT',{price:12.5,active:false})).status,200);
  assert.equal((await api('/api/products/'+id,'PUT',{price:1e308})).status,400);
  const reactivated=await api('/api/products/'+id,'PUT',{active:true});assert.equal(reactivated.body.price,12.5);assert.equal(reactivated.body.active,true);
});

test('Caja: fondos y fechas calendáricas válidas, apertura única y movimientos estrictos',async()=>{
  for(const body of [{openingAmount:'abc'},{openingAmount:null},{openingAmount:''},{openingAmount:-1},{openingAmount:1e308},{openingAmount:0,businessDate:'2026-02-30'},{openingAmount:0,businessDate:'2026-99-99'},{openingAmount:0,businessDate:'2025-02-29'}])assert.equal((await api('/api/cash-sessions/open','POST',body)).status,400);
  const opened=await api('/api/cash-sessions/open','POST',{openingAmount:100,businessDate:'2024-02-29'});assert.equal(opened.status,201);cashId=opened.body.id;
  assert.equal((await api('/api/cash-sessions/open','POST',{openingAmount:1})).status,409);
  for(const body of [{type:'otro',amount:1},{type:'in',amount:null},{type:'out',amount:-1},{type:'in',amount:1e308}])assert.equal((await api('/api/cash-sessions/'+cashId+'/movements','POST',body)).status,400);
  assert.equal((await api('/api/cash-sessions/'+cashId+'/movements','POST',{type:'in',amount:20})).status,201);
  assert.equal((await api('/api/cash-sessions/'+cashId+'/movements','POST',{type:'out',amount:10})).status,201);
});

test('Ventas: caja alterada, intención ausente, cantidades y pagos inválidos no modifican existencias',async()=>{
  const before=snapshot();
  for(const body of [sale({cashSessionId:'inexistente'}),sale({businessDate:'2026-01-01'})])assert.equal((await api('/api/sales','POST',body)).status,409);
  for(const body of [sale({checkoutIntentId:undefined}),sale({items:[{productId:'piece',quantity:1.5}]}),sale({items:[{productId:'piece',quantity:null}]}),sale({items:[{productId:'kg',quantity:.001}]}),sale({paymentMethod:'otro'}),sale({paymentMethod:'tarjeta'}),sale({paymentDetails:[]}),sale({discount:1e308}),sale({invoiceRequested:'false'})])assert.equal((await api('/api/sales','POST',body)).status,400);
  assert.deepEqual(snapshot(),before);
});

test('Dos POST simultáneos para una intención: un folio, una salida de inventario y un evento',async()=>{
  const body=sale(),before=(await api('/api/products')).body.find(p=>p.id==='piece').stockQuantity;
  const responses=await Promise.all([api('/api/sales','POST',body),api('/api/sales','POST',body)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);assert.equal(responses[0].body.id,responses[1].body.id);
  assert.equal((await api('/api/products')).body.find(p=>p.id==='piece').stockQuantity,before-1);
  assert.equal((await api('/api/audit-events')).body.filter(e=>e.event_type==='sale_completed'&&e.entity_id===responses[0].body.id).length,1);
  confirmedBody=body;confirmedSale=responses[0].body;
});

test('Respuesta perdida: reintento devuelve la venta confirmada; cambios con la misma intención se rechazan',async()=>{
  const before=snapshot();assert.equal((await api('/api/sales','POST',confirmedBody)).body.id,confirmedSale.id);
  assert.equal((await api('/api/sales','POST',{...confirmedBody,items:[{productId:'piece',quantity:2}]})).status,409);
  assert.deepEqual(snapshot(),before);
  const lost=sale();await fetch(base+'/api/sales',{method:'POST',headers:{Cookie:admin,'Content-Type':'application/json'},body:JSON.stringify(lost)});
  assert.equal((await api('/api/sales','POST',lost)).status,200);
});

test('Dos compras legítimas idénticas con intenciones distintas generan ventas distintas',async()=>{
  const a=await api('/api/sales','POST',sale()),b=await api('/api/sales','POST',sale());assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual(a.body.id,b.body.id);
});

test('Peso manual: autorización vinculada a usuario, sesión, intención, producto, cantidad y caja',async()=>{
  const body=sale({items:[{productId:'kg',quantity:1,source:'manual'}]});
  assert.equal((await api('/api/sales','POST',body,worker)).status,403);
  const request={reason:'otro',explanation:'Detalle sintético autorizado',pin:'864209',productId:'kg',quantity:1,checkoutIntentId:body.checkoutIntentId,cashSessionId:cashId};
  assert.equal((await api('/api/authorizations/manual-weight','POST',{...request,pin:'999999'},worker)).status,401);
  assert.equal((await api('/api/authorizations/manual-weight','POST',{...request,quantity:-1},worker)).status,400);
  assert.equal((await api('/api/authorizations/manual-weight','POST',{...request,cashSessionId:'otro'},worker)).status,409);
  const authorized=await api('/api/authorizations/manual-weight','POST',request,worker);assert.equal(authorized.status,200);assert.ok(authorized.body.expiresAt);
  body.items[0].manualAuthorization=authorized.body.token;
  assert.equal((await api('/api/sales','POST',{...body,items:[{...body.items[0],quantity:2}]},worker)).status,403);
  assert.equal((await api('/api/sales','POST',body,admin)).status,403);
  const saved=await api('/api/sales','POST',body,worker);assert.equal(saved.status,201);assert.equal(saved.body.operator.name,'Colaborador sintético');
  assert.equal((await api('/api/sales','POST',body,worker)).status,200);
  assert.equal((await api('/api/sales','POST',{...body,checkoutIntentId:intent()},worker)).status,403);
  const events=await api('/api/audit-events');assert.ok(events.body.some(e=>e.event_type==='manual_weight_authorized'));assert.ok(!JSON.stringify(events.body).includes(authorized.body.token));assert.ok(!JSON.stringify(events.body).includes('864209'));
  const scale=await api('/api/sales','POST',sale({items:[{productId:'kg',quantity:1,source:'scale'}]}),worker);assert.equal(scale.status,201);
});

test('Administrador, tarjeta, transferencia, descuentos existentes y cancelación conservan totales',async()=>{
  for(const paymentMethod of ['tarjeta','transferencia']){const result=await api('/api/sales','POST',sale({paymentMethod,paymentDetails:{reference:'SINTETICO'}}));assert.equal(result.status,201);assert.equal(result.body.total,100);}
  const manualBody=sale({items:[{productId:'kg',quantity:1,source:'manual'}],discount:10,discountReason:'Prueba sintética'});const adminGrant=await api('/api/authorizations/manual-weight','POST',{pin:'864209',productId:'kg',quantity:1,checkoutIntentId:manualBody.checkoutIntentId,cashSessionId:cashId,reason:'falla_bascula'});assert.equal(adminGrant.status,200);manualBody.items[0].manualAuthorization=adminGrant.body.token;
  const manual=await api('/api/sales','POST',manualBody);assert.equal(manual.status,201);assert.equal(manual.body.total,190);
  const stock=(await api('/api/products')).body.find(p=>p.id==='kg').stockQuantity;
  assert.equal((await api('/api/sales/'+manual.body.id+'/cancel','PATCH',{reason:'Cancelación sintética'})).status,200);
  assert.equal((await api('/api/sales/'+manual.body.id+'/cancel','PATCH',{reason:'Cancelación duplicada'})).status,400);
  assert.equal((await api('/api/products')).body.find(p=>p.id==='kg').stockQuantity,stock+1);
});

test('La autorización manual vencida o duplicada en dos partidas no puede reutilizarse',async()=>{
  const body=sale({items:[{productId:'kg',quantity:1,source:'manual'}]});
  const grant=await api('/api/authorizations/manual-weight','POST',{reason:'otro',explanation:'Detalle sintético autorizado',pin:'864209',productId:'kg',quantity:1,checkoutIntentId:body.checkoutIntentId,cashSessionId:cashId},worker);assert.equal(grant.status,200);body.items[0].manualAuthorization=grant.body.token;
  const before=snapshot();
  assert.equal((await api('/api/sales','POST',{...body,items:[body.items[0],body.items[0]]},worker)).status,403);
  fs.writeFileSync(path.join(area,'clock-offset'),'300001');
  try{assert.equal((await api('/api/sales','POST',body,worker)).status,403);assert.deepEqual(snapshot(),before);}finally{fs.writeFileSync(path.join(area,'clock-offset'),'0');}
});

test('Inventario: unidades, fechas, ajustes y costo ponderado válidos sin cambios ante rechazo',async()=>{
  const before=snapshot();
  for(const patch of [{quantity:-1},{quantity:1.5},{unitCost:null},{unitCost:1e308},{receivedAt:'2026-04-31'},{salePrice:''}])assert.equal((await api('/api/inventory/entries','POST',{productId:'piece',quantity:1,unitCost:40,...patch})).status,400);
  assert.equal((await api('/api/products/piece/inventory','PATCH',{stockQuantity:2,minStock:1,reason:''})).status,400);
  assert.equal((await api('/api/products/piece/inventory','PATCH',{stockQuantity:-1,minStock:1,reason:'Prueba'})).status,400);
  assert.deepEqual(snapshot(),before);
  assert.equal((await api('/api/inventory/entries','POST',{productId:'piece',quantity:2,unitCost:40,receivedAt:'2024-02-29',reason:'Recepción sintética'})).status,201);
  assert.equal((await api('/api/products/piece/inventory','PATCH',{stockQuantity:40,minStock:2,reason:'Merma sintética'})).status,200);
});

test('Solicitud fiscal: estructuras y correo inválidos, duplicados y venta cancelada',async()=>{
  const body={rfc:'XAXX010101000',businessName:'Cliente sintético',fiscalZip:'00000',fiscalRegime:'601',cfdiUse:'G03',email:'cliente@example.invalid'};
  for(const patch of [{businessName:{}},{fiscalRegime:[]},{email:'invalido'},{fiscalZip:'1234'}])assert.equal((await api('/api/sales/'+confirmedSale.id+'/invoice','PATCH',{...body,...patch})).status,400);
  assert.equal((await api('/api/sales/'+confirmedSale.id+'/invoice','PATCH',body)).status,200);
  assert.equal((await api('/api/sales/'+confirmedSale.id+'/invoice','PATCH',body)).status,409);
});

test('Colaborador desactivado: persiste, revoca SSE y sesión, conserva permisos y operaciones históricas',async()=>{
  const granted=Object.fromEntries(require('../src/access').MODULES.map(id=>[id,id==='pos'||id==='sales']));
  assert.equal((await api('/api/users/worker/permissions','PUT',{permissions:granted})).status,200);
  const stream=await fetch(base+'/api/access/events',{headers:{Cookie:worker}}),reader=stream.body.getReader();await reader.read();
  const users=(await api('/api/settings')).body.users;
  const result=await api('/api/settings','PUT',{users:users.map(u=>u.id==='worker'?{...u,active:false}:u)});assert.equal(result.status,200);assert.equal(result.body.users.find(u=>u.id==='worker').active,false);
  const event=await Promise.race([reader.read(),pause(3000).then(()=>{throw Error('No se revocó SSE');})]);assert.match(new TextDecoder().decode(event.value),/expired/);await reader.cancel();
  assert.equal((await api('/api/sales','GET',undefined,worker)).status,401);
  assert.equal((await api('/api/auth/employee','POST',{userId:'worker',pin:'135790'})).status,401);
  assert.deepEqual((await api('/api/users/worker/permissions')).body.permissions,granted);
  assert.ok((await api('/api/sales')).body.some(s=>s.operator?.name==='Colaborador sintético'));
  assert.equal((await api('/api/settings','PUT',{users:users.map(u=>u.role==='admin'?{...u,active:false}:u)})).status,400);
});

test('Cierre concurrente, cambio de turno y reintento confirmado no reasignan ni duplican ventas',async()=>{
  const invalidClose=await api('/api/cash-sessions/'+cashId+'/close','POST',{countedCash:null});assert.equal(invalidClose.status,400);
  const body=sale(),old=cashId;const results=await Promise.all([api('/api/cash-sessions/'+old+'/close','POST',{countedCash:0}),api('/api/sales','POST',body)]);
  assert.equal(results[0].status,200);assert.ok([201,409].includes(results[1].status));
  cashId=(await api('/api/cash-sessions/open','POST',{openingAmount:0})).body.id;
  assert.equal((await api('/api/sales','POST',sale({cashSessionId:old}))).status,409);
  assert.equal((await api('/api/sales','POST',confirmedBody)).body.cashSessionId,old);
});

test('Reinicio: intención confirmada, baja del colaborador, productos y configuración permanecen',async()=>{
  await stop();const keyHash=hash(path.join(data,'.secrets.json'));await start();admin=(await api('/api/auth/admin','POST',{pin:'864209'})).cookie;
  assert.equal((await api('/api/sales','POST',confirmedBody)).body.id,confirmedSale.id);
  assert.equal((await api('/api/auth/employee','POST',{userId:'worker',pin:'135790'})).status,401);
  assert.equal((await api('/api/settings')).body.users.find(u=>u.id==='worker').active,false);
  assert.equal(hash(path.join(data,'.secrets.json')),keyHash);assert.equal((await api('/api/configuration/integrity')).body.ok,true);
});

test('Fallo del respaldo se informa sin negar ni duplicar una venta ya confirmada',async()=>{
  const backups=path.join(data,'backups'),saved=path.join(area,'previous-backups');assert.ok(p.inside(backups,area)&&p.inside(saved,area));fs.renameSync(backups,saved);fs.writeFileSync(backups,'Obstáculo exclusivamente sintético');
  try{const body=sale(),result=await api('/api/sales','POST',body);assert.equal(result.status,201);assert.equal(result.backup,'pending');assert.equal((await api('/api/configuration')).body.backupStatus.failed,true);assert.equal((await api('/api/sales','POST',body)).body.id,result.body.id);}
  finally{fs.unlinkSync(backups);fs.renameSync(saved,backups);}
  assert.equal((await api('/api/sales','POST',sale())).backup,null);
});
