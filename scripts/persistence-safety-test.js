const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const p=require('../src/persistence');
const {PosDatabase}=require('../src/database');
const {restoreData}=require('./restore-data');
const project=path.resolve(__dirname,'..'),dev=path.join(project,'.dev');
const pin='864209',workerPin='135790';
let temporary,program,updatedProgram,sourceData,localAppData,persistentRoot,persistentData,child,base,cookie,saleId,oldCookie;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function assertTemporary(target){assert.ok(p.inside(path.resolve(target),temporary)&&path.resolve(target)!==temporary);p.rejectLinks(target);}
function directory(name){const target=path.join(temporary,name);assertTemporary(target);p.privateDirectory(target);return target;}
function copyProgram(target){
  assertTemporary(target);fs.mkdirSync(target,{recursive:true});fs.cpSync(path.join(project,'src'),path.join(target,'src'),{recursive:true});fs.copyFileSync(path.join(project,'package.json'),path.join(target,'package.json'));
  if(path.basename(target)==='app'){
    const root=path.dirname(target);fs.mkdirSync(path.join(root,'runtime'));fs.copyFileSync(process.execPath,path.join(root,'runtime/node.exe'));
    fs.mkdirSync(path.join(target,'scripts'));for(const name of ['restore-data.js','recovery-custody.js'])fs.copyFileSync(path.join(project,'scripts',name),path.join(target,'scripts',name));
    fs.copyFileSync(path.join(project,'portable/Start-ElMuellePOS.ps1'),path.join(root,'Start-ElMuellePOS.ps1'));
    require('./seal-release').sealPackage(root);
  }
}
async function port(){return new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const value=socket.address().port;socket.close(()=>resolve(value));});});}
async function stop(){if(child&&child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}}
function serverEnv(directory,installed=false,extra={}){assertTemporary(directory);return {...process.env,NODE_OPTIONS:'',NODE_PATH:path.join(project,'node_modules'),NODE_ENV:'test',HOST:'127.0.0.1',DATA_DIR:directory,ENV_FILE:path.join(temporary,'absent.env'),ADMIN_PIN:pin,EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',REQUIRE_HTTPS:'false',CORS_ORIGIN:'',EL_MUELLE_STORAGE_MODE:installed?'windows-user':'',LOCALAPPDATA:localAppData,...extra};}
async function start(appRoot,directory,{installed=false,extra={},failure=false}={}){
  assertTemporary(appRoot);const selected=await port();assert.ok(![3000,3001].includes(selected));base='http://127.0.0.1:'+selected;
  child=spawn(process.execPath,[path.join(appRoot,'src/server.js')],{cwd:appRoot,windowsHide:true,env:{...serverEnv(directory,installed,extra),PORT:String(selected)},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  for(let i=0;i<300;i++){
    if(child.exitCode!==null){if(failure){assert.notEqual(child.exitCode,0);return output;}throw Error('El servidor sintético no inició.');}
    if(!failure)try{if((await fetch(base+'/api/health')).ok)return;}catch{}
    await pause(100);
  }
  await stop();throw Error('La instancia temporal no completó el arranque esperado.');
}
async function api(route,method='GET',body,session=cookie){const headers={'Content-Type':'application/json',...(session?{Cookie:session}:{})};if(route==='/api/sales'&&method==='POST')body=await require('./checkout-test-client').completeCheckout(base,body,headers);const response=await fetch(base+route,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function login(){const result=await api('/api/auth/admin','POST',{pin},null);assert.equal(result.status,200);cookie=result.cookie;}
function rows(directory){const db=new DatabaseSync(path.join(directory,p.DATABASE_NAME),{readOnly:true});try{return {documents:db.prepare('SELECT * FROM documents ORDER BY collection,document_id').all(),audit:db.prepare('SELECT * FROM audit_events ORDER BY id').all()};}finally{db.close();}}
function fileTree(directory){const entries=[];for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory())for(const [name,value] of fileTree(file))entries.push([item.name+'/'+name,value]);else entries.push([item.name,hash(file)]);}return entries.sort(([a],[b])=>a.localeCompare(b));}
before(()=>{
  fs.mkdirSync(dev,{recursive:true});temporary=fs.mkdtempSync(path.join(dev,'em003-persistence-test-'));p.restrictPrivatePath(temporary,true);
  program=path.join(temporary,'program-v1');updatedProgram=path.join(temporary,'program-v2/app');copyProgram(program);
  sourceData=path.join(program,'data');p.privateDirectory(sourceData);
  localAppData=directory('LocalAppData');persistentRoot=path.join(localAppData,'ElMuellePOS');p.privateDirectory(persistentRoot);persistentData=path.join(persistentRoot,'data');
  fs.writeFileSync(path.join(sourceData,'products.json'),JSON.stringify(Array.from({length:28},(_,i)=>({id:'synthetic-'+i,name:'Producto sintético '+i,category:'Pruebas',unit:'pieza',price:100,costPrice:40,stockQuantity:10,minStock:2,active:true}))));
});
after(async()=>{await stop();if(temporary){assert.ok(p.inside(temporary,dev)&&path.basename(temporary).startsWith('em003-persistence-test-'));fs.rmSync(temporary,{recursive:true,force:true});}});

test('Rutas Windows: datos externos estables, DATA_DIR explícito y rechazo de adopción silenciosa',()=>{
  const env={LOCALAPPDATA:localAppData,EL_MUELLE_STORAGE_MODE:'windows-user'};
  const storage=p.resolveStorage({env,platform:'win32',appRoot:program});
  assert.equal(storage.dataDir,persistentData);assert.equal(storage.envPath,path.join(persistentRoot,'config','.env'));assert.ok(!p.inside(storage.dataDir,program));
  assert.equal(p.resolveStorage({env:{...env,DATA_DIR:sourceData},platform:'win32',appRoot:path.join(temporary,'different-program')}).dataDir,sourceData);
  assert.throws(()=>p.resolveStorage({env:{...env,DATA_DIR:sourceData},platform:'win32',appRoot:program}),{code:'STORAGE_OVERLAP'});
  assert.throws(()=>p.resolveStorage({env:{...env,LOCALAPPDATA:program},platform:'win32',appRoot:program}),{code:'STORAGE_OVERLAP'});
  assert.throws(()=>p.resolveStorage({env:{...env,LOCALAPPDATA:''},platform:'win32',appRoot:program}),{code:'STORAGE_PROFILE'});
  assert.equal(p.resolveStorage({env:{DATA_DIR:sourceData},appRoot:program}).dataDir,sourceData);
  const fixture=directory('packaged-program'),app=path.join(fixture,'app');fs.mkdirSync(app);
  assert.throws(()=>p.resolveStorage({env:{...env,DATA_DIR:path.join(fixture,'other-data')},platform:'win32',appRoot:app}),{code:'STORAGE_OVERLAP'});
  fs.writeFileSync(path.join(app,'.env'),'# Configuración sintética legada');assert.throws(()=>p.resolveStorage({env,platform:'win32',appRoot:app}),{code:'LEGACY_CONFIG_REQUIRES_SELECTION'});
  fs.unlinkSync(path.join(app,'.env'));fs.mkdirSync(path.join(fixture,'browser-profile'));fs.writeFileSync(path.join(fixture,'browser-profile','synthetic.json'),'{}');
  assert.throws(()=>p.resolveStorage({env,platform:'win32',appRoot:app}),{code:'LEGACY_PROFILE_REQUIRES_SELECTION'});
});
test('Clave ausente, incorrecta o archivo inválido: falla antes de escribir o regenerar secretos',()=>{
  const data=directory('key-check'),key=p.resolveEncryptionKey(data),db=new PosDatabase(data);p.ensureKeyCheck(db,key);db.db.close();
  const file=path.join(data,p.DATABASE_NAME),keyFile=path.join(data,'.secrets.json'),saved=hash(file),held=path.join(data,'original-held.json');
  fs.renameSync(keyFile,held);assert.throws(()=>p.resolveEncryptionKey(data),{code:'STORAGE_KEY_MISSING'});assert.equal(fs.existsSync(keyFile),false);assert.equal(hash(file),saved);fs.renameSync(held,keyFile);
  assert.throws(()=>p.resolveEncryptionKey(data,'wrong-key-for-synthetic-test-only-123456'),{code:'STORAGE_KEY_MISMATCH'});assert.equal(hash(file),saved);
  fs.writeFileSync(keyFile,'invalid-json');assert.throws(()=>p.resolveEncryptionKey(data),{code:'STORAGE_KEY_INVALID'});assert.equal(fs.readFileSync(keyFile,'utf8'),'invalid-json');
  const legacy=directory('encrypted-legacy');fs.writeFileSync(path.join(legacy,'sales.json'),'[{"invoice":{"customerEncrypted":"enc:v1:invalid"}}]');assert.throws(()=>p.resolveEncryptionKey(legacy),{code:'STORAGE_KEY_MISSING'});assert.equal(fs.existsSync(path.join(legacy,'.secrets.json')),false);
  const invalid=directory('invalid-database');fs.writeFileSync(path.join(invalid,p.DATABASE_NAME),'not sqlite');assert.throws(()=>p.resolveEncryptionKey(invalid),{code:'STORAGE_DATABASE_INVALID'});assert.equal(fs.existsSync(path.join(invalid,'.secrets.json')),false);
  const keyOnly=directory('key-without-database');p.resolveEncryptionKey(keyOnly);const originalKeyHash=hash(path.join(keyOnly,'.secrets.json'));assert.throws(()=>p.resolveEncryptionKey(keyOnly),{code:'STORAGE_DATABASE_MISSING'});assert.equal(hash(path.join(keyOnly,'.secrets.json')),originalKeyHash);assert.equal(fs.existsSync(path.join(keyOnly,p.DATABASE_NAME)),false);
});
test('Permisos de archivos privados y rechazo de enlaces en rutas de datos',()=>{
  p.verifyPrivatePath(temporary);
  const target=directory('link-target'),link=path.join(temporary,'linked');assertTemporary(link);fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');
  try{assert.throws(()=>p.resolveEncryptionKey(path.join(link,'child')),{code:'STORAGE_LINK'});}finally{fs.unlinkSync(link);}
});
test('Instalación sintética conserva 28 productos, usuarios, permisos, caja y datos cifrados',async()=>{
  await start(program,sourceData);await login();oldCookie=cookie;
  const users=[{id:'admin',name:'Admin sintético',role:'admin',active:true},{id:'worker',name:'Empleado sintético',role:'employee',active:true}];
  assert.equal((await api('/api/settings','PUT',{users,employeePins:{worker:workerPin},adminContact:{email:'admin@example.com',phone:'6690000000'}})).status,200);
  const permissions=Object.fromEntries(require('../src/access').MODULES.map(id=>[id,id==='sales']));assert.equal((await api('/api/users/worker/permissions','PUT',{permissions})).status,200);
  assert.equal((await api('/api/cash-sessions/open','POST',{openingAmount:100})).status,201);
  // Esta prueba ejercita tarjeta explícitamente habilitada por administración.
  assert.equal((await api('/api/payment-methods','PUT',{efectivo:true,tarjeta:true,transferencia:true})).status,200);
  const sale=await api('/api/sales','POST',{items:[{productId:'synthetic-0',quantity:1}],paymentMethod:'tarjeta',paymentReference:'SYNTHETIC'});assert.equal(sale.status,201);saleId=sale.body.id;
  assert.equal((await api('/api/sales/'+saleId+'/invoice','PATCH',{rfc:'XAXX010101000',businessName:'Receptor sintético',fiscalZip:'00000',fiscalRegime:'601',cfdiUse:'G03',email:'invoice@example.com'})).status,200);
  const business=(await api('/api/configuration')).body.business;assert.equal((await api('/api/configuration/business','PUT',{...business,commercialName:'Negocio sintético',email:'business@example.com'})).status,200);
  const prefs=(await api('/api/preferences')).body;assert.equal((await api('/api/preferences','PUT',{...prefs,notifications:false,accent:'sky'})).status,200);
  assert.equal((await api('/api/products')).body.length,28);await stop();
  assert.throws(()=>p.resolveStorage({env:{LOCALAPPDATA:localAppData,EL_MUELLE_STORAGE_MODE:'windows-user'},platform:'win32',appRoot:program}),{code:'LEGACY_DATA_REQUIRES_SELECTION'});assert.equal(fs.existsSync(persistentData),false);
});
test('Copia no destructiva y recuperación efectiva: SQLite, clave protegida, auditoría y respaldos completos',()=>{
  // SHM es un índice/área de coordinación de SQLite; una lectura puede actualizarlo.
  const committedFiles=()=>fileTree(sourceData).filter(([name])=>!name.endsWith('-shm'));
  const before=committedFiles(),snapshot=rows(sourceData);
  const result=restoreData({databaseFile:path.join(sourceData,p.DATABASE_NAME),keyFile:path.join(sourceData,'.secrets.json'),destination:persistentData,backupDirectory:path.join(sourceData,'backups')});
  assert.equal(result.restored,true);assert.equal(result.activationRequired,true);assert.ok(result.backups>=1);assert.deepEqual(rows(persistentData),snapshot);assert.deepEqual(committedFiles(),before);assert.deepEqual(rows(sourceData),snapshot);
  assert.equal(hash(path.join(sourceData,'.secrets.json')),hash(path.join(persistentData,'.secrets.json')));p.verifyPrivatePath(persistentData);p.verifyPrivatePath(path.join(persistentData,'.secrets.json'));
  const unchanged=fileTree(persistentData);assert.throws(()=>restoreData({databaseFile:path.join(sourceData,p.DATABASE_NAME),keyFile:path.join(sourceData,'.secrets.json'),destination:persistentData}));assert.deepEqual(fileTree(persistentData),unchanged);
});
test('Reemplazo simulado del programa mantiene datos externos, configuración, clave y preferencias',async()=>{
  copyProgram(updatedProgram);
  p.privateDirectory(path.join(persistentRoot,'config'));fs.writeFileSync(path.join(persistentRoot,'config','.env'),'# Configuración sintética persistente\n');
  p.privateDirectory(path.join(persistentRoot,'browser-profile'));fs.writeFileSync(path.join(persistentRoot,'browser-profile','synthetic-preference.json'),'{"motion":true}');
  const keyHash=hash(path.join(persistentData,'.secrets.json'));
  await start(updatedProgram,persistentData,{installed:true});assert.equal((await api('/api/sales','GET',undefined,oldCookie)).status,401);await login();
  assert.equal((await api('/api/products')).body.length,28);assert.equal((await api('/api/products')).body[0].stockQuantity,9);
  const sale=(await api('/api/sales/'+saleId)).body;assert.equal(sale.invoice.customer.email,'invoice@example.com');
  const config=(await api('/api/configuration')).body;assert.equal(config.business.commercialName,'Negocio sintético');assert.equal(config.profile.email,'admin@example.com');
  assert.equal((await api('/api/preferences')).body.accent,'sky');assert.equal((await api('/api/preferences')).body.notifications,false);
  assert.equal((await api('/api/users/worker/permissions')).body.permissions.pos,false);assert.equal((await api('/api/configuration/integrity')).body.ok,true);
  assert.ok((await api('/api/audit-events')).body.some(e=>e.event_type==='invoice_request_saved'));
  assert.equal((await api('/api/sales','POST',{items:[{productId:'synthetic-1',quantity:1}],paymentMethod:'efectivo',amountReceived:100})).status,201);
  const worker=await api('/api/auth/employee','POST',{userId:'worker',pin:workerPin},null);assert.equal(worker.status,200);assert.equal(worker.body.user.permissions.sales,true);assert.equal(worker.body.user.permissions.pos,false);
  assert.equal(hash(path.join(persistentData,'.secrets.json')),keyHash);assert.ok(fs.readdirSync(path.join(persistentData,'backups')).length);
  assert.equal(fs.readFileSync(path.join(persistentRoot,'browser-profile','synthetic-preference.json'),'utf8'),'{"motion":true}');await stop();
});
test('Actualización fallida simulada y reversión del código: no cambian archivos persistentes',async()=>{
  const entry=path.join(updatedProgram,'src/server.js');assertTemporary(entry);const original=fs.readFileSync(entry);const before=fileTree(persistentRoot);
  fs.writeFileSync(entry,'throw new Error("Fallo sintético de actualización");');await start(updatedProgram,persistentData,{installed:true,failure:true});assert.deepEqual(fileTree(persistentRoot),before);
  fs.writeFileSync(entry,original);await start(updatedProgram,persistentData,{installed:true});await login();assert.equal((await api('/api/sales')).body.length,2);assert.equal((await api('/api/sales/'+saleId)).body.invoice.customer.rfc,'XAXX010101000');await stop();
});
test('Restauración rechaza respaldo inválido, clave equivocada y ciphertext dañado sin tocar el destino',async()=>{
  const wrong=directory('wrong-recovery');const wrongKey=path.join(wrong,'.secrets.json');fs.writeFileSync(wrongKey,JSON.stringify({dataEncryptionKey:'wrong-key-synthetic-only-12345678901234567890'}));
  const destination=path.join(temporary,'must-not-exist');
  assert.throws(()=>restoreData({databaseFile:path.join(persistentData,p.DATABASE_NAME),keyFile:wrongKey,destination}));assert.equal(fs.existsSync(destination),false);
  const invalidFile=path.join(wrong,p.DATABASE_NAME);fs.writeFileSync(invalidFile,'invalid');assert.throws(()=>restoreData({databaseFile:invalidFile,keyFile:path.join(persistentData,'.secrets.json'),destination}));assert.equal(fs.existsSync(destination),false);
  const held=path.join(persistentData,'held-original-key.json'),secret=path.join(persistentData,'.secrets.json'),dbPath=path.join(persistentData,p.DATABASE_NAME),before=hash(dbPath);fs.renameSync(secret,held);
  const missingOutput=await start(updatedProgram,persistentData,{installed:true,failure:true});assert.ok(missingOutput.includes('STORAGE_KEY_MISSING'));assert.equal(fs.existsSync(secret),false);assert.equal(hash(dbPath),before);fs.renameSync(held,secret);
  const key=p.readKeyFile(secret);const wrongOutput=await start(updatedProgram,persistentData,{installed:true,extra:{DATA_ENCRYPTION_KEY:'wrong-key-synthetic-only-12345678901234567890'},failure:true});assert.ok(wrongOutput.includes('STORAGE_KEY_MISMATCH'));assert.ok(!wrongOutput.includes(key));assert.equal(hash(dbPath),before);
  const corrupt=path.join(temporary,'corrupt');restoreData({databaseFile:dbPath,keyFile:secret,destination:corrupt});const db=new DatabaseSync(path.join(corrupt,p.DATABASE_NAME));try{const row=db.prepare("SELECT payload FROM documents WHERE collection='sales' AND document_id=?").get(saleId);const sale=JSON.parse(row.payload);const parts=sale.invoice.customerEncrypted.split(':');parts[4]='AAAA';sale.invoice.customerEncrypted=parts.join(':');db.prepare("UPDATE documents SET payload=? WHERE collection='sales' AND document_id=?").run(JSON.stringify(sale),saleId);}finally{db.close();}
  const corruptInspection=p.inspectDatabase(path.join(corrupt,p.DATABASE_NAME));assert.throws(()=>p.validateKey(key,corruptInspection),{code:'STORAGE_KEY_MISMATCH'});
  assert.throws(()=>restoreData({databaseFile:path.join(corrupt,p.DATABASE_NAME),keyFile:secret,destination}));assert.equal(fs.existsSync(destination),false);
});
test('Snapshot de una fuente con WAL incluye la última transacción confirmada',()=>{
  const data=directory('wal-source'),key=p.resolveEncryptionKey(data),db=new PosDatabase(data);p.ensureKeyCheck(db,key);db.transaction(()=>db.saveDocument('synthetic','wal-record',{committed:true}));assert.ok(fs.existsSync(path.join(data,p.DATABASE_NAME+'-wal')));
  try{const destination=path.join(temporary,'wal-restored');restoreData({databaseFile:path.join(data,p.DATABASE_NAME),keyFile:path.join(data,'.secrets.json'),destination});assert.ok(rows(destination).documents.some(row=>row.collection==='synthetic'&&JSON.parse(row.payload).committed));}finally{db.db.close();}
});
test('Recuperación interrumpida y base activa ausente no inicializan otra base',()=>{
  const partial=path.join(temporary,'partial-restore'),originalRename=fs.renameSync;
  fs.renameSync=(from,to)=>{if(p.inside(path.resolve(to),partial))throw Error('Interrupción sintética');return originalRename(from,to);};
  try{assert.throws(()=>restoreData({databaseFile:path.join(persistentData,p.DATABASE_NAME),keyFile:path.join(persistentData,'.secrets.json'),destination:partial}));}finally{fs.renameSync=originalRename;}
  assert.ok(fs.existsSync(path.join(partial,'.recovery-incomplete')));assert.throws(()=>p.resolveEncryptionKey(partial),{code:'STORAGE_RECOVERY_INCOMPLETE'});assert.equal(fs.existsSync(path.join(partial,p.DATABASE_NAME)),false);
  const missing=directory('missing-active-db');fs.mkdirSync(path.join(missing,'backups'));fs.writeFileSync(path.join(missing,'backups','snapshot.sqlite'),'synthetic');
  assert.throws(()=>p.resolveEncryptionKey(missing),{code:'STORAGE_DATABASE_MISSING'});assert.equal(fs.existsSync(path.join(missing,'.secrets.json')),false);
});
