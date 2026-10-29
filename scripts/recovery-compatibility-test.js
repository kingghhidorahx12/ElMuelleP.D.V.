// Sólo datos sintéticos; nunca abre la base ni el resguardo del propietario.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {PosDatabase}=require('../src/database');
const p=require('../src/persistence');
const custody=require('./recovery-custody');
const project=path.resolve(__dirname,'..'),dev=path.join(project,'.dev');
let temporary;
const previousTemp=process.env.TEMP,previousTmp=process.env.TMP;
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const customer={email:'compatibility-synthetic@example.invalid',rfc:'XAXX010101000'};
function folder(name){const target=path.join(temporary,name);assert.ok(p.inside(target,temporary));p.privateDirectory(target);return target;}
function fixture(name){
  const data=folder(name),key=p.resolveEncryptionKey(data),db=new PosDatabase(data);
  try{
    p.ensureKeyCheck(db,key);
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',crypto.createHash('sha256').update(key).digest(),iv);
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(customer)),cipher.final()]);
    const customerEncrypted=['enc','v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join(':');
    db.transaction(()=>{
      db.saveDocument('sales','synthetic-sale',{id:'synthetic-sale',customerEncrypted,total:100});
      db.saveDocument('settings','current',{users:[{id:'synthetic-owner',role:'admin'}],business:{name:'Synthetic only'}});
      db.addAuditEvent({eventType:'synthetic_fixture',entityType:'test',details:{synthetic:true}});
    });
  }finally{db.close();}
  const envFile=path.join(data,'.env');fs.writeFileSync(envFile,'# Synthetic only\nHOST=127.0.0.1\n');
  return {data,databaseFile:path.join(data,p.DATABASE_NAME),keyFile:path.join(data,'.secrets.json'),envFile,backupDirectory:path.join(data,'backups')};
}
function protectedState(source){
  const files=[source.databaseFile,source.keyFile,source.envFile,...fs.readdirSync(source.backupDirectory).map(name=>path.join(source.backupDirectory,name))];
  return files.sort().map(file=>[file,hash(file)]);
}
function databaseState(file){
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    return {
      documents:JSON.stringify(db.prepare('SELECT * FROM documents ORDER BY collection,document_id').all()),
      audit:JSON.stringify(db.prepare('SELECT * FROM audit_events ORDER BY id').all())
    };
  }finally{db.close();}
}
function verifyRecovery(source,destination){
  const file=path.join(destination,p.DATABASE_NAME),keyFile=path.join(destination,'.secrets.json');
  assert.equal(hash(keyFile),hash(source.keyFile));
  assert.deepEqual(databaseState(file),databaseState(source.databaseFile));
  assert.equal(hash(path.join(destination,'configuration.recovered.env')),hash(source.envFile));
  assert.equal(fs.existsSync(path.join(destination,'.env')),false);
  const key=p.readKeyFile(keyFile),inspection=p.inspectDatabase(file);
  assert.equal(inspection.encrypted.length,1);p.validateKey(key,inspection);
  const db=new DatabaseSync(file,{readOnly:true});
  let payload;
  try{payload=JSON.parse(db.prepare("SELECT payload FROM documents WHERE collection='sales' AND document_id='synthetic-sale'").get().payload).customerEncrypted;}finally{db.close();}
  const [,,iv,tag,encrypted]=payload.split(':');
  const decipher=crypto.createDecipheriv('aes-256-gcm',crypto.createHash('sha256').update(key).digest(),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  assert.deepEqual(JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted,'base64url')),decipher.final()]).toString('utf8')),customer);
}
before(()=>{
  fs.mkdirSync(dev,{recursive:true});temporary=fs.mkdtempSync(path.join(dev,'em003-recovery-compatibility-'));
  p.restrictPrivatePath(temporary,true);
  const runtime=folder('private-runtime');process.env.TEMP=runtime;process.env.TMP=runtime;
});
after(()=>{
  if(previousTemp===undefined)delete process.env.TEMP;else process.env.TEMP=previousTemp;
  if(previousTmp===undefined)delete process.env.TMP;else process.env.TMP=previousTmp;
  if(temporary){
    assert.ok(p.inside(temporary,dev)&&path.basename(temporary).startsWith('em003-recovery-compatibility-'));
    p.rejectLinks(temporary);fs.rmSync(temporary,{recursive:true,force:true});
    assert.equal(fs.existsSync(temporary),false);
  }
});
test('Política aprobada: crea y recupera v1 con 6 caracteres, conservando datos cifrados y origen',()=>{
  assert.equal(custody.MIN_PASSWORD_LENGTH,6);
  const source=fixture('six-character-source'),before=protectedState(source),archive=path.join(temporary,'six.emrecovery');
  const password='syn6ok'; // Exclusivamente sintética.
  custody.exportCustody({...source,destination:archive,password});
  const savedHash=hash(archive),envelope=JSON.parse(fs.readFileSync(archive,'utf8'));
  assert.equal(envelope.format,'ElMuellePOS-recovery-v1');
  assert.equal(fs.readFileSync(archive,'utf8').includes(password),false);
  assert.equal(fs.readFileSync(archive,'utf8').includes(customer.email),false);
  const destination=path.join(temporary,'six-restored');
  const result=custody.restoreCustody({archive,destination,password});
  assert.equal(result.activationRequired,true);verifyRecovery(source,destination);
  assert.equal(hash(archive),savedHash);assert.deepEqual(protectedState(source),before);
});
test('Un respaldo v1 con contraseña histórica de 16 caracteres sigue recuperándose',()=>{
  const source=fixture('sixteen-character-source'),before=protectedState(source),archive=path.join(temporary,'sixteen.emrecovery');
  const password='synthetic-test16';assert.equal(password.length,16);
  custody.exportCustody({...source,destination:archive,password});
  const savedHash=hash(archive),destination=path.join(temporary,'sixteen-restored');
  custody.restoreCustody({archive,destination,password});verifyRecovery(source,destination);
  assert.equal(hash(archive),savedHash);assert.deepEqual(protectedState(source),before);
});
test('Menos de 6 caracteres no crea respaldo ni recupera un destino',()=>{
  const source=fixture('too-short-source'),archive=path.join(temporary,'short.emrecovery'),before=protectedState(source);
  assert.throws(()=>custody.exportCustody({...source,destination:archive,password:'short'}),/al menos 6 caracteres/);
  assert.equal(fs.existsSync(archive),false);
  custody.exportCustody({...source,destination:archive,password:'syn6ok'});
  const savedHash=hash(archive),destination=path.join(temporary,'too-short-restored');
  assert.throws(()=>custody.restoreCustody({archive,destination,password:'short'}),/al menos 6 caracteres/);
  assert.equal(fs.existsSync(destination),false);assert.equal(hash(archive),savedHash);
  assert.deepEqual(protectedState(source),before);
});
test('Contraseña incorrecta y copia truncada se rechazan; el respaldo original no cambia',()=>{
  const source=fixture('rejected-source'),archive=path.join(temporary,'original.emrecovery'),before=protectedState(source);
  custody.exportCustody({...source,destination:archive,password:'syn6ok'});
  const savedHash=hash(archive),wrong=path.join(temporary,'wrong-password');
  assert.throws(()=>custody.restoreCustody({archive,destination:wrong,password:'bad6ok'}));
  assert.equal(fs.existsSync(wrong),false);
  const truncated=path.join(temporary,'truncated-copy.emrecovery');
  fs.writeFileSync(truncated,fs.readFileSync(archive).subarray(0,60));
  const incomplete=path.join(temporary,'incomplete-restored');
  assert.throws(()=>custody.restoreCustody({archive:truncated,destination:incomplete,password:'syn6ok'}));
  assert.equal(fs.existsSync(incomplete),false);assert.equal(hash(archive),savedHash);
  assert.deepEqual(protectedState(source),before);
});

test('Herramientas actuales en copia aislada: identidad y recuperación cruzada con mínimo de 6 caracteres',()=>{
  const app=folder('current-tools'),scriptDir=path.join(app,'scripts');fs.mkdirSync(scriptDir);fs.cpSync(path.join(project,'src'),path.join(app,'src'),{recursive:true});for(const file of ['recovery-custody.js','restore-data.js'])fs.copyFileSync(path.join(project,'scripts',file),path.join(scriptDir,file));const packagedPath=path.join(scriptDir,'recovery-custody.js');
  assert.equal(hash(packagedPath),hash(path.join(__dirname,'recovery-custody.js')));
  const packaged=require(packagedPath);assert.equal(packaged.MIN_PASSWORD_LENGTH,6);
  const source=fixture('packaged-source'),before=protectedState(source),archive=path.join(temporary,'packaged.emrecovery'),password='syn6ok';
  packaged.exportCustody({...source,destination:archive,password});
  const savedHash=hash(archive),currentTarget=path.join(temporary,'current-from-package');
  custody.restoreCustody({archive,destination:currentTarget,password});verifyRecovery(source,currentTarget);
  const currentArchive=path.join(temporary,'current.emrecovery');
  custody.exportCustody({...source,destination:currentArchive,password});
  const currentHash=hash(currentArchive),packagedTarget=path.join(temporary,'package-from-current');
  packaged.restoreCustody({archive:currentArchive,destination:packagedTarget,password});verifyRecovery(source,packagedTarget);
  assert.equal(hash(archive),savedHash);assert.equal(hash(currentArchive),currentHash);
  assert.deepEqual(protectedState(source),before);
});
