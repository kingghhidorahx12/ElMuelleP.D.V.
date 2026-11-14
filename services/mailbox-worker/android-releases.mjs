import crypto from 'node:crypto';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),HEX=/^[a-f0-9]{64}$/,CHUNK=524288;
const certificate='66347436ba4bb5ec9b991b89f0a068680cdbd6020075e7f7d78e7cf6a16effd5';
function fail(message,statusCode=400){throw Object.assign(Error(message),{statusCode});}
export function manifest(value){
 if(!value||Object.keys(value).some(k=>!['applicationId','versionCode','versionName','bytes','sha256','certificateSHA256','chunkSize','chunks','notes'].includes(k))||value.applicationId!=='mx.elmuelle.pdv'||value.certificateSHA256!==certificate||!Number.isSafeInteger(value.versionCode)||value.versionCode<14||value.versionCode>1000000||typeof value.versionName!=='string'||!/^[a-zA-Z0-9.-]{1,70}$/.test(value.versionName)||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>170*1024*1024||!HEX.test(value.sha256||'')||![131072,CHUNK].includes(value.chunkSize)||!Array.isArray(value.chunks)||value.chunks.length!==Math.ceil(value.bytes/value.chunkSize)||!value.chunks.every(s=>HEX.test(s))||typeof value.notes!=='string'||value.notes.length>2000)fail('Manifiesto Android inválido.');
 return value;
}
export async function releaseRequest({request,route,method,c,body,json,env}){
 let match;
 if(route==='/admin/api/android/releases'&&method==='GET'){
  const {results}=await c.statement('SELECT id,version_code,bytes,status FROM android_releases ORDER BY version_code DESC').all();return json({releases:results});
 }
 if((match=route.match(/^\/admin\/api\/android\/releases\/([a-f0-9]{64})\/retire$/))&&method==='POST'){
  const id=match[1],{value}=await body(request,2048),row=await c.statement('SELECT version_code FROM android_releases WHERE id=?',id).first();
  if(!row)fail('Versión no encontrada.',404);
  if(!value||value.expectedVersionCode!==row.version_code||value.confirmSHA256!==id)fail('Confirmación de retirada inválida.',409);
  const newer=await c.statement("SELECT id FROM android_releases WHERE status='published' AND version_code>? LIMIT 1",row.version_code).first();if(!newer)fail('No se retira la versión más reciente disponible.',409);
  await c.db.batch([c.statement('DELETE FROM android_chunks WHERE release_id=?',id),c.statement('DELETE FROM android_releases WHERE id=? AND version_code=?',id,row.version_code)]);return json({retired:true,versionCode:row.version_code,sha256:id});
 }
 if((match=route.match(/^\/admin\/api\/android\/releases\/([a-f0-9]{64})$/))&&method==='GET'){
  const row=await c.statement('SELECT manifest,status FROM android_releases WHERE id=?',match[1]).first();if(!row)fail('Versión no encontrada.',404);const {results}=await c.statement('SELECT position FROM android_chunks WHERE release_id=? ORDER BY position',match[1]).all();return json({status:row.status,manifest:JSON.parse(row.manifest),stored:results.map(v=>v.position)});
 }
 if(route==='/admin/api/android/enrollments'&&method==='POST'){
  const count=await c.statement('SELECT COUNT(*) n FROM clients').first();if(count.n>=100)fail('Límite de instalaciones alcanzado.',409);
  const code=crypto.randomBytes(16).toString('hex'),expires=Date.now()+600000;await c.statement('INSERT INTO enrollments(digest,expires) VALUES(?,?)',hash(code),expires).run();return json({code,expiresAt:new Date(expires).toISOString()},201);
 }
 if(route==='/admin/api/android/releases'&&method==='POST'){
  const {value}=await body(request,200000),m=manifest(value),id=m.sha256,prior=await c.statement('SELECT manifest FROM android_releases WHERE id=?',id).first();
  if(prior){if(prior.manifest!==JSON.stringify(m))fail('Esta huella ya tiene otro manifiesto.',409);return json({id,alreadyPrepared:true});}
  const used=await c.statement('SELECT COALESCE(SUM(bytes),0) n FROM android_releases').first();if(used.n+m.bytes>300*1024*1024)fail('Se alcanzó la reserva gratuita para APK. Requiere revisar las versiones anteriores; no se borró ninguna.',409);
  await c.statement('INSERT INTO android_releases(id,version_code,bytes,manifest,status) VALUES(?,?,?,?,?)',id,m.versionCode,m.bytes,JSON.stringify(m),'draft').run();return json({id},201);
 }
 if((match=route.match(/^\/admin\/api\/android\/releases\/([a-f0-9]{64})\/chunks\/(\d{1,4})$/))&&method==='PUT'){
  const [,id,number]=match,index=Number(number),row=await c.statement('SELECT manifest,status FROM android_releases WHERE id=?',id).first();if(!row)fail('Versión no encontrada.',404);if(row.status!=='draft')fail('La versión publicada es inmutable.',409);
  const m=manifest(JSON.parse(row.manifest)),{value}=await body(request,750000);if(index>=m.chunks.length||!value||Object.keys(value).some(k=>k!=='data')||typeof value.data!=='string'||value.data.length>700000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.data))fail('Bloque Android inválido.');
  const bytes=Buffer.from(value.data,'base64'),expected=Math.min(m.chunkSize,m.bytes-index*m.chunkSize);if(bytes.length!==expected||bytes.toString('base64')!==value.data||hash(bytes)!==m.chunks[index])fail('La huella del bloque no coincide.');
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',c.key,iv);cipher.setAAD(Buffer.from('apk:'+id+':'+index));const encrypted=Buffer.concat([cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
  // Bind ciphertext as base64 text, avoiding serialization of half a million
  // individual BLOB bytes through D1's JSON binding on the free Worker plan.
  await c.statement('INSERT OR IGNORE INTO android_chunks(release_id,position,sha256,iv,encrypted,bytes) VALUES(?,?,?,?,?,?)',id,index,m.chunks[index],iv.toString('base64url'),encrypted.toString('base64'),bytes.length).run();return json({stored:true,index});
 }
 if((match=route.match(/^\/admin\/api\/android\/releases\/([a-f0-9]{64})\/publish$/))&&method==='POST'){
  const id=match[1],row=await c.statement('SELECT * FROM android_releases WHERE id=?',id).first();if(!row)fail('Versión no encontrada.',404);const m=manifest(JSON.parse(row.manifest)),{results}=await c.statement('SELECT position,sha256,bytes FROM android_chunks WHERE release_id=? ORDER BY position',id).all();
  if(results.length!==m.chunks.length||results.some((v,i)=>v.position!==i||v.sha256!==m.chunks[i]||v.bytes!==Math.min(m.chunkSize,m.bytes-i*m.chunkSize)))fail('La APK no está completa. No se publicó.',409);
  const higher=await c.statement("SELECT version_code FROM android_releases WHERE status='published' AND version_code>=? AND id<>? LIMIT 1",m.versionCode,id).first();if(higher)fail('Ya hay una versión igual o posterior publicada.',409);
  await c.statement("UPDATE android_releases SET status='published' WHERE id=?",id).run();return json({published:true,versionCode:m.versionCode,sha256:id});
 }
 // Caller authenticates an enrolled installation before reaching these routes.
 if(route==='/v1/android/releases/latest'&&method==='GET'){
  const row=await c.statement("SELECT manifest FROM android_releases WHERE status='published' ORDER BY version_code DESC LIMIT 1").first();return json({release:row?manifest(JSON.parse(row.manifest)):null});
 }
 if((match=route.match(/^\/v1\/android\/releases\/([a-f0-9]{64})\/chunks\/(\d{1,4})$/))&&method==='GET'){
  const [,id,number]=match,index=Number(number),row=await c.statement("SELECT c.* FROM android_chunks c JOIN android_releases r ON r.id=c.release_id WHERE c.release_id=? AND c.position=? AND r.status='published'",id,index).first();if(!row)fail('Bloque no disponible.',404);
  const bytes=typeof row.encrypted==='string'?Buffer.from(row.encrypted,'base64'):Buffer.from(row.encrypted),decipher=crypto.createDecipheriv('aes-256-gcm',c.key,Buffer.from(row.iv,'base64url'));decipher.setAAD(Buffer.from('apk:'+id+':'+index));decipher.setAuthTag(bytes.subarray(-16));const plain=Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]);return json({sha256:row.sha256,data:plain.toString('base64')});
 }
 return null;
}
