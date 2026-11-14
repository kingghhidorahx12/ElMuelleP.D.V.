// Windows GUI browsers do not consistently return --dump-dom through stdout.
// Use their loopback DevTools endpoint, with a new private profile per invocation.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function readPage({browser,profile,url,expression,timeout=15000}){
 const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--edge-skip-compat-layer-relaunch','--disable-features=AutoDeElevate,msEdgeUpdateLaunchServicesPreferredVersion','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket,seq=0;const pending=new Map(),deadline=Date.now()+timeout;let launchError;child.on('error',e=>{launchError=e;});
 try{
  const active=path.join(profile,'DevToolsActivePort');while(!fs.existsSync(active)){if(launchError)throw launchError;if(child.exitCode!==null||Date.now()>deadline)throw Error('No se pudo iniciar la validación de imagen.');await wait(50);}
  const port=Number(fs.readFileSync(active,'utf8').split('\n')[0]);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Puerto de validación inválido.');
  const response=await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(url),{method:'PUT',signal:AbortSignal.timeout(3000)});const target=await response.json();
  const targetUrl=new URL(target.webSocketDebuggerUrl);if(targetUrl.hostname!=='127.0.0.1'||Number(targetUrl.port)!==port)throw Error('El navegador devolvió un destino no local.');
  socket=new WebSocket(targetUrl);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No respondió el validador de imagen.')),3000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('No se pudo conectar al validador local.'));},{once:true});});
  socket.addEventListener('message',event=>{const answer=JSON.parse(event.data),p=pending.get(answer.id);if(p){pending.delete(answer.id);clearTimeout(p.timer);answer.error?p.reject(Error('La validación no se completó.')):p.resolve(answer.result);}});
  const call=(method,params)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Tiempo de validación agotado.'));},3000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  while(Date.now()<deadline){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.result?.value!==undefined&&result.result.value!==null&&result.result.value!=='pending')return result.result.value;await wait(50);}
  throw Error('La imagen no pudo verificarse a tiempo.');
 }finally{
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Validador cerrado.'));}
  if(socket?.readyState===WebSocket.OPEN){const closed=new Promise(resolve=>socket.addEventListener('close',resolve,{once:true}));socket.send(JSON.stringify({id:++seq,method:'Browser.close'}));await Promise.race([closed,wait(3000)]);}
  if(child.exitCode===null){const closed=new Promise(resolve=>child.once('exit',resolve));await Promise.race([closed,wait(1000)]);if(child.exitCode===null){child.kill();await Promise.race([closed,wait(2000)]);}}
  if(socket)socket.close();
 }
}
module.exports={readPage};
