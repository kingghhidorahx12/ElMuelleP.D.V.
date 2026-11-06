(()=>{'use strict';
 const chapters=[
  {id:'dashboard',name:'Resumen del negocio',view:'dashboard',text:'Revisa cómo va tu negocio. El periodo de arriba se aplica a los indicadores y a los paneles que usan el periodo general.'},
  {id:'pos',name:'Punto de Venta',view:'pos',text:'Busca el producto, revisa su cantidad o peso y agrégalo a Venta actual. El cobro se registra al confirmarlo; para vender necesitas abrir caja y tener existencias.',extras:[['#sidebarToggleBtn','Menú lateral','Oculta o muestra el menú para ganar espacio. Puedes volver a cualquier pantalla desde aquí.'],['#ticketToggleBtn','Venta actual','Abre o cierra el ticket. Revisa cantidades, total y forma de pago antes de confirmar el cobro.'],['#connectScaleBtn,.scale-card','Báscula y equipos','Conecta y configura tu equipo USB OTG desde Configuración. Usa solamente un peso válido. La captura manual pide autorización y un motivo.']]},
  {id:'sales',name:'Ventas',view:'sales',text:'Busca por fecha o folio y selecciona una venta para consultar sus productos y pagos. Cancelar una venta es una operación real y requiere los permisos correspondientes.'},
  {id:'products',name:'Productos',view:'products',text:'Aquí están los nombres, códigos, categorías, precios y fotografías. Nuevo producto y Editar abren el formulario; guardar aplica los cambios. Las existencias se cambian desde Inventario.',extras:[['#productsView .products-toolbar,#productsView .product-admin-tools,#productsView','Buscar, crear y editar','Usa el buscador y la categoría para encontrar un producto. Conserva su tipo de venta: por kilo o por pieza. Puedes cambiar o quitar su fotografía antes de guardar.']]},
  {id:'stock',name:'Inventario · Existencias',view:'inventory',inventory:'stock',text:'Revisa las existencias y los avisos de cada producto. El saldo cero de arranque es administrativo: no afirma que ya se haya contado físicamente la mercancía.'},
  {id:'receipt',name:'Inventario · Entrada',view:'inventory',inventory:'entry',movement:'receipt',text:'Usa Entrada para registrar mercancía que realmente llegó: producto, cantidad, costo y motivo. Los datos sólo se aplican al confirmar. Este recorrido no registrará ninguna entrada.'},
  {id:'adjustment',name:'Inventario · Ajuste',view:'inventory',inventory:'entry',movement:'adjustment',text:'Después de contar la mercancía, usa Ajuste para indicar la existencia que debe quedar y explicar la diferencia. No es una compra ni una venta.'},
  {id:'waste',name:'Inventario · Merma',view:'inventory',inventory:'entry',movement:'waste',text:'Registra la mercancía que ya no puede venderse y explica el motivo. La merma descuenta existencias cuando la confirmas.'},
  {id:'inventory-history',name:'Inventario · Historial',view:'inventory',inventory:'history',text:'Busca los movimientos por producto, fecha y tipo. El historial permite revisar qué cambió, por qué y quién lo registró.'},
  ...[['current','Caja actual'],['movements','Entradas y retiros'],['count','Conteo y cierre'],['history','Historial de cajas']].map(([cash,name])=>({id:'cash-'+cash,name:'Caja · '+name,view:'reports',reports:'cash',cash,text:{current:'Consulta el estado de la caja y el efectivo esperado. Para abrirla, cuenta el fondo real y confirma su importe.',movements:'Las entradas y retiros cambian el efectivo de caja, no las existencias. Captura el importe real y su motivo.',count:'Cuenta el efectivo real y compáralo con el esperado. Revisa la diferencia antes de confirmar el cierre.',history:'Consulta las cajas cerradas y sus cortes. Abrir este historial no cambia las operaciones.'}[cash]})),
  {id:'billing',name:'Solicitudes de factura',view:'billing',text:'Selecciona una venta, copia los datos fiscales del cliente y revisa la solicitud. Guardar una solicitud no emite ni timbra un CFDI.'},
  ...[['sales','Ventas'],['products','Productos vendidos'],['inventory','Inventario']].map(([reportType,name])=>({id:'report-'+reportType,name:'Reportes · '+name,view:'reports',reports:'reports',reportType,text:'Elige el periodo y actualiza para consultar resultados. Puedes exportar o imprimir cuando haya datos. El reporte de inventario muestra las existencias actuales.'})),
  ...[['general','General'],['business','Negocio'],['scale','Báscula'],['users','Usuarios y PIN'],['peripherals','Periféricos'],['fiscal','Facturación'],['appearance','Apariencia'],['audit','Auditoría'],['maintenance','Mantenimiento']].map(([settings,name])=>({id:'settings-'+settings,name:'Configuración · '+name,view:'settings',settings,text:{general:'Ajusta avisos, presentación y formas de pago. Una forma de pago desactivada se oculta en el cobro. Puedes volver a abrir este recorrido desde aquí.',business:'Edita la información del establecimiento que aparece en tickets y reportes. Los cambios se aplican al guardar.',scale:'Configura el dispositivo y comprueba su lectura antes de vender por peso. La compatibilidad definitiva requiere probar la báscula real conectada por OTG.',users:'Cada persona debe usar su propio acceso. Protege el PIN del administrador y revisa los permisos de cada empleado.',peripherals:'Configura tu impresora USB o Bluetooth desde Equipos y respaldos en el menú de Android. Una vista previa no demuestra que el papel se haya impreso.',fiscal:'Configura los datos fiscales del establecimiento. Son distintos de los datos del cliente que solicita una factura.',appearance:'Elige las opciones visuales disponibles para tu usuario. No modifica los productos ni las operaciones.',audit:'Consulta las acciones registradas para revisar cambios y responsabilidades. No compartas información privada de esta pantalla.',maintenance:'Consulta el estado del sistema. Desde Equipos y respaldos, crea una copia cifrada y verifica su recuperación en una carpeta aislada. Conserva su contraseña por separado.'}[settings]})),
  ...[['employees','Empleados'],['permissions','Permisos'],['pin','Política de PIN']].map(([usersTab,name])=>({id:'users-'+usersTab,name:'Usuarios · '+name,view:'settings',settings:'users',usersTab,text:{employees:'Crea una cuenta individual para cada empleado y revisa sus permisos antes de darle acceso.',permissions:'Asigna a cada empleado sólo las pantallas y funciones que necesita. Los costos y otras funciones administrativas siguen protegidos por su rol.',pin:'Cada persona tiene un PIN de 6 a 12 números. No lo compartas. Para cambiar el del administrador necesitas su PIN actual.'}[usersTab]})),
  {id:'support',name:'Ayuda y buzón',view:'settings',settings:'general',text:'Los iconos de ayuda explican cada panel. Para abrir el buzón, pulsa tu nombre arriba a la derecha y elige Buzón. Puedes registrar un Error, una Sugerencia o una Queja. Las capturas son opcionales y requieren tu autorización.',extras:[['#sessionUserName','Tu cuenta y el buzón','Pulsa tu nombre y elige Buzón. Describe qué estabas haciendo sin incluir PIN, claves ni datos privados. Conserva el folio para consultar las respuestas. El envío remoto necesita conexión y enlace de soporte activo.']]}
 ];
 const memory=new Map();let owner=null,active=false,chapterIndex=0,stepIndex=0,resumeStep=0,steps=[],snapshot=null,busy=false,epoch=0,dialog,card,spot;
 const admin=()=>typeof state!=='undefined'&&state.sessionAuthenticated&&!state.employeeLoginRequired&&state.currentUser?.role==='admin';
 const key=()=>admin()?'elmuelle.android.adminTour.v1.'+state.currentUser.id:null;
 function load(){if(!admin())return null;if(memory.has(key()))return memory.get(key());const value=AndroidTourStore.read(state.currentUser.id);memory.set(key(),value);return value;}
 function save(status){const value={status,chapter:chapterIndex,step:stepIndex<0?resumeStep:stepIndex};memory.set(key(),value);AndroidTourStore.write(state.currentUser.id,value);}
 const valid=()=>active&&admin()&&state.currentUser.id===owner;
 const visible=el=>el?.isConnected&&!el.closest('[hidden],.hidden')&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
 function build(){
  if(dialog)return;dialog=document.createElement('dialog');dialog.id='androidAdminTour';dialog.setAttribute('aria-labelledby','androidTourTitle');
  dialog.innerHTML='<div class="android-tour-spot" aria-hidden="true"></div><section class="android-tour-card"><small id="androidTourProgress"></small><h2 id="androidTourTitle"></h2><select id="androidTourChapters" aria-label="Ir a una sección"></select><p id="androidTourDescription"></p><div class="android-tour-actions"><button type="button" data-tour-later>Más tarde</button><button type="button" data-tour-back>Anterior</button><button type="button" data-tour-next>Siguiente</button><button type="button" data-tour-skip>Omitir recorrido</button></div></section>';
  document.body.append(dialog);spot=dialog.querySelector('.android-tour-spot');card=dialog.querySelector('.android-tour-card');
  const list=dialog.querySelector('select');for(const [i,c]of chapters.entries()){const option=document.createElement('option');option.value=i;option.textContent=c.name;list.append(option);}
  list.addEventListener('change',()=>go(Number(list.value),0));
  dialog.querySelector('[data-tour-next]').addEventListener('click',()=>{if(stepIndex<0)go(chapterIndex,resumeStep);else if(stepIndex+1<steps.length){stepIndex++;render();save('active');}else if(chapterIndex+1<chapters.length)go(chapterIndex+1,0);else stop('completed');});
  dialog.querySelector('[data-tour-back]').addEventListener('click',()=>{if(stepIndex>0){stepIndex--;render();save('active');}else if(chapterIndex>0)go(chapterIndex-1,0);});
  dialog.querySelector('[data-tour-later]').addEventListener('click',()=>stop('paused'));
  dialog.querySelector('[data-tour-skip]').addEventListener('click',()=>stop('dismissed'));
  dialog.addEventListener('cancel',event=>{event.preventDefault();stop('paused');});
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  window.addEventListener('resize',()=>{if(valid())position();});
 }
 function position(){
  const scale=Math.min(1.8,Math.max(1,1/(parent.androidDesktopGeometry?.scale||1)));dialog.style.setProperty('--tour-scale',scale);
  const target=steps[stepIndex]?.target;
  const r=visible(target)?target.getBoundingClientRect():null;
  if(r){Object.assign(spot.style,{display:'block',left:Math.max(2,r.left-5)+'px',top:Math.max(2,r.top-5)+'px',width:Math.min(innerWidth-4,r.width+10)+'px',height:Math.min(innerHeight-4,r.height+10)+'px'});}
  else Object.assign(spot.style,{display:'block',left:'0px',top:'0px',width:'0px',height:'0px'});
  const bounds=card.getBoundingClientRect(),pad=12;
  let x=innerWidth-bounds.width-pad,y=innerHeight-bounds.height-pad;
  if(r){if(r.right+pad+bounds.width<innerWidth)x=r.right+pad;else if(r.left-bounds.width-pad>0)x=r.left-bounds.width-pad;if(r.top>bounds.height+pad)y=pad;}
  card.style.left=Math.max(pad,x)+'px';card.style.top=Math.max(pad,y)+'px';
 }
 function render(){
  if(!valid())return;const step=steps[stepIndex];
  dialog.querySelector('#androidTourTitle').textContent=step.title;
  dialog.querySelector('#androidTourDescription').textContent=step.text;
  card.scrollTop=0;
  dialog.querySelector('#androidTourProgress').textContent='Guía del administrador · '+(chapterIndex+1)+' / '+chapters.length+' · Panel '+(stepIndex+1)+' de '+steps.length;
  dialog.querySelector('select').value=chapterIndex;
  dialog.querySelector('[data-tour-back]').hidden=chapterIndex===0&&stepIndex<=0;
  dialog.querySelector('[data-tour-next]').textContent=stepIndex===steps.length-1&&chapterIndex===chapters.length-1?'Terminar':'Siguiente';
  step.target?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  requestAnimationFrame(position);
 }
 function description(button){
  const special={'settings-printer':'En Android configura una impresora USB o Bluetooth compatible desde Equipos y respaldos. La impresión real se acredita revisando el papel, no sólo la vista previa.','settings-maintenance':'Crea un respaldo cifrado desde Equipos y respaldos. Puedes comprobar la recuperación en una carpeta aislada antes de usarlo. El original se conserva.','settings-port':'Abre Equipos y respaldos para elegir tu dispositivo USB OTG y su perfil. La compatibilidad depende del modelo y del formato que envía.','settings-permissions':'Selecciona un empleado y revisa los permisos que tendrá. Guarda sólo cuando estés seguro de los cambios. Este recorrido no modifica sus accesos.'};
  return special[button.dataset.contextHelp]||(typeof panelHelpText==='function'?panelHelpText(button):'')||(typeof contextHelpText==='function'?contextHelpText(button):'');
 }
 async function go(index,panel){
  if(!valid()||busy)return;busy=true;const version=++epoch;
  try{
   chapterIndex=Math.max(0,Math.min(chapters.length-1,index));const c=chapters[chapterIndex];
   setView(c.view);if(c.reports)setReportsMode(c.reports);if(c.cash)setCashTab(c.cash);
   if(c.inventory)setInventoryMode(c.inventory);if(c.movement)setInventoryMovementMode(c.movement);
   if(c.settings)setSettingsMode(c.settings);if(c.usersTab)setConfigurationUserTab(c.usersTab);
   if(c.reportType){const tab=document.querySelector('[data-report-type="'+c.reportType+'"]');tab?.click();}
   await new Promise(resolve=>setTimeout(resolve,180));if(!valid()||version!==epoch)return;
   if(typeof enhancePanelHelp==='function')enhancePanelHelp();
   steps=[{title:c.name,text:c.text,target:document.querySelector('.app-view.active')}];
   const root=c.settings?document.getElementById('settingsPane-'+c.settings):document.getElementById(c.view+'View');
   const candidates=[...(root?.querySelectorAll('[data-context-help]')||[])];
   if(c.view==='pos')candidates.push(...document.querySelectorAll('#currentSalePanel [data-context-help],.pos-layout [data-context-help]'));
   const seen=new Set();for(const button of candidates){if(!visible(button)||button.dataset.contextHelp==='page')continue;
    const text=description(button);if(!text||seen.has(text))continue;seen.add(text);
    const heading=button.closest('h3,h4,h5');const title=(heading?.textContent||button.getAttribute('aria-label')||c.name).replace(/^Ayuda:?\s*/,'').trim();
    steps.push({title,text,target:heading?.closest('.dashboard-card,.work-panel,.inner-panel,.configuration-card,.detail-panel,.ticket-panel')||heading||button});
   }
   for(const [selector,title,text]of c.extras||[]){const target=[...document.querySelectorAll(selector)].find(visible);if(target)steps.push({title,text,target});}
   stepIndex=Math.max(0,Math.min(panel,steps.length-1));save('active');render();
  }finally{busy=false;}
 }
 function start(resume=false){
  if(!admin()||active)return false;
  const settingsMode=document.querySelector('.settings-layout')?.dataset.settingsMode;
  const draft=typeof settingsCenter!=='undefined'&&settingsCenter.draft&&settingsCenter.preferences&&JSON.stringify(settingsCenter.draft)!==JSON.stringify(settingsCenter.preferences);
  if(document.querySelector('dialog[open]')||state.ticket?.length||state.selectedProduct||draft||(state.activeView==='inventory'&&document.querySelector('.inventory-management-layout')?.dataset.inventoryMode==='entry')||(state.activeView==='settings'&&settingsMode!=='general')){showToast('Guarda lo que estás haciendo y abre el recorrido desde Configuración → General.');return false;}
  build();snapshot={view:state.activeView,reports:state.reportsMode,settings:settingsMode,inventory:document.querySelector('.inventory-management-layout')?.dataset.inventoryMode,movement:state.inventoryMovementMode,sidebar:state.sidebarCollapsed,ticket:state.ticketCollapsed,reportType:document.getElementById('reportTypeFilter')?.value,cash:document.querySelector('[data-cash-tab][aria-selected="true"]')?.dataset.cashTab,usersTab:document.querySelector('[data-configuration-user-tab][aria-selected="true"]')?.dataset.configurationUserTab};
  owner=state.currentUser.id;active=true;const previous=resume?load():null;chapterIndex=previous?.chapter||0;resumeStep=Math.max(0,previous?.step||0);stepIndex=-1;
  dialog.showModal();dialog.querySelector('select').hidden=true;dialog.querySelector('[data-tour-back]').hidden=true;
  dialog.querySelector('#androidTourProgress').textContent='Bienvenido a El Muelle PDV';dialog.querySelector('#androidTourTitle').textContent='Conoce tu punto de venta';
  dialog.querySelector('#androidTourDescription').textContent='Te mostraremos dónde está cada función. No haremos ventas ni cambiaremos tus datos. Puedes elegir una sección, pausar y continuar después desde Configuración → General.';
  dialog.querySelector('[data-tour-next]').textContent=previous?'Continuar':'Empezar';steps=[];requestAnimationFrame(position);
  dialog.querySelector('[data-tour-next]').addEventListener('click',()=>{dialog.querySelector('select').hidden=false;},{once:true});
  save('offered');return true;
 }
 function stop(status){
  if(!active)return;const allowed=valid();if(allowed)save(status);active=false;epoch++;busy=false;dialog?.close();
  if(allowed&&snapshot){setView(snapshot.view);if(snapshot.reports)setReportsMode(snapshot.reports);if(snapshot.settings)setSettingsMode(snapshot.settings);if(snapshot.inventory)setInventoryMode(snapshot.inventory);if(snapshot.movement)setInventoryMovementMode(snapshot.movement);if(snapshot.cash)setCashTab(snapshot.cash);if(snapshot.usersTab)setConfigurationUserTab(snapshot.usersTab);if(snapshot.reportType)document.querySelector('[data-report-type="'+snapshot.reportType+'"]')?.click();state.sidebarCollapsed=snapshot.sidebar;state.ticketCollapsed=snapshot.ticket;updateShellState();}
  snapshot=null;
 }
 function installLauncher(){
  const home=document.getElementById('settingsPane-general');if(!home||document.getElementById('androidTourReplay'))return;
  const button=document.createElement('button');button.type='button';button.id='androidTourReplay';button.className='quiet-btn android-tour-replay';button.textContent='Recorrido guiado del administrador';button.addEventListener('click',()=>{const record=load();start(Boolean(record&&!['completed','dismissed'].includes(record.status)));});
  home.prepend(button);
 }
 setInterval(()=>{
  if(!admin()){document.getElementById('androidTourReplay')?.setAttribute('hidden','');if(active)stop('paused');return;}if(active&&state.currentUser.id!==owner){stop('paused');return;}
  installLauncher();document.getElementById('androidTourReplay')?.removeAttribute('hidden');if(!active&&!load()&&typeof init==='function'&&init.ready&&!start(false))save('paused');
 },750);
 window.ElMuelleTour={start,chapters:chapters.map(({id,name})=>({id,name})),get active(){return active;}};
})();
