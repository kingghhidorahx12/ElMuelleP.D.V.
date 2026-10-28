// Respaldo autocontenido cifrado. La contraseña nunca se acepta por argumentos o entorno.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const readline = require('node:readline');
const p = require('../src/persistence');
const {restoreData} = require('./restore-data');
const MAGIC = 'ElMuellePOS-recovery-v1';
const MAX_BYTES = 256 * 1024 * 1024;
const MIN_PASSWORD_LENGTH = 6;

function passwordKey(password,salt) {
  if(typeof password!=='string'||password.length<MIN_PASSWORD_LENGTH)throw Error(`Usa una contraseña de recuperación de al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  return crypto.scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
}
function privateStage() {
  const stage=fs.mkdtempSync(path.join(os.tmpdir(),'el-muelle-custody-'));
  try {p.restrictPrivatePath(stage,true);return stage;}
  catch(error){fs.rmdirSync(stage);throw error;}
}
function cleanup(stage) {
  if(!p.inside(stage,os.tmpdir())||!path.basename(stage).startsWith('el-muelle-custody-'))throw Error('Área temporal inválida.');
  p.rejectLinks(stage);fs.rmSync(stage,{recursive:true,force:true});
}
function exportCustody({databaseFile,keyFile,configuredKey,destination,password,envFile,backupDirectory}) {
  const output=path.resolve(destination);
  p.rejectLinks(output);
  if(p.inside(output,path.dirname(path.resolve(databaseFile))))throw Error('Guarda la custodia fuera del directorio de datos de origen.');
  if(fs.existsSync(output))throw Error('El archivo de custodia ya existe.');
  // Validar contraseña antes de producir material temporal.
  const salt=crypto.randomBytes(32),derived=passwordKey(password,salt);
  const stage=privateStage();
  try {
    let secret=keyFile;
    if(!secret) {
      if(!configuredKey&&envFile){p.rejectLinks(envFile);configuredKey=require('node:util').parseEnv(fs.readFileSync(envFile,'utf8')).DATA_ENCRYPTION_KEY;}
      configuredKey=String(configuredKey||'').trim();
      if(!configuredKey)throw Error('Falta la clave original.');
      p.validateKey(configuredKey,p.inspectDatabase(databaseFile));
      p.privateDirectory(path.join(stage,'key'));
      secret=path.join(stage,'key','original-key.json');
      fs.writeFileSync(secret,JSON.stringify({dataEncryptionKey:configuredKey}),{flag:'wx',mode:0o600});
    }
    const snapshot=path.join(stage,'snapshot');
    restoreData({databaseFile,keyFile:secret,destination:snapshot,backupDirectory});
    const files={};
    const collect=(folder,prefix='')=>{
      for(const item of fs.readdirSync(folder,{withFileTypes:true})) {
        const file=path.join(folder,item.name),name=prefix+item.name;
        p.rejectLinks(file);
        if(item.isDirectory())collect(file,name+'/');
        else files[name]=fs.readFileSync(file).toString('base64');
      }
    };
    collect(snapshot);
    if(envFile){p.rejectLinks(envFile);files['configuration.env']=fs.readFileSync(envFile).toString('base64');}
    const payload=Buffer.from(JSON.stringify({format:MAGIC,files}));
    if(payload.length>MAX_BYTES/2)throw Error('El respaldo excede el límite de esta herramienta.');
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',derived,iv);
    cipher.setAAD(Buffer.from(MAGIC));
    const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);
    const envelope=JSON.stringify({format:MAGIC,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')});
    fs.writeFileSync(output,envelope,{flag:'wx',mode:0o600});
    return {exported:true,encrypted:true,externalCustodyConfirmed:false};
  } finally {derived.fill(0);cleanup(stage);}
}
function restoreCustody({archive,destination,password}) {
  p.rejectLinks(archive);p.rejectLinks(destination);
  if(fs.existsSync(destination))throw Error('El destino debe ser nuevo.');
  if(fs.statSync(archive).size>MAX_BYTES)throw Error('Respaldo demasiado grande.');
  const envelope=JSON.parse(fs.readFileSync(archive,'utf8'));
  if(envelope.format!==MAGIC)throw Error('Formato de respaldo desconocido.');
  const decode=(value,length)=>{
    if(typeof value!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Respaldo inválido.');
    const bytes=Buffer.from(value,'base64');if((length&&bytes.length!==length)||bytes.toString('base64')!==value)throw Error('Respaldo inválido.');return bytes;
  };
  const derived=passwordKey(password,decode(envelope.salt,32));
  let payload;
  try {
    const decipher=crypto.createDecipheriv('aes-256-gcm',derived,decode(envelope.iv,12));
    decipher.setAAD(Buffer.from(MAGIC));decipher.setAuthTag(decode(envelope.tag,16));
    payload=JSON.parse(Buffer.concat([decipher.update(decode(envelope.ciphertext)),decipher.final()]).toString('utf8'));
  } finally {derived.fill(0);}
  if(payload.format!==MAGIC||!payload.files||Array.isArray(payload.files)||typeof payload.files!=='object')throw Error('Respaldo inválido.');
  const stage=privateStage();
  try {
    for(const [name,value] of Object.entries(payload.files)) {
      if(![p.DATABASE_NAME,'.secrets.json','configuration.env'].includes(name)&&!/^backups\/el-muelle-pos-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name))throw Error('Archivo no permitido.');
      const file=path.join(stage,name);
      if(name.startsWith('backups/')&&!fs.existsSync(path.dirname(file)))p.privateDirectory(path.dirname(file));
      fs.writeFileSync(file,decode(value),{flag:'wx',mode:0o600});
    }
    const backups=path.join(stage,'backups');
    const result=restoreData({databaseFile:path.join(stage,p.DATABASE_NAME),keyFile:path.join(stage,'.secrets.json'),destination,backupDirectory:fs.existsSync(backups)?backups:undefined});
    // Conservar la configuración recuperada sin activarla ni reemplazar .env.
    if(fs.existsSync(path.join(stage,'configuration.env'))) {
      const marker=path.join(destination,'.recovery-incomplete');
      fs.writeFileSync(marker,'Recovery in progress',{flag:'wx',mode:0o600});
      fs.copyFileSync(path.join(stage,'configuration.env'),path.join(destination,'configuration.recovered.env'),fs.constants.COPYFILE_EXCL);
      fs.unlinkSync(marker);
    }
    return {...result,configurationActivationRequired:fs.existsSync(path.join(stage,'configuration.env'))};
  } finally {cleanup(stage);}
}

async function promptPassword(label) {
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Se requiere una terminal interactiva para la contraseña.');
  process.stdout.write(label);
  readline.emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{
    let value='';
    function done(error){process.stdin.off('keypress',onKey);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(value);}
    function onKey(text,key={}) {
      if(key.ctrl&&key.name==='c')return done(Error('Cancelado.'));
      if(key.name==='return')return done();
      if(key.name==='backspace') {if(value.length){value=value.slice(0,-1);process.stdout.write('\b \b');}}
      else if(text&&!key.ctrl&&!key.meta&&text>=' ') {value+=text;process.stdout.write('*'.repeat(text.length));}
    }
    process.stdin.on('keypress',onKey);
  });
}
module.exports={exportCustody,restoreCustody,promptPassword,MIN_PASSWORD_LENGTH};
if(require.main===module)(async()=>{
  const [command,...args]=process.argv.slice(2),values={};
  if(!['export','restore'].includes(command)||args.length%2)throw Error('Usa export o restore e indica las rutas necesarias.');
  const allowed=command==='export'?['--database','--key-file','--destination','--env-file','--backup-dir']:['--archive','--destination'];
  for(let i=0;i<args.length;i+=2){if(!allowed.includes(args[i])||!args[i+1]||Object.hasOwn(values,args[i]))throw Error('Argumento inválido.');values[args[i]]=args[i+1];}
  if(!values['--destination']||!(command==='export'?values['--database']:values['--archive']))throw Error('Faltan rutas requeridas.');
  const password=await promptPassword(`${command==='export'?'Crear':'Abrir'} respaldo (mínimo ${MIN_PASSWORD_LENGTH} caracteres): `);
  if(command==='export'&&password!==await promptPassword('Repite la contraseña: '))throw Error('Las contraseñas no coinciden.');
  // Sin archivo local, sólo se lee la clave configurada; nunca se crea una nueva.
  const result=command==='export'?exportCustody({databaseFile:values['--database'],keyFile:values['--key-file'],configuredKey:process.env.DATA_ENCRYPTION_KEY,destination:values['--destination'],envFile:values['--env-file'],backupDirectory:values['--backup-dir'],password}):restoreCustody({archive:values['--archive'],destination:values['--destination'],password});
  console.log(JSON.stringify(result));
})().catch(()=>{console.error('Custodia rechazada: revisa contraseña, integridad, clave original y destino nuevo. No se cambió la base activa.');process.exitCode=1;});
