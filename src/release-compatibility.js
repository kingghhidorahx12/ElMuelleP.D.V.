// Contrato del flujo controlado. Los hashes se aprueban fuera del paquete;
// no constituyen una firma ni protegen de ejecutar manualmente un EXE histórico.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const REQUIRED = Object.freeze({schema:'documents-v1',cipher:'enc:v1',permissions:'employee-modules-v1',security:1});
const MANIFEST = 'release-manifest.json';
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function noLinks(file){let next=path.resolve(file);for(;;){if(fs.existsSync(next)&&fs.lstatSync(next).isSymbolicLink())fail('RELEASE_LINK','No se admiten enlaces en una revisión verificada.');const parent=path.dirname(next);if(parent===next)return;next=parent;}}
function capabilities(value){
  if(!value||Object.keys(REQUIRED).some(key=>value[key]!==REQUIRED[key]))fail('RELEASE_INCOMPATIBLE','Revisión rechazada: requiere esquema documents-v1, cifrado enc:v1 y permisos individuales employee-modules-v1 (seguridad 1).');
}
function descriptor(file,expectedHash){
  noLinks(file);
  if(!fs.existsSync(file))fail('RELEASE_UNVERIFIED','La revisión no tiene identidad ni compatibilidad de seguridad verificadas. No se reemplazaron archivos.');
  if(expectedHash&&(!/^[a-f0-9]{64}$/.test(expectedHash)||sha256(file)!==expectedHash))fail('RELEASE_HASH','La identidad de la revisión no coincide con el SHA-256 aprobado.');
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  if(value.format!=='ElMuellePOS-release-v1'||!value.files||Array.isArray(value.files)||typeof value.files!=='object')fail('RELEASE_FORMAT','Descriptor de revisión inválido.');
  capabilities(value.capabilities);
  for(const name of ['app/src/access.js','app/src/server.js','app/src/database.js','app/src/persistence.js','app/src/release-compatibility.js','app/scripts/restore-data.js','app/scripts/recovery-custody.js','Start-ElMuellePOS.ps1','runtime/node.exe'])if(!Object.hasOwn(value.files,name))fail('RELEASE_INCOMPLETE','Faltan componentes obligatorios de seguridad.');
  if(crypto.createHash('sha256').update(JSON.stringify(value.files)).digest('hex')!==value.revisionSHA256)fail('RELEASE_IDENTITY','Identidad de revisión inválida.');
  for(const [name,hash] of Object.entries(value.files))if(!/^[a-f0-9]{64}$/.test(hash)||name.includes('\\')||name.startsWith('/')||name.split('/').some(part=>!part||part==='.'||part==='..')||name.includes(':'))fail('RELEASE_PATH','El descriptor contiene una ruta o hash inválido.');
  return value;
}
function verifyPackage(root,expectedHash){
  noLinks(root);const value=descriptor(path.join(root,MANIFEST),expectedHash);
  for(const [name,hash] of Object.entries(value.files)){const file=path.join(root,name);noLinks(file);if(!fs.existsSync(file)||sha256(file)!==hash)fail('RELEASE_CONTENT','Archivos de aplicación distintos de la revisión verificada: '+name);}
  return value;
}
function checkInstalled(installDir){
  if(!installDir)return;
  noLinks(installDir);const file=path.join(installDir,MANIFEST);
  // Una revisión posterior puede exigir un contrato que este código no conoce.
  // No rebajar ese requisito; un archivo de programa dañado sí puede repararse.
  if(fs.existsSync(file))descriptor(file);
}
function checkData(dataDir,{envFile,configuredKey=process.env.DATA_ENCRYPTION_KEY}={}){
  if(!dataDir)return;
  noLinks(dataDir);
  const file=path.join(dataDir,'el-muelle-pos.sqlite');
  if(!fs.existsSync(file))return;
  if(!configuredKey&&envFile&&fs.existsSync(envFile)){noLinks(envFile);configuredKey=require('node:util').parseEnv(fs.readFileSync(envFile,'utf8')).DATA_ENCRYPTION_KEY;}
  checkDatabase(file,path.join(dataDir,'.secrets.json'),configuredKey);
}
function checkDatabase(file,keyFile,configuredKey){
  noLinks(file);noLinks(keyFile);
  const p=require('./persistence');
  // Sólo lectura: comprueba integridad, esquema y TODOS los valores cifrados
  // con la clave existente. No crea claves ni inicializa una base paralela.
  const saved=fs.existsSync(keyFile)?p.readKeyFile(keyFile):'',configured=String(configuredKey||'').trim();
  if(configured&&saved&&configured!==saved)fail('STORAGE_KEY_MISMATCH','La clave configurada y la local no coinciden. No se cambió ninguna.');
  const key=configured||saved;
  if(!key)fail('STORAGE_KEY_MISSING','Falta la clave original. No se generó otra ni se abrió la base.');
  p.validateKey(key,p.inspectDatabase(file));
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file,{readOnly:true});
  try{
    if(db.prepare('PRAGMA user_version').get().user_version!==0)fail('RELEASE_SCHEMA','Versión de esquema no admitida por esta revisión.');
    const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
    if(names.some(name=>!['documents','audit_events'].includes(name)))fail('RELEASE_SCHEMA','El esquema exige una revisión distinta; no se modificaron datos.');
    for(const [table,expected] of Object.entries({documents:['collection','document_id','payload','updated_at'],audit_events:['id','event_type','entity_type','entity_id','actor_id','actor_name','details','created_at']})){
      const actual=db.prepare('PRAGMA table_info('+table+')').all().map(row=>row.name);
      if(actual.length!==expected.length||expected.some((name,index)=>actual[index]!==name))fail('RELEASE_SCHEMA','Columnas no compatibles con la revisión seleccionada.');
    }
    for(const row of db.prepare("SELECT payload FROM documents WHERE collection='screen-permissions'").all()){
      const permissions=JSON.parse(row.payload).permissions;
      const modules=['pos','sales','cash','billing','products','inventory','dashboard','reports','settings'];
      if(!permissions||typeof permissions!=='object'||Array.isArray(permissions)||Object.keys(permissions).some(key=>!modules.includes(key))||Object.values(permissions).some(value=>typeof value!=='boolean'))fail('RELEASE_PERMISSIONS','Los permisos guardados requieren revisión; no se restablecieron valores.');
    }
  }finally{db.close();}
}
module.exports={REQUIRED,MANIFEST,sha256,noLinks,descriptor,verifyPackage,checkInstalled,checkData,checkDatabase};
if(require.main===module){
  try{
    const args=process.argv.slice(2),values={};
    for(let i=0;i<args.length;i+=2){if(!['--package','--manifest','--sha256','--data-dir','--configuration-file','--installed-root'].includes(args[i])||!args[i+1]||Object.hasOwn(values,args[i]))fail('RELEASE_ARGUMENT','Argumentos de compatibilidad inválidos.');values[args[i]]=args[i+1];}
    if(!values['--sha256']||(!values['--package']&&!values['--manifest']))fail('RELEASE_ARGUMENT','Indica descriptor o paquete y su SHA-256 aprobado.');
    const revision=values['--package']?verifyPackage(values['--package'],values['--sha256']):descriptor(values['--manifest'],values['--sha256']);
    checkInstalled(values['--installed-root']);checkData(values['--data-dir'],{envFile:values['--configuration-file']});console.log(JSON.stringify({compatible:true,revisionSHA256:revision.revisionSHA256,capabilities:revision.capabilities}));
  }catch(error){console.error(error.code+': '+error.message);process.exitCode=1;}
}
