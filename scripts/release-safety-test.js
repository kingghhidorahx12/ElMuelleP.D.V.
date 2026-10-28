// Regresión focalizada P1-B. Instala únicamente variantes con GUID/rutas/puerto
// propios en .dev; no ejecuta los EXE definitivos ni restaura datos del dueño.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {spawnSync}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const p=require('../src/persistence'),c=require('../src/release-compatibility');
const seal=require('./seal-release'),manager=require('./manage-release');
const project=path.resolve(__dirname,'..'),dev=path.join(project,'.dev');
const originalId='B2F014C6-CAEF-4DF9-AE86-E0A49025D95D';
const pin='864209',workerPin='135790',all=value=>Object.fromEntries(require('../src/access').MODULES.map(id=>[id,value]));
let area,appId,port,install,persistent,data,configuration,payload,receipt,options,baseline,adminCookie,workerCookie,running=false,compiler;
const results={};
const quote=value=>"'"+value.replaceAll("'","''")+"'";
function ps(script){const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop';"+script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function owned(file){assert.ok(path.resolve(file)!==area&&p.inside(path.resolve(file),area));p.rejectLinks(file);return file;}
function directory(file){owned(file);p.privateDirectory(file);return file;}
function registry(id){return ps('$p='+quote('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{'+id+'}_is1')+';if(Test-Path -LiteralPath $p){Get-ItemProperty -LiteralPath $p|Select-Object DisplayName,DisplayVersion,InstallLocation,UninstallString|ConvertTo-Json -Compress}');}
function tree(root,production=false){
  if(!fs.existsSync(root))return [];const output=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){const file=path.join(root,entry.name);if(entry.isSymbolicLink())continue;
    if(entry.isDirectory()){if(!production||!['Cache','Code Cache','GPUCache','Service Worker','node_modules'].includes(entry.name))output.push(...tree(file,production));}
    else if(!production||/\.sqlite(?:-wal)?$|\.emrecovery$|^\.secrets\.json$|^\.env$|^products\.json$|^Preferences$|^Local State$|^Start-ElMuellePOS\.ps1$|^Stop-ElMuellePOS\.ps1$/.test(entry.name)){if(!file.endsWith('-shm'))output.push([file,c.sha256(file)]);}
  }return output.sort();
}
function protection(){return {files:[path.join(project,'data'),path.join(process.env.USERPROFILE,'AppData/Local/Programs/ElMuellePOS'),path.join(process.env.USERPROFILE,'AppData/Local/ElMuellePOS')].flatMap(root=>tree(root,true)),registry:registry(originalId),port3000:ps('Get-NetTCPConnection -State Listen|Where-Object LocalPort -eq 3000|Select-Object LocalAddress,LocalPort,OwningProcess|ConvertTo-Json -Compress'),originalInstaller:c.sha256(path.join(project,'dist/installer/ElMuellePOS-Setup.exe'))};}
function environment(){return {...process.env,NODE_OPTIONS:'',NODE_PATH:'',NODE_ENV:'test',TEMP:path.join(area,'runtime-temp'),TMP:path.join(area,'runtime-temp'),EL_MUELLE_STORAGE_MODE:'windows-user',DATA_DIR:data,ENV_FILE:configuration,PORT:String(port),HOST:'127.0.0.1',ADMIN_PIN:pin,EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',LOCALAPPDATA:path.join(area,'synthetic-user'),CORS_ORIGIN:'',REQUIRE_HTTPS:'false'};}
async function api(route,method='GET',body,cookie=adminCookie){const response=await fetch('http://127.0.0.1:'+port+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
function launcher(script){const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',owned(path.join(install,script)),...(script.startsWith('Start')?['-NoBrowser','-Port',String(port)]:[])],{env:environment(),encoding:'utf8',windowsHide:true,timeout:60000});return r;}
async function start(){const r=launcher('Start-ElMuellePOS.ps1');assert.equal(r.status,0,r.stderr);running=true;assert.equal((await api('/api/health')).status,200);adminCookie=(await api('/api/auth/admin','POST',{pin},null)).cookie;assert.ok(adminCookie);}
function stop(){if(!running)return;const r=launcher('Stop-ElMuellePOS.ps1');assert.equal(r.status,0,r.stderr);running=false;}
async function verifyPrivileges(){
  const admin=await api('/api/auth/session');assert.equal(admin.body.user.role,'admin');assert.deepEqual(admin.body.user.permissions,all(true));
  const worker=await api('/api/auth/employee','POST',{userId:'worker',pin:workerPin},null);assert.equal(worker.status,200);workerCookie=worker.cookie;
  assert.equal(worker.body.user.role,'employee');assert.deepEqual(worker.body.user.permissions,{...all(false),sales:true});
  assert.equal((await api('/api/products','GET',undefined,workerCookie)).status,403);
  assert.equal((await api('/api/products/synthetic-0','GET',undefined,workerCookie)).status,403);
  assert.equal((await api('/api/sales','POST',{},workerCookie)).status,403);
  assert.equal((await api('/api/users/worker/permissions','PUT',{permissions:all(true)},workerCookie)).status,403);
  assert.equal((await api('/api/sales','GET',undefined,workerCookie)).status,200);
  assert.equal((await api('/api/products')).body.length,28);
}
function installCompatible(label){
  // El helper utiliza la misma validación que el CLI. Sólo el instalador de
  // prueba sustituye las rutas de persistencia, nunca la lógica de permisos.
  const old={...process.env};Object.assign(process.env,environment());
  try{return manager.installRelease(options,{installDir:install,silent:true,log:owned(path.join(area,label+'.log'))});}
  finally{for(const key of Object.keys(process.env))if(!Object.hasOwn(old,key))delete process.env[key];Object.assign(process.env,old);}
}
before(async()=>{
  assert.equal(process.platform,'win32');
  compiler=path.join(process.env.LOCALAPPDATA,'Programs/Inno Setup 6/ISCC.exe');assert.ok(fs.existsSync(compiler));
  baseline=protection();assert.equal(baseline.originalInstaller,'c6adae91953155a802103fd828a41b980636553ae191e5addb6e37f2f2e06113');
  area=fs.mkdtempSync(path.join(dev,'em003-safe-rollback-'));p.restrictPrivatePath(area,true);
  appId=crypto.randomUUID().toUpperCase();assert.notEqual(appId,originalId);assert.equal(registry(appId),'');
  port=await new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const selected=socket.address().port;socket.close(()=>resolve(selected));});});assert.ok(![3000,3001].includes(port));
  install=path.join(area,'installed');persistent=directory(path.join(area,'persistent'));data=path.join(persistent,'data');configuration=path.join(directory(path.join(persistent,'config')),'.env');
  directory(path.join(area,'runtime-temp'));directory(path.join(area,'synthetic-user'));
  payload=path.join(area,'payload');fs.cpSync(path.join(project,'dist/ElMuellePOS-Portable'),payload,{recursive:true,errorOnExist:true,force:false});
  // Identidad aprobada de fuentes antes de cambiar exclusivamente el aislamiento.
  for(const name of fs.readdirSync(path.join(project,'src')))if(name.endsWith('.js'))assert.equal(c.sha256(path.join(payload,'app/src',name)),c.sha256(path.join(project,'src',name)),name+' requiere regenerar el portable');
  let file=path.join(payload,'app/src/persistence.js'),source=fs.readFileSync(file,'utf8');
  assert.ok(source.includes("path.resolve(env.LOCALAPPDATA,'ElMuellePOS')"));fs.writeFileSync(file,source.replace("path.resolve(env.LOCALAPPDATA,'ElMuellePOS')",JSON.stringify(persistent)));
  file=path.join(payload,'app/src/server.js');source=fs.readFileSync(file,'utf8');assert.ok(source.includes('const PORT = Number(process.env.PORT || 3000);'));fs.writeFileSync(file,source.replace('const PORT = Number(process.env.PORT || 3000);','const PORT = Number(process.env.PORT || '+port+');'));
  file=path.join(payload,'Start-ElMuellePOS.ps1');source=fs.readFileSync(file,'utf8');fs.writeFileSync(file,source.replace('[int]$Port = 3000','[int]$Port = '+port));
  seal.sealPackage(payload);
  const firstPrecheck=spawnSync(process.execPath,[path.join(payload,'app/src/release-compatibility.js'),'--manifest',path.join(payload,c.MANIFEST),'--sha256',c.sha256(path.join(payload,c.MANIFEST)),'--data-dir',data,'--configuration-file',configuration],{env:environment(),encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(firstPrecheck.status,0,firstPrecheck.stderr);assert.equal(fs.existsSync(data),false);assert.equal(fs.existsSync(configuration),false);
  results.firstInstallWithoutConfiguration=true;
  let iss=fs.readFileSync(path.join(project,'installer/ElMuellePOS.iss'),'utf8');
  iss=iss.replace(/^#define MyAppName .*$/m,'#define MyAppName "El Muelle POS PRUEBA EM003 '+appId.slice(0,8)+'"')
    .replace(/^#define MyReleaseHash .*$/m,'#define MyReleaseHash GetSHA256OfFile("'+path.join(payload,c.MANIFEST)+'")')
    .replace(/^AppId=.*$/m,'AppId={{'+appId+'}').replace(/^DefaultDirName=.*$/m,'DefaultDirName='+install)
    .replace(/^OutputDir=.*$/m,'OutputDir='+path.join(area,'output'))
    .replace(/^SetupIconFile=.*$/m,'SetupIconFile='+path.join(payload,'app/public/assets/brand/el-muelle-app-icon.ico'))
    .replaceAll('..\\dist\\ElMuellePOS-Portable\\',payload+'\\')
    .replace('..\\portable\\Stop-ElMuellePOS.ps1',path.join(payload,'Stop-ElMuellePOS.ps1'))
    .replaceAll('{localappdata}\\ElMuellePOS',persistent)
    .replace('{autoprograms}\\Cerrar servidor El Muelle POS','{autoprograms}\\{#MyAppName} - Cerrar servidor');
  assert.ok(!iss.includes(originalId)&&!iss.includes('{localappdata}\\'));assert.ok(iss.includes('skipifsilent'));
  const script=path.join(area,'variant.iss');fs.writeFileSync(script,'\uFEFF'+iss.replace(/^\uFEFF/,''));
  const compiled=spawnSync(compiler,[script],{windowsHide:true,encoding:'utf8',timeout:180000});assert.equal(compiled.status,0,compiled.stdout.slice(-1800)+compiled.stderr);
  const sealed=seal.sealInstaller(payload,path.join(area,'output/ElMuellePOS-Setup.exe'));receipt=sealed.receipt;
  options={receipt,expectedSHA256:sealed.receiptSHA256,packageRoot:payload,dataDir:data};
  results.testAppId=appId;results.testPort=port;results.variantInstallerSHA256=sealed.installerSHA256;
  results.originalInstallerExecuted=false;results.area=area;results.productionProtectedFiles=baseline.files.length;results.variantInstallerBytes=fs.statSync(path.join(area,'output/ElMuellePOS-Setup.exe')).size;
  fs.writeFileSync(path.join(area,'scope.json'),JSON.stringify({area,appId,port,install,persistent,payload,options},null,2));
  assert.equal(installCompatible('initial-install').installed,true);
  // Únicamente productos sintéticos. La semilla aprobada de entrega conserva 28.
  directory(data);fs.writeFileSync(path.join(data,'products.json'),JSON.stringify(Array.from({length:28},(_,i)=>({id:'synthetic-'+i,name:'Producto sintetico '+i,unit:'pieza',category:'Prueba',price:100,costPrice:40,stockQuantity:10,active:true}))));
  fs.writeFileSync(configuration,'# Configuracion sintetica, no produccion\nHOST=127.0.0.1\n');
  await start();const users=[{id:'admin',name:'Administrador sintetico',role:'admin',active:true},{id:'worker',name:'Empleado sintetico',role:'employee',active:true}];
  assert.equal((await api('/api/settings','PUT',{users,employeePins:{worker:workerPin}})).status,200);
  assert.equal((await api('/api/users/worker/permissions','PUT',{permissions:{...all(false),sales:true}})).status,200);stop();
  const backups=directory(path.join(persistent,'resguardos'));fs.writeFileSync(path.join(backups,'synthetic.emrecovery'),'BACKUP SENTINEL - NOT A REAL ARCHIVE');
});
after(()=>{
  try{stop();}finally{
    if(area){
      assert.equal(ps('Get-NetTCPConnection -State Listen|Where-Object LocalPort -eq '+port+'|Select-Object -ExpandProperty OwningProcess'),'');
      assert.equal(ps('Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'"|Where-Object ExecutablePath -eq '+quote(path.join(install,'runtime/node.exe'))+'|Select-Object -ExpandProperty ProcessId'),'');
      const record=registry(appId);if(record){assert.equal(path.resolve(JSON.parse(record).InstallLocation),path.resolve(install));ps('Remove-Item -LiteralPath '+quote('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{'+appId+'}_is1')+' -Recurse -Force');}
      ps('$base=[Environment]::GetFolderPath("Programs");foreach($name in @('+quote('El Muelle POS PRUEBA EM003 '+appId.slice(0,8)+'.lnk')+','+quote('El Muelle POS PRUEBA EM003 '+appId.slice(0,8)+' - Cerrar servidor.lnk')+')){$p=Join-Path $base $name;if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}');
      for(const name of ['installed','persistent','payload','runtime-temp','synthetic-user','unknown-schema','env-only-key','old-compatible','historical-candidate']){const file=owned(path.join(area,name));if(fs.existsSync(file))fs.rmSync(file,{recursive:true,force:true});}
      assert.deepEqual(protection(),baseline);assert.equal(registry(appId),'');
      results.H_productionUnchanged=true;results.testInstallationRegistryAndProcessesCleaned=true;
      fs.writeFileSync(path.join(area,'state.json'),JSON.stringify(results,null,2));console.log('SAFE_ROLLBACK_RESULT '+JSON.stringify(results));
    }
  }
});
test('A/B: permisos reales del empleado y endpoints protegidos en la variante instalada',async()=>{await start();try{await verifyPrivileges();results.A=true;results.B=true;}finally{stop();}});
test('C/F: reversión controlada a 6b8c90d rechazada antes de ejecutar el instalador',()=>{
  const before=tree(persistent),installedHash=c.sha256(path.join(install,'app/src/server.js'));
  const historical=directory(path.join(area,'historical-candidate'));
  // Archivo histórico exacto ya compilado, sólo se calcula su hash; jamás se ejecuta.
  const old=path.join(project,'.dev/em003-p1b-history-6b8c90d-FEyV2K/source/dist/installer/ElMuellePOS-Setup.exe');
  assert.equal(c.sha256(old),'ecda591334a7479ba01b810dbb827eb5c3f1613798107e92ecbd18aab6595d42');
  fs.copyFileSync(old,path.join(historical,'ElMuellePOS-Setup.exe'));
  const file=path.join(historical,'legacy.release.json');fs.writeFileSync(file,JSON.stringify({format:'ElMuellePOS-installer-release-v1',installer:'ElMuellePOS-Setup.exe',installerSHA256:c.sha256(old),manifestSHA256:'0'.repeat(64),revisionSHA256:'0'.repeat(64)}));
  assert.throws(()=>manager.installRelease({receipt:file,expectedSHA256:c.sha256(file),packageRoot:historical,dataDir:data},{installDir:install,silent:true}),{code:'RELEASE_UNVERIFIED'});
  assert.deepEqual(tree(persistent),before);assert.equal(c.sha256(path.join(install,'app/src/server.js')),installedHash);results.C=true;results.F=true;
});
test('Identidad/capacidades: rechaza permiso antiguo aunque ambas versiones sean 1.0.0',()=>{
  const file=path.join(payload,c.MANIFEST),original=fs.readFileSync(file),value=JSON.parse(original);
  try{value.capabilities.permissions='roles-only';fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>c.verifyPackage(payload,c.sha256(file)),{code:'RELEASE_INCOMPATIBLE'});}
  finally{fs.writeFileSync(file,original);}
  const oldVersion=directory(path.join(area,'old-compatible')),manifest=JSON.parse(original);manifest.version='0.9.0';const oldFile=path.join(oldVersion,c.MANIFEST);fs.writeFileSync(oldFile,JSON.stringify(manifest));
  assert.equal(c.descriptor(oldFile,c.sha256(oldFile)).version,'0.9.0');
  assert.throws(()=>manager.preflight({...options,expectedSHA256:'0'.repeat(64)}));
  const access=path.join(payload,'app/src/access.js'),saved=fs.readFileSync(access);try{fs.appendFileSync(access,'\n// cambio no aprobado\n');assert.throws(()=>manager.preflight(options),{code:'RELEASE_CONTENT'});}finally{fs.writeFileSync(access,saved);}
  results.identityAndCapabilities=true;results.olderCompatibleDescriptorAccepted=true;
});
test('Esquema desconocido: rechazo sin modificar datos ni respaldos',()=>{
  const copy=path.join(area,'unknown-schema');require('./restore-data').restoreData({databaseFile:path.join(data,p.DATABASE_NAME),keyFile:path.join(data,'.secrets.json'),destination:copy});
  const db=new DatabaseSync(path.join(copy,p.DATABASE_NAME));try{db.exec('CREATE TABLE future_schema (id TEXT);');}finally{db.close();}
  const before=tree(copy);assert.throws(()=>manager.preflight({...options,dataDir:copy}),{code:'RELEASE_SCHEMA'});assert.deepEqual(tree(copy),before);results.unknownSchemaRejected=true;
});
test('Clave original en configuración: compatible sin crear ni cambiar secretos',()=>{
  const copy=path.join(area,'env-only-key');require('./restore-data').restoreData({databaseFile:path.join(data,p.DATABASE_NAME),keyFile:path.join(data,'.secrets.json'),destination:copy});
  const original=path.join(copy,'.secrets.json'),key=p.readKeyFile(original),envFile=path.join(copy,'synthetic.env');
  fs.renameSync(original,path.join(copy,'held-original-key.json'));fs.writeFileSync(envFile,'DATA_ENCRYPTION_KEY='+key+'\n');
  const before=tree(copy);c.checkData(copy,{envFile,configuredKey:''});assert.deepEqual(tree(copy),before);assert.equal(fs.existsSync(original),false);
  assert.throws(()=>c.checkData(data,{configuredKey:'synthetic-wrong-configured-key-12345678901234567890'}),{code:'STORAGE_KEY_MISMATCH'});results.originalConfiguredKeySupported=true;
});
test('Requisitos instalados superiores: el flujo y el propio instalador rechazan rebajarlos',()=>{
  const file=path.join(install,c.MANIFEST),saved=fs.readFileSync(file),future=JSON.parse(saved),before=tree(persistent),serverHash=c.sha256(path.join(install,'app/src/server.js'));future.capabilities.security=2;
  try{
    fs.writeFileSync(file,JSON.stringify(future));
    assert.throws(()=>installCompatible('refused-security-downgrade'),{code:'RELEASE_INCOMPATIBLE'});
    const result=spawnSync(path.join(area,'output/ElMuellePOS-Setup.exe'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/TASKS=','/DIR='+install,'/LOG='+owned(path.join(area,'refused-in-installer.log'))],{env:environment(),windowsHide:true,timeout:60000});
    assert.notEqual(result.status,0);assert.ok(!result.error);assert.deepEqual(tree(persistent),before);assert.equal(c.sha256(path.join(install,'app/src/server.js')),serverHash);results.installedSecurityRequirementPreserved=true;
  }finally{fs.writeFileSync(file,saved);}
});
test('D: reinstalación compatible por flujo controlado conserva SQLite, clave, permisos y configuración',()=>{const before=tree(persistent);assert.equal(installCompatible('compatible-reinstall').installed,true);assert.deepEqual(tree(persistent),before);results.D=true;});
test('E/G: recuperación de archivos compatibles después de fallo conserva privilegios efectivos',async()=>{
  const entry=path.join(install,'app/src/server.js'),before=tree(persistent);fs.writeFileSync(entry,'throw Error("Fallo sintetico EM003");');
  const failed=launcher('Start-ElMuellePOS.ps1');assert.notEqual(failed.status,0);assert.deepEqual(tree(persistent),before);
  assert.equal(installCompatible('compatible-repair').installed,true);assert.deepEqual(tree(persistent),before);
  await start();try{await verifyPrivileges();results.E=true;results.G=true;}finally{stop();}
  assert.equal(c.sha256(configuration),before.find(([file])=>file===configuration)[1]);
});
test('H: producción, instalador definitivo, registro y puerto 3000 permanecen intactos',()=>{assert.deepEqual(protection(),baseline);results.H=true;});
