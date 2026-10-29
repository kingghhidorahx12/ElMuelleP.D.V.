/* Configuración y solicitudes: presentación sobre los servicios existentes. */
const settingsCenter = {preferences:null,draft:null,configuration:null,loadedFor:null,loadVersion:0,business:null,invoiceFilter:'all',previewed:null};
const configurationSections = {
  general:['General','Sistema y preferencias','Configuraciones personales de la interfaz.','power'],
  business:['Negocio','Información del negocio','Datos administrativos del establecimiento.','store'],
  scale:['Báscula','Conexión y lectura','Configuración y lectura del dispositivo existente.','scale'],
  users:['Usuarios y PIN','Accesos y empleados','Gestiona los usuarios y sus accesos al sistema.','users'],
  peripherals:['Periféricos','Impresión y dispositivos','Opciones compatibles con este navegador.','printer'],
  fiscal:['Facturación','Datos fiscales','Datos del establecimiento y alcance fiscal real.','file'],
  appearance:['Apariencia','Tema y visualización','Preferencias del mismo perfil de usuario.','palette'],
  audit:['Auditoría','Registros de acciones','Consulta de eventos reales del sistema.','list'],
  maintenance:['Mantenimiento','Estado del sistema','Consulta de respaldos e integridad.','database']
};
function configurationIcon(name) {
  const paths={power:'M12 2v10M6 5a9 9 0 1 0 12 0',store:'M3 10h18L19 3H5l-2 7ZM4 10v11h16V10M9 21v-7h6v7',scale:'M4 6h16l2 9H2l2-9ZM12 15v6M6 21h12M9 3h6',users:'M16 21v-3a7 7 0 0 0-14 0v3M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 8M18 15a5 5 0 0 1 4 5',printer:'M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6zM17 11h1',file:'M6 3h9l4 4v14H6V3ZM14 3v5h5M9 12h7M9 16h7',palette:'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a5 5 0 0 0 5-5c0-3-4-5-9-5ZM7 8h.01M12 6h.01M17 8h.01M6 13h.01',list:'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',database:'M4 6c0-4 16-4 16 0s-16 4-16 0ZM4 6v12c0 4 16 4 16 0V6M4 12c0 4 16 4 16 0',clock:'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',globe:'M21 12H3M12 3c-6 6-6 12 0 18M12 3c6 6 6 12 0 18M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',save:'M4 3h14l3 3v15H3V3ZM7 3v6h10V3M7 21v-8h10v8',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',check:'m5 12 4 4L19 6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',user:'M4 21v-3a8 8 0 0 1 16 0v3M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',lock:'M5 10h14v11H5V10ZM8 10V6a4 4 0 0 1 8 0v4M12 14v3'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.file}"/></svg>`;
}
function configurationCard(title,icon,body,classes='') { return `<section class="configuration-card ${classes}"><h4>${configurationIcon(icon)}<span>${title}</span></h4>${body}</section>`; }
function preferenceSelect(key,label,options,note='') {return `<label class="configuration-field"><span>${label}</span><select data-ui-preference="${key}" aria-label="${label}">${options.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select>${note?`<small>${note}</small>`:''}</label>`;}
function preferenceToggle(key,label,description) {return `<label class="configuration-option"><span><strong>${label}</strong><small>${description}</small></span><input type="checkbox" role="switch" data-ui-preference="${key}" /></label>`;}
function configurationPane(key,content) {return `<section id="settingsPane-${key}" data-settings-pane="${key}" role="tabpanel" aria-labelledby="settingsTab-${key}" tabindex="0" hidden>${content}</section>`;}
function preferenceDateOptions() {
  const p=settingsCenter.preferences;
  return p?{timeZone:p.timeZone,year:'numeric',month:p.dateFormat==='long'?'long':'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:p.hour12}:undefined;
}
function uiNumberLocale() {return settingsCenter.preferences?.numberLocale||'es-MX';}
function presentationClockOptions() {const p=settingsCenter.preferences;return p?{hour12:p.hour12,timeZone:p.timeZone}:{};}
function noticePreference(kind) {
  const p=settingsCenter.preferences;
  if(p?.sounds&&kind==='success'&&navigator.userActivation?.hasBeenActive) {
    try {const audio=new (window.AudioContext||window.webkitAudioContext)();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.frequency.value=660;gain.gain.setValueAtTime(.035,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+.12);oscillator.onended=()=>audio.close();}catch{/* La restricción de audio no bloquea la operación. */}
  }
  return !(kind==='success'&&p?.notifications===false);
}
function applyPresentationPreferences() {
  document.body.dataset.uiAccent=settingsCenter.preferences?.accent||'gold';
  updateClock();
  const catalog=$('productGrid'),scroll=catalog?.scrollTop||0;
  renderProducts();if(catalog)catalog.scrollTop=scroll;renderTicket();
}
function syncPreferenceControls() {
  if(!settingsCenter.draft)return;
  $$('[data-ui-preference]').forEach(e=>{const v=settingsCenter.draft[e.dataset.uiPreference];if(e.type==='checkbox')e.checked=v;else e.value=String(v);});
  const dirty=JSON.stringify(settingsCenter.preferences)!==JSON.stringify(settingsCenter.draft);
  if($('configurationPending'))$('configurationPending').textContent=dirty?'Cambios sin guardar':'Preferencias guardadas';
}
async function savePresentationPreferences() {
  const version=settingsCenter.loadVersion;
  const button=$('configurationSaveBtn');button.disabled=true;
  try {const saved=await fetchJson('/api/preferences',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(settingsCenter.draft)});if(version!==settingsCenter.loadVersion)return;settingsCenter.preferences=saved;settingsCenter.draft={...saved};applyPresentationPreferences();syncPreferenceControls();showToast('Preferencias guardadas.','success');}
  catch(error){if(version===settingsCenter.loadVersion){$('configurationPending').textContent=error.message+' Puedes reintentar.';showToast(error.message);}}
  finally{if(version===settingsCenter.loadVersion)button.disabled=false;}
}
async function recoverPresentationPreferences() {
  if(!settingsCenter.configuration&&isAdminUser())return loadConfigurationContext();
  const version=settingsCenter.loadVersion;
  try {const prefs=await fetchJson('/api/preferences');if(version!==settingsCenter.loadVersion)return;settingsCenter.preferences=prefs;settingsCenter.draft={...prefs};applyPresentationPreferences();syncPreferenceControls();$('configurationSaveBtn').disabled=false;}
  catch(error){if(version===settingsCenter.loadVersion)$('configurationPending').textContent=error.message+' Puedes reintentar.';}
}
async function loadConfigurationContext() {
  const version=++settingsCenter.loadVersion;
  const owner=state.sessionAuthenticated?state.currentUser?.id:null;
  settingsCenter.loadedFor=owner;settingsCenter.preferences=null;settingsCenter.configuration=null;settingsCenter.business=null;
  settingsCenter.draft=null;settingsCenter.previewed=null;settingsCenter.invoiceSales=null;
  $$('[data-business-field],#adminContactEmail,#adminContactPhone').forEach(e=>{e.value='';});
  ['configurationAppData','configurationDialogBody','invoiceSelectedItems'].forEach(id=>{if($(id))$(id).replaceChildren();});
  if($('businessLogoPreview'))$('businessLogoPreview').src='./assets/brand/el-muelle-logo.png';
  if($('userLastAccess'))$('userLastAccess').textContent='Sin registro verificable';
  if($('configurationBackupData'))$('configurationBackupData').textContent='Información no cargada.';
  if($('configurationSaveBtn'))$('configurationSaveBtn').disabled=true;
  if($('saveUserSettingsBtn')){$('saveUserSettingsBtn').disabled=false;$('saveUserSettingsBtn').textContent='Guardar cambios';}
  if(!owner){delete document.body.dataset.uiAccent;return;}
  try {
    const prefs=await fetchJson('/api/preferences');if(version!==settingsCenter.loadVersion)return;
    settingsCenter.preferences=prefs;settingsCenter.draft={...prefs};applyPresentationPreferences();syncPreferenceControls();
    $('configurationSaveBtn').disabled=false;
    if(isAdminUser()) {const data=await fetchJson('/api/configuration');if(version!==settingsCenter.loadVersion)return;settingsCenter.configuration=data;settingsCenter.business={...data.business};renderConfigurationData();}
  }catch(error){if(version===settingsCenter.loadVersion){if($('configurationPending'))$('configurationPending').textContent=error.message;showToast('No se pudo recuperar la configuración.');}}
}
function renderConfigurationData() {
  const data=settingsCenter.configuration;if(!data)return;
  $$('[data-business-field]').forEach(e=>{e.value=settingsCenter.business[e.dataset.businessField]||'';});
  $('businessLogoPreview').src=settingsCenter.business.logo||'./assets/brand/el-muelle-logo.png';
  $('adminContactEmail').value=data.profile.email||'';$('adminContactPhone').value=data.profile.phone||'';
  $('userLastAccess').textContent=data.lastAccess?new Date(data.lastAccess).toLocaleString('es-MX',preferenceDateOptions()):'Sin registro verificable';
  $('configurationUserCount').textContent=state.settings.users.length;
  $('configurationAppData').innerHTML=Object.entries({Sistema:data.application.name,Versión:data.application.version,Entorno:data.application.environment,Estado:'Servidor disponible','Base de datos':data.application.database,'Inicio del servidor':new Date(data.application.startedAt).toLocaleString('es-MX',preferenceDateOptions())}).map(([k,v])=>`<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
  $('configurationBackupData').textContent=`${data.application.backupCount} respaldos automáticos disponibles. Último respaldo disponible: ${data.application.lastBackup||'aún no disponible'}.`+(data.backupStatus?.failed?' El último intento de respaldo falló. Las operaciones confirmadas se conservan; solicita revisión técnica.':'');
}
async function saveBusinessConfiguration(event) {
  event.preventDefault();if(!settingsCenter.business){showToast('Espera a que se recuperen los datos del negocio.');return;}const button=event.submitter;button.disabled=true;
  const version=settingsCenter.loadVersion;
  const next={...settingsCenter.business};$$('[data-business-field]').forEach(e=>{next[e.dataset.businessField]=e.value.trim();});
  try {const saved=await fetchJson('/api/configuration/business',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});if(version!==settingsCenter.loadVersion)return;settingsCenter.business=saved;settingsCenter.configuration.business=saved;renderConfigurationData();$('businessSaveStatus').textContent='Datos del negocio guardados.';$('fiscalSaveStatus').textContent='Datos fiscales guardados.';showToast('Datos del negocio guardados.','success');}
  catch(error){if(version===settingsCenter.loadVersion){$('businessSaveStatus').textContent=error.message;$('fiscalSaveStatus').textContent=error.message;showToast(error.message);}}
  finally{if(version===settingsCenter.loadVersion)button.disabled=false;}
}
function syncConfigurationSection(mode) {
  const definition=configurationSections[mode];if(!definition)return;
  $('settingsSectionTitle').textContent=definition[0];$('settingsSectionEyebrow').textContent=mode==='scale'?'Configuración del dispositivo':'Configuración del sistema';
  $('configurationSectionDescription').textContent=definition[2];$('configurationHeroIcon').innerHTML=configurationIcon(definition[3]);
  $('configurationSaveArea').hidden=!['general','appearance'].includes(mode);$('configurationUsersIndicator').hidden=mode!=='users';
}
function setConfigurationUserTab(key,focus=false) {
  if(key==='permissions'&&typeof loadPermissionEmployees==='function')loadPermissionEmployees();
  $$('[data-configuration-user-tab]').forEach(e=>{const selected=e.dataset.configurationUserTab===key;e.setAttribute('aria-selected',String(selected));e.tabIndex=selected?0:-1;if(selected&&focus)e.focus();});
  $$('[data-configuration-user-pane]').forEach(e=>{const entering=e.hidden&&e.dataset.configurationUserPane===key;e.hidden=e.dataset.configurationUserPane!==key;if(entering)animatePosFeedback(e,'navigation');});
  const save=document.querySelector('.users-settings-actions');
  if(save) {save.hidden=!['admin','employees'].includes(key);if(!save.hidden)$(key==='admin'?'configurationAdminActions':'configurationEmployeeActions').appendChild(save);}
}
function buildConfigurationCenter() {
  const motion=$('posMotionToggle');
  document.querySelector('.settings-subview-tabs').innerHTML=Object.entries(configurationSections).map(([key,[title,sub,,icon]])=>`<button id="settingsTab-${key}" type="button" role="tab" aria-selected="false" aria-controls="settingsPane-${key}" tabindex="-1" data-settings-mode-btn="${key}">${configurationIcon(icon)}<span>${title}<small>${sub}</small></span></button>`).join('');
  const head=document.querySelector('.settings-section-head');head.insertAdjacentHTML('afterbegin','<span id="configurationHeroIcon" class="configuration-hero-icon"></span>');head.querySelector('div').insertAdjacentHTML('beforeend','<p id="configurationSectionDescription"></p>');head.insertAdjacentHTML('beforeend','<div id="configurationSaveArea"><button id="configurationSaveBtn" class="quiet-btn" type="button">'+configurationIcon('save')+'Guardar cambios</button><small id="configurationPending" role="status">Cargando preferencias…</small></div><div id="configurationUsersIndicator" hidden><span>Usuarios totales</span><strong id="configurationUserCount">—</strong><small>Sistema activo · sesión verificada</small></div>');
  const appearance=preferenceSelect('theme','Tema visual',[['marine','Marino (predeterminado)']],'Único tema aprobado disponible.')+preferenceSelect('accent','Color de acento',[['gold','Dorado'],['sky','Celeste']])+preferenceSelect('interfaceMode','Modo de interfaz',[['light','Claro']],'Se conserva la interfaz clara aprobada.');
  $('settingsPane-general').innerHTML='<div class="configuration-general-grid">'+configurationCard('Opciones del sistema','power',preferenceToggle('confirmDrafts','Confirmar antes de eliminar','Confirmación al vaciar borradores; la seguridad siempre se conserva.')+preferenceToggle('sounds','Sonidos del sistema','Aviso breve al completar acciones reales.')+preferenceToggle('notifications','Notificaciones en pantalla','Avisos de éxito; los errores siempre se muestran.')+'<div class="configuration-option"><span><strong>Modo de pantalla completa</strong><small>Sesión de este navegador; requiere una acción del usuario.</small></span><button id="configurationFullscreenBtn" class="configuration-switch" type="button" aria-pressed="false" aria-label="Activar pantalla completa"></button></div><div class="configuration-option"><span><strong>Reducir movimiento</strong><small>Se aplica al instante y se conserva en este navegador.</small></span><div id="settingsMotionSlot" class="configuration-switch-slot"></div></div>','configuration-system-options')+configurationCard('Fecha y hora','clock',preferenceSelect('timeZone','Zona horaria',[['America/Mexico_City','Ciudad de México'],['America/Tijuana','Tijuana'],['America/Cancun','Cancún'],['UTC','UTC']])+preferenceSelect('dateFormat','Formato de fecha',[['short','26/10/2026'],['long','26 de octubre de 2026']])+preferenceSelect('hour12','Formato de hora',[['true','12 horas'],['false','24 horas']]))+configurationCard('Idioma y región','globe',preferenceSelect('locale','Idioma del sistema',[['es-MX','Español (México)']],'Otros idiomas no están traducidos.')+preferenceSelect('numberLocale','Formato de números',[['es-MX','1,234.56'],['es-ES','1.234,56']]))+configurationCard('Apariencia rápida','palette','<div id="configurationQuickAppearance"><p>El tema y el color de acento se editan en Apariencia para tu usuario.</p><button id="configurationQuickAppearanceLink" class="quiet-btn" type="button">Abrir Apariencia</button></div>','configuration-appearance-card')+configurationCard('Datos de la aplicación','file','<dl id="configurationAppData" class="configuration-data"></dl>')+'</div>';
  const generalGrid=document.querySelector('.configuration-general-grid'),generalCards=[...generalGrid.children];
  const generalColumns=[[generalCards[0],generalCards[3]],[generalCards[1],generalCards[2],generalCards[4]]].map(cards=>{const column=document.createElement('div');column.className='configuration-column';column.append(...cards);return column;});
  generalGrid.replaceChildren(...generalColumns);
  $('settingsMotionSlot').appendChild(motion);
  const businessFields=[['commercialName','Nombre comercial'],['email','Correo de contacto'],['phone','Teléfono'],['address','Dirección'],['businessName','Razón social']];
  document.querySelector('.settings-content').insertAdjacentHTML('beforeend',configurationPane('business',configurationCard('Información del negocio','store','<form id="configurationBusinessForm" class="configuration-form">'+businessFields.map(([key,label])=>`<label>${label}<input data-business-field="${key}" maxlength="${key==='address'?240:key==='businessName'?160:key==='commercialName'?100:key==='phone'?40:120}" ${key==='commercialName'?'required':''} ${key==='email'?'type="email"':'type="text"'} /></label>`).join('')+'<label>Logotipo · PNG, JPEG o WebP · máximo 256 KB<input id="businessLogoInput" type="file" accept="image/png,image/jpeg,image/webp" /></label><img id="businessLogoPreview" class="configuration-logo-preview" alt="Logotipo del negocio" /><button class="solid-btn" type="submit">Guardar negocio</button><p id="businessSaveStatus" role="status"></p></form>'))+configurationPane('fiscal',configurationCard('Datos fiscales del establecimiento','file','<form id="configurationFiscalForm" class="configuration-form">'+[['rfc','RFC',13],['postalCode','Código postal fiscal',5],['fiscalRegime','Régimen fiscal',10]].map(([key,label,max])=>`<label>${label}<input data-business-field="${key}" maxlength="${max}" /></label>`).join('')+'<p>La razón social se administra en Negocio. Estos datos pertenecen al establecimiento, no al receptor de cada solicitud.</p><button class="solid-btn" type="submit">Guardar datos fiscales</button><p id="fiscalSaveStatus" role="status"></p></form>')+configurationCard('Alcance fiscal','file','<p>Las solicitudes se guardan en el sistema. No existe integración con SAT/PAC, timbrado ni XML de solicitud con formato aprobado.</p><p><strong>Solicitud guardada ≠ CFDI emitido.</strong></p>'))+configurationPane('appearance',configurationCard('Apariencia de la interfaz','palette','<p>Preferencias visuales personales. No modifica fotografías ni dimensiones del catálogo.</p><div id="configurationAppearanceHome"><div id="configurationAppearanceControls">'+appearance+'</div></div>'))+configurationPane('peripherals',configurationCard('Impresión del navegador','printer','<p>El navegador permite elegir una impresora al imprimir. No ofrece detección ni estado verificable de impresoras desde esta aplicación.</p><button id="configurationPrintPreviewBtn" class="quiet-btn" type="button">Vista de prueba de impresión</button><p>Una vista previa no confirma que el papel se haya impreso.</p>'))+configurationPane('maintenance',configurationCard('Estado y respaldos','database','<p id="configurationBackupData">Cargando información…</p><p>Los respaldos automáticos existentes se conservan. Restauración y cambios de rutas requieren coordinación técnica.</p><button id="configurationIntegrityBtn" class="quiet-btn" type="button">Verificar integridad de SQLite</button><p id="configurationIntegrityStatus" role="status"></p>')));
  buildConfigurationUsers();initSettingsNavigation();setSettingsMode('general');
}

function buildConfigurationUsers() {
  const pane=$('settingsPane-users');const cards=[...pane.querySelectorAll('.users-settings-card')];const actions=pane.querySelector('.users-settings-actions');
  const pinFields=cards[0].querySelector('.users-pin-grid');pinFields.hidden=true;
  cards[0].querySelector('.users-card-head').innerHTML='<div><h4>Datos del administrador</h4><p>Información del acceso administrativo actual.</p></div>';
  cards[0].insertAdjacentHTML('beforeend','<div class="configuration-pin-summary"><span>'+configurationIcon('lock')+'PIN configurado · no recuperable</span><button id="configurationChangePinBtn" class="quiet-btn" type="button" aria-expanded="false">Cambiar PIN</button></div><label>Correo de contacto (opcional)<input id="adminContactEmail" type="email" maxlength="120" autocomplete="off" /></label><label>Teléfono (opcional)<input id="adminContactPhone" type="tel" maxlength="40" autocomplete="off" /></label><div id="configurationAdminActions"></div>');
  cards[0].querySelector('#configurationChangePinBtn').addEventListener('click',e=>{pinFields.hidden=!pinFields.hidden;e.currentTarget.setAttribute('aria-expanded',String(!pinFields.hidden));if(!pinFields.hidden)$('currentAdminPinInput').focus();});
  const tabLabels={admin:['Administrador','user'],employees:['Empleados / Encargados','users'],permissions:['Permisos','lock'],policy:['Política de PIN','lock']};
  pane.replaceChildren();pane.classList.add('configuration-users');
  pane.innerHTML='<div class="configuration-user-tabs atelier-tabs" role="tablist" aria-label="Gestión de usuarios">'+Object.entries(tabLabels).map(([k,[label,icon]])=>`<button id="configurationUserTab-${k}" type="button" role="tab" aria-selected="${k==='admin'}" aria-controls="configurationUserPane-${k}" tabindex="${k==='admin'?0:-1}" data-configuration-user-tab="${k}">${configurationIcon(icon)}${label}</button>`).join('')+'</div><section id="configurationUserPane-admin" class="configuration-user-grid" data-configuration-user-pane="admin" role="tabpanel" aria-labelledby="configurationUserTab-admin"><div id="configurationAdminFormHome"></div><div>'+configurationCard('Estado de cuenta','user','<dl class="configuration-data"><div><dt>Estado de la cuenta</dt><dd>Activa · sesión validada</dd></div><div><dt>Último acceso registrado</dt><dd id="userLastAccess">Sin registro verificable</dd></div><div><dt>Rol</dt><dd>Administrador</dd></div><div><dt>Permisos</dt><dd>Acceso administrativo según las reglas vigentes.</dd></div></dl>','configuration-account-card')+configurationCard('Opciones adicionales','power','<p>Los avisos de éxito se configuran para tu usuario en General. Los errores siempre se muestran.</p><button id="configurationNotificationsLink" class="quiet-btn" type="button">Ver notificaciones en General</button>'+'<button id="configurationAppearanceLink" class="quiet-btn" type="button">Ver apariencia del sistema</button>')+'</div></section><section id="configurationUserPane-employees" data-configuration-user-pane="employees" role="tabpanel" aria-labelledby="configurationUserTab-employees" hidden><div id="configurationEmployeesHome"></div><div id="configurationEmployeeActions"></div></section><section id="configurationUserPane-permissions" data-configuration-user-pane="permissions" role="tabpanel" aria-labelledby="configurationUserTab-permissions" hidden>'+configurationCard('Permisos efectivos','lock','<div class="table-scroll"><table><thead><tr><th>Capacidad</th><th>Administrador</th><th>Encargado</th></tr></thead><tbody><tr><td>POS, báscula, apertura y cierre de caja</td><td>Sí</td><td>Sí</td></tr><tr><td>Ventas</td><td>Todas</td><td>Propias</td></tr><tr><td>Datos fiscales y solicitudes</td><td>Administración</td><td>Sin acceso a datos fiscales privados</td></tr><tr><td>Productos, inventario y Resumen</td><td>Sí</td><td>No</td></tr><tr><td>Usuarios, configuración y auditoría</td><td>Sí</td><td>No</td></tr></tbody></table></div><p>Consulta de la política vigente. No se permite editar roles ni elevar privilegios desde esta pantalla.</p>')+'</section><section id="configurationUserPane-policy" data-configuration-user-pane="policy" role="tabpanel" aria-labelledby="configurationUserTab-policy" hidden>'+configurationCard('Política vigente de PIN','lock','<ul><li>Entre 6 y 12 dígitos numéricos.</li><li>El cambio del PIN administrador requiere el PIN actual y confirmación.</li><li>Cada empleado utiliza su propio PIN.</li><li>Los secretos se almacenan mediante scrypt con salt; no son recuperables.</li><li>Se conservan los límites de intentos y las sesiones existentes.</li></ul><p>Las reglas se consultan aquí y no son editables.</p>')+'</section>';
  $('configurationAdminFormHome').appendChild(cards[0]);$('configurationEmployeesHome').appendChild(cards[1]);$('configurationAdminActions').appendChild(actions);
  actions.insertAdjacentHTML('beforeend','<p id="configurationUserStatus" role="status"></p>');
  $('saveUserSettingsBtn').textContent='Guardar cambios';
  const tabs=$$('[data-configuration-user-tab]');tabs.forEach((e,i)=>{e.addEventListener('click',()=>setConfigurationUserTab(e.dataset.configurationUserTab));e.addEventListener('keydown',event=>{const n={ArrowRight:(i+1)%tabs.length,ArrowLeft:(i+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];if(n!==undefined){event.preventDefault();setConfigurationUserTab(tabs[n].dataset.configurationUserTab,true);}});});
  $('configurationNotificationsLink').addEventListener('click',()=>setSettingsMode('general'));
  $('configurationAppearanceLink').addEventListener('click',()=>setSettingsMode('appearance'));
  setConfigurationUserTab('admin');
}
function invoiceRequestState(sale) {return sale.invoice?.status==='solicitada'?['with','Con solicitud']:sale.invoice?.status==='pendiente_datos'?['with','Datos pendientes']:['without','Sin solicitud'];}
function selectedInvoiceSale() {return state.sales.find(s=>s.id===$('invoiceSaleId').value.trim());}
function invoiceFingerprint() {return JSON.stringify(['invoiceSaleId','invoiceRfc','invoiceName','invoiceZip','invoiceRegime','invoiceUse','invoiceEmail'].map(id=>$(id).value.trim()));}
function renderInvoiceDetails(options={}) {
  const sale=options.reset?null:selectedInvoiceSale();const summary=$('invoiceSaleSummary');
  summary.innerHTML=sale?`<span>Venta seleccionada</span><div><strong>${escapeHtml(sale.id)}</strong><b>${money(sale.total)}</b></div><p>${escapeHtml(new Date(sale.createdAt).toLocaleString('es-MX',preferenceDateOptions()))} · ${escapeHtml(getSaleStatus(sale))} · ${invoiceRequestState(sale)[1]}</p>`:'<span>Venta seleccionada</span><p>Selecciona un folio existente o una venta de la lista.</p>';
  $('invoiceSelectedItems').innerHTML=sale?'<div class="table-scroll"><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>'+(sale.items||[]).map(item=>`<tr><td>${escapeHtml(item.name||'Producto')}</td><td>${escapeHtml(quantityText(item.quantity,item.unit))}</td><td>${money(item.price)}</td><td>${money(item.total)}</td></tr>`).join('')+`</tbody><tfoot><tr><th colspan="3">Total</th><td>${money(sale.total)}</td></tr></tfoot></table></div>`:'<p class="invoice-empty">'+configurationIcon('file')+'<span>Selecciona una venta para mostrar los productos.<small>Busca un folio o elige un registro del periodo.</small></span></p>';
  const eligible=sale&&getSaleStatus(sale)!=='cancelada'&&sale.invoice?.status!=='solicitada';
  $('invoiceGenerateBtn').disabled=!eligible||!isAdminUser();$('invoicePreviewBtn').disabled=!sale;
  $('invoiceEligibility').textContent=!sale?'':getSaleStatus(sale)==='cancelada'?'La venta está cancelada.':sale.invoice?.status==='solicitada'?'La solicitud ya está registrada. Puedes consultar su vista previa.':'';
  if(!isAdminUser())$('invoiceEligibility').textContent='El registro de solicitudes requiere permisos de administrador.';
  updateInvoiceSteps();
}
function updateInvoiceSteps(active=null) {
  const complete=['invoiceRfc','invoiceName','invoiceZip','invoiceRegime','invoiceUse'].every(id=>$(id).value.trim());
  const step=active||(!selectedInvoiceSale()?1:complete?3:2);
  $$('[data-invoice-step]').forEach(e=>{if(Number(e.dataset.invoiceStep)===step)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});
}
function renderInvoiceSales(sales) {
  settingsCenter.invoiceSales=sales;
  const filter=settingsCenter.invoiceFilter;
  const shown=sales.filter(s=>filter==='all'||invoiceRequestState(s)[0]===filter);
  $('recentSalesList').innerHTML=shown.length?'<div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Folio</th><th>Total</th><th>Estado</th><th><span class="sr-only">Seleccionar</span></th></tr></thead><tbody>'+shown.map(s=>`<tr><td>${escapeHtml(new Date(s.createdAt).toLocaleString('es-MX',preferenceDateOptions()))}</td><td>${escapeHtml(s.id)}</td><td>${money(s.total)}</td><td><span class="status-badge ${s.invoice?.status==='solicitada'?'ok':''}">${escapeHtml(getSaleStatus(s)==='cancelada'?'Cancelada':invoiceRequestState(s)[1])}</span></td><td><button class="quiet-btn" type="button" data-invoice-select="${escapeHtml(s.id)}" aria-label="Consultar venta ${escapeHtml(s.id)}">${configurationIcon('eye')}</button></td></tr>`).join('')+'</tbody></table></div>':'<p class="empty-state">No hay ventas que coincidan con el periodo y estado seleccionados.</p>';
}
function chooseInvoiceSale(id) {
  const sale=state.sales.find(s=>s.id===id);if(!sale)return;$('invoiceSaleId').value=id;
  const c=sale.invoice?.customer||{};
  for(const [id,key] of Object.entries({invoiceRfc:'rfc',invoiceName:'businessName',invoiceZip:'fiscalZip',invoiceRegime:'fiscalRegime',invoiceUse:'cfdiUse',invoiceEmail:'email'}))$(id).value=c[key]||'';
  settingsCenter.previewed=null;renderInvoiceDetails();$('invoiceRfc').focus();
}
function validateInvoiceCapture() {
  const sale=selectedInvoiceSale();if(!sale)return 'Selecciona una venta existente.';
  if(getSaleStatus(sale)==='cancelada')return 'La venta está cancelada.';
  if(sale.invoice?.status==='solicitada')return 'Esta venta ya tiene una solicitud registrada.';
  if(!['invoiceRfc','invoiceName','invoiceZip','invoiceRegime','invoiceUse'].every(id=>$(id).value.trim()))return 'Faltan datos fiscales obligatorios.';
  if(!/^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/i.test($('invoiceRfc').value.trim())||!/^\d{5}$/.test($('invoiceZip').value.trim()))return 'El RFC o código postal fiscal no son válidos.';
  if($('invoiceEmail').value&&!$('invoiceEmail').checkValidity())return 'El correo electrónico no es válido.';
  return '';
}
function openConfigurationDialog(title,body,actions) {
  const modal=$('configurationDialog');$('configurationDialogTitle').textContent=title;$('configurationDialogBody').innerHTML=body;$('configurationDialogActions').replaceChildren(...actions);
  modal.classList.remove('hidden');modal.inert=false;modal.setAttribute('aria-hidden','false');settingsCenter.dialogFocus=document.activeElement;$('configurationDialogClose').focus();
}
function closeConfigurationDialog() {const modal=$('configurationDialog');modal.classList.add('hidden');modal.inert=true;modal.setAttribute('aria-hidden','true');settingsCenter.dialogFocus?.focus({preventScroll:true});}
function previewInvoiceRequest(forSave=false) {
  const sale=selectedInvoiceSale();if(!sale){showToast('Selecciona una venta existente.');return;}
  const error=forSave?validateInvoiceCapture():'';if(error){$('invoiceEligibility').textContent=error;showToast(error);return;}
  const customer=[['invoiceRfc','RFC'],['invoiceName','Nombre o razón social'],['invoiceZip','Código postal fiscal'],['invoiceRegime','Régimen fiscal'],['invoiceUse','Uso de CFDI'],['invoiceEmail','Correo']].map(([id,label])=>`<div><dt>${label}</dt><dd>${escapeHtml($(id).value||'Sin capturar')}</dd></div>`).join('');
  const buttons=[];
  if(forSave){const button=document.createElement('button');button.type='button';button.className='solid-btn';button.textContent='Confirmar y guardar solicitud';button.addEventListener('click',async()=>{if(settingsCenter.invoiceSaving)return;settingsCenter.previewed=invoiceFingerprint();settingsCenter.invoiceSaving=true;button.disabled=true;try{await saveInvoiceRequest({preventDefault(){}});}finally{settingsCenter.invoiceSaving=false;button.disabled=false;}});buttons.push(button);}
  openConfigurationDialog('Revisar solicitud',`<p><strong>${escapeHtml(sale.id)}</strong> · ${money(sale.total)}</p><dl class="configuration-data">${customer}</dl>${$('invoiceSelectedItems').innerHTML}<p>Se guardará una solicitud. No se emitirá ni timbrará un CFDI, ni se generará XML fiscal.</p>`,buttons);updateInvoiceSteps(3);
}
function reviewInvoiceRequest() {if(settingsCenter.previewed===invoiceFingerprint()&&settingsCenter.invoiceSaving)return true;previewInvoiceRequest(true);return false;}
function completeInvoiceReview() {settingsCenter.previewed=null;closeConfigurationDialog();$('invoiceSaleId').value='';renderInvoiceDetails({reset:true});updateInvoiceSteps(4);}
function buildInvoiceCenter() {
  const form=$('invoiceForm'),recent=document.querySelector('.billing-recent-panel');
  const fiscalIds=['invoiceRfc','invoiceName','invoiceZip','invoiceRegime','invoiceUse','invoiceEmail'];const fields=fiscalIds.map(id=>$(id).closest('label'));
  const picker=form.querySelector('.billing-sale-picker'),summary=$('invoiceSaleSummary');const note=document.querySelector('.billing-fiscal-note');
  form.replaceChildren();form.classList.add('invoice-complete-form');
  form.innerHTML='<section class="invoice-stage-card"><header class="invoice-marine-head">'+configurationIcon('file')+'<div><h3>Nueva solicitud de factura</h3><p>Relaciona una venta con el cliente fiscal y registra su solicitud.</p></div></header><ol class="invoice-steps">'+['Venta','Cliente','Revisar','Solicitar'].map((label,i)=>`<li data-invoice-step="${i+1}"><b>${i+1}</b>${label}</li>`).join('')+'</ol><div id="invoicePickerHome"></div></section><section class="invoice-stage-card"><h4>'+configurationIcon('user')+'Datos del cliente fiscal</h4><div id="invoiceFiscalFields" class="invoice-fiscal-grid"></div></section><section class="invoice-stage-card"><div class="invoice-selected-title"><h4>'+configurationIcon('file')+'Venta seleccionada</h4><button id="invoiceClearSelectionBtn" class="quiet-btn" type="button">Limpiar selección</button></div><div id="invoiceSummaryHome"></div><div id="invoiceSelectedItems"></div><p id="invoiceEligibility" role="status"></p></section>';
  $('invoicePickerHome').appendChild(picker);fields.forEach(e=>$('invoiceFiscalFields').appendChild(e));$('invoiceSummaryHome').appendChild(summary);
  $('invoiceSaleId').placeholder='Buscar venta por folio…';picker.querySelector('label').insertAdjacentHTML('afterbegin','<span class="sr-only">Venta / folio</span>');
  const actions=document.createElement('section');actions.className='invoice-stage-card invoice-actions-card';actions.innerHTML='<h4>'+configurationIcon('power')+'Acciones</h4><div class="invoice-action-buttons"><button id="invoicePreviewBtn" class="quiet-btn" type="button">'+configurationIcon('eye')+'Vista previa</button><button id="invoiceGenerateBtn" class="solid-btn" type="submit" form="invoiceForm">'+configurationIcon('file')+'Generar solicitud</button></div><p class="invoice-scope-note">La solicitud se guarda para su gestión posterior. No genera XML ni emite CFDI.</p>';recent.after(actions);actions.appendChild(note);
  const right=document.createElement('div');right.className='invoice-right-column';recent.before(right);right.append(recent,actions);
  for(const [id,label] of [['recentSalesPeriodFilter','Periodo'],['recentSalesDateInput','Fecha']]) {const input=$(id),wrapper=document.createElement('label');wrapper.className='invoice-filter-field';wrapper.textContent=label;input.before(wrapper);wrapper.appendChild(input);}
  recent.querySelector('h3').insertAdjacentHTML('afterbegin',configurationIcon('list'));
  const filters=document.createElement('div');filters.className='invoice-status-filters';filters.setAttribute('aria-label','Estado de solicitud');filters.innerHTML=[['all','Todas'],['with','Con solicitud'],['without','Sin solicitud']].map(([v,label])=>`<button class="quiet-btn" type="button" data-invoice-filter="${v}" aria-pressed="${v==='all'}">${label}</button>`).join('');recent.querySelector('.panel-head').after(filters);$('recentSalesList').classList.add('invoice-sales-table');
  document.querySelector('.billing-layout').classList.add('billing-complete');recent.classList.add('invoice-stage-card');
  $('invoicePreviewBtn').addEventListener('click',()=>previewInvoiceRequest());$('invoiceClearSelectionBtn').addEventListener('click',()=>{form.reset();$('invoiceSaleId').value='';settingsCenter.previewed=null;renderInvoiceDetails({reset:true});});
  form.addEventListener('input',()=>{settingsCenter.previewed=null;updateInvoiceSteps();});
  filters.addEventListener('click',e=>{const button=e.target.closest('[data-invoice-filter]');if(!button)return;settingsCenter.invoiceFilter=button.dataset.invoiceFilter;$$('[data-invoice-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(settingsCenter.invoiceSales)renderInvoiceSales(settingsCenter.invoiceSales);});
  $('recentSalesList').addEventListener('click',e=>{const b=e.target.closest('[data-invoice-select]');if(b)chooseInvoiceSale(b.dataset.invoiceSelect);});
  $('selectInvoiceSaleBtn').addEventListener('click',()=>{const search=$('invoiceSaleId').value.trim().toLocaleLowerCase('es-MX');const matches=state.sales.filter(s=>s.id.toLocaleLowerCase('es-MX').includes(search));if(search&&matches.length===1)chooseInvoiceSale(matches[0].id);else if(search){renderInvoiceSales(matches);$('invoiceEligibility').textContent=matches.length?`${matches.length} coincidencias. Selecciona un registro en Ventas y solicitudes.`:'No se encontró ese folio.';}});
  renderInvoiceDetails();
}
function initSettingsCenter() {
  if(initSettingsCenter.ready)return;initSettingsCenter.ready=true;
  buildConfigurationCenter();buildInvoiceCenter();syncDevicePreferencesAccess();
  $('configurationQuickAppearanceLink').addEventListener('click',()=>setSettingsMode('appearance'));
  $('configurationQuickAppearance').insertAdjacentHTML('beforeend','<img class="configuration-theme-preview" src="./assets/pos/atelier-login-panorama.webp" alt="Vista del tema marino" />');
  $('configurationSaveArea').insertAdjacentHTML('beforeend','<button id="configurationRecoverBtn" class="quiet-btn" type="button">Recuperar preferencias</button>');
  $('configurationRecoverBtn').addEventListener('click',()=>{if(settingsCenter.draft&&JSON.stringify(settingsCenter.draft)!==JSON.stringify(settingsCenter.preferences)&&settingsCenter.preferences?.confirmDrafts!==false&&!window.confirm('¿Descartar los cambios sin guardar y recuperar las preferencias guardadas?'))return;recoverPresentationPreferences();});
  document.body.insertAdjacentHTML('beforeend','<div id="configurationDialog" class="modal hidden" role="dialog" aria-modal="true" aria-hidden="true" inert aria-labelledby="configurationDialogTitle"><section class="modal-card configuration-dialog-card"><div class="modal-head"><h3 id="configurationDialogTitle"></h3><button id="configurationDialogClose" class="icon-btn" type="button" aria-label="Cerrar">×</button></div><div id="configurationDialogBody"></div><div id="configurationDialogActions" class="modal-actions"></div></section></div>');
  $('configurationDialogClose').addEventListener('click',closeConfigurationDialog);$('configurationDialog').addEventListener('click',e=>{if(e.target===$('configurationDialog'))closeConfigurationDialog();});
  $('configurationDialog').addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeConfigurationDialog();}if(e.key==='Tab'){const nodes=[...e.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(n=>n.getBoundingClientRect().width);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  $$('[data-ui-preference]').forEach(e=>e.addEventListener('change',()=>{if(!settingsCenter.draft)return;let value=e.type==='checkbox'?e.checked:e.value;if(e.dataset.uiPreference==='hour12')value=value==='true';settingsCenter.draft[e.dataset.uiPreference]=value;syncPreferenceControls();if(e.closest('#configurationUserPane-admin'))savePresentationPreferences();}));
  $('configurationSaveBtn').addEventListener('click',savePresentationPreferences);
  $('configurationBusinessForm').addEventListener('submit',saveBusinessConfiguration);$('configurationFiscalForm').addEventListener('submit',saveBusinessConfiguration);
  $$('[data-business-field]').forEach(e=>e.addEventListener('input',()=>{$('businessSaveStatus').textContent='Cambios sin guardar.';$('fiscalSaveStatus').textContent='Cambios sin guardar.';}));
  $('businessLogoInput').addEventListener('change',async e=>{const file=e.target.files[0],version=settingsCenter.loadVersion;if(!file||!settingsCenter.business)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>262144)throw Error('Usa una imagen PNG, JPEG o WebP de hasta 256 KB.');const bitmap=await createImageBitmap(file);const valid=bitmap.width<=2048&&bitmap.height<=2048;bitmap.close();if(!valid)throw Error('El logotipo debe medir como máximo 2048 × 2048 px.');const value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});if(version!==settingsCenter.loadVersion)return;settingsCenter.business.logo=value;$('businessLogoPreview').src=value;$('businessSaveStatus').textContent='Logotipo listo. Guarda los datos del negocio para conservarlo.';}catch(error){if(version===settingsCenter.loadVersion){showToast(error.message||'No se pudo leer el logotipo.');e.target.value='';}}});
  $('configurationIntegrityBtn').addEventListener('click',async e=>{const button=e.currentTarget,version=settingsCenter.loadVersion;button.disabled=true;try{const r=await fetchJson('/api/configuration/integrity');if(version!==settingsCenter.loadVersion)return;$('configurationIntegrityStatus').textContent=r.ok?'Verificación de integridad: correcta.':'SQLite reportó una inconsistencia. Solicita revisión técnica.';}catch(error){if(version===settingsCenter.loadVersion)$('configurationIntegrityStatus').textContent=error.message;}finally{button.disabled=false;}});
  $('configurationPrintPreviewBtn').addEventListener('click',()=>{const button=document.createElement('button');button.type='button';button.className='solid-btn';button.textContent='Abrir impresión del navegador';button.addEventListener('click',()=>{$('printArea').innerHTML='<section><h1>Prueba de impresión · El Muelle POS</h1><p>Documento de prueba. Sin operación comercial.</p></section>';window.print();});openConfigurationDialog('Prueba de impresión','<p>Esta vista comprueba la preparación del documento. La impresora y el resultado físico se verifican fuera de la aplicación.</p>',[button]);});
  const fullscreen=$('configurationFullscreenBtn');fullscreen.disabled=!document.fullscreenEnabled;fullscreen.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{showToast('El navegador no permitió activar pantalla completa.');}});document.addEventListener('fullscreenchange',()=>{fullscreen.setAttribute('aria-pressed',String(Boolean(document.fullscreenElement)));fullscreen.setAttribute('aria-label',document.fullscreenElement?'Salir de pantalla completa':'Activar pantalla completa');});
  window.addEventListener('elmuelle:session',()=>{if(settingsCenter.loadedFor!==(state.sessionAuthenticated?state.currentUser?.id:null)){if(!$('configurationDialog').classList.contains('hidden'))closeConfigurationDialog();loadConfigurationContext();}});
  loadConfigurationContext();
}
if (init.ready) initSettingsCenter();
