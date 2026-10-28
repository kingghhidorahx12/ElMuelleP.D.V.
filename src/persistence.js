// Rutas y comprobación previa: ninguna recuperación cambia la base activa por sí sola.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {DatabaseSync} = require('node:sqlite');

const DATABASE_NAME = 'el-muelle-pos.sqlite';
const KEY_CHECK_ID = 'encryption-key-check-v1';
function fail(code, message) {const error = new Error(message); error.code = code; throw error;}
function inside(candidate, parent) {const relative = path.relative(parent, candidate); return relative === '' || (!relative.startsWith('..'+path.sep) && relative !== '..' && !path.isAbsolute(relative));}
function rejectLinks(target) {
  let current = path.resolve(target);
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail('STORAGE_LINK', 'La ruta persistente no puede contener enlaces ni uniones.');
    const parent = path.dirname(current); if (parent === current) return; current = parent;
  }
}
function hasLegacyData(directory) {
  return fs.existsSync(directory) && fs.readdirSync(directory).some(name => name !== 'products.json');
}
function resolveStorage({env=process.env, platform=process.platform, appRoot=path.resolve(__dirname,'..')}={}) {
  const installed = env.EL_MUELLE_STORAGE_MODE === 'windows-user';
  if (env.EL_MUELLE_STORAGE_MODE && !installed) fail('STORAGE_MODE', 'Modo de almacenamiento no admitido.');
  if (installed && (platform !== 'win32' || !env.LOCALAPPDATA || !path.isAbsolute(env.LOCALAPPDATA))) fail('STORAGE_PROFILE', 'No se pudo resolver el perfil local de Windows.');
  const root = installed ? path.resolve(env.LOCALAPPDATA,'ElMuellePOS') : appRoot;
  const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(root,'data');
  const programRoot=path.basename(appRoot).toLowerCase()==='app'?path.dirname(appRoot):appRoot;
  const envPath=env.ENV_FILE ? path.resolve(env.ENV_FILE) : path.join(root,installed?'config/.env':'.env');
  if (installed && (inside(root,programRoot) || inside(programRoot,root) || inside(dataDir,programRoot) || inside(programRoot,dataDir) || inside(envPath,programRoot))) fail('STORAGE_OVERLAP','Los datos persistentes deben estar fuera de los archivos del programa.');
  // Un origen legado nunca se ignora para abrir silenciosamente una base nueva.
  if (installed && !env.DATA_DIR && hasLegacyData(path.join(appRoot,'data'))) fail('LEGACY_DATA_REQUIRES_SELECTION','Hay datos en la instalación anterior. Requieren una copia verificada y selección explícita de DATA_DIR antes de usar la nueva ruta.');
  if(installed&&!env.ENV_FILE&&fs.existsSync(path.join(appRoot,'.env')))fail('LEGACY_CONFIG_REQUIRES_SELECTION','Hay configuración dentro del programa anterior. Debe verificarse y seleccionarse fuera del programa antes del arranque.');
  const legacyProfile=path.join(programRoot,'browser-profile');
  if(installed&&fs.existsSync(legacyProfile)&&fs.readdirSync(legacyProfile).length)fail('LEGACY_PROFILE_REQUIRES_SELECTION','Hay preferencias de navegador dentro del programa anterior. Requieren copia y archivo verificados antes de usar el perfil persistente.');
  return {installed,root,dataDir,databasePath:path.join(dataDir,DATABASE_NAME),secretPath:path.join(dataDir,'.secrets.json'),
    envPath,
    logsDir:path.join(root,'logs'),runtimeDir:path.join(root,'runtime-state'),browserProfileDir:path.join(root,'browser-profile')};
}

function restrictPrivatePath(target, directory=false) {
  rejectLinks(target);
  if (process.platform !== 'win32') {fs.chmodSync(target,directory?0o700:0o600); return;}
  // El secreto nunca se interpola en comandos ni se imprime. SID independientes del idioma.
  const script = `$ErrorActionPreference='Stop'; $p=$env:EL_MUELLE_PRIVATE_PATH; $isDir=$env:EL_MUELLE_PRIVATE_DIRECTORY -eq 'true';
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;
    if($isDir){$acl=[Security.AccessControl.DirectorySecurity]::new();$inherit=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{$acl=[Security.AccessControl.FileSecurity]::new();$inherit=[Security.AccessControl.InheritanceFlags]::None}
    $acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);
    foreach($id in @($sid.Value,'S-1-5-18','S-1-5-32-544')){$rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($id),[Security.AccessControl.FileSystemRights]::FullControl,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);$acl.AddAccessRule($rule)}
    if($isDir){[IO.Directory]::SetAccessControl($p,$acl)}else{[IO.File]::SetAccessControl($p,$acl)}`;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:'ignore',env:{...process.env,EL_MUELLE_PRIVATE_PATH:path.resolve(target),EL_MUELLE_PRIVATE_DIRECTORY:String(directory)}});
  if (result.status !== 0) fail('STORAGE_ACL','No se pudo proteger el archivo o directorio privado. No continúes la recuperación.');
}
function privateDirectory(directory) {
  rejectLinks(directory); fs.mkdirSync(directory,{mode:0o700});
  try {restrictPrivatePath(directory,true);} catch(error) {fs.rmdirSync(directory); throw error;}
}
function verifyPrivatePaths(targets) {
  targets.forEach(rejectLinks);
  if(process.platform!=='win32') {if(targets.some(target=>(fs.statSync(target).mode&0o077)!==0))fail('STORAGE_ACL','El almacenamiento privado tiene permisos de acceso demasiado amplios.');return;}
  const script=`$ErrorActionPreference='Stop';$allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544');foreach($p in ($env:EL_MUELLE_PRIVATE_PATHS -split '\n')){if([IO.Directory]::Exists($p)){$acl=[IO.Directory]::GetAccessControl($p)}else{$acl=[IO.File]::GetAccessControl($p)};foreach($rule in $acl.Access){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed){exit 2}}}`;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:'ignore',env:{...process.env,EL_MUELLE_PRIVATE_PATHS:targets.map(target=>path.resolve(target)).join('\n')}});
  if(result.status!==0)fail('STORAGE_ACL','La carpeta persistente tiene permisos no verificados. Requiere revisión técnica antes del arranque.');
}
function verifyPrivatePath(target) {verifyPrivatePaths([target]);}
function prepareInstalledStorage(storage, appRoot=path.resolve(__dirname,'..')) {
  if (!storage.installed) return;
  rejectLinks(storage.root); rejectLinks(storage.dataDir);
  if(fs.existsSync(path.join(storage.dataDir,'.recovery-incomplete')))fail('STORAGE_RECOVERY_INCOMPLETE','Hay una recuperación incompleta. Requiere revisión técnica antes del arranque.');
  if (!fs.existsSync(storage.root)) privateDirectory(storage.root);
  else verifyPrivatePath(storage.root);
  for (const directory of [storage.dataDir,path.dirname(storage.envPath),storage.logsDir,storage.runtimeDir,storage.browserProfileDir]) {
    if (!fs.existsSync(directory)) {fs.mkdirSync(path.dirname(directory),{recursive:true,mode:0o700});privateDirectory(directory);}
  }
  const backupDir=path.join(storage.dataDir,'backups');
  const sensitive=[storage.dataDir,path.dirname(storage.envPath),storage.logsDir,storage.runtimeDir,storage.browserProfileDir,storage.envPath,storage.secretPath,storage.databasePath,storage.databasePath+'-wal',storage.databasePath+'-shm',backupDir];
  if(fs.existsSync(backupDir)){rejectLinks(backupDir);for(const name of fs.readdirSync(backupDir))if(name.endsWith('.sqlite'))sensitive.push(path.join(backupDir,name));}
  verifyPrivatePaths(sensitive.filter(target=>fs.existsSync(target)));
  const catalog=path.join(storage.dataDir,'products.json');
  if (!fs.existsSync(storage.databasePath) && !fs.existsSync(catalog) && !hasLegacyData(storage.dataDir)) {
    const seed=path.join(appRoot,'data','products.json');
    if (!fs.existsSync(seed)) fail('STORAGE_CATALOG','No se encontró el catálogo inicial de la aplicación.');
    fs.copyFileSync(seed,catalog,fs.constants.COPYFILE_EXCL);
  }
}

function encryptedValues(value, output=[]) {
  if (typeof value === 'string' && value.startsWith('enc:')) output.push(value);
  else if (Array.isArray(value)) value.forEach(item=>encryptedValues(item,output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item=>encryptedValues(item,output));
  return output;
}
function inspectDatabase(file) {
  rejectLinks(file); let db;
  try {
    if (fs.statSync(file).size < 100) throw Error('invalid');
    db=new DatabaseSync(file,{readOnly:true});
    const check=db.prepare('PRAGMA quick_check').all();
    if (check.length!==1 || Object.values(check[0])[0]!=='ok') throw Error('invalid');
    const rows=db.prepare('SELECT collection,document_id,payload FROM documents').all();
    const encrypted=[]; let keyCheck=null;
    for (const row of rows) {const value=JSON.parse(row.payload); encryptedValues(value,encrypted);if(row.collection==='meta'&&row.document_id===KEY_CHECK_ID)keyCheck=value;}
    // Comprobar también que la bitácora necesaria para restaurar está disponible.
    db.prepare('SELECT id,details FROM audit_events').all().forEach(row=>JSON.parse(row.details));
    return {encrypted,keyCheck};
  } catch {fail('STORAGE_DATABASE_INVALID','La base no es un respaldo válido de El Muelle POS o no supera la comprobación de integridad.');}
  finally {db?.close();}
}
function keyProof(key) {return crypto.createHmac('sha256',crypto.createHash('sha256').update(key).digest()).update('El Muelle POS / clave de datos / v1').digest('hex');}
function validateKey(key, inspection) {
  try {
    if (typeof key!=='string' || key.trim().length<32) throw Error('invalid');
    if (inspection.keyCheck) {
      const saved=inspection.keyCheck.proof;
      if (typeof saved!=='string'||!/^[a-f0-9]{64}$/.test(saved)||!crypto.timingSafeEqual(Buffer.from(saved,'hex'),Buffer.from(keyProof(key),'hex'))) throw Error('invalid');
    }
    const derived=crypto.createHash('sha256').update(key).digest();
    for (const payload of inspection.encrypted) {
      const parts=payload.split(':');if(parts.length!==5||parts[0]!=='enc'||parts[1]!=='v1')throw Error('invalid');
      const iv=Buffer.from(parts[2],'base64url'),tag=Buffer.from(parts[3],'base64url');if(iv.length!==12||tag.length!==16)throw Error('invalid');
      const decipher=crypto.createDecipheriv('aes-256-gcm',derived,iv);decipher.setAuthTag(tag);
      JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[4],'base64url')),decipher.final()]).toString('utf8'));
    }
  } catch {fail('STORAGE_KEY_MISMATCH','La clave no corresponde a la base o hay información cifrada dañada. Recupera la clave original; no se modificó la base.');}
}
function readKeyFile(file) {
  rejectLinks(file);
  try {const key=JSON.parse(fs.readFileSync(file,'utf8')).dataEncryptionKey;if(typeof key!=='string'||key.trim().length<32)throw Error('invalid');return key.trim();}
  catch {fail('STORAGE_KEY_INVALID','No se pudo leer una clave local válida. Recupera el archivo original desde su custodia segura.');}
}
function resolveEncryptionKey(dataDir,configuredKey='') {
  rejectLinks(dataDir);
  if(fs.existsSync(path.join(dataDir,'.recovery-incomplete')))fail('STORAGE_RECOVERY_INCOMPLETE','Hay una recuperación incompleta. No se abrió ni se inicializó la base.');
  const databasePath=path.join(dataDir,DATABASE_NAME),secretPath=path.join(dataDir,'.secrets.json');
  if(!fs.existsSync(databasePath)&&(fs.existsSync(databasePath+'-wal')||fs.existsSync(databasePath+'-shm')||(fs.existsSync(path.join(dataDir,'backups'))&&fs.readdirSync(path.join(dataDir,'backups')).some(name=>name.endsWith('.sqlite')))))fail('STORAGE_DATABASE_MISSING','Falta la base activa pero hay archivos de recuperación. No se inicializó otra base.');
  const inspection=fs.existsSync(databasePath)?inspectDatabase(databasePath):{encrypted:[],keyCheck:null};
  let legacyState=false;
  if(!fs.existsSync(databasePath)) {
    for(const name of ['products','sales','settings','cash-sessions','cash-shifts','inventory-entries']) {
      const file=path.join(dataDir,name+'.json');if(!fs.existsSync(file))continue;
      let value;
      try {rejectLinks(file);value=JSON.parse(fs.readFileSync(file,'utf8'));}
      catch {fail('STORAGE_DATABASE_INVALID','Los datos heredados no se pueden leer con seguridad. No se generó otra clave.');}
      // Un marcador acredita una migración anterior, no datos recuperables.
      if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,'migratedTo'))fail('STORAGE_DATABASE_MISSING','Falta la base de una instalación ya migrada. Restaura su respaldo; no se inicializó otra base.');
      encryptedValues(value,inspection.encrypted);
      if(name!=='products'&&((Array.isArray(value)&&value.length>0)||(name==='settings'&&value&&!Array.isArray(value)&&typeof value==='object'&&['users','adminPin','adminPinHash','setupCompleted'].some(field=>Object.hasOwn(value,field)))))legacyState=true;
    }
  }
  const existingFile=fs.existsSync(secretPath);
  if(existingFile&&!fs.existsSync(databasePath)&&!legacyState)fail('STORAGE_DATABASE_MISSING','Existe una clave local pero falta la base activa. Revisa la recuperación antes de inicializar datos.');
  let key=String(configuredKey||'').trim();
  if (key && key.length<32) fail('STORAGE_KEY_INVALID','La clave configurada no es válida. No se generó otra clave.');
  if(key&&existingFile&&readKeyFile(secretPath)!==key)fail('STORAGE_KEY_MISMATCH','La clave configurada y la clave local no coinciden. Revisa la custodia original antes del arranque.');
  if (!key && existingFile) key=readKeyFile(secretPath);
  if (!key && (inspection.encrypted.length || inspection.keyCheck)) fail('STORAGE_KEY_MISSING','Falta la clave de una base existente. Restaura su clave original; no se generó otra.');
  if (key) {validateKey(key,inspection);return key;}
  // Sólo primera inicialización sin datos cifrados ni comprobante de clave previo.
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  key=crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(secretPath,JSON.stringify({dataEncryptionKey:key,createdAt:new Date().toISOString()}),{encoding:'utf8',mode:0o600,flag:'wx'});
  restrictPrivatePath(secretPath);
  return key;
}
function ensureKeyCheck(database,key) {
  if(database.readDocument('meta',KEY_CHECK_ID))return;
  database.transaction(()=>database.saveDocument('meta',KEY_CHECK_ID,{proof:keyProof(key)}));
}

module.exports={DATABASE_NAME,KEY_CHECK_ID,resolveStorage,prepareInstalledStorage,resolveEncryptionKey,ensureKeyCheck,inspectDatabase,validateKey,readKeyFile,privateDirectory,restrictPrivatePath,verifyPrivatePath,rejectLinks,inside};
if(require.main===module){
  try {
    if(!['--paths','--prepare'].includes(process.argv[2]))fail('STORAGE_ARGUMENT','Usa --paths o --prepare.');
    const storage=resolveStorage();if(process.argv[2]==='--prepare')prepareInstalledStorage(storage);
    process.stdout.write(JSON.stringify(storage));
  }catch(error){process.stderr.write((error.code||'STORAGE_ERROR')+': '+error.message+'\n');process.exitCode=1;}
}
