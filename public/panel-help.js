// Ayudas de uso: no consultan datos ni conceden permisos.
const panelHelpDescriptions={
  'settings-payments':'Activa las formas de pago que aceptas en tu negocio y guarda los cambios. Se aplican a todas las cajas. Activar Tarjeta permite registrar ese pago; no conecta una terminal bancaria.',
  'pos-catalog':'Busca un producto por nombre o código y selecciónalo. Puedes filtrar por categoría o ver tus favoritos. Elegirlo todavía no registra una venta.',
  'pos-ticket':'Aquí se reúne lo que vas a vender. Revisa cantidades y total antes de cobrar. Puedes corregir el ticket; la venta se guarda cuando el cobro queda confirmado.',
  'pos-weight':'Si vendes por kilo, revisa el peso de la báscula. Si necesitas escribirlo, usa la captura manual y solicita autorización. Agregar al ticket todavía no cobra.',
  'pos-piece':'Escribe cuántas piezas vas a vender. Debe ser un número entero y no superar las existencias disponibles, incluyendo lo que ya agregaste al ticket.',
  'product-projection':'Estos importes te ayudan a revisar el inventario del producto. La información de costos y ganancia sólo está disponible para administración.',
  'inventory-stock':'Consulta cuánto hay de cada producto. “Sin verificar” significa que falta contar sus existencias; no equivale a cero. Los cambios se registran con su motivo.',
  'inventory-activity':'Aquí aparecen los movimientos recientes de mercancía. Abre el historial para buscar por producto, fecha o tipo de movimiento.',
  'inventory-projection':'Revisa cómo quedaría el inventario con los datos que estás capturando. Es una vista previa: las existencias cambian cuando confirmas el movimiento.',
  'inventory-top':'Muestra los productos destacados según las ventas disponibles. Las cantidades conservan su unidad: kilos y piezas no se suman como si fueran lo mismo.',
  'inventory-slow':'Te ayuda a identificar productos con poco movimiento en las ventas consultadas. Revisa el periodo y las existencias antes de tomar una decisión.',
  'movement-receipt':'Registra mercancía que llegó al negocio. Elige un producto o crea uno nuevo, captura cantidad, costo y motivo, y confirma la entrada. Si falta el conteo inicial, regístralo primero.',
  'movement-adjustment':'Corrige la existencia después de contar la mercancía. Escribe la cantidad que debe quedar y explica la diferencia. No es una compra nueva.',
  'movement-waste':'Registra mercancía que ya no se puede vender. Escribe cuánto vas a retirar y por qué. La cantidad se descuenta al confirmar la merma.',
  'billing-start':'Primero selecciona la venta que necesita factura. Después completa los datos del cliente y revisa la solicitud antes de guardarla.',
  'billing-customer':'Copia los datos tal como aparecen en la constancia fiscal del cliente. Revisa RFC, nombre y código postal para evitar errores en la solicitud.',
  'billing-sale':'Revisa que el folio, los productos y el total correspondan al cliente. Limpiar selección sólo quita la venta de este formulario; no cancela la venta.',
  'billing-list':'Busca ventas del periodo y revisa si ya tienen una solicitud. Usa los filtros para encontrar la que necesitas y selecciona su folio.',
  'billing-actions':'La vista previa te permite revisar los datos. Generar solicitud la guarda para continuar el trámite; todavía no es una factura emitida ni un CFDI.',
  'sales-detail':'Selecciona una venta de la lista para ver sus productos, pagos y estado. Las opciones disponibles dependen de tus permisos.',
  'sales-products':'Aquí aparecen los productos que se registraron en esta venta, con sus cantidades e importes. Consultarlos no modifica la venta.',
  'report-results':'Elige el tipo de reporte y el periodo, y pulsa Actualizar. La tabla muestra los resultados disponibles. El reporte de inventario refleja las existencias actuales.',
  'report-sales':'Esta gráfica muestra cómo se distribuyeron las ventas en el periodo. Puedes agruparlas por día o semana y cambiar entre barras y líneas.',
  'report-payments':'Compara cuánto se pagó con cada método en las ventas consultadas. La gráfica cambia al actualizar el periodo del reporte.',
  'dashboard-products':'Consulta los productos vendidos en el periodo y cambia cuántos quieres ver. Usa las flechas para recorrer las opciones disponibles de este panel.',
  'dashboard-metrics':'Consulta la cifra indicada en el título. Las flechas cambian el dato y el selector cambia el periodo de este panel. “Periodo general” usa la fecha elegida arriba.',
  'dashboard-categories':'Este panel está reservado para las ventas por categoría. Por ahora ese desglose no está disponible; no significa que no hayas vendido.',
  'dashboard-payments':'Muestra cómo se repartieron los pagos del periodo. Puedes elegir una fecha propia para este panel o usar el periodo general.',
  'dashboard-trends':'Compara la evolución de los datos indicados en el título. Usa las flechas para cambiar la comparación y elige el periodo que quieras revisar.',
  'dashboard-activity':'Revisa las últimas ventas completadas del periodo. Pulsa Ver todas para abrir el listado de ventas y consultar sus detalles.',
  'dashboard-alerts':'Aquí aparecen avisos sobre las existencias, como productos agotados o bajo mínimo. Revisa cada aviso antes de registrar una compra o un ajuste.',
  'cash-current':'Consulta la caja actual: quién la abrió, cuándo y cuánto efectivo se espera. El efectivo esperado se calcula con las operaciones registradas.',
  'cash-open':'Cuenta el dinero con el que iniciarás y escríbelo como fondo inicial. Al confirmar la apertura podrás registrar ventas en esta caja.',
  'cash-operations':'Desde aquí puedes registrar entradas o retiros de efectivo y preparar el cierre. Los movimientos manuales requieren al administrador.',
  'cash-activity':'Consulta lo que ha ocurrido desde que se abrió esta caja. Cada registro te ayuda a revisar el origen de los cambios en el efectivo.',
  'cash-movement':'Usa Entrada cuando agregues efectivo y Retiro cuando lo saques. Escribe el importe y el motivo. Esto no registra una venta ni mueve mercancía.',
  'cash-movements':'Revisa las entradas y retiros de efectivo que se guardaron en esta caja. Aquí puedes comprobar el motivo y quién registró cada movimiento.',
  'cash-count':'Cuenta el efectivo real y compáralo con el esperado. Revisa cualquier diferencia antes de confirmar el cierre; consultar o contar todavía no cierra la caja.',
  'cash-calculator':'Escribe cuántos billetes y monedas tienes. La calculadora suma el efectivo; pulsa Usar total para pasarlo al conteo de cierre.',
  'cash-history':'Consulta las cajas cerradas del periodo y sus comprobantes. Revisa cada corte para comparar lo contado con lo que se esperaba.',
  'cash-payments':'Revisa cómo se repartieron los pagos de la caja. Los pagos con tarjeta o transferencia no representan efectivo dentro del cajón.',
  'settings-system':'Elige cómo quieres recibir avisos y usar la pantalla. Guarda tus preferencias al terminar. Los mensajes de error se siguen mostrando para que puedas resolverlos.',
  'settings-date':'Elige la zona horaria y cómo quieres ver la fecha y la hora. Esto cambia su presentación en pantalla, no las fechas guardadas de las ventas.',
  'settings-language':'Elige las opciones disponibles para mostrar números e idioma. Revisa el ejemplo para distinguir el separador de miles del separador decimal.',
  'settings-quick':'Abre Apariencia para elegir entre las opciones visuales disponibles. Estos cambios son para tu usuario y no modifican productos ni ventas.',
  'settings-app':'Consulta la información de la aplicación y del servidor. Estos datos sirven para identificar la versión cuando solicites ayuda técnica.',
  'settings-admin-data':'Actualiza los datos de tu acceso administrativo. Para cambiar el PIN necesitas el PIN actual y confirmar el nuevo. Guarda al terminar.',
  'settings-account':'Consulta el estado, el rol y el último acceso registrado de esta cuenta. Tus permisos determinan qué información y acciones están disponibles.',
  'settings-extra':'Desde aquí puedes ir a las opciones de avisos y apariencia de tu usuario. Son ajustes de presentación; no cambian las operaciones del negocio.',
  'settings-employees':'Agrega o actualiza a quienes usarán el sistema. Cada empleado debe tener su propio PIN. Revisa sus permisos antes de darle acceso.',
  'settings-permissions':'Elige un empleado y marca las pantallas que podrá usar. Guarda para aplicar el cambio. Dar acceso a una pantalla no autoriza acciones exclusivas del administrador.',
  'settings-pin':'El PIN debe tener entre 6 y 12 números. Cada persona usa el suyo. Si necesitas cambiar el PIN del administrador, primero se solicita el PIN actual.',
  'settings-printer':'Abre la prueba y elige una impresora en la ventana del navegador. Revisa el papel impreso para comprobar el resultado; la vista previa por sí sola no lo confirma.',
  'settings-scanner':'Activa el lector de códigos para todo el establecimiento. Debe funcionar como teclado y terminar cada lectura con Enter. En el POS pulsa Escanear antes de usarlo.',
  'settings-port':'Estos datos permiten comunicarse con la báscula. Conserva la configuración de tu modelo y pulsa Conectar báscula para elegir el puerto del dispositivo.',
  'settings-monitor':'Aquí verás el peso que envía la báscula conectada. Si aparece Sin conexión o no cambia la lectura, revisa el dispositivo antes de capturar una venta.',
  'scanner-capture':'Coloca el cursor en Código del producto y usa el lector, o escribe el código y pulsa Enter. El producto se selecciona para revisar su cantidad o peso; todavía no se vende.',
  'device-motion':'Activa Reducir movimiento si prefieres menos animaciones. La elección se conserva en este navegador y puedes cambiarla cuando lo necesites.'
};
function panelHelpIcon(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 17h.01"/></svg>';}
function panelHelpText(button){
  if(button.dataset.contextHelp==='page')return {pos:panelHelpDescriptions['pos-catalog'],products:'Consulta el catálogo y busca por nombre, código o categoría. Si tienes permiso para editar, abre un producto o crea uno nuevo. Las existencias se cambian desde Inventario.',inventory:panelHelpDescriptions['inventory-stock'],sales:'Busca las ventas por fecha o folio y selecciona una para ver su detalle. El listado y las acciones disponibles dependen de tus permisos.',dashboard:'Elige el periodo que quieres revisar y pulsa Actualizar. Los paneles muestran las ventas disponibles para tu usuario. Algunos importes sólo los puede consultar administración.',billing:panelHelpDescriptions['billing-start'],reports:state.reportsMode==='cash'?panelHelpDescriptions['cash-current']:panelHelpDescriptions['report-results'],settings:contextHelpDescriptions['settings-'+document.querySelector('.settings-layout').dataset.settingsMode],restricted:'Tu cuenta no tiene pantallas disponibles. Pide al administrador que revise tus permisos; puedes seguir usando las opciones de tu cuenta.'}[state.activeView]||'';
  if(button.dataset.contextHelp==='inventory-entry')return panelHelpDescriptions['movement-'+(state.inventoryMovementMode||'receipt')];
  return panelHelpDescriptions[button.dataset.contextHelp]||'';
}
function panelHelpKey(heading){
  const byId={pageTitle:'page',productFormStatusTitle:'products',weighProductName:'pos-weight',pieceQuantityTitle:'pos-piece',manualModalTitle:'manual-weight',inventoryEntryProductName:'inventory-projection',dashboardFeaturedHeading:'dashboard-products',dashboardSalesChartCaption:'dashboard-metrics',dashboardCategoryHeading:'dashboard-categories',dashboardPaymentHeading:'dashboard-payments',dashboardTrendHeading:'dashboard-trends',dashboardActivityHeading:'dashboard-activity',dashboardAlertsHeading:'dashboard-alerts',reportPreviewTitle:'report-results',reportSalesChartTitle:'report-sales',reportPaymentsTitle:'report-payments',cashShiftStatus:'cash-current'};
  if(byId[heading.id])return byId[heading.id];
  const byTitle={'Métodos de pago':'settings-payments','Selecciona el producto':'pos-catalog','Venta actual':'pos-ticket','Inventario actual':'product-projection','Movimiento de inventario':'inventory-entry','Historial de movimientos':'inventory-history','Existencias por producto':'inventory-stock','Actividad reciente':'inventory-activity','Producto destacado':'inventory-top','Menor rotación':'inventory-slow','Nueva solicitud de factura':'billing-start','Datos del cliente fiscal':'billing-customer','Venta seleccionada':'billing-sale','Ventas y solicitudes':'billing-list','Acciones':'billing-actions','Selecciona una venta':'sales-detail','Detalle de venta':'sales-detail','Iniciar la operación':'cash-open','Operaciones de la caja abierta':'cash-operations','Actividad de esta caja':'cash-activity','Registrar entrada o retiro':'cash-movement','Movimientos registrados':'cash-movements','Conteo y cierre':'cash-count','Calculadora de efectivo':'cash-calculator','Historial de cortes':'cash-history','Pagos':'cash-payments','Opciones del sistema':'settings-system','Fecha y hora':'settings-date','Idioma y región':'settings-language','Apariencia rápida':'settings-quick','Datos de la aplicación':'settings-app','Información del negocio':'settings-business','Datos del administrador':'settings-admin-data','Estado de cuenta':'settings-account','Opciones adicionales':'settings-extra','Empleados':'settings-employees','Permisos por empleado':'settings-permissions','Permisos efectivos':'settings-permissions','Política vigente de PIN':'settings-pin','Impresión del navegador':'settings-printer','Escáner de códigos':'settings-scanner','Datos fiscales del establecimiento':'settings-fiscal','Alcance fiscal':'settings-fiscal','Apariencia de la interfaz':'settings-appearance','Estado y respaldos':'settings-maintenance','Bitácora de acciones':'settings-audit','Puerto serial':'settings-port','Monitor en vivo':'settings-monitor','Escanear producto':'scanner-capture','Preferencias del dispositivo':'settings-scale','Báscula':'settings-scale','Movimiento':'device-motion'};
  if(heading.id==='settingsSectionTitle'||heading.id==='settingsScaleWeight')return null;
  if(heading.classList.contains('sales-detail-products-title'))return 'sales-products';
  return byTitle[heading.textContent.trim()]||null;
}
function enhancePanelHelp(){
  if(initContextHelp.active&&!initContextHelp.active.button.isConnected)closeContextHelp();
  for(const heading of document.querySelectorAll('#pageTitle,.app-view h3,.app-view h4,.app-view h5,#currentSalePanel h3,.pos-section-title h3,.modal h3,.modal h4,#scannerCaptureDialog h3')){
    const key=panelHelpKey(heading);if(!key)continue;
    let button=heading.querySelector('button[data-context-help]');
    if(!button){const header=heading.closest('.form-title,.panel-head,.modal-head');button=header&&[...header.querySelectorAll('button[data-context-help]')].find(b=>b.dataset.contextHelp===key);}
    if(!button){button=document.createElement('button');button.type='button';button.dataset.contextHelp=key;button.setAttribute('aria-expanded','false');}
    button.classList.add('context-help-trigger','context-help-inline');
    button.setAttribute('aria-label','Ayuda: '+heading.textContent.trim());
    if(!button.querySelector('svg'))button.innerHTML=panelHelpIcon();
    if(button.parentElement!==heading)heading.append(button);
  }
  for(const button of document.querySelectorAll('button.context-help-trigger'))if(!button.querySelector('svg'))button.innerHTML=panelHelpIcon();
}
function initPanelHelp(){
  if(initPanelHelp.ready)return;initPanelHelp.ready=true;
  for(const tab of document.querySelectorAll('#inventoryOperationTabs [data-inventory-operation]')){
    const option=document.createElement('div');option.className='inventory-operation-option';option.setAttribute('role','presentation');tab.before(option);option.append(tab);
    const help=document.createElement('button');help.type='button';help.className='context-help-trigger';help.dataset.contextHelp='movement-'+tab.dataset.inventoryOperation;help.setAttribute('aria-label','Ayuda: '+tab.textContent.trim());help.setAttribute('aria-expanded','false');help.innerHTML=panelHelpIcon();option.append(help);
  }
  enhancePanelHelp();
  const observer=new MutationObserver(records=>{
    const headingAdded=records.some(record=>record.target.nodeType===1&&record.target.matches('h2#pageTitle,h3,h4,h5')&&!record.target.querySelector('[data-context-help]')||[...record.addedNodes].some(n=>n.nodeType===1&&(n.matches('h2#pageTitle,h3,h4,h5')||n.querySelector('h2#pageTitle,h3,h4,h5'))));
    if(!headingAdded||initPanelHelp.pending)return;
    initPanelHelp.pending=true;requestAnimationFrame(()=>{initPanelHelp.pending=false;enhancePanelHelp();});
  });
  observer.observe(document.body,{childList:true,subtree:true});initPanelHelp.observer=observer;
  document.addEventListener('keydown',event=>{if(event.target.closest('button[data-context-help]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key))event.stopPropagation();},true);
}
if(init.ready)initPanelHelp();
