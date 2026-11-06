// Preparación mínima del volumen del contenedor; el servidor se ejecuta como UID 1000.
const fs=require('node:fs'),path=require('node:path');
try{
 if(typeof process.getuid==='function'&&process.getuid()===0){
  const directory=process.env.MAILBOX_DATA_DIR;
  if(directory!=='/data'||!fs.existsSync(directory)||!fs.lstatSync(directory).isDirectory()||fs.lstatSync(directory).isSymbolicLink())throw Error('Volumen inválido.');
  for(const name of ['reports.sqlite','reports.sqlite-wal','reports.sqlite-shm']){const file=path.join(directory,name);if(fs.existsSync(file)){if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('Archivo inválido.');fs.chmodSync(file,0o600);fs.chownSync(file,1000,1000);}}
  fs.chmodSync(directory,0o700);fs.chownSync(directory,1000,1000);process.setgroups([]);process.setgid(1000);process.setuid(1000);
 }
 require('./server').startReceiver();
}catch{console.error('No se preparó el volumen privado del receptor.');process.exitCode=1;}
