const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),{spawn}=require('node:child_process'),protocol=require('../src/mailbox-protocol');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('Receptor desplegable: secretos por entorno, persistencia, reinicio y fallo seguro de volumen o clave',async()=>{
 const area=fs.mkdtempSync(path.join(root,'.dev/em003-receiver-startup-')),data=path.join(area,'data');fs.mkdirSync(data);const dataKey=crypto.randomBytes(32).toString('hex'),adminToken=crypto.randomBytes(32).toString('hex'),clientId='startup-synthetic',secret=crypto.randomBytes(32).toString('hex');let child;
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});}),base='http://127.0.0.1:'+port;
 const environment={...process.env,NODE_OPTIONS:'',MAILBOX_DATA_DIR:data,MAILBOX_DATA_KEY:dataKey,MAILBOX_ADMIN_TOKEN:adminToken,MAILBOX_CLIENTS_JSON:JSON.stringify({[clientId]:secret}),MAILBOX_CLIENTS_FILE:'',MAILBOX_HOST:'127.0.0.1',PORT:String(port)};
 async function start(extra={}){child=spawn(process.execPath,['services/mailbox-receiver/server.js'],{cwd:root,windowsHide:true,env:{...environment,...extra},stdio:'ignore'});return child;}
 async function ready(){for(let i=0;i<100;i++){if(child.exitCode!==null||child.signalCode)throw Error('El receptor no inició');try{if((await fetch(base+'/health')).ok)return;}catch{}await pause(50);}throw Error('Tiempo de inicio agotado');}
 async function stop(){if(child&&child.exitCode===null&&!child.signalCode){const process=child,done=new Promise(resolve=>process.once('exit',resolve));process.kill();await done;}child=null;}
 async function rejected(extra){const process=await start(extra),result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{process.kill();reject(Error('No rechazó la configuración inválida'));},5000);process.once('exit',code=>{clearTimeout(timer);resolve(code);});});assert.notEqual(result,0);child=null;}
 try{
  await start();await ready();const packet={id:crypto.randomUUID(),kind:'sugerencia',description:'Reporte sintético del punto de entrada remoto',createdAt:new Date().toISOString(),attachments:[],attachmentsReviewed:false,consentRemote:true},body=JSON.stringify(packet);
  const response=await fetch(base+'/v1/reports',{method:'POST',headers:protocol.signedHeaders({clientId,secret},'POST','/v1/reports',body),body});assert.equal(response.status,201);const receipt=await response.json();await stop();
  await start();await ready();const route='/v1/reports/'+packet.id,restored=await fetch(base+route,{headers:protocol.signedHeaders({clientId,secret},'GET',route,'')});assert.equal(restored.status,200);assert.equal((await restored.json()).receipt,receipt.receipt);await stop();
  await rejected({MAILBOX_DATA_KEY:crypto.randomBytes(32).toString('hex')});const missing=path.join(area,'missing-volume');await rejected({MAILBOX_DATA_DIR:missing});assert.equal(fs.existsSync(missing),false);await rejected({MAILBOX_CLIENTS_JSON:'{}'});
 }finally{await stop();assert.ok(path.resolve(area).startsWith(path.join(root,'.dev')+path.sep));fs.rmSync(area,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
