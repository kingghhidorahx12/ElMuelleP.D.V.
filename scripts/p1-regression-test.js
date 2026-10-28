// Fallos P1 reproducidos exclusivamente con datos sintéticos y puertos efímeros.
const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const {spawn,execFileSync} = require('node:child_process');
const {PosDatabase} = require('../src/database');
const p = require('../src/persistence');
const {stopServer} = require('../src/stop-server');
const {exportCustody,restoreCustody} = require('./recovery-custody');
const project = path.resolve(__dirname,'..');
const dev = path.join(project,'.dev');
const password = 'Contraseña sintética exclusiva de pruebas 2026';
let temporary;
const children = new Set();
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function folder(name) {const file=path.join(temporary,name);fs.mkdirSync(file,{recursive:true});return file;}
function quiet(work) {const original=console.error;console.error=()=>{};try{return work();}finally{console.error=original;}}
function seed(directory) {fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'products.json'),JSON.stringify([{id:'p1-product',name:'Producto sintético',unit:'pieza',price:100,costPrice:40,stockQuantity:10,active:true}]));}
function fixture(name) {
  const data=folder(name),key=p.resolveEncryptionKey(data),db=new PosDatabase(data);
  p.ensureKeyCheck(db,key);
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',crypto.createHash('sha256').update(key).digest(),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify({email:'synthetic@example.com'})),cipher.final()]);
  const payload=['enc','v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join(':');
  db.transaction(()=>db.saveDocument('sales','custody-test',{id:'custody-test',customerEncrypted:payload}));
  db.close();return {data,key,databaseFile:path.join(data,p.DATABASE_NAME),keyFile:path.join(data,'.secrets.json')};
}
async function availablePort() {return new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});}
async function waitReady(child,url) {
  for(let i=0;i<400;i++) {if(child?.exitCode!==null&&child?.exitCode!==undefined)throw Error('La instancia sintética no inició.');try{if((await fetch(url+'/api/health')).ok)return;}catch{}await pause(100);}
  throw Error('Tiempo de arranque aislado agotado.');
}
function testEnv(localAppData,port) {return {...process.env,NODE_OPTIONS:'',NODE_ENV:'test',NODE_PATH:path.join(project,'node_modules'),LOCALAPPDATA:localAppData,EL_MUELLE_STORAGE_MODE:'windows-user',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:'',ENV_FILE:'',DATA_ENCRYPTION_KEY:'',ADMIN_PIN:'',EMPLOYEE_PIN:'',REQUIRE_HTTPS:'false',CORS_ORIGIN:''};}
function copyApp(target) {
  fs.mkdirSync(target,{recursive:true});fs.cpSync(path.join(project,'src'),path.join(target,'src'),{recursive:true});
  fs.copyFileSync(path.join(project,'package.json'),path.join(target,'package.json'));seed(path.join(target,'data'));
  const root=path.dirname(target);fs.mkdirSync(path.join(root,'runtime'));fs.copyFileSync(process.execPath,path.join(root,'runtime/node.exe'));
  fs.mkdirSync(path.join(target,'scripts'));for(const file of ['restore-data.js','recovery-custody.js'])fs.copyFileSync(path.join(project,'scripts',file),path.join(target,'scripts',file));
  for(const file of ['Start-ElMuellePOS.ps1','Stop-ElMuellePOS.ps1'])fs.copyFileSync(path.join(project,'portable',file),path.join(root,file));
  require('./seal-release').sealPackage(root);
}
before(()=>{fs.mkdirSync(dev,{recursive:true});temporary=fs.mkdtempSync(path.join(dev,'em003-p1-regression-'));p.restrictPrivatePath(temporary,true);});
after(async()=>{
  for(const child of children)if(child.exitCode===null&&child.signalCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}
  if(temporary){assert.ok(p.inside(temporary,dev)&&path.basename(temporary).startsWith('em003-p1-regression-'));p.rejectLinks(temporary);fs.rmSync(temporary,{recursive:true,force:true});}
});

test('COMMIT fallido revierte una sola vez, conserva el error y permite la transacción siguiente',()=>{
  const db=new PosDatabase(folder('commit-failure')),original=db.db.exec.bind(db.db),expected=Error('Fallo COMMIT sintético');let rollback=0;
  db.db.exec=sql=>{if(sql==='COMMIT')throw expected;if(sql==='ROLLBACK')rollback++;return original(sql);};
  try {assert.throws(()=>db.transaction(()=>db.saveDocument('p1','lost',{value:1})),error=>error===expected);assert.equal(db.transactionDepth,0);assert.equal(rollback,1);assert.equal(db.readDocument('p1','lost'),null);}
  finally {db.db.exec=original;}
  db.transaction(()=>db.saveDocument('p1','next',{value:2}));assert.equal(db.readDocument('p1','next').value,2);db.close();
});
test('Fallo del respaldo posterior al COMMIT conserva el resultado y nunca intenta ROLLBACK',()=>{
  const db=new PosDatabase(folder('post-commit')),original=db.db.exec.bind(db.db);let rollback=0;
  db.db.exec=sql=>{if(sql==='ROLLBACK')rollback++;return original(sql);};
  db.createDailyBackup=()=>{throw Error('Fallo de respaldo sintético');};
  quiet(()=>assert.equal(db.transaction(()=>{db.saveDocument('p1','committed',{value:1});return 'confirmado';}),'confirmado'));
  assert.equal(rollback,0);assert.equal(db.transactionDepth,0);assert.equal(db.readDocument('p1','committed').value,1);
  quiet(()=>db.transaction(()=>db.saveDocument('p1','next',{value:2})));assert.equal(db.readDocument('p1','next').value,2);db.close();
});
test('Fallo al crear carpeta de respaldos no falsea el éxito de una venta confirmada',()=>{
  const db=new PosDatabase(folder('backup-directory'));
  fs.writeFileSync(db.backupDir,'Obstáculo sintético');
  quiet(()=>db.transaction(()=>db.saveDocument('sales','committed',{total:100})));
  assert.equal(db.readDocument('sales','committed').total,100);assert.equal(db.transactionDepth,0);db.close();
});
test('Respaldo previo queda intacto si falla el reemplazo del nuevo snapshot',()=>{
  const db=new PosDatabase(folder('previous-backup'));db.transaction(()=>db.saveDocument('p1','first',{value:1}));
  const old=path.join(db.backupDir,fs.readdirSync(db.backupDir)[0]),before=hash(old),rename=fs.renameSync;
  fs.renameSync=(from,to)=>{if(to===old)throw Error('Fallo sintético');return rename(from,to);};
  try{quiet(()=>db.transaction(()=>db.saveDocument('p1','second',{value:2})));}finally{fs.renameSync=rename;}
  assert.equal(hash(old),before);assert.equal(fs.readdirSync(db.backupDir).length,1);assert.equal(db.readDocument('p1','second').value,2);db.close();
});
test('Marcadores heredados sin SQLite rechazan arranque, con o sin clave y sin generar archivos',()=>{
  for(const name of ['settings','sales'])for(const withKey of [false,true]) {
    const data=folder('marker-'+name+'-'+withKey);
    if(withKey)p.resolveEncryptionKey(data);
    fs.writeFileSync(path.join(data,name+'.json'),JSON.stringify({migratedTo:p.DATABASE_NAME,migratedAt:'synthetic'}));
    const before=fs.readdirSync(data).map(file=>[file,hash(path.join(data,file))]);
    assert.throws(()=>p.resolveEncryptionKey(data),{code:'STORAGE_DATABASE_MISSING'});
    assert.deepEqual(fs.readdirSync(data).map(file=>[file,hash(path.join(data,file))]),before);
  }
});
test('Objeto arbitrario de settings no elude guarda; datos heredados reales siguen permitidos',()=>{
  const data=folder('invalid-legacy');p.resolveEncryptionKey(data);fs.writeFileSync(path.join(data,'settings.json'),'{}');
  assert.throws(()=>p.resolveEncryptionKey(data),{code:'STORAGE_DATABASE_MISSING'});
  fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({setupCompleted:false,users:[]}));assert.equal(typeof p.resolveEncryptionKey(data),'string');
});
test('Custodia cifrada recupera SQLite, clave, configuración y respaldos sin activar ni sobrescribir',()=>{
  const source=fixture('custody-source'),envFile=path.join(source.data,'.env'),destination=path.join(temporary,'custody-restored');
  fs.writeFileSync(envFile,'# Configuración sintética\nHOST=127.0.0.1\n');
  const archive=path.join(temporary,'external.emrecovery');
  exportCustody({...source,destination:archive,password,envFile,backupDirectory:path.join(source.data,'backups')});
  const bytes=fs.readFileSync(archive,'utf8');assert.equal(bytes.includes(source.key),false);assert.equal(bytes.includes('synthetic@example.com'),false);
  const result=restoreCustody({archive,destination,password});assert.equal(result.activationRequired,true);assert.equal(result.configurationActivationRequired,true);assert.ok(result.backups>0);
  assert.equal(p.readKeyFile(path.join(destination,'.secrets.json')),source.key);p.validateKey(source.key,p.inspectDatabase(path.join(destination,p.DATABASE_NAME)));
  assert.equal(hash(path.join(destination,'configuration.recovered.env')),hash(envFile));assert.equal(fs.existsSync(path.join(destination,'.env')),false);
  const before=hash(archive);assert.throws(()=>exportCustody({...source,destination:archive,password}));assert.equal(hash(archive),before);
  assert.throws(()=>restoreCustody({archive,destination,password}));
});
test('Contraseña incorrecta, archivo alterado o truncado fallan sin crear destino',()=>{
  const source=fixture('custody-rejected'),archive=path.join(temporary,'rejected.emrecovery'),destination=path.join(temporary,'rejected-target');
  exportCustody({...source,destination:archive,password});
  assert.throws(()=>restoreCustody({archive,destination,password:'Contraseña incorrecta de prueba'}));assert.equal(fs.existsSync(destination),false);
  const original=fs.readFileSync(archive,'utf8'),value=JSON.parse(original);value.ciphertext=(value.ciphertext[0]==='A'?'B':'A')+value.ciphertext.slice(1);fs.writeFileSync(archive,JSON.stringify(value));
  assert.throws(()=>restoreCustody({archive,destination,password}));assert.equal(fs.existsSync(destination),false);
  fs.writeFileSync(archive,original.slice(0,60));assert.throws(()=>restoreCustody({archive,destination,password}));assert.equal(fs.existsSync(destination),false);
});
test('Clave sólo de entorno puede custodiarse sin crear ni reemplazar el secreto del origen',()=>{
  const source=fixture('env-only');fs.unlinkSync(source.keyFile);
  const envFile=path.join(source.data,'.env');fs.writeFileSync(envFile,'DATA_ENCRYPTION_KEY='+source.key+'\n');
  const archive=path.join(temporary,'env-only.emrecovery'),destination=path.join(temporary,'env-only-restored'),before=hash(source.databaseFile);
  exportCustody({databaseFile:source.databaseFile,destination:archive,password,envFile});
  restoreCustody({archive,destination,password});assert.equal(fs.existsSync(source.keyFile),false);assert.equal(hash(source.databaseFile),before);
  p.validateKey(p.readKeyFile(path.join(destination,'.secrets.json')),p.inspectDatabase(path.join(destination,p.DATABASE_NAME)));
});
test('Archivo autenticado con rutas no permitidas se rechaza sin escribir fuera del área privada',()=>{
  const salt=crypto.randomBytes(32),iv=crypto.randomBytes(12),derived=crypto.scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  const cipher=crypto.createCipheriv('aes-256-gcm',derived,iv);cipher.setAAD(Buffer.from('ElMuellePOS-recovery-v1'));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify({format:'ElMuellePOS-recovery-v1',files:{'../escaped.txt':'YQ=='}})),cipher.final()]);
  const archive=path.join(temporary,'traversal.emrecovery'),destination=path.join(temporary,'traversal-target');
  fs.writeFileSync(archive,JSON.stringify({format:'ElMuellePOS-recovery-v1',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}));
  assert.throws(()=>restoreCustody({archive,destination,password}));assert.equal(fs.existsSync(destination),false);assert.equal(fs.existsSync(path.join(temporary,'escaped.txt')),false);
});

test('Windows: lanzadores reales conservan rutas predeterminadas, rechazan PID ajeno y cierran SQLite', {skip:process.platform!=='win32',timeout:120000},async()=>{
  const portable=folder('portable con espacios'),app=path.join(portable,'app');copyApp(app);
  const local=folder('perfil Windows con espacios'),port=await availablePort();assert.ok(![3000,3001].includes(port));
  const env=testEnv(local,port);
  try {execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(portable,'Start-ElMuellePOS.ps1'),'-NoBrowser','-Port',String(port)],{env,windowsHide:true,stdio:'ignore',timeout:60000});}
  catch {const log=path.join(local,'ElMuellePOS','logs','server.err.log');throw Error(fs.existsSync(log)?fs.readFileSync(log,'utf8'):'El lanzador sintético no inició.');}
  const storage=p.resolveStorage({env,appRoot:app}),pidFile=path.join(storage.runtimeDir,'server.pid'),pid=Number(fs.readFileSync(pidFile,'utf8'));
  const stopArgs=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(portable,'Stop-ElMuellePOS.ps1')];
  try {
    await waitReady(null,'http://127.0.0.1:'+port);assert.ok(fs.existsSync(storage.databasePath));assert.equal(fs.existsSync(path.join(app,'data',p.DATABASE_NAME)),false);p.verifyPrivatePath(storage.secretPath);
    const control=JSON.parse(fs.readFileSync(path.join(storage.runtimeDir,`server-${pid}.control.json`),'utf8'));
    await new Promise((resolve,reject)=>{const socket=net.createConnection(control.pipe);socket.on('connect',()=>socket.write('á'.repeat(64)+'\n'));socket.on('error',reject);socket.on('close',resolve);});
    assert.equal((await fetch('http://127.0.0.1:'+port+'/api/health')).status,200);
    fs.writeFileSync(pidFile,String(process.pid));assert.throws(()=>execFileSync('powershell.exe',stopArgs,{env,windowsHide:true,stdio:'pipe',timeout:30000}));assert.equal(Number(fs.readFileSync(pidFile,'utf8')),process.pid);process.kill(process.pid,0);
  } finally {
    fs.writeFileSync(pidFile,String(pid));execFileSync('powershell.exe',stopArgs,{env,windowsHide:true,stdio:'pipe',timeout:30000});
  }
  assert.equal(fs.existsSync(pidFile),false);assert.equal(fs.existsSync(path.join(storage.runtimeDir,`server-${pid}.control.json`)),false);assert.throws(()=>process.kill(pid,0));
  assert.equal(p.inspectDatabase(storage.databasePath).encrypted.length,0);
  assert.ok(!fs.existsSync(storage.databasePath+'-wal')||fs.statSync(storage.databasePath+'-wal').size===0);
});

test('Revisión anterior sin contrato se rechaza; la actual reinicia conservando la clave y los datos', {timeout:120000},async()=>{
  const local=folder('version-profile'),app=path.join(folder('version-current'),'app');copyApp(app);
  const env=testEnv(local,await availablePort()),storage=p.resolveStorage({env,appRoot:app});p.prepareInstalledStorage(storage,app);
  delete env.ADMIN_PIN;
  const configured=path.join(storage.root,'config','.env');fs.writeFileSync(configured,'# Configuración sintética de versión\nADMIN_PIN=864209\n');
  async function launch(target,selectedEnv) {
    const child=spawn(process.execPath,[path.join(target,'src','server.js')],{env:selectedEnv,cwd:target,windowsHide:true,stdio:['ignore','ignore','pipe']});children.add(child);
    let errors='';child.stderr.on('data',chunk=>errors+=chunk);
    try {await waitReady(child,'http://127.0.0.1:'+selectedEnv.PORT);} catch {throw Error('Fallo de arranque sintético: '+errors);}
    return child;
  }
  const current=await launch(app,env);
  try {
    const url='http://127.0.0.1:'+env.PORT,auth=await fetch(url+'/api/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'864209'})});assert.equal(auth.status,200);
  } finally {await stopServer(current.pid,storage);}
  const keyHash=hash(storage.secretPath),legacy=folder('version-head');
  const files=execFileSync('git',['ls-tree','-r','--name-only','HEAD','src'],{cwd:project,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  for(const file of files){const target=path.join(legacy,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,execFileSync('git',['show','HEAD:'+file],{cwd:project}));}
  fs.copyFileSync(path.join(project,'package.json'),path.join(legacy,'package.json'));
  const databaseHash=hash(storage.databasePath);
  assert.throws(()=>require('../src/release-compatibility').verifyPackage(legacy),{code:'RELEASE_UNVERIFIED'});
  assert.equal(hash(storage.databasePath),databaseHash);
  assert.equal(hash(storage.secretPath),keyHash);p.validateKey(p.readKeyFile(storage.secretPath),p.inspectDatabase(storage.databasePath));
  const resumed=await launch(app,{...env,PORT:String(await availablePort())});await stopServer(resumed.pid,storage);assert.equal(hash(storage.secretPath),keyHash);
});
