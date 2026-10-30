/* Permisos de pantalla: el servidor conserva la autoridad de cada operación. */
const accessModules=[['pos','Punto de Venta'],['sales','Ventas'],['cash','Caja y cortes'],['billing','Solicitudes de factura'],['products','Productos'],['inventory','Inventario'],['dashboard','Resumen del negocio'],['reports','Reportes'],['settings','Configuración']];
const accessDescriptions={
  pos:'Permite preparar y cobrar ventas con caja abierta. Los descuentos y la cantidad manual conservan la autorización administrativa.',
  sales:'Permite consultar las ventas del empleado y sus comprobantes. Cancelar ventas requiere al administrador.',
  cash:'Permite consultar la caja, abrirla y cerrarla con el efectivo contado. Las entradas y retiros manuales requieren al administrador.',
  billing:'Permite consultar las ventas propias y el estado de sus solicitudes. Capturar datos fiscales o guardar solicitudes requiere al administrador; no se emite CFDI.',
  products:'Permite consultar el catálogo, precios y existencias. Crear, editar o desactivar productos requiere al administrador.',
  inventory:'Permite consultar existencias y entradas registradas; la rotación usa las ventas propias. Registrar entradas o ajustar existencias requiere al administrador.',
  dashboard:'Permite consultar el resumen con las ventas propias y el catálogo disponible. No autoriza modificaciones administrativas.',
  reports:'Permite consultar, exportar e imprimir reportes de ventas propias, productos vendidos e inventario actual. No concede acciones administrativas ni acceso a ventas ajenas.',
  settings:'Permite usar preferencias personales, apariencia, báscula e impresión del navegador. No permite administrar empleados, permisos, datos del negocio, auditoría ni mantenimiento.'
};
let accessStream=null,accessStreamOwner=null,permissionEditorVersion=0;
const personalSettingsSections=['general','scale','appearance','peripherals'];
function hasScreenPermission(module) {return module==='cash'?canAccessView('reports','cash'):module==='reports'?canAccessView('reports','reports'):canAccessView(module);}
function canReadProductData() {return ['pos','products','inventory','dashboard','reports'].some(hasScreenPermission);}
function accessSalesUrl() {
  if(['sales','billing','inventory','dashboard','reports','cash'].some(hasScreenPermission))return '/api/sales';
  return hasScreenPermission('pos')?'/api/sales?context=pos':null;
}
function closeAccessStream() {
  accessStream?.close();accessStream=null;accessStreamOwner=null;permissionEditorVersion++;
  if(!$('permissionEmployeeSelect'))return;
  $('permissionEmployeeSelect').replaceChildren();$('permissionEmployeeSelect').disabled=false;
  $('permissionEmployeeRole').textContent='Encargado';$('permissionModules').disabled=true;$('permissionSaveBtn').disabled=true;$('permissionReloadBtn').disabled=false;
  $$('[data-permission-module]').forEach(input=>input.checked=false);
  $$('[data-saved-permission]').forEach(label=>label.textContent='Sin cargar');
  $('permissionStatus').textContent='Selecciona un empleado.';
}
function ensureAllowedScreen() {
  if(!state.sessionAuthenticated)return;
  if(state.activeView!=='restricted'&&canAccessView(state.activeView))return;
  const first=accessModules.find(([id])=>hasScreenPermission(id));
  if(state.activeView==='restricted'&&!first)return;
  if(!first){setView('restricted');return;}
  if(first[0]==='cash'||first[0]==='reports'){setReportsMode(first[0]);setView('reports');}
  else setView(first[0]);
}
function syncEmployeeScreenUi() {
  const admin=isAdminUser();
  document.body.classList.toggle('screen-readonly',!admin);
  $$('[data-settings-mode-btn]').forEach(button=>button.hidden=!admin&&!personalSettingsSections.includes(button.dataset.settingsModeBtn));
  const appCard=$('configurationAppData')?.closest('.configuration-card');if(appCard)appCard.hidden=!admin;
  const motionRow=$('settingsMotionSlot')?.closest('.configuration-option');if(motionRow)motionRow.hidden=!admin;
  const mode=document.querySelector('.settings-layout')?.dataset.settingsMode;
  if(!admin&&mode&&!personalSettingsSections.includes(mode))setSettingsMode('general');
  if(!admin&&document.querySelector('.products-layout')?.dataset.productsMode==='form')setProductMode('list');
  if(!admin&&document.querySelector('.inventory-management-layout')?.dataset.inventoryMode==='entry')setInventoryMode('stock');
  ['products','inventory','dashboard'].forEach(id=>{const view=$(id+'View');if(!view)return;let note=view.querySelector('.screen-role-note');if(!note){note=document.createElement('p');note.className='screen-role-note';note.textContent='Acceso de consulta. Las modificaciones requieren al administrador; las ventas disponibles corresponden a tu usuario.';view.prepend(note);}note.hidden=admin;});
}
function applyAccessUser(user) {
  if(!state.sessionAuthenticated||user.id!==state.currentUser?.id)return;
  const changed=JSON.stringify(state.currentUser.permissions)!==JSON.stringify(user.permissions);
  state.currentUser=normalizeSessionUser(user);saveSessionUser(state.currentUser);renderSessionUi();
  ensureAllowedScreen();
  if(changed){
    if(!canReadProductData())state.products=[];
    state.sales=[];state.inventoryEntries=[];
    if(!hasScreenPermission('billing')){$('invoiceForm')?.reset();$('invoiceSelectedItems')?.replaceChildren();}
    Promise.all([loadProducts(),loadSales()]).then(()=>{
      if(state.activeView==='inventory'&&hasScreenPermission('inventory'))loadInventoryEntries();
      if(state.activeView==='billing'&&hasScreenPermission('billing'))loadRecentSales();
    }).catch(()=>{});
    showToast('Se actualizaron tus accesos. Las operaciones confirmadas y el borrador de venta se conservan.');
  }
}
async function refreshAccessFromServer() {
  if(!state.sessionAuthenticated)return;
  const owner=state.currentUser.id;
  try{const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});if(!response.ok)return;const result=await response.json();if(!state.sessionAuthenticated||state.currentUser.id!==owner)return;if(!result.authenticated){logoutToAccess({preservePendingCheckout:Boolean(state.checkoutPending)});return;}applyAccessUser(result.user);}catch{/* La API sigue verificando cada petición durante una desconexión. */}
}
function syncAccessSession() {
  if(!state.sessionAuthenticated){closeAccessStream();return;}
  if(accessStreamOwner===state.currentUser.id)return;
  closeAccessStream();accessStreamOwner=state.currentUser.id;
  if(typeof EventSource==='undefined')return;
  const owner=accessStreamOwner;accessStream=new EventSource('/api/access/events');
  accessStream.addEventListener('open',()=>{if(accessStreamOwner===owner&&typeof refreshPaymentMethods==='function')refreshPaymentMethods();});
  accessStream.addEventListener('permissions',event=>{if(accessStreamOwner!==owner)return;try{applyAccessUser(JSON.parse(event.data));}catch{}});
  accessStream.addEventListener('scanner',()=>{if(accessStreamOwner===owner&&typeof refreshScannerSettings==='function')refreshScannerSettings();});
  accessStream.addEventListener('payment-methods',()=>{if(accessStreamOwner===owner&&typeof refreshPaymentMethods==='function')refreshPaymentMethods();});
  accessStream.addEventListener('expired',()=>{if(accessStreamOwner===owner)logoutToAccess({preservePendingCheckout:Boolean(state.checkoutPending)});});
}
function buildPermissionEditor() {
  const pane=$('configurationUserPane-permissions');if(!pane)return;
  pane.innerHTML=configurationCard('Permisos por empleado','lock','<div class="permission-editor-toolbar"><label>Empleado<select id="permissionEmployeeSelect" aria-label="Empleado para permisos"></select></label><span id="permissionEmployeeRole">Encargado</span><button id="permissionReloadBtn" class="quiet-btn" type="button">Recuperar permisos</button></div><p>Permitir una pantalla no autoriza acciones administrativas. Los PIN y roles se conservan.</p><fieldset id="permissionModules" class="permission-modules" disabled><legend class="sr-only">Acceso por pantalla</legend>'+accessModules.map(([id,label])=>'<label class="configuration-option"><span><strong>'+label+'</strong><small id="permissionDescription-'+id+'" class="permission-description">'+accessDescriptions[id]+'</small><small data-saved-permission="'+id+'">Sin cargar</small></span><input type="checkbox" role="switch" data-permission-module="'+id+'" aria-label="Permitir '+label+'" aria-describedby="permissionDescription-'+id+'" /></label>').join('')+'</fieldset><div class="permission-editor-actions"><button id="permissionSaveBtn" class="solid-btn" type="button" disabled>Guardar permisos</button><p id="permissionStatus" role="status">Selecciona un empleado.</p></div>');
  $('permissionEmployeeSelect').addEventListener('change',loadEmployeePermissions);
  $('permissionReloadBtn').addEventListener('click',loadEmployeePermissions);
  $('permissionSaveBtn').addEventListener('click',saveEmployeePermissions);
  $$('[data-permission-module]').forEach(input=>input.addEventListener('change',()=>{$('permissionStatus').textContent='Cambios sin guardar.';}));
}
function loadPermissionEmployees() {
  if(!isAdminUser()||!$('permissionEmployeeSelect'))return;
  const select=$('permissionEmployeeSelect'),previous=select.value;
  select.innerHTML=state.settings.users.filter(user=>user.role==='employee').map(user=>'<option value="'+escapeHtml(user.id)+'">'+escapeHtml(user.name)+'</option>').join('');
  if([...select.options].some(option=>option.value===previous))select.value=previous;
  loadEmployeePermissions();
}
function renderEmployeePermissions(result) {
  $$('[data-permission-module]').forEach(input=>input.checked=result.permissions[input.dataset.permissionModule]===true);
  $$('[data-saved-permission]').forEach(label=>label.textContent=result.permissions[label.dataset.savedPermission]?'Guardado: permitido':'Guardado: bloqueado');
  $('permissionEmployeeRole').textContent=result.employee.name+' · Encargado';
}
async function loadEmployeePermissions() {
  const version=++permissionEditorVersion,id=$('permissionEmployeeSelect').value;
  $('permissionEmployeeRole').textContent=id?$('permissionEmployeeSelect').selectedOptions[0].textContent+' · Encargado':'Sin empleados guardados';
  $('permissionModules').disabled=true;$('permissionSaveBtn').disabled=true;
  $$('[data-permission-module]').forEach(input=>input.checked=false);
  $$('[data-saved-permission]').forEach(label=>label.textContent='Sin cargar');
  if(!id){$('permissionStatus').textContent='Agrega y guarda un empleado en Empleados / Encargados para asignar permisos.';return;}
  $('permissionStatus').textContent='Cargando permisos guardados…';
  try{const result=await fetchJson('/api/users/'+encodeURIComponent(id)+'/permissions');if(version!==permissionEditorVersion||!isAdminUser())return;renderEmployeePermissions(result);$('permissionModules').disabled=false;$('permissionSaveBtn').disabled=false;$('permissionStatus').textContent='Permisos guardados recuperados.';}catch(error){if(version===permissionEditorVersion)$('permissionStatus').textContent=error.message+' Usa Recuperar permisos para reintentar.';}
}
async function saveEmployeePermissions() {
  const version=permissionEditorVersion,id=$('permissionEmployeeSelect').value;
  if(!id||!isAdminUser())return;
  const permissions=Object.fromEntries($$('[data-permission-module]').map(input=>[input.dataset.permissionModule,input.checked]));
  $('permissionSaveBtn').disabled=true;$('permissionModules').disabled=true;$('permissionEmployeeSelect').disabled=true;$('permissionReloadBtn').disabled=true;$('permissionStatus').textContent='Guardando permisos…';
  try{const result=await fetchJson('/api/users/'+encodeURIComponent(id)+'/permissions',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({permissions})});if(version!==permissionEditorVersion||!isAdminUser())return;renderEmployeePermissions(result);$('permissionStatus').textContent='Permisos guardados y aplicados a las sesiones activas.';}catch(error){if(version===permissionEditorVersion)$('permissionStatus').textContent=error.message+' No se pudo confirmar el guardado. Usa Recuperar permisos para comprobar el estado.';}finally{if(version===permissionEditorVersion){$('permissionSaveBtn').disabled=false;$('permissionModules').disabled=false;$('permissionEmployeeSelect').disabled=false;$('permissionReloadBtn').disabled=false;}}
}
function initAccessControl() {
  if(initAccessControl.ready)return;initAccessControl.ready=true;
  const restricted=document.createElement('section');restricted.id='restrictedView';restricted.className='app-view';restricted.innerHTML='<section class="configuration-card restricted-access"><h3>Acceso restringido</h3><p>No tienes pantallas autorizadas. Solicita al administrador que revise tus permisos.</p><p>Mi cuenta, tus preferencias personales y Cerrar sesión siguen disponibles.</p></section>';document.querySelector('.workspace').appendChild(restricted);
  buildPermissionEditor();syncEmployeeScreenUi();
  window.addEventListener('elmuelle:session',syncAccessSession);
  window.addEventListener('elmuelle:access-denied',refreshAccessFromServer);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshAccessFromServer();});
  syncAccessSession();ensureAllowedScreen();
}
if(init.ready)initAccessControl();
