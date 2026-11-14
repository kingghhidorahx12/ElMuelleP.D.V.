// Cloudflare adapter: the POS protocol, validation and private inbox are shared
// with the existing receiver. D1 stores encrypted reports and private APK chunks.
import crypto from 'node:crypto';
import p from '../../src/mailbox-protocol.js';
import {releaseRequest} from './android-releases.mjs';
const HEX=/^[a-f0-9]{64}$/,CLIENT=/^[a-zA-Z0-9_-]{8,64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Strict-Transport-Security':'max-age=31536000'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
const ack=r=>({id:r.id,receipt:r.receipt,receivedAt:r.receivedAt,status:r.status,updatedAt:r.updatedAt,replies:r.replies});
const prepared=new WeakMap();
function context(env){
 if(!HEX.test(env.MAILBOX_DATA_KEY||'')||!HEX.test(env.MAILBOX_ADMIN_TOKEN||'')||p.equal(env.MAILBOX_DATA_KEY,env.MAILBOX_ADMIN_TOKEN))p.fail('Configuración privada no disponible.',503);
 const key=Buffer.from(env.MAILBOX_DATA_KEY,'hex');
 const seal=(value,aad)=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join('.');};
 const open=(encrypted,aad)=>{const [iv,tag,bytes]=encrypted.split('.'),cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(Buffer.from(tag,'base64url'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(bytes,'base64url')),cipher.final()]));};
 return {key,seal,open,db:env.DB,statement:(sql,...values)=>env.DB.prepare(sql).bind(...values)};
}
async function keyCheck(c){
 let ready=prepared.get(c.db);if(!ready){ready=(async()=>{const proof=crypto.createHmac('sha256',c.key).update('ElMuellePDV-mailbox-key-v1').digest('hex');await c.statement("INSERT OR IGNORE INTO receiver_meta VALUES('key-proof-v1',?)",proof).run();const saved=await c.statement("SELECT value FROM receiver_meta WHERE id='key-proof-v1'").first();if(!p.equal(saved.value,proof))p.fail('Se requiere la clave original del buzón.',503);})();prepared.set(c.db,ready);ready.catch(()=>prepared.delete(c.db));}await ready;
}
async function body(request,max=p.LIMITS.bodyBytes){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))p.fail('Usa JSON.',415);
 if(Number(request.headers.get('Content-Length')||0)>max)p.fail('Solicitud demasiado grande.',413);
 const reader=request.body?.getReader();if(!reader)p.fail('Solicitud vacía.');let length=0,parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();p.fail('Solicitud demasiado grande.',413);}parts.push(value);}
 const raw=Buffer.concat(parts).toString('utf8');try{return {raw,value:JSON.parse(raw)};}catch{p.fail('JSON inválido.');}
}
async function rate(request,c,scope,max){
 const now=Date.now(),id=crypto.createHmac('sha256',c.key).update((request.headers.get('CF-Connecting-IP')||'local')+':'+scope+':'+Math.floor(now/60000)).digest('hex');
 await c.statement('DELETE FROM rate_limits WHERE expires<?',now).run();
 const result=await c.statement('INSERT INTO rate_limits VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET n=n+1 WHERE n<? RETURNING n',id,now+120000,max).first();
 if(!result)p.fail('Demasiadas solicitudes. Espera un minuto.',429);
}
async function clientAuth(request,c,raw){
 const id=request.headers.get('X-Mailbox-Client'),stamp=request.headers.get('X-Mailbox-Time'),nonce=request.headers.get('X-Mailbox-Nonce'),sig=request.headers.get('X-Mailbox-Signature');
 if(!CLIENT.test(id||'')||!/^\d{13}$/.test(stamp||'')||Math.abs(Date.now()-Number(stamp))>300000||!/^[a-f0-9]{32}$/.test(nonce||'')||!HEX.test(sig||''))p.fail('Autenticación no válida.',401);
 const row=await c.statement('SELECT encrypted FROM clients WHERE id=? AND active=1',id).first();if(!row)p.fail('Autenticación no válida.',401);
 const secret=c.open(row.encrypted,'client:'+id).secret,url=new URL(request.url);
 if(!p.equal(sig,p.signature(secret,id,request.method,url.pathname+url.search,stamp,nonce,raw)))p.fail('Autenticación no válida.',401);
 await c.statement('DELETE FROM nonces WHERE expires<?',Date.now()).run();
 const inserted=await c.statement('INSERT OR IGNORE INTO nonces VALUES(?,?,?)',id,nonce,Number(stamp)+300000).run();if(inserted.meta.changes!==1)p.fail('Solicitud repetida o no válida.',401);
 return id;
}
function adminAuth(request,env){const auth=request.headers.get('Authorization')||'';if(auth.length!==71||!auth.startsWith('Bearer ')||!p.equal(auth.slice(7),env.MAILBOX_ADMIN_TOKEN))p.fail('Acceso administrativo no válido.',401);}
async function fullRecord(c,row,images=false){
 const record=c.open(row.encrypted,row.client+':'+row.id);record.attachments=[];
 if(images){const {results}=await c.statement('SELECT position,mime,iv,encrypted FROM attachments WHERE report=? ORDER BY position',row.id).all();for(const item of results){const cipher=crypto.createDecipheriv('aes-256-gcm',c.key,Buffer.from(item.iv,'base64url')),bytes=Buffer.from(item.encrypted);cipher.setAAD(Buffer.from(row.client+':'+row.id+':attachment:'+item.position));cipher.setAuthTag(bytes.subarray(-16));record.attachments.push({mime:item.mime,data:Buffer.concat([cipher.update(bytes.subarray(0,-16)),cipher.final()]).toString('base64')});}}
 return record;
}
async function fetchRequest(request,env){
 const url=new URL(request.url),route=url.pathname,method=request.method;
 if(url.protocol!=='https:'&&!(env.LOCAL_TEST==='1'&&url.hostname==='127.0.0.1'))p.fail('Usa HTTPS.',400);
 if(method==='OPTIONS')return json({message:'Método no permitido.'},405);
 if(method==='GET'&&['/admin','/admin/','/admin/admin.js','/admin/admin.css'].includes(route)){
  if(route==='/admin')return new Response(null,{status:308,headers:{...headers,Location:'/admin/'}});
  const assetUrl=new URL(request.url);assetUrl.pathname=route.slice('/admin'.length);const asset=await env.ASSETS.fetch(new Request(assetUrl,request));const safeHeaders=new Headers(asset.headers);for(const [name,value]of Object.entries(headers))safeHeaders.set(name,value);return new Response(asset.body,{status:asset.status,headers:safeHeaders});
 }
 const c=context(env);await keyCheck(c);
 if(route==='/health'&&method==='GET')return json({ok:true,service:'ElMuellePDV-Buzon'});
 const isAdmin=route.startsWith('/admin/api/');
 await rate(request,c,isAdmin?'admin':route.startsWith('/v1/android/')?'updates':'client',route.includes('/android/')?600:120);
 if(route.startsWith('/admin/api/android/')){
  const authorization=request.headers.get('Authorization')||'',token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  if(!HEX.test(token)||!p.equal(token,env.MAILBOX_ADMIN_TOKEN)&&!(HEX.test(env.ANDROID_RELEASE_TOKEN||'')&&p.equal(token,env.ANDROID_RELEASE_TOKEN)))p.fail('Publicación no autorizada.',401);
  return await releaseRequest({request,route,method,c,body,json,env})||json({message:'No encontrado.'},404);
 }
 if(isAdmin)adminAuth(request,env);
 if(route==='/admin/api/capabilities'&&method==='GET')return json({individualEnrollment:true});
 if(route==='/admin/api/enrollments'&&method==='POST'){
  await rate(request,c,'create-enrollment',5);const code=crypto.randomBytes(16).toString('hex'),expires=Date.now()+10*60000;
  await c.statement('DELETE FROM enrollments WHERE expires<?',Date.now()).run();
  const count=await c.statement('SELECT COUNT(*) n FROM clients').first();if(count.n>=100)p.fail('Límite de instalaciones alcanzado.',409);
  await c.statement('INSERT INTO enrollments(digest,expires) VALUES(?,?)',p.hash(code),expires).run();return json({code,expiresAt:new Date(expires).toISOString()},201);
 }
 if(route==='/v1/enroll'&&method==='POST'){
  await rate(request,c,'enroll',10);const {value}=await body(request,2048);
  if(!value||Object.keys(value).some(k=>!['code','clientId','secret'].includes(k))||!/^[a-f0-9]{32}$/.test(value.code||'')||!UUID.test(value.clientId||'')||!HEX.test(value.secret||'')||p.equal(value.secret,env.MAILBOX_DATA_KEY)||p.equal(value.secret,env.MAILBOX_ADMIN_TOKEN))p.fail('Activación inválida.',401);
  const digest=p.hash(value.code),secretDigest=p.hash(value.secret),now=Date.now(),encrypted=c.seal({secret:value.secret},'client:'+value.clientId);
  // D1 batches are atomic. A one-time code binds to exactly one local identity;
  // retries after a lost response are safe only with the same generated secret.
  const result=await c.db.batch([
   c.statement('UPDATE enrollments SET client=?,secret_digest=? WHERE digest=? AND expires>? AND (client IS NULL OR (client=? AND secret_digest=?))',value.clientId,secretDigest,digest,now,value.clientId,secretDigest),
   c.statement('INSERT OR IGNORE INTO clients(id,encrypted,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM clients)<100 AND EXISTS(SELECT 1 FROM enrollments WHERE digest=? AND expires>? AND client=? AND secret_digest=?)',value.clientId,encrypted,new Date().toISOString(),digest,now,value.clientId,secretDigest)
  ]);
  const client=await c.statement('SELECT encrypted,active FROM clients WHERE id=?',value.clientId).first();
  if(result[0].meta.changes!==1||!client||!client.active||!p.equal(c.open(client.encrypted,'client:'+value.clientId).secret,value.secret))p.fail('Código vencido, utilizado o no válido.',401);
  return json({enrolled:true,clientId:value.clientId});
 }
 if(route.startsWith('/v1/')){
  // The private APK includes a download-only capability, never a publishing or
  // mailbox credential. No enrollment, reports, or administrative access here.
  if(route.startsWith('/v1/android/')&&method==='GET'){
   const authorization=request.headers.get('Authorization')||'',token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
   if(HEX.test(env.ANDROID_UPDATE_READ_TOKEN||'')&&HEX.test(token)&&p.equal(token,env.ANDROID_UPDATE_READ_TOKEN))return await releaseRequest({request,route,method,c,body,json,env})||json({message:'No encontrado.'},404);
  }
  const parsed=method==='POST'?await body(request):{raw:'',value:null},client=await clientAuth(request,c,parsed.raw);
  if(route.startsWith('/v1/android/'))return await releaseRequest({request,route,method,c,body,json,env})||json({message:'No encontrado.'},404);
  if(route==='/v1/reports'&&method==='POST'){
   const packet=p.normalizeReport(parsed.value);if(!packet.consentRemote)p.fail('El envío requiere consentimiento.');const digest=p.hash(JSON.stringify(packet));
   let row=await c.statement('SELECT * FROM reports WHERE id=?',packet.id).first();if(row){if(row.client!==client||row.digest!==digest)p.fail('La identidad corresponde a otro reporte.',409);return json(ack(await fullRecord(c,row)));}
   const now=new Date().toISOString(),record={...packet,attachments:[],attachmentCount:packet.attachments.length,receipt:crypto.randomBytes(24).toString('hex'),receivedAt:now,updatedAt:now,status:'recibido',classification:'sin_clasificar',replies:[]};
   const encrypted=c.seal(record,client+':'+packet.id),images=packet.attachments.map((image,index)=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',c.key,iv);cipher.setAAD(Buffer.from(client+':'+packet.id+':attachment:'+index));const bytes=Buffer.concat([cipher.update(Buffer.from(image.data,'base64')),cipher.final(),cipher.getAuthTag()]);return {mime:image.mime,iv:iv.toString('base64url'),bytes};});
   try{await c.db.batch([c.statement('INSERT INTO reports VALUES(?,?,?,?,?,?,?,?,?)',packet.id,client,packet.kind,'recibido',now,now,digest,encrypted,encrypted.length+images.reduce((n,v)=>n+v.bytes.length,0)),...images.map((image,index)=>c.statement('INSERT INTO attachments VALUES(?,?,?,?,?)',packet.id,index,image.mime,image.iv,image.bytes.buffer.slice(image.bytes.byteOffset,image.bytes.byteOffset+image.bytes.byteLength)))]);}catch(error){
    if(String(error).includes('MAILBOX_DAILY_LIMIT'))p.fail('Límite diario de reportes alcanzado.',429);if(String(error).includes('MAILBOX_CAPACITY'))p.fail('El buzón remoto no tiene capacidad disponible.',507);
    row=await c.statement('SELECT * FROM reports WHERE id=? AND client=? AND digest=?',packet.id,client,digest).first();if(row)return json(ack(await fullRecord(c,row)));throw error;
   }
   return json(ack(record),201);
  }
  const id=route.slice('/v1/reports/'.length);if(route.startsWith('/v1/reports/')&&UUID.test(id)&&method==='GET'){const row=await c.statement('SELECT * FROM reports WHERE id=? AND client=?',id,client).first();if(!row)p.fail('Reporte no encontrado.',404);return json(ack(await fullRecord(c,row)));}
 }
 if(route==='/admin/api/reports'&&method==='GET'){
  const cursor=Number(url.searchParams.get('cursor')||0),status=url.searchParams.get('status')||'',kind=url.searchParams.get('kind')||'';if(!Number.isSafeInteger(cursor)||cursor<0||status&&!p.STATES.includes(status)||kind&&!p.KINDS.includes(kind))p.fail('Filtro inválido.');
  const {results}=await c.statement("SELECT rowid,* FROM reports WHERE rowid>? AND (?='' OR status=?) AND (?='' OR kind=?) ORDER BY rowid LIMIT 50",cursor,status,status,kind,kind).all();const reports=[];for(const row of results){const item=await fullRecord(c,row);reports.push({...ack(item),kind:item.kind,classification:item.classification,description:item.description,attachmentCount:item.attachmentCount});}return json({reports,nextCursor:results.at(-1)?.rowid||null});
 }
 if(route.startsWith('/admin/api/reports/')){
  const id=route.slice('/admin/api/reports/'.length);if(!UUID.test(id))p.fail('Reporte no encontrado.',404);const row=await c.statement('SELECT * FROM reports WHERE id=?',id).first();if(!row)p.fail('Reporte no encontrado.',404);
  if(method==='GET')return json(await fullRecord(c,row,true));
  if(method==='PATCH'){
   const {value}=await body(request,8192);if(!value||Object.keys(value).some(k=>!['status','classification','reply'].includes(k))||!p.STATES.includes(value.status)||!['sin_clasificar','seguridad','operacion','interfaz','otro'].includes(value.classification))p.fail('Clasificación inválida.');
   const reply=p.text(value.reply??'',2000),record=await fullRecord(c,row);if(reply&&record.replies.length>=50)p.fail('Límite de respuestas alcanzado.',409);record.status=value.status;record.classification=value.classification;record.updatedAt=new Date().toISOString();if(reply)record.replies.push({text:reply,at:record.updatedAt});
   const result=await c.statement('UPDATE reports SET status=?,updated_at=?,encrypted=? WHERE id=? AND encrypted=?',record.status,record.updatedAt,c.seal(record,row.client+':'+id),id,row.encrypted).run();if(result.meta.changes!==1)p.fail('Otro cambio se guardó antes. Vuelve a consultar el reporte.',409);return json(ack(record));
  }
 }
 return json({message:'No encontrado.'},404);
}
export default {async fetch(request,env){try{return await fetchRequest(request,env);}catch(error){const status=error.statusCode||503;if(env.LOCAL_TEST==='1'&&status>=500)console.error('WORKER_TEST_ERROR',error.message);return json({message:status<500?error.message:'El buzón no pudo completar la operación.'},status);}}};
