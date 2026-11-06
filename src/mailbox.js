const crypto=require('node:crypto'),protocol=require('./mailbox-protocol'),fs=require('node:fs'),path=require('node:path');
function registerMailbox({app,database,requireSessionUser,requireAdminUser,encryptSensitivePayload:encrypt,decryptSensitivePayload:decrypt,recordAuditEvent,remoteTransport}){
 const allowLoopback=process.env.NODE_ENV==='test'&&process.env.MAILBOX_TEST_LOOPBACK==='1',send=remoteTransport||protocol.transport({allowLoopback}),pending=new Set(),attempts=new Map();
 const read=(collection,id)=>{const saved=database.readDocument(collection,id);if(!saved)return null;const value=decrypt(saved.encrypted);if(!value)protocol.fail('No se pudo leer el buzón guardado; solicita revisión técnica.',503);return value;};
 const save=(collection,id,value)=>database.saveDocument(collection,id,{encrypted:encrypt(value)});
 const defaults=JSON.parse(fs.readFileSync(path.join(__dirname,'mailbox-endpoint.json'),'utf8'));
 if(Object.keys(defaults).some(key=>key!=='endpoint'))throw Error('Configuración pública del buzón inválida.');
 const defaultEndpoint=defaults.endpoint?protocol.endpoint(defaults.endpoint,allowLoopback):'';
 const config=()=>read('support-config','remote')||{endpoint:defaultEndpoint,clientId:'',secret:'',active:false};
 function limit(key,max){const now=Date.now();for(const [k,v]of attempts)if(v.until<=now)attempts.delete(k);let item=attempts.get(key);if(!item){if(attempts.size>=1000)protocol.fail('Espera un momento antes de volver a intentarlo.',429);item={count:0,until:now+60000};attempts.set(key,item);}if(++item.count>max)protocol.fail('Demasiados intentos. Espera un minuto.',429);}
 const safe=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(error){res.status(error.statusCode||503).json({message:error.statusCode&&error.statusCode<500?error.message:'El reporte sigue guardado localmente. No se obtuvo confirmación de soporte.'});}};
 const configured=value=>Boolean(value.endpoint&&value.secret&&value.active!==false);
 const publicConfig=(value,user)=>({configured:configured(value),...(user.role==='admin'?{endpoint:value.endpoint||defaultEndpoint,clientId:value.clientId,canEnroll:Boolean(value.endpoint||defaultEndpoint)&&!configured(value)}:{}),mode:configured(value)?'remoto_configurado':'local'});
 function get(req,res){const user=requireSessionUser(req,res);if(!user)return {};const id=req.params.id;if(!/^[a-f0-9-]{36}$/.test(id))protocol.fail('Reporte no encontrado.',404);const item=read('support-reports',id);if(!item||(user.role!=='admin'&&item.ownerId!==user.id))protocol.fail('Reporte no encontrado.',404);return {user,item};}
 const summary=item=>({id:item.id,folio:item.folio,kind:item.kind,createdAt:item.createdAt,delivery:item.delivery,status:item.remote?.status||'local',receipt:item.remote?.receipt||null,receivedAt:item.remote?.receivedAt||null,replies:item.remote?.replies||[],updatedAt:item.remote?.updatedAt||null});
 function validateReceipt(value,item){if(!value||value.id!==item.id||typeof value.receipt!=='string'||!/^[a-f0-9]{48}$/.test(value.receipt)||!protocol.STATES.includes(value.status)||typeof value.receivedAt!=='string'||!Number.isFinite(Date.parse(value.receivedAt))||typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt))||!Array.isArray(value.replies)||value.replies.length>50)protocol.fail('El acuse remoto no es válido.',502);return {id:item.id,receipt:value.receipt,status:value.status,receivedAt:value.receivedAt,updatedAt:value.updatedAt,replies:value.replies.map(reply=>({text:protocol.text(reply.text,2000,1),at:protocol.text(reply.at,30,20)}))};}
 async function transmit(item,cfg){
  if(!configured(cfg))protocol.fail('El receptor remoto todavía no está configurado. El reporte está guardado en este equipo.',409);
  if(pending.has(item.id))protocol.fail('Este reporte ya se está enviando. Espera su acuse.',409);pending.add(item.id);
  try{
   const packet={id:item.id,kind:item.kind,description:item.description,createdAt:item.createdAt,attachments:item.attachments,attachmentsReviewed:item.attachmentsReviewed,consentRemote:true};
   const remote=validateReceipt(await send(cfg,'POST','/v1/reports',packet),item);item={...item,delivery:'recibido',remote};database.transaction(()=>{save('support-reports',item.id,item);recordAuditEvent('support_report_received','support',item.id,null,{receipt:remote.receipt});});return item;
  }finally{pending.delete(item.id);}
 }
 app.get('/api/support/config',safe((req,res)=>{const user=requireSessionUser(req,res);if(user)res.json(publicConfig(config(),user));}));
 app.post('/api/support/enroll',safe(async(req,res)=>{
  const user=requireAdminUser(req,res);if(!user)return;limit('enroll:'+user.id,5);
  const body=req.body;if(!body||Object.keys(body).some(key=>key!=='code')||!/^[a-f0-9]{32}$/.test(body.code||''))protocol.fail('Usa el código de activación vigente que te entregue soporte.');
  const previous=config();if(configured(previous))protocol.fail('Esta instalación ya tiene su propio enlace activado.',409);const target=previous.endpoint||defaultEndpoint;if(!target)protocol.fail('La dirección del receptor aún no está preparada.',409);
  if(pending.has('enrollment'))protocol.fail('La activación ya está en curso.',409);pending.add('enrollment');
  try{
   const digest=protocol.hash(body.code),value=previous.enrollmentDigest===digest?previous:{endpoint:target,clientId:crypto.randomUUID(),secret:crypto.randomBytes(32).toString('hex'),active:false,enrollmentDigest:digest};
   // Persist the locally generated identity before transmitting it. A lost HTTPS
   // response can then be retried with the same one-time code and identity.
   save('support-config','remote',value);
   let receipt;try{receipt=await send(value,'POST','/v1/enroll',{code:body.code,clientId:value.clientId,secret:value.secret});}catch{protocol.fail('No se pudo activar el enlace. Comprueba la conexión y usa un código vigente de soporte; puedes reintentar el mismo código.',502);}
   if(receipt?.enrolled!==true||receipt.clientId!==value.clientId)protocol.fail('El receptor no confirmó la activación.',502);
   const active={endpoint:value.endpoint,clientId:value.clientId,secret:value.secret,active:true};
   database.transaction(()=>{save('support-config','remote',active);recordAuditEvent('support_installation_enrolled','support','remote',user,{enabled:true});});res.json(publicConfig(active,user));
  }finally{pending.delete('enrollment');}
 }));
 app.put('/api/support/config',safe((req,res)=>{
  const user=requireAdminUser(req,res);if(!user)return;const body=req.body;if(!body||Object.keys(body).some(key=>!['endpoint','clientId','secret'].includes(key)))protocol.fail('Configuración inválida.');
  let value;if(body.endpoint===''){value={endpoint:'',clientId:'',secret:''};}else{const previous=config();value={endpoint:protocol.endpoint(body.endpoint,allowLoopback),clientId:protocol.text(body.clientId,64,8),secret:body.secret===''&&body.clientId===previous.clientId?previous.secret:body.secret};if(!/^[a-zA-Z0-9_-]{8,64}$/.test(value.clientId)||typeof value.secret!=='string'||!/^[a-f0-9]{64}$/.test(value.secret))protocol.fail('Usa el identificador y la clave de enlace de 64 caracteres entregados por soporte.');}
  database.transaction(()=>{save('support-config','remote',value);recordAuditEvent('support_configuration_changed','support','remote',user,{enabled:Boolean(value.endpoint)});});res.json(publicConfig(value,user));
 }));
 app.get('/api/support/reports',safe((req,res)=>{const user=requireSessionUser(req,res);if(!user)return;const rows=database.db.prepare("SELECT document_id FROM documents WHERE collection='support-reports' ORDER BY updated_at DESC LIMIT 500").all(),reports=[];for(const row of rows){const item=read('support-reports',row.document_id);if(user.role==='admin'||item.ownerId===user.id)reports.push(summary(item));}res.json({reports,...publicConfig(config(),user)});}));
 app.get('/api/support/reports/:id',safe((req,res)=>{const {user,item}=get(req,res);if(user)res.json({...summary(item),description:item.description,attachmentCount:item.attachments.length});}));
 app.post('/api/support/reports',safe(async(req,res)=>{
  const user=requireSessionUser(req,res);if(!user)return;limit('create:'+user.id,5);
  const body=req.body;if(!body||Object.keys(body).some(key=>!['operationId','kind','description','attachments','consentRemote','attachmentsReviewed'].includes(key)))protocol.fail('Reporte inválido.');
  const packet=protocol.normalizeReport({id:body.operationId,kind:body.kind,description:body.description,createdAt:new Date().toISOString(),attachments:body.attachments||[],consentRemote:body.consentRemote,attachmentsReviewed:body.attachmentsReviewed});
  const prior=read('support-reports',packet.id);let item;
  if(prior){if(prior.ownerId!==user.id||protocol.hash(JSON.stringify({kind:prior.kind,description:prior.description,attachments:prior.attachments}))!==protocol.hash(JSON.stringify({kind:packet.kind,description:packet.description,attachments:packet.attachments})))protocol.fail('Este folio corresponde a otro reporte.',409);item=prior;}else{
   const used=database.db.prepare("SELECT COUNT(*) n FROM documents WHERE collection='support-reports'").get().n;if(used>=500)protocol.fail('El buzón local alcanzó su límite de 500 reportes; solicita a soporte una revisión.',409);
   const total=database.db.prepare("SELECT COALESCE(SUM(length(payload)),0) n FROM documents WHERE collection='support-reports'").get().n;if(total+JSON.stringify(packet).length*1.5>128*1024*1024)protocol.fail('El buzón local alcanzó su límite de almacenamiento.',409);
   item={...packet,ownerId:user.id,folio:'EM-'+packet.id.slice(0,8).toUpperCase(),delivery:'local',remote:null};database.transaction(()=>{save('support-reports',item.id,item);recordAuditEvent('support_report_created','support',item.id,user,{kind:item.kind,attachments:item.attachments.length});});
  }
  let notice='Guardado en esta computadora. Aún no hay acuse remoto.';
  if(body.consentRemote===true&&item.delivery!=='recibido'){try{item=await transmit(item,config());notice='Soporte recibió tu reporte.';}catch{notice='Guardado localmente. No se obtuvo acuse remoto; puedes enviarlo después.';}}
  res.status(prior?200:201).json({...summary(item),notice});
 }));
 app.post('/api/support/reports/:id/send',safe(async(req,res)=>{const {user,item}=get(req,res);if(!user)return;if(req.body?.consentRemote!==true)protocol.fail('Autoriza el envío del contenido a soporte.');limit('send:'+user.id,10);const sent=item.delivery==='recibido'?item:await transmit(item,config());res.json(summary(sent));}));
 app.post('/api/support/reports/:id/refresh',safe(async(req,res)=>{const {user,item}=get(req,res);if(!user)return;if(!item.remote)protocol.fail('El reporte todavía no tiene un acuse remoto.',409);limit('refresh:'+user.id,30);const cfg=config();if(!configured(cfg))protocol.fail('El enlace remoto no está configurado.',409);const remote=validateReceipt(await send(cfg,'GET','/v1/reports/'+item.id),item);if(remote.receipt!==item.remote.receipt)protocol.fail('El acuse remoto cambió inesperadamente.',502);const next={...item,remote};database.transaction(()=>save('support-reports',item.id,next));res.json(summary(next));}));
 return {summary};
}
module.exports={registerMailbox};
