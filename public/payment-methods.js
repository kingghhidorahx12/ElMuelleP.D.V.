// Disponibilidad compartida del negocio; el servidor valida cada cobro.
const paymentMethodsState={value:{efectivo:false,tarjeta:false,transferencia:false},owner:null,generation:null,allowed:null,version:0,saving:false,dirty:false};
const paymentMethodLabels={efectivo:'Efectivo',tarjeta:'Tarjeta',transferencia:'Transferencia'};
function isPaymentMethodEnabled(method){return paymentMethodsState.value[method]===true;}
function reconcilePaymentMethod(){
  if(state.checkoutPending||state.checkoutProcessing||state.checkoutPreparing)return;
  if(!isPaymentMethodEnabled(state.paymentMethod)){
    const available=Object.keys(paymentMethodLabels).find(isPaymentMethodEnabled);
    if(available){state.paymentReference='';if($('paymentReferenceInput'))$('paymentReferenceInput').value='';setPaymentMethod(available);}
  }
}
function applyPaymentMethods(value){
  paymentMethodsState.value=Object.fromEntries(Object.keys(paymentMethodLabels).map(key=>[key,value?.[key]===true]));
  reconcilePaymentMethod();syncCheckoutControls();
  $$('.pay-method').forEach(button=>{const enabled=isPaymentMethodEnabled(button.dataset.method);button.hidden=!enabled;button.title=enabled?'':'Desactivado en Configuración · Negocio';});
  $$('[data-payment-setting]').forEach(input=>{if(!paymentMethodsState.dirty)input.checked=isPaymentMethodEnabled(input.dataset.paymentSetting);input.disabled=paymentMethodsState.saving||!isAdminUser()||!state.sessionAuthenticated;});
  $('paymentMethodsSaveBtn').disabled=paymentMethodsState.saving||!isAdminUser()||!state.sessionAuthenticated;
}
async function paymentMethodsRequest(options={}){
  const response=await fetch('/api/payment-methods',{credentials:'same-origin',cache:'no-store',...options});
  const value=await response.json();if(!response.ok)throw Error(value.message||'No se pudieron consultar los métodos de pago.');return value;
}
async function refreshPaymentMethods(){
  const version=++paymentMethodsState.version,owner=state.currentUser?.id,generation=state.checkoutGeneration;
  if(!state.sessionAuthenticated||(!isAdminUser()&&!canAccessView('pos'))){paymentMethodsState.dirty=false;applyPaymentMethods({});return;}
  try{const value=await paymentMethodsRequest();if(version!==paymentMethodsState.version||owner!==state.currentUser?.id||generation!==state.checkoutGeneration)return;applyPaymentMethods(value);}
  catch(error){if(version===paymentMethodsState.version){applyPaymentMethods({});$('paymentMethodsStatus').textContent=error.message+' Usa Volver a consultar para reintentar.';}}
}
function syncPaymentMethodsSession(){
  const owner=state.sessionAuthenticated?state.currentUser?.id:null,allowed=isAdminUser()||canAccessView('pos');
  if(owner===paymentMethodsState.owner&&state.checkoutGeneration===paymentMethodsState.generation&&allowed===paymentMethodsState.allowed)return;
  paymentMethodsState.owner=owner;paymentMethodsState.generation=state.checkoutGeneration;paymentMethodsState.allowed=allowed;paymentMethodsState.dirty=false;applyPaymentMethods({});refreshPaymentMethods();
}
async function savePaymentMethods(){
  if(paymentMethodsState.saving||!state.sessionAuthenticated||!isAdminUser())return;
  const owner=state.currentUser.id,generation=state.checkoutGeneration;
  const value=Object.fromEntries($$('[data-payment-setting]').map(input=>[input.dataset.paymentSetting,input.checked]));
  paymentMethodsState.version++;paymentMethodsState.saving=true;applyPaymentMethods(paymentMethodsState.value);$('paymentMethodsStatus').textContent='Guardando…';
  try{const saved=await paymentMethodsRequest({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});if(owner!==state.currentUser?.id||generation!==state.checkoutGeneration)return;paymentMethodsState.version++;paymentMethodsState.dirty=false;applyPaymentMethods(saved);$('paymentMethodsStatus').textContent='Métodos guardados y aplicados al negocio.';}
  catch(error){if(owner===state.currentUser?.id&&generation===state.checkoutGeneration)$('paymentMethodsStatus').textContent=error.message;}
  finally{paymentMethodsState.saving=false;applyPaymentMethods(paymentMethodsState.value);}
}
function initPaymentMethods(){
  if(initPaymentMethods.ready)return;initPaymentMethods.ready=true;
  $('settingsPane-business').insertAdjacentHTML('beforeend',configurationCard('Métodos de pago','store','<p>Elige cómo podrán cobrar en todas las cajas. Mantén al menos una opción activa.</p>'+Object.entries(paymentMethodLabels).map(([key,label])=>'<label class="configuration-option"><span><strong>'+label+'</strong><small>'+(key==='tarjeta'?'Desactivada inicialmente. Activarla permite registrar el pago; no conecta una terminal.':'Disponible en Venta actual cuando está activo.')+'</small></span><input type="checkbox" role="switch" data-payment-setting="'+key+'" aria-label="Activar '+label+'" disabled /></label>').join('')+'<div class="payment-settings-actions"><button id="paymentMethodsSaveBtn" class="solid-btn" type="button" disabled>Guardar métodos</button><button id="paymentMethodsReloadBtn" class="quiet-btn" type="button">Volver a consultar</button></div><p id="paymentMethodsStatus" role="status" aria-live="polite"></p>'));
  $$('[data-payment-setting]').forEach(input=>input.addEventListener('change',()=>{paymentMethodsState.dirty=true;$('paymentMethodsStatus').textContent='Cambios sin guardar.';}));
  $('paymentMethodsSaveBtn').addEventListener('click',savePaymentMethods);
  $('paymentMethodsReloadBtn').addEventListener('click',()=>{paymentMethodsState.dirty=false;refreshPaymentMethods();});
  window.addEventListener('elmuelle:session',syncPaymentMethodsSession);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshPaymentMethods();});
  syncPaymentMethodsSession();
}
if(init.ready)initPaymentMethods();
