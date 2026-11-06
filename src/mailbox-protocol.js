const crypto=require('node:crypto'),net=require('node:net'),dns=require('node:dns').promises,https=require('node:https'),http=require('node:http');
const LIMITS=Object.freeze({description:4000,attachments:2,imageBytes:1024*1024,bodyBytes:3*1024*1024,pixels:16000000,dimension:6000});
const KINDS=['error','sugerencia','queja'],STATES=['recibido','en_revision','resuelto','cerrado'];
function fail(message,statusCode=400){const error=new Error(message);error.statusCode=statusCode;throw error;}
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function text(value,max,min=0){if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))fail('El texto no tiene el formato o longitud permitidos.');return value.trim();}
function imageDimensions(bytes,mime){
 if(mime==='image/png'&&bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.subarray(-8,-4).toString()==='IEND')return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
 if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217){let at=2;while(at+4<bytes.length){if(bytes[at++]!==255)return [];while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===217||marker===218)break;const length=bytes.readUInt16BE(at);if(length<2||at+length>bytes.length)return [];if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8)return [bytes.readUInt16BE(at+5),bytes.readUInt16BE(at+3)];at+=length;}}
 if(mime==='image/webp'&&bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.readUInt32LE(4)+8===bytes.length&&bytes.toString('ascii',8,12)==='WEBP'){
  const kind=bytes.toString('ascii',12,16);if(kind==='VP8X')return [1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)];
  if(kind==='VP8 '&&bytes.subarray(23,26).equals(Buffer.from([157,1,42])))return [bytes.readUInt16LE(26)&16383,bytes.readUInt16LE(28)&16383];
  if(kind==='VP8L'&&bytes[20]===47){const value=bytes.readUInt32LE(21);return [(value&16383)+1,((value>>>14)&16383)+1];}
 }
 return [];
}
function attachment(input,index){
 if(!input||typeof input!=='object'||Object.keys(input).some(key=>!['mime','data'].includes(key))||!['image/png','image/jpeg','image/webp'].includes(input.mime)||typeof input.data!=='string'||input.data.length%4!==0||input.data.length>Math.ceil(LIMITS.imageBytes/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))fail('La captura debe ser PNG, JPEG o WebP de hasta 1 MiB.');
 const bytes=Buffer.from(input.data,'base64'),[width,height]=imageDimensions(bytes,input.mime);
 if(!bytes.length||bytes.length>LIMITS.imageBytes||bytes.toString('base64')!==input.data||!width||!height||width>LIMITS.dimension||height>LIMITS.dimension||width*height>LIMITS.pixels)fail('La captura está dañada o excede el tamaño permitido (6000 px, 16 megapíxeles).');
 return {mime:input.mime,data:input.data};
}
function normalizeReport(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['id','kind','description','createdAt','attachments','consentRemote','attachmentsReviewed'].includes(key)))fail('Reporte inválido.');
 if(typeof input.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)||!KINDS.includes(input.kind))fail('Folio o tipo de reporte inválido.');
 if(typeof input.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.createdAt)||!Number.isFinite(Date.parse(input.createdAt)))fail('Fecha inválida.');
 if(!Array.isArray(input.attachments)||input.attachments.length>LIMITS.attachments)fail('Puedes adjuntar hasta dos capturas.');
 if(input.consentRemote!==undefined&&typeof input.consentRemote!=='boolean'||input.attachmentsReviewed!==undefined&&typeof input.attachmentsReviewed!=='boolean')fail('La autorización debe confirmarse expresamente.');
 if(input.attachments.length&&input.attachmentsReviewed!==true)fail('Confirma que revisaste las capturas antes de adjuntarlas.');
 return {id:input.id.toLowerCase(),kind:input.kind,description:text(input.description,LIMITS.description,10),createdAt:input.createdAt,attachments:input.attachments.map(attachment),attachmentsReviewed:input.attachmentsReviewed===true,consentRemote:input.consentRemote===true};
}
function signature(secret,client,method,route,timestamp,nonce,body){return crypto.createHmac('sha256',Buffer.from(secret,'hex')).update(['v1',client,method,route,timestamp,nonce,hash(body)].join('\n')).digest('hex');}
function signedHeaders(config,method,route,body){const stamp=String(Date.now()),nonce=crypto.randomBytes(16).toString('hex');return {'Content-Type':'application/json','X-Mailbox-Client':config.clientId,'X-Mailbox-Time':stamp,'X-Mailbox-Nonce':nonce,'X-Mailbox-Signature':signature(config.secret,config.clientId,method,route,stamp,nonce,body)};}
function publicAddress(address){
 const version=net.isIP(address);if(version===6)return /^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:(?:db8|0):/i.test(address)&&!/^2002:/i.test(address);
 if(version!==4)return false;const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
function endpoint(value,allowLoopback=false){
 let url;try{url=new URL(value);}catch{fail('Escribe la dirección HTTPS del receptor de soporte.');}
 const local=allowLoopback&&url.protocol==='http:'&&url.hostname==='127.0.0.1';
 if((!local&&(url.protocol!=='https:'||url.port&&url.port!=='443'))||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.hostname.length>253||(!local&&(url.hostname==='localhost'||net.isIP(url.hostname.replace(/^\[|\]$/g,''))&&!publicAddress(url.hostname.replace(/^\[|\]$/g,'')))))fail('El receptor debe usar una dirección HTTPS pública, sin rutas ni credenciales.');
 return url.origin;
}
function transport({allowLoopback=false,lookup=dns.lookup}={}){return async(config,method,route,payload)=>{
 const origin=endpoint(config.endpoint,allowLoopback),url=new URL(route,origin),body=payload===undefined?'':JSON.stringify(payload),local=allowLoopback&&url.hostname==='127.0.0.1'&&url.protocol==='http:';
 let addresses;if(!local){addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(item=>!publicAddress(item.address)))fail('El receptor no resuelve a una dirección pública permitida.',502);}
 return new Promise((resolve,reject)=>{
  const req=(local?http:https).request(url,{method,agent:false,maxHeaderSize:8192,headers:{...signedHeaders(config,method,route,body),'Content-Length':Buffer.byteLength(body)},...(local?{}:{rejectUnauthorized:true,minVersion:'TLSv1.2',lookup:(_hostname,options,callback)=>callback(null,options.all?addresses:addresses[0].address,addresses[0].family)})},res=>{
   const chunks=[];let length=0;res.on('data',chunk=>{length+=chunk.length;if(length>128*1024){req.destroy(Error('Respuesta de soporte demasiado grande.'));return;}chunks.push(chunk);});res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(Object.assign(Error('El receptor no confirmó la operación.'),{statusCode:502}));try{resolve(JSON.parse(Buffer.concat(chunks)));}catch{reject(Error('Acuse de soporte inválido.'));}});
  });const deadline=setTimeout(()=>req.destroy(Error('El receptor no respondió a tiempo.')),12000);deadline.unref();req.on('close',()=>clearTimeout(deadline));req.on('error',reject);req.end(body);
 });
};}
function equal(a,b){return crypto.timingSafeEqual(Buffer.from(hash(String(a)),'hex'),Buffer.from(hash(String(b)),'hex'));}
module.exports={LIMITS,KINDS,STATES,fail,text,hash,normalizeReport,signature,signedHeaders,equal,endpoint,publicAddress,transport};
