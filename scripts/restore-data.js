// Recuperación local optativa: copia consistente a un destino nuevo y privado.
// No selecciona DATA_DIR, no migra la instalación activa y nunca reemplaza archivos.
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const p=require('../src/persistence');

function restoreData({databaseFile,keyFile,destination,backupDirectory}) {
  if(!databaseFile||!keyFile||!destination)throw Error('Indica base, archivo de clave y destino nuevo.');
  const source=path.resolve(databaseFile),target=path.resolve(destination),secret=path.resolve(keyFile);
  [source,target,secret].forEach(p.rejectLinks);
  if(fs.existsSync(target)||p.inside(source,target)||p.inside(secret,target)||p.inside(target,path.dirname(source))||p.inside(target,path.dirname(secret)))throw Error('El destino debe ser un directorio nuevo, separado del origen.');
  const key=p.readKeyFile(secret);
  p.validateKey(key,p.inspectDatabase(source));
  // El restaurador actual conserva los permisos; no habilita código histórico.
  require('../src/release-compatibility').checkDatabase(source,secret);
  const backups=[];
  if(backupDirectory) {
    p.rejectLinks(backupDirectory);
    if(p.inside(path.resolve(backupDirectory),target))throw Error('Los respaldos deben estar fuera del destino.');
    for(const name of fs.readdirSync(backupDirectory)) {
      if(!/^el-muelle-pos-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name))continue;
      const file=path.join(backupDirectory,name);p.validateKey(key,p.inspectDatabase(file));backups.push([file,name]);
    }
  }
  // El directorio padre debe existir; no se crean rutas arbitrarias en forma recursiva.
  const stage=fs.mkdtempSync(path.join(path.dirname(target),'.el-muelle-restore-'));
  try {
    p.restrictPrivatePath(stage,true);
    const output=path.join(stage,p.DATABASE_NAME);
    const db=new DatabaseSync(source,{readOnly:true});
    try{db.exec("VACUUM INTO '"+output.replace(/'/g,"''")+"'");}finally{db.close();}
    p.validateKey(key,p.inspectDatabase(output));
    fs.copyFileSync(secret,path.join(stage,'.secrets.json'),fs.constants.COPYFILE_EXCL);
    p.restrictPrivatePath(path.join(stage,'.secrets.json'));
    const copiedKey=p.readKeyFile(path.join(stage,'.secrets.json'));
    p.validateKey(copiedKey,p.inspectDatabase(output));
    if(backups.length) {
      const folder=path.join(stage,'backups');p.privateDirectory(folder);
      for(const [file,name] of backups){const copied=path.join(folder,name);fs.copyFileSync(file,copied,fs.constants.COPYFILE_EXCL);p.validateKey(copiedKey,p.inspectDatabase(copied));}
    }
    // Reservar el destino impide reemplazar incluso un directorio vacío creado mientras se copiaba.
    p.privateDirectory(target);
    fs.writeFileSync(path.join(target,'.recovery-incomplete'),'Recovery in progress',{flag:'wx',mode:0o600});
    for(const name of fs.readdirSync(stage))fs.renameSync(path.join(stage,name),path.join(target,name));
    fs.unlinkSync(path.join(target,'.recovery-incomplete'));
    fs.rmdirSync(stage);
    return {restored:true,backups:backups.length,activationRequired:true};
  } catch(error) {
    // Sólo el área temporal creada aquí; un destino parcial se conserva para revisión.
    if(p.inside(stage,path.dirname(target))&&path.basename(stage).startsWith('.el-muelle-restore-'))fs.rmSync(stage,{recursive:true,force:true});
    throw error;
  }
}
module.exports={restoreData};
if(require.main===module) {
  try {
    const args=process.argv.slice(2),values={};
    for(let i=0;i<args.length;i+=2){if(!['--database','--key-file','--destination','--backup-dir'].includes(args[i])||!args[i+1])throw Error('Usa --database, --key-file, --destination y opcionalmente --backup-dir.');values[args[i]]=args[i+1];}
    const result=restoreData({databaseFile:values['--database'],keyFile:values['--key-file'],destination:values['--destination'],backupDirectory:values['--backup-dir']});
    console.log(JSON.stringify(result));
  }catch{console.error('Recuperación rechazada: verifica integridad, clave original, permisos y destino nuevo. No se cambió la selección de base activa.');process.exitCode=1;}
}
