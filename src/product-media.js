// Fotografías persistentes: límites, firma y decodificación real con el navegador Windows existente.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const p=require('./persistence');
const MAX_PHOTO=5*1024*1024;
const PHOTO_NAME=/^[a-f0-9]{64}\.(?:jpg|png|webp)$/;
function invalid(message){const error=new Error(message);error.statusCode=400;throw error;}
function signature(bytes){
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return ['image/png','png'];
  if(bytes.length>=12&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return ['image/jpeg','jpg'];
  if(bytes.length>=20&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length)return ['image/webp','webp'];
  invalid('La fotografía debe ser JPEG, PNG o WebP válido.');
}
function browserPath(){return [process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter(Boolean).flatMap(root=>[path.join(root,'Microsoft/Edge/Application/msedge.exe'),path.join(root,'Google/Chrome/Application/chrome.exe')]).find(file=>fs.existsSync(file));}
async function decode(bytes,mime){
  const browser=browserPath();if(!browser){const e=new Error('No se encontró el navegador instalado para verificar la fotografía.');e.statusCode=503;throw e;}
  const area=fs.mkdtempSync(path.join(os.tmpdir(),'el-muelle-image-'));p.restrictPrivatePath(area,true);
  try{
    const page=path.join(area,'decode.html');
    // Sólo bytes codificados en base64; ningún nombre, ruta o script procede del cliente.
    fs.writeFileSync(page,'<!doctype html><meta charset="utf-8"><pre id="result">pending</pre><script>const i=new Image();i.onload=()=>{try{const w=i.naturalWidth,h=i.naturalHeight;if(!w||!h||w>8192||h>8192||w*h>32000000)throw Error();const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(i,0,0);c.getContext("2d").getImageData(0,0,1,1);document.getElementById("result").textContent="VALID:"+w+":"+h}catch{document.getElementById("result").textContent="INVALID"}};i.onerror=()=>document.getElementById("result").textContent="INVALID";i.src="data:'+mime+';base64,'+bytes.toString('base64')+'";document.currentScript.remove();</script>',{flag:'wx'});
    const output=await new Promise((resolve,reject)=>{
      const child=spawn(browser,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--user-data-dir='+path.join(area,'profile'),'--dump-dom','--virtual-time-budget=5000',require('node:url').pathToFileURL(page).href],{windowsHide:true,stdio:['ignore','pipe','ignore']});
      let out='',settled=false;const timer=setTimeout(()=>{child.kill();},15000);
      child.stdout.on('data',b=>{out+=b;if(out.length>1024*1024)child.kill();});
      child.once('error',e=>{settled=true;clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);if(!settled)code===0?resolve(out):reject(new Error('No se pudo decodificar la fotografía.'));});
    });
    if(!/<pre id="result">VALID:\d+:\d+<\/pre>/.test(output))invalid('La fotografía está dañada o sus dimensiones exceden el límite permitido.');
  }finally{if(p.inside(area,os.tmpdir())&&path.basename(area).startsWith('el-muelle-image-'))fs.rmSync(area,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
async function preparePhoto(input,dataDir){
  if(input===undefined)return null;
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.data!=='string'||typeof input.mime!=='string')invalid('Fotografía inválida.');
  if(input.data.length>Math.ceil(MAX_PHOTO/3)*4)invalid('La fotografía excede 5 MiB.');
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))invalid('Contenido de fotografía inválido.');
  const bytes=Buffer.from(input.data,'base64');if(!bytes.length||bytes.length>MAX_PHOTO||bytes.toString('base64')!==input.data)invalid('La fotografía excede 5 MiB o está incompleta.');
  const [mime,ext]=signature(bytes);if(input.mime!==mime)invalid('El tipo declarado no coincide con el contenido de la fotografía.');
  await decode(bytes,mime);
  const folder=path.join(dataDir,'product-photos');p.rejectLinks(folder);if(!fs.existsSync(folder))p.privateDirectory(folder);
  const name=crypto.randomBytes(32).toString('hex')+'.'+ext,file=path.join(folder,name);p.rejectLinks(file);fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
  return {name,file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),committed:false};
}
function discard(photo){if(photo&&!photo.committed){p.rejectLinks(photo.file);if(fs.existsSync(photo.file))fs.unlinkSync(photo.file);}}
// Lee las referencias del snapshot SQLite, no una colección mutable del proceso vivo.
function copyPhotos(databaseFile,sourceFolder,destination){
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(databaseFile,{readOnly:true});let records;
  try{records=db.prepare("SELECT payload FROM documents WHERE collection IN ('products','product-photo-history')").all().map(row=>JSON.parse(row.payload));}finally{db.close();}
  const refs=new Map();for(const r of records)if(r.photoFile){if(!PHOTO_NAME.test(r.photoFile)||!/^[a-f0-9]{64}$/.test(r.photoSHA256||''))throw Error('Referencia de fotografía inválida.');refs.set(r.photoFile,r.photoSHA256);}
  if(!refs.size)return 0;
  p.rejectLinks(sourceFolder);const target=path.join(destination,'product-photos');p.privateDirectory(target);
  for(const [name,expected]of refs){const from=path.join(sourceFolder,name);p.rejectLinks(from);const bytes=fs.readFileSync(from);if(bytes.length>MAX_PHOTO||crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Fotografía ausente o alterada.');signature(bytes);fs.writeFileSync(path.join(target,name),bytes,{flag:'wx',mode:0o600});}
  return refs.size;
}
module.exports={MAX_PHOTO,PHOTO_NAME,preparePhoto,discard,copyPhotos};
