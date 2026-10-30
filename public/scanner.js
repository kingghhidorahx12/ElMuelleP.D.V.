// Lectores USB/Bluetooth en modo teclado. Sólo escucha el campo dedicado.
const scannerState={enabled:false,owner:null,generation:null,allowed:null,version:0,pending:false,controller:null,settingsController:null,settingsVersion:0};
function scannerAllowed(){return state.sessionAuthenticated&&canAccessView('pos');}
function scannerMatches(code,products){return products.filter(product=>product.code===code);}
function closeScannerCapture(restoreFocus=false){
  scannerState.version++;scannerState.controller?.abort();scannerState.controller=null;scannerState.pending=false;
  const field=$('scannerCodeInput'),dialog=$('scannerCaptureDialog');if(field){field.value='';field.disabled=false;}
  if($('scannerCaptureStatus'))$('scannerCaptureStatus').textContent='';
  if(dialog?.open)dialog.close();
  if(restoreFocus&&scannerAllowed()&&scannerState.enabled)$('scanProductBtn')?.focus({preventScroll:true});
}
function applyScannerSetting(value){
  scannerState.enabled=scannerAllowed()&&value?.enabled===true;
  if(!scannerState.enabled)closeScannerCapture();
  $('scanProductBtn').hidden=!scannerState.enabled;
  const toggle=$('scannerEnabledInput');if(toggle){toggle.checked=value?.enabled===true;toggle.disabled=!state.sessionAuthenticated||!isAdminUser();toggle.closest('.configuration-card').hidden=!scannerAllowed();}
}
async function scannerRequest(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
  if(!response.ok)throw Error(response.status===403?'No tienes autorización para usar el escáner.':'No se pudo consultar el escáner. Intenta nuevamente.');
  return response.json();
}
async function refreshScannerSettings(){
  const version=++scannerState.settingsVersion,owner=state.currentUser?.id,generation=state.checkoutGeneration;
  scannerState.settingsController?.abort();
  if(!scannerAllowed()){applyScannerSetting({enabled:false});return;}
  const controller=new AbortController();scannerState.settingsController=controller;
  try{const value=await scannerRequest('/api/peripherals/scanner',{signal:controller.signal});if(version!==scannerState.settingsVersion||owner!==state.currentUser?.id||generation!==state.checkoutGeneration||!scannerAllowed())return;applyScannerSetting(value);}
  catch(error){if(version===scannerState.settingsVersion&&error.name!=='AbortError')applyScannerSetting({enabled:false});}
}
function syncScannerSession(){
  const owner=state.sessionAuthenticated?state.currentUser?.id:null,allowed=scannerAllowed();
  if(owner===scannerState.owner&&state.checkoutGeneration===scannerState.generation&&allowed===scannerState.allowed)return;
  closeScannerCapture();scannerState.owner=owner;scannerState.generation=state.checkoutGeneration;scannerState.allowed=allowed;applyScannerSetting({enabled:false});
  refreshScannerSettings();
}
async function openScannerCapture(){
  const owner=state.currentUser?.id,generation=state.checkoutGeneration;
  if(!scannerAllowed()||state.activeView!=='pos'||state.checkoutPending||state.checkoutProcessing){showToast('Resuelve el cobro pendiente y abre el POS antes de escanear.');return;}
  if(document.querySelector('dialog[open],.modal:not(.hidden)'))return;
  await refreshScannerSettings();
  if(owner!==state.currentUser?.id||generation!==state.checkoutGeneration||!scannerState.enabled||!scannerAllowed()||state.activeView!=='pos'||state.checkoutPending||state.checkoutProcessing||document.querySelector('dialog[open],.modal:not(.hidden)'))return;
  closeScannerCapture();$('scannerCaptureDialog').showModal();$('scannerCaptureStatus').textContent='Escanea un código y termina con Enter.';$('scannerCodeInput').focus();
}
async function processScannerCapture(event){
  if(event.key!=='Enter'||event.repeat||event.isComposing)return;
  event.preventDefault();
  const field=$('scannerCodeInput'),dialog=$('scannerCaptureDialog'),code=field.value;
  if(scannerState.pending||!dialog.open||!scannerState.enabled||!scannerAllowed())return;
  if(!code){$('scannerCaptureStatus').textContent='Escanea o escribe un código.';return;}
  if(code.length>80||/[\u0000-\u001f\u007f]/.test(code)){$('scannerCaptureStatus').textContent='Código inválido: máximo 80 caracteres, sin caracteres de control.';return;}
  // Consumir esta captura antes del primer await: Enter duplicado no la reutiliza.
  const version=++scannerState.version,owner=state.currentUser.id,generation=state.checkoutGeneration,controller=new AbortController();
  scannerState.controller=controller;scannerState.pending=true;field.value='';field.disabled=true;
  const current=()=>version===scannerState.version&&state.sessionAuthenticated&&owner===state.currentUser?.id&&generation===state.checkoutGeneration&&scannerAllowed()&&state.activeView==='pos'&&dialog.open;
  const status=message=>{$('scannerCaptureStatus').textContent=message;};
  try{
    status('Buscando código…');
    const setting=await scannerRequest('/api/peripherals/scanner',{signal:controller.signal});if(!current())return;
    if(!setting.enabled){applyScannerSetting(setting);showToast('El administrador desactivó el escáner.');return;}
    const products=await scannerRequest('/api/products',{signal:controller.signal});if(!current())return;
    // Revalidar el ajuste después de la consulta evita resultados de una captura desactivada.
    const effective=await scannerRequest('/api/peripherals/scanner',{signal:controller.signal});if(!current())return;
    if(!effective.enabled){applyScannerSetting(effective);showToast('El administrador desactivó el escáner.');return;}
    if(state.checkoutPending||state.checkoutProcessing||document.querySelector('.modal:not(.hidden),dialog[open]:not(#scannerCaptureDialog)')){status('Resuelve la operación abierta antes de escanear.');return;}
    const matches=scannerMatches(code,products);
    if(matches.length>1){status('Código ambiguo: pertenece a varios productos. Solicita revisión al administrador.');return;}
    if(!matches.length){status('Código no encontrado. No se agregó ningún producto.');return;}
    const product=matches[0];if(product.active===false){status('El producto está inactivo.');return;}
    if(typeof product.stockQuantity!=='number'){status('Existencias sin verificar. Registra primero el conteo inicial.');return;}
    if(product.stockQuantity<=0){status('Producto agotado. No hay existencias para vender.');return;}
    state.products=products;closeScannerCapture();selectProduct(product);
  }catch(error){if(current()&&error.name!=='AbortError')status(error.message);}
  finally{if(version===scannerState.version){scannerState.pending=false;scannerState.controller=null;field.disabled=false;if(dialog.open)field.focus();}}
}
function initScanner(){
  if(initScanner.ready)return;initScanner.ready=true;
  document.body.insertAdjacentHTML('beforeend','<dialog id="scannerCaptureDialog" class="scanner-capture"><form method="dialog"><div class="scanner-capture-heading"><h3>Escanear producto</h3><button id="closeScannerBtn" type="button" class="quiet-btn" aria-label="Cerrar captura de código">Cerrar</button></div><label for="scannerCodeInput">Código del producto</label><input id="scannerCodeInput" type="text" maxlength="80" autocomplete="off" spellcheck="false" autocapitalize="off" aria-describedby="scannerCaptureStatus" /><p id="scannerCaptureStatus" role="status" aria-live="polite"></p><small>Lector en modo teclado USB/Bluetooth con terminador Enter. No se verifica su conexión física.</small></form></dialog>');
  const pane=$('settingsPane-peripherals');pane.insertAdjacentHTML('beforeend',configurationCard('Escáner de códigos','search','<label class="configuration-option"><span><strong>Usar escáner</strong><small>Ajuste compartido del establecimiento. Sólo administración puede cambiarlo.</small></span><input id="scannerEnabledInput" type="checkbox" role="switch" disabled /></label><p id="scannerSettingStatus" role="status"></p>'));
  $('scanProductBtn').title='Capturar un código de producto';$('scanProductBtn').addEventListener('click',openScannerCapture);
  $('scannerCodeInput').addEventListener('keydown',processScannerCapture);
  $('scannerCaptureDialog').querySelector('form').addEventListener('submit',event=>event.preventDefault());
  $('closeScannerBtn').addEventListener('click',()=>closeScannerCapture(true));
  $('scannerCaptureDialog').addEventListener('cancel',event=>{event.preventDefault();closeScannerCapture(true);});
  $('scannerCaptureDialog').addEventListener('close',()=>{if(scannerState.pending||$('scannerCodeInput').value)closeScannerCapture();});
  $('scannerEnabledInput').addEventListener('change',async event=>{
    const toggle=event.currentTarget,owner=state.currentUser?.id,generation=state.checkoutGeneration;toggle.disabled=true;
    try{const value=await scannerRequest('/api/peripherals/scanner',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:toggle.checked})});if(owner!==state.currentUser?.id||generation!==state.checkoutGeneration)return;applyScannerSetting(value);$('scannerSettingStatus').textContent='Ajuste compartido guardado.';}
    catch(error){if(owner===state.currentUser?.id&&generation===state.checkoutGeneration){$('scannerSettingStatus').textContent=error.message;await refreshScannerSettings();}}
    finally{toggle.disabled=!state.sessionAuthenticated||!isAdminUser();}
  });
  window.addEventListener('elmuelle:session',syncScannerSession);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshScannerSettings();});
  syncScannerSession();
}
if(init.ready)initScanner();
