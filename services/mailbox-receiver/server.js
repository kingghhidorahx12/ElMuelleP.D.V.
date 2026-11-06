const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),express=require('express'),{DatabaseSync}=require('node:sqlite');
const p=require('../../src/mailbox-protocol');
function createReceiver({dataDir,dataKey,adminToken,clients,allowHttp=false,limitPerMinute=120,maxReports=10000,maxBytes=512*1024*1024}={}){
 if(!path.isAbsolute(dataDir||'')||!/^[a-f0-9]{64}$/.test(dataKey||'')||!/^[a-f0-9]{64}$/.test(adminToken||'')||p.equal(dataKey,adminToken)||!clients||Array.isArray(clients)||!Object.keys(clients).length||Object.keys(clients).length>100)throw Error('Configura almacenamiento persistente, clave de cifrado, acceso administrativo y clientes independientes.');
 for(const [id,key]of Object.entries(clients))if(!/^[a-zA-Z0-9_-]{8,64}$/.test(id)||!/^[a-f0-9]{64}$/.test(key)||p.equal(key,dataKey)||p.equal(key,adminToken))throw Error('Configuración de clientes inválida.');
 if(new Set(Object.values(clients)).size!==Object.keys(clients).length)throw Error('Cada cliente requiere una clave distinta.');
 let current=path.resolve(dataDir);while(true){if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('No se permiten enlaces en el almacenamiento.');const next=path.dirname(current);if(next===current)break;current=next;}
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});if(process.platform!=='win32')fs.chmodSync(dataDir,0o700);
 const dbPath=path.join(dataDir,'reports.sqlite');if(fs.existsSync(dbPath)&&fs.lstatSync(dbPath).isSymbolicLink())throw Error('Almacenamiento inválido.');
 const db=new DatabaseSync(dbPath);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY,client TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,digest TEXT NOT NULL,encrypted TEXT NOT NULL); CREATE TABLE IF NOT EXISTS nonces (client TEXT NOT NULL,nonce TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(client,nonce)); CREATE INDEX IF NOT EXISTS reports_client_date ON reports(client,created_at); CREATE INDEX IF NOT EXISTS nonces_expire ON nonces(expires);');if(process.platform!=='win32')fs.chmodSync(dbPath,0o600);
 const key=Buffer.from(dataKey,'hex'),buckets=new Map();
 function seal(value,id,client){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(client+':'+id));const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return ['enc:v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join(':');}
 function open(row){const [, ,iv,tag,bytes]=row.encrypted.split(':'),cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));cipher.setAAD(Buffer.from(row.client+':'+row.id));cipher.setAuthTag(Buffer.from(tag,'base64url'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(bytes,'base64url')),cipher.final()]));}
 try{
  db.exec('CREATE TABLE IF NOT EXISTS receiver_meta (id TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const proof=crypto.createHmac('sha256',key).update('ElMuellePDV-mailbox-key-v1').digest('hex'),saved=db.prepare("SELECT value FROM receiver_meta WHERE id='key-proof-v1'").get();
  if(saved&&!p.equal(saved.value,proof))throw Error('Se requiere la clave original del buzón.');
  const first=db.prepare('SELECT * FROM reports LIMIT 1').get();if(first)open(first);
  if(!saved)db.prepare('INSERT INTO receiver_meta VALUES(?,?)').run('key-proof-v1',proof);
 }catch(error){db.close();throw error;}
 const ack=record=>({id:record.id,receipt:record.receipt,receivedAt:record.receivedAt,status:record.status,updatedAt:record.updatedAt,replies:record.replies});
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Strict-Transport-Security':'max-age=31536000; includeSubDomains'});if(req.method==='OPTIONS')return res.status(405).end();next();});
 function limit(req,res,next){const now=Date.now();for(const [id,item]of buckets)if(item.until<=now)buckets.delete(id);const id=(req.socket.remoteAddress||'unknown')+(req.path.startsWith('/admin/api')?':admin':':client');let item=buckets.get(id);if(!item){if(buckets.size>=10000)return res.status(429).json({message:'Intenta más tarde.'});item={until:now+60000,n:0};buckets.set(id,item);}if(++item.n>limitPerMinute){res.set('Retry-After','60');return res.status(429).json({message:'Demasiadas solicitudes.'});}next();}
 app.use(['/v1','/admin/api'],limit);
 const safe=fn=>(req,res,next)=>{try{fn(req,res,next);}catch(error){next(error);}};
 function clientAuth(req,res,next){
  const id=req.get('X-Mailbox-Client'),stamp=req.get('X-Mailbox-Time'),nonce=req.get('X-Mailbox-Nonce'),signature=req.get('X-Mailbox-Signature');
  if(!Object.hasOwn(clients,id||'')||!/^\d{13}$/.test(stamp||'')||Math.abs(Date.now()-Number(stamp))>300000||!/^[a-f0-9]{32}$/.test(nonce||'')||!/^[a-f0-9]{64}$/.test(signature||'')||!p.equal(signature,p.signature(clients[id],id,req.method,req.originalUrl,stamp,nonce,req.rawBody||'')))return res.status(401).json({message:'Autenticación no válida.'});
  db.prepare('DELETE FROM nonces WHERE expires < ?').run(Date.now());if(db.prepare('SELECT COUNT(*) n FROM nonces').get().n>=10000)return res.status(429).json({message:'Intenta más tarde.'});
  try{db.prepare('INSERT INTO nonces VALUES(?,?,?)').run(id,nonce,Number(stamp)+300000);}catch(error){if(error.code?.startsWith('ERR_SQLITE'))return res.status(401).json({message:'Solicitud repetida o no válida.'});throw error;}
  req.clientId=id;next();
 }
 function adminAuth(req,res,next){const auth=req.get('Authorization')||'';if(auth.length>80||!auth.startsWith('Bearer ')||!p.equal(auth.slice(7),adminToken))return res.status(401).json({message:'Acceso administrativo no válido.'});next();}
 app.use('/admin/api',adminAuth);
 app.use('/v1',(req,res,next)=>{if(!Object.hasOwn(clients,req.get('X-Mailbox-Client')||''))return res.status(401).json({message:'Autenticación no válida.'});next();});
 app.use(['/v1','/admin/api'],(req,res,next)=>{if(['POST','PATCH','PUT'].includes(req.method)&&!req.is('application/json'))return res.status(415).json({message:'Usa JSON.'});next();},express.json({limit:p.LIMITS.bodyBytes,strict:true,verify:(req,_res,buffer)=>{req.rawBody=buffer.toString('utf8');}}));
 app.use('/v1',safe(clientAuth));
 app.get('/health',safe((_req,res)=>{db.prepare('SELECT 1').get();res.json({ok:true,service:'ElMuellePDV-Buzon'});}));
 app.post('/v1/reports',safe((req,res)=>{
  const packet=p.normalizeReport(req.body);if(!packet.consentRemote)p.fail('El envío requiere consentimiento.');
  const digest=p.hash(JSON.stringify(packet)),prior=db.prepare('SELECT * FROM reports WHERE id=?').get(packet.id);
  if(prior){if(prior.client!==req.clientId||prior.digest!==digest)p.fail('La identidad corresponde a otro reporte.',409);return res.json(ack(open(prior)));}
  const since=new Date(Date.now()-86400000).toISOString();if(db.prepare('SELECT COUNT(*) n FROM reports WHERE client=? AND created_at>?').get(req.clientId,since).n>=20)p.fail('Límite diario de reportes alcanzado.',429);
  const usage=db.prepare('SELECT COUNT(*) n,COALESCE(SUM(length(encrypted)),0) bytes FROM reports').get();if(usage.n>=maxReports||usage.bytes+JSON.stringify(packet).length*1.5>maxBytes)p.fail('El buzón remoto no tiene capacidad disponible.',507);
  const now=new Date().toISOString(),record={...packet,receipt:crypto.randomBytes(24).toString('hex'),receivedAt:now,updatedAt:now,status:'recibido',classification:'sin_clasificar',replies:[]};
  db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?,?,?)').run(packet.id,req.clientId,packet.kind,'recibido',now,now,digest,seal(record,packet.id,req.clientId));res.status(201).json(ack(record));
 }));
 app.get('/v1/reports/:id',safe((req,res)=>{const row=db.prepare('SELECT * FROM reports WHERE id=? AND client=?').get(req.params.id,req.clientId);if(!row)return res.status(404).json({message:'Reporte no encontrado.'});res.json(ack(open(row)));}));
 app.get('/admin/api/reports',safe((req,res)=>{
  const cursor=Number(req.query.cursor||0);if(!Number.isSafeInteger(cursor)||cursor<0)p.fail('Paginación inválida.');
  const status=req.query.status||'',kind=req.query.kind||'';if(status&&!p.STATES.includes(status)||kind&&!p.KINDS.includes(kind))p.fail('Filtro inválido.');
  const rows=db.prepare("SELECT rowid,* FROM reports WHERE rowid>? AND (?='' OR status=?) AND (?='' OR kind=?) ORDER BY rowid LIMIT 50").all(cursor,status,status,kind,kind);
  res.json({reports:rows.map(row=>{const item=open(row);return {...ack(item),kind:item.kind,classification:item.classification,description:item.description,attachmentCount:item.attachments.length};}),nextCursor:rows.at(-1)?.rowid||null});
 }));
 app.get('/admin/api/reports/:id',safe((req,res)=>{const row=db.prepare('SELECT * FROM reports WHERE id=?').get(req.params.id);if(!row)return res.status(404).json({message:'Reporte no encontrado.'});res.json(open(row));}));
 app.patch('/admin/api/reports/:id',safe((req,res)=>{
  const input=req.body;if(!input||Object.keys(input).some(key=>!['status','classification','reply'].includes(key))||!p.STATES.includes(input.status)||!['sin_clasificar','seguridad','operacion','interfaz','otro'].includes(input.classification))p.fail('Clasificación inválida.');
  const reply=p.text(input.reply??'',2000),row=db.prepare('SELECT * FROM reports WHERE id=?').get(req.params.id);if(!row)return res.status(404).json({message:'Reporte no encontrado.'});
  const record=open(row);if(reply&&record.replies.length>=50)p.fail('Límite de respuestas alcanzado.',409);const now=new Date().toISOString();record.status=input.status;record.classification=input.classification;record.updatedAt=now;if(reply)record.replies.push({text:reply,at:now});
  db.prepare('UPDATE reports SET status=?,updated_at=?,encrypted=? WHERE id=?').run(record.status,now,seal(record,row.id,row.client),row.id);res.json(ack(record));
 }));
 app.use('/admin',express.static(path.join(__dirname,'public'),{index:'index.html',dotfiles:'deny',fallthrough:false}));
 app.use((_req,res)=>res.status(404).json({message:'No encontrado.'}));
 app.use((error,_req,res,_next)=>res.status(error.statusCode||error.status||503).json({message:(error.statusCode||error.status)<500?error.message:'El buzón no pudo completar la operación.'}));
 return {app,db,dbPath,close:()=>{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();}};
}
function startReceiver(){try{
 const dataDir=process.env.MAILBOX_DATA_DIR;if(!dataDir||!fs.existsSync(dataDir))throw Error('Monta y configura el volumen persistente MAILBOX_DATA_DIR antes del arranque.');
 const clients=process.env.MAILBOX_CLIENTS_JSON?JSON.parse(process.env.MAILBOX_CLIENTS_JSON):JSON.parse(fs.readFileSync(process.env.MAILBOX_CLIENTS_FILE,'utf8'));
 const receiver=createReceiver({dataDir,dataKey:process.env.MAILBOX_DATA_KEY,adminToken:process.env.MAILBOX_ADMIN_TOKEN,clients});
 const server=receiver.app.listen(Number(process.env.PORT||8080),process.env.MAILBOX_HOST||'0.0.0.0',()=>console.log('Receptor de buzón iniciado.'));
 server.headersTimeout=15000;server.requestTimeout=20000;server.keepAliveTimeout=5000;server.maxHeadersCount=40;server.maxConnections=200;server.maxRequestsPerSocket=100;
 const stop=()=>{server.close(()=>{receiver.close();process.exit(0);});setTimeout(()=>process.exit(1),15000).unref();};process.once('SIGTERM',stop);process.once('SIGINT',stop);
 return {server,receiver};
}catch{console.error('No se inició el buzón: revisa el volumen persistente y las credenciales privadas.');process.exitCode=1;}}
if(require.main===module)startReceiver();
module.exports={createReceiver,startReceiver};
