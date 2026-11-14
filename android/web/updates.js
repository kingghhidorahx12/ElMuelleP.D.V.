(()=>{'use strict';const wait=setInterval(()=>{
 if(!init.ready||!document.querySelector('#settingsView .settings-content'))return;clearInterval(wait);
 const panel=document.createElement('details');panel.id='androidUpdatesPanel';panel.className='work-panel commerce-panel';
 panel.innerHTML='<summary>Actualizaciones de El Muelle PDV</summary><div class="commerce-body"><p>Actualiza desde aquí, sin códigos ni activar Buzón. La descarga se verifica y conserva tus datos. Android te pedirá confirmar la instalación.</p><button type="button" class="solid-btn" data-update>Buscar y actualizar</button><progress max="100" value="0" hidden></progress><p role="status" data-message></p></div>';
 document.querySelector('#settingsView .settings-content').append(panel);
 const button=panel.querySelector('[data-update]'),bar=panel.querySelector('progress'),message=text=>panel.querySelector('[data-message]').textContent=text;
 let epoch=0,identity=null,timer=null,flow=false,pending=false,lastState=null;
 const allowed=()=>state.sessionAuthenticated&&isAdminUser(),current=version=>version===epoch&&allowed();
 const saleBusy=()=>state.ticket.length||state.checkoutPending||state.checkoutProcessing;
 const post=url=>fetchJson(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 function render(s){
  lastState=s;const busy=['downloading','verifying','checking'].includes(s.phase);button.disabled=busy||pending;bar.hidden=!busy;bar.value=s.progress;
  button.textContent=s.phase==='ready'?'Instalar actualización':s.available?'Actualizar a '+s.release.versionName:'Buscar y actualizar';
  message(s.phase==='error'?s.message:s.phase==='checking'?'Buscando una nueva versión…':s.phase==='downloading'?'Descargando de forma segura: '+s.progress+' %':s.phase==='verifying'?'Verificando la APK…':s.phase==='ready'?'Descarga verificada. Lista para instalar sin borrar tus datos.':s.available?'Disponible '+s.release.versionName+'. '+s.release.notes:'Versión instalada: '+s.currentVersion.versionName);
 }
 function install(){
  if(saleBusy()){flow=false;message('Descarga lista. Termina o vacía la venta actual antes de instalar.');return;}
  if(state.activeView!=='settings'){flow=false;message('Descarga lista. Vuelve a Configuración y pulsa Instalar actualización.');return;}
  flow=false;AndroidShell.installUpdate();
 }
 async function status(){
  clearTimeout(timer);timer=null;if(!allowed())return;const version=epoch;
  try{const s=await fetchJson('/api/android/updates/status');if(!current(version))return;render(s);if(s.phase==='ready'&&flow)install();else if(['downloading','verifying','checking'].includes(s.phase))timer=setTimeout(status,1000);}catch(error){if(current(version)){flow=false;message(error.message);button.disabled=false;}}
 }
 button.onclick=async()=>{
  if(!allowed()||pending)return;if(saleBusy()){message('Termina o vacía la venta actual antes de actualizar.');return;}
  if(lastState?.phase==='ready'){install();return;}
  const version=epoch;pending=true;flow=true;button.disabled=true;message('Buscando una nueva versión…');
  try{const checked=await post('/api/android/updates/check');if(!current(version))return;render(checked);if(!checked.available){flow=false;message('Ya tienes la versión más reciente.');return;}await post('/api/android/updates/download');if(current(version)){pending=false;await status();}}
  catch(error){if(current(version)){flow=false;message(error.message);}}finally{if(current(version)){pending=false;button.disabled=['downloading','verifying','checking'].includes(lastState?.phase);}}
 };
 async function session(){
  const next=allowed()?state.currentUser?.id:null;panel.hidden=!next;if(next===identity)return;identity=next;const version=++epoch;clearTimeout(timer);timer=null;flow=pending=false;lastState=null;bar.hidden=true;button.disabled=false;message('');if(!next)return;
  await status();if(!current(version)||['downloading','verifying','ready'].includes(lastState?.phase))return;
  try{const s=await post('/api/android/updates/check');if(current(version)){render(s);if(s.available)showToast('Hay una actualización en Configuración.');}}catch(error){if(current(version))message(error.message);}
 }
 window.addEventListener('elmuelle:session',session);panel.addEventListener('toggle',()=>{if(panel.open)status();});session();
 },80);})();
