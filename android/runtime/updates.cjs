const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),certificate='66347436ba4bb5ec9b991b89f0a068680cdbd6020075e7f7d78e7cf6a16effd5';
function validateManifest(m){if(!m||m.applicationId!=='mx.elmuelle.pdv'||m.certificateSHA256!==certificate||!Number.isSafeInteger(m.versionCode)||m.versionCode<14||!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>170*1024*1024||!/^[a-f0-9]{64}$/.test(m.sha256||'')||![131072,524288].includes(m.chunkSize)||!Array.isArray(m.chunks)||m.chunks.length!==Math.ceil(m.bytes/m.chunkSize)||!m.chunks.every(v=>/^[a-f0-9]{64}$/.test(v)))throw Error('La información de actualización no es válida.');return m;}
function createUpdater({directory,configuration,send,currentVersion}){
 let state={phase:'idle',progress:0},release=null,ready=null,busy=false;
 const cfg=()=>{const value=configuration();if(!value?.endpoint||!/^[a-f0-9]{64}$/.test(value.downloadToken||''))throw Error('No se pudo preparar el canal de actualizaciones. Instala la versión de transición y vuelve a intentar.');return value;};
 const status=()=>({...state,currentVersion:currentVersion(),available:!!release&&release.versionCode>currentVersion().versionCode,release:release?{versionCode:release.versionCode,versionName:release.versionName,bytes:release.bytes,notes:String(release.notes||'').slice(0,2000)}:null});
 async function check(){if(busy)throw Error('La actualización ya está en curso.');busy=true;state={phase:'checking',progress:0};try{const result=await send(cfg(),'GET','/v1/android/releases/latest');release=result.release?validateManifest(result.release):null;state={phase:'idle',progress:0};return status();}catch(e){state={phase:'error',progress:0,message:e.message};throw e;}finally{busy=false;}}
 async function download(){if(busy)throw Error('La actualización ya está en curso.');if(!release||release.versionCode<=currentVersion().versionCode)throw Error('Primero busca una versión más reciente.');const config=cfg(),m=validateManifest(structuredClone(release));busy=true;state={phase:'downloading',progress:0};let temporary,handle;
  try{fs.mkdirSync(directory,{recursive:true,mode:0o700});temporary=path.join(directory,'download-'+crypto.randomUUID()+'.part');handle=fs.openSync(temporary,'wx',0o600);const digest=crypto.createHash('sha256');let total=0;
   for(let index=0;index<m.chunks.length;index++){
    const started=Date.now();let result;for(let attempt=0;attempt<5;attempt++){try{result=await send(config,'GET','/v1/android/releases/'+m.sha256+'/chunks/'+index);break;}catch(e){if(attempt===4)throw e;await new Promise(r=>setTimeout(r,750*(attempt+1)));}}
    if(typeof result.data!=='string'||result.data.length>700000||!/^[A-Za-z0-9+/]*={0,2}$/.test(result.data))throw Error('La descarga contiene un bloque inválido.');const bytes=Buffer.from(result.data,'base64');if(result.sha256!==m.chunks[index]||bytes.toString('base64')!==result.data||bytes.length!==Math.min(m.chunkSize,m.bytes-total)||hash(bytes)!==m.chunks[index])throw Error('La descarga no coincide con su huella. No se instalará.');
    let at=0;while(at<bytes.length)at+=fs.writeSync(handle,bytes,at,bytes.length-at);digest.update(bytes);total+=bytes.length;state={phase:'downloading',progress:Math.floor(total/m.bytes*100)};
    const remaining=150-(Date.now()-started);if(remaining>0)await new Promise(r=>setTimeout(r,remaining));
   }
   state={phase:'verifying',progress:100};fs.fsyncSync(handle);fs.closeSync(handle);handle=undefined;if(total!==m.bytes||digest.digest('hex')!==m.sha256)throw Error('La APK está incompleta o su huella no coincide.');
   const file=path.join(directory,crypto.randomUUID()+'.apk');fs.renameSync(temporary,file);temporary=null;ready={file,sha256:m.sha256,versionCode:m.versionCode,bytes:m.bytes};state={phase:'ready',progress:100};
  }catch(e){state={phase:'error',progress:state.progress,message:e.message};throw e;}finally{if(handle!==undefined)fs.closeSync(handle);if(temporary&&path.dirname(temporary)===path.resolve(directory)&&fs.existsSync(temporary))fs.unlinkSync(temporary);busy=false;}
  return status();
 }
 function installation(){if(busy||state.phase!=='ready'||!ready)throw Error('Primero descarga y verifica la actualización.');const descriptor=fs.openSync(ready.file,'r'),digest=crypto.createHash('sha256'),buffer=Buffer.alloc(65536);try{let n;while((n=fs.readSync(descriptor,buffer,0,buffer.length,null))>0)digest.update(buffer.subarray(0,n));}finally{fs.closeSync(descriptor);}if(fs.statSync(ready.file).size!==ready.bytes||digest.digest('hex')!==ready.sha256||ready.versionCode<=currentVersion().versionCode)throw Error('La APK cambió o ya no es una actualización.');return {...ready};}
 return {status,check,download,installation};
}
module.exports={createUpdater,validateManifest};
