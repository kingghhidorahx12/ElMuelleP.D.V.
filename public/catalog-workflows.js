// Flujos comerciales separados de los movimientos de existencias.
async function catalogPendingDatabase(key,value){
  return new Promise((resolve,reject)=>{const request=indexedDB.open('ElMuellePendingOperations',1);request.onupgradeneeded=()=>request.result.createObjectStore('operations');request.onerror=()=>reject(Error('No se pudo conservar la operación para un reintento seguro.'));request.onsuccess=()=>{const db=request.result,transaction=db.transaction('operations',value===undefined?'readonly':'readwrite'),store=transaction.objectStore('operations'),operation=value===undefined?store.get(key):store.put(value,key);let result;operation.onsuccess=()=>{result=operation.result;};transaction.oncomplete=()=>{db.close();resolve(result);};transaction.onerror=()=>{db.close();reject(Error('No se pudo conservar la operación pendiente.'));};};});
}
async function catalogPendingStore(){
  const owner=state.currentUser?.id;if(!owner||!state.sessionAuthenticated)throw Error('Inicia sesión nuevamente.');
  const key='el-muelle.catalog-operations.'+owner;
  const records=await catalogPendingDatabase(key)||{};
  return {records,async save(){await catalogPendingDatabase(key,records);}};
}
async function runCatalogOperation(key,url,method,payload){
  if(!state.catalogOperationLocks)state.catalogOperationLocks=new Set();
  if(state.catalogOperationLocks.size)throw Error('La operación se está confirmando.');
  state.catalogOperationLocks.add(key);
  try{
    const store=await catalogPendingStore(),old=store.records[key];
    if(old&&(old.url!==url||old.method!==method||JSON.stringify(old.payload)!==JSON.stringify(payload)))throw Error('Hay una operación pendiente. Reintenta la operación anterior antes de iniciar otra.');
    const pending=old||{url,method,payload,operationId:crypto.randomUUID()};store.records[key]=pending;await store.save();refreshCatalogPending();
    try{const value=await fetchJson(pending.url,{method:pending.method,headers:{'Content-Type':'application/json'},body:JSON.stringify({...pending.payload,operationId:pending.operationId})});delete store.records[key];await store.save();refreshCatalogPending();return value;}
    catch(error){if(error.status>=400&&error.status<500&&error.status!==401){delete store.records[key];await store.save();refreshCatalogPending();}throw error;}
  }finally{state.catalogOperationLocks.delete(key);}
}
async function refreshCatalogPending(){
  const node=$('catalogPendingOperations');if(!node||!state.currentUser||!state.sessionAuthenticated)return;
  const owner=state.currentUser.id,{records}=await catalogPendingStore();if(state.currentUser?.id!==owner)return;node.replaceChildren();node.hidden=!Object.keys(records).length;
  for(const [key,pending]of Object.entries(records)){const button=document.createElement('button');button.type='button';button.className='quiet-btn';button.textContent='Reintentar operación pendiente';button.onclick=async()=>{button.disabled=true;try{await runCatalogOperation(key,pending.url,pending.method,pending.payload);showToast('Operación confirmada.');await loadProducts();if(canAccessView('inventory'))await loadInventoryEntries();}catch(error){showToast(error.message);}finally{button.disabled=false;}};node.append(button);}
}
function syncProductPhotoPreview(){
  const preview=$('productPhotoPreview');if(!preview)return;
  const existing=state.products.find(p=>p.id===state.editingProductId);
  const src=state.pendingProductPhoto?'data:'+state.pendingProductPhoto.mime+';base64,'+state.pendingProductPhoto.data:existing?getPosProductImagePath(existing):'';
  preview.hidden=!src;preview.src=src||'';if($('productPhotoPlaceholder'))$('productPhotoPlaceholder').hidden=!!src;if($('cancelProductPhotoBtn'))$('cancelProductPhotoBtn').hidden=!state.pendingProductPhoto;
  if($('productPhotoFileName'))$('productPhotoFileName').textContent=state.pendingProductPhotoName||((existing?.photoFile||src)?'Fotografía actual':'Ningún archivo seleccionado');
  if($('productPhotoStatus')){$('productPhotoStatus').textContent=state.pendingProductPhoto?'Fotografía válida, lista para guardar.':'JPEG, PNG o WebP · máximo 5 MiB · recomendado 1:1';$('productPhotoStatus').dataset.state=state.pendingProductPhoto?'valid':'idle';}
}
async function selectProductPhoto(){
  const file=$('productPhotoInput').files[0];if(!file)return;
  const version=(state.productPhotoVersion||0)+1;state.productPhotoVersion=version;
  try{
    if(file.size>5*1024*1024)throw Error('La fotografía excede 5 MiB.');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Selecciona una fotografía JPEG, PNG o WebP.');
    const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('No se pudo leer la fotografía.'));reader.readAsDataURL(file);});
    const image=new Image();image.src=url;await image.decode();if(!image.naturalWidth||image.naturalWidth>8192||image.naturalHeight>8192||image.naturalWidth*image.naturalHeight>32000000)throw Error('Las dimensiones de la fotografía exceden el límite.');
    if(state.productPhotoVersion!==version)return;state.pendingProductPhoto={mime:file.type,data:url.slice(url.indexOf(',')+1)};state.pendingProductPhotoName=file.name;syncProductPhotoPreview();
  }catch(error){if(state.productPhotoVersion===version){$('productPhotoInput').value='';if($('productPhotoStatus')){$('productPhotoStatus').textContent=error.message;$('productPhotoStatus').dataset.state='error';}showToast(error.message);}}
}
async function saveCommercialProduct(event){
  event.preventDefault();if(state.productSaving)return;state.productSaving=true;const button=$('saveProductBtn');button.disabled=true;
  try{
    const editing=state.editingProductId,payload={name:$('productNameInput').value.trim(),description:$('productDescriptionInput').value.trim(),category:$('productCategoryInput').value,unit:$('productUnitInput').value,price:Number($('productPriceInput').value),costPrice:Number($('productCostInput').value||0),minStock:$('productMinStockInput').value===''?null:Number($('productMinStockInput').value),active:$('productActiveInput').checked};
    if(!payload.name||!payload.category||!Number.isFinite(payload.price)||payload.price<=0||!Number.isFinite(payload.costPrice)||payload.costPrice<0||payload.minStock!==null&&(!Number.isFinite(payload.minStock)||payload.minStock<0||payload.unit==='pieza'&&!Number.isInteger(payload.minStock)))throw Error('Revisa nombre, precio, costo y mínimo.');
    payload.code=$('productCodeInput')?.value.trim()||'';
    if(state.pendingProductPhoto)payload.photo=state.pendingProductPhoto;
    if(!await openProductConfirm({title:editing?'Actualizar producto':'Agregar producto',message:'Se guardará la información comercial; las existencias se administran en Inventario.',summary:payload.name+' · '+money(payload.price)+' / '+getUnitLabel(payload.unit),confirmLabel:'Guardar'}))return;
    await runCatalogOperation('product',editing?'/api/products/'+editing:'/api/products',editing?'PUT':'POST',payload);
    // La confirmación precede al refresco; un error de consulta no invita a repetir el alta.
    resetProductForm();setProductMode('list');showToast('Producto guardado.');await loadProducts();
  }catch(error){showToast(error.message||'No se confirmó el guardado. Reintenta la operación pendiente.');}finally{state.productSaving=false;button.disabled=false;}
}
async function saveInventoryReceipt(event){
  event.preventDefault();if(state.inventorySaving)return;state.inventorySaving=true;const button=$('saveInventoryEntryBtn');button.disabled=true;
  try{
    const movementMode=state.inventoryMovementMode||'receipt',isNew=movementMode==='receipt'&&getInventoryEntryMode()==='new',product=isNew?null:getSelectedInventoryEntryProduct(),payload={productId:product?.id,quantity:Number($('inventoryEntryQuantityInput').value),unitCost:Number($('inventoryEntryUnitCostInput').value),salePrice:Number($('inventoryEntrySalePriceInput').value||0),receivedAt:$('inventoryEntryDateInput').value||getLocalDateString(),reason:$('inventoryEntryNotesInput').value.trim(),supplier:$('inventorySupplierInput')?.value.trim()||''};
    if(isNew){payload.newProduct=getInventoryNewProductDraft();delete payload.productId;}
    if(!payload.reason)throw Error('Captura el motivo de la recepción.');if(!isNew&&typeof product?.stockQuantity!=='number')throw Error('Registra primero el conteo inicial en Existencias.');
    if(movementMode!=='receipt'){
      if(!Number.isFinite(payload.quantity)||payload.quantity<0||movementMode==='waste'&&payload.quantity<=0)throw Error('Captura una cantidad válida.');
      const stockQuantity=movementMode==='waste'?product.stockQuantity-payload.quantity:payload.quantity;
      if(!await openProductConfirm({title:movementMode==='waste'?'Registrar merma':'Ajustar existencias',message:'Se conservarán el motivo y la existencia anterior en el historial.',summary:quantityText(stockQuantity,product.unit),confirmLabel:'Confirmar'}))return;
      await runCatalogOperation('receipt','/api/products/'+product.id+'/inventory','PATCH',{stockQuantity,reason:payload.reason,type:movementMode});showToast('Movimiento confirmado.');await loadProducts();await loadInventoryEntries();return;
    }
    if(!await openProductConfirm({title:isNew?'Alta y recepción inicial':'Registrar entrada',message:'El producto y el movimiento se confirmarán en una sola operación.',summary:quantityText(payload.quantity,product?.unit||payload.newProduct.unit),confirmLabel:'Registrar'}))return;
    await runCatalogOperation('receipt','/api/inventory/entries','POST',payload);resetInventoryEntryForm();showToast('Recepción confirmada.');await loadProducts();await loadInventoryEntries();
  }catch(error){showToast(error.message||'No se confirmó la recepción.');}finally{state.inventorySaving=false;button.disabled=false;}
}
async function saveInventoryMovement(productId){
  const product=state.products.find(p=>p.id===productId),escape=CSS.escape(productId),quantityInput=document.querySelector('[data-stock-product="'+escape+'"]'),why=document.querySelector('[data-inventory-reason="'+escape+'"]');
  if(!quantityInput.value.trim()){showToast('Captura una existencia verificada; cero significa agotado.');return;}
  const reason=why.value.trim();if(reason.length<3){showToast('Captura el motivo del movimiento.');why.focus();return;}
  const initial=typeof product.stockQuantity!=='number',quantity=Number(quantityInput.value),minimum=document.querySelector('[data-min-product="'+escape+'"]'),type=document.querySelector('[data-inventory-kind="'+escape+'"]')?.value||'adjustment';
  const payload=initial?{productId,quantity,reason,minStock:minimum.value===''?null:Number(minimum.value)}:{stockQuantity:quantity,reason,type,minStock:minimum.value===''?null:Number(minimum.value)};
  try{await runCatalogOperation('inventory:'+productId,initial?'/api/inventory/counts':'/api/products/'+productId+'/inventory',initial?'POST':'PATCH',payload);state.inventoryEditingId=null;showToast(initial?'Conteo inicial confirmado.':'Movimiento confirmado.');await loadProducts();await loadInventoryEntries();}catch(error){showToast(error.message);}
}
async function renderPendingRestitutions(){
  const host=$('pendingRestitutions');if(!host)return;host.replaceChildren();
  const records=await fetchJson('/api/inventory/restitutions');for(const pending of records.filter(r=>r.status==='pending')){const row=document.createElement('article'),label=document.createElement('p');label.textContent='Restitución pendiente · '+pending.saleId+' · '+quantityText(pending.quantity,pending.unit);row.append(label);
    for(const [action,text]of [['add','Sumar restitución'],['included','Ya incluida en el conteo']]){const button=document.createElement('button');button.type='button';button.className='quiet-btn';button.textContent=text;button.onclick=async()=>{const reason=window.prompt('Motivo de conciliación: indica si la mercancía ya está incluida en el conteo.');if(!reason)return;button.disabled=true;try{await runCatalogOperation('restitution:'+pending.id,'/api/inventory/restitutions/'+encodeURIComponent(pending.id)+'/reconcile','POST',{action,reason});showToast('Restitución conciliada.');await loadProducts();await renderPendingRestitutions();}catch(error){showToast(error.message);}finally{button.disabled=false;}};row.append(button);}host.append(row);
  }host.hidden=!host.childElementCount;
}
function initCatalogWorkflows(){
  if(initCatalogWorkflows.ready)return;initCatalogWorkflows.ready=true;
  $('productPhotoInput').addEventListener('change',selectProductPhoto);
  const drop=document.querySelector('.product-photo-preview');drop.addEventListener('dragover',event=>event.preventDefault());drop.addEventListener('drop',event=>{event.preventDefault();if(event.dataTransfer.files.length!==1){showToast('Selecciona una sola fotografía.');return;}$('productPhotoInput').files=event.dataTransfer.files;selectProductPhoto();});
  $('productPhotoChooseBtn')?.addEventListener('click',()=>$('productPhotoInput').click());
  $('cancelProductPhotoBtn').addEventListener('click',()=>{state.productPhotoVersion=(state.productPhotoVersion||0)+1;state.pendingProductPhoto=null;state.pendingProductPhotoName='';$('productPhotoInput').value='';syncProductPhotoPreview();});
  $('cancelProductFormBtn').addEventListener('click',()=>{resetProductForm();setProductMode('list');});refreshCatalogPending();
  $('closeProductEditorBtn').addEventListener('click',()=>{resetProductForm();setProductMode('list');});
  $('productConfirmModal').addEventListener('cancel',event=>{event.preventDefault();closeProductConfirm(false);});
  $('productEditorDialog').addEventListener('cancel',event=>{event.preventDefault();resetProductForm();setProductMode('list');});
  document.querySelectorAll('[data-inventory-operation]').forEach(button=>button.addEventListener('click',()=>{
    const mode=button.dataset.inventoryOperation;state.inventoryMovementMode=mode;$('inventoryQuantityLabel').textContent=mode==='receipt'?'Cantidad recibida':mode==='waste'?'Cantidad de merma':'Existencia resultante';
    document.querySelectorAll('[data-inventory-operation]').forEach(tab=>{tab.classList.toggle('active',tab===button);tab.setAttribute('aria-selected',String(tab===button));});
    for(const name of ['inventoryEntryUnitCostInput','inventoryEntrySalePriceInput','inventoryEntryDateInput','inventorySupplierInput'])$(name).closest('label').hidden=mode!=='receipt';
    document.querySelector('[aria-label="Tipo de entrada de mercancía"]').hidden=mode!=='receipt';if(mode!=='receipt')setInventoryEntryMode('existing');
    $('saveInventoryEntryBtn').textContent=mode==='receipt'?'Registrar entrada':mode==='waste'?'Registrar merma':'Registrar ajuste';
    const reason=$('inventoryEntryNotesInput').closest('label');reason.firstChild.textContent=mode==='receipt'?'Motivo de recepción':mode==='waste'?'Motivo de merma':'Motivo de ajuste';
  }));
  initPinVisibility();
}

function updateManualProductContext(){const product=state.selectedProduct;if(!product)return;$('manualProductName').textContent=product.name;$('manualProductUnit').textContent=product.unit==='kg'?'Por kilogramo':'Por pieza';$('manualProductPrice').textContent='Precio: '+money(product.price)+' / '+getUnitLabel(product.unit);$('manualProductPhoto').src=getPosProductImagePath(product);$('manualProductPhoto').hidden=false;$('manualProductPhoto').onerror=()=>{$('manualProductPhoto').hidden=true;};}

function syncFinancialVisibility(){
  const admin=isAdminUser();document.body.classList.toggle('financial-private',!admin);
  if(!admin){const sensitive=item=>Object.keys(item).some(key=>/(?:cost|profit|margin|investment|projected)/i.test(key)),clean=item=>Object.fromEntries(Object.entries(item).filter(([key])=>!/(?:cost|profit|margin|investment|projected)/i.test(key)));if(state.ticket.some(sensitive))state.ticket=state.ticket.map(clean);if(state.checkoutPending?.payload?.items?.some(sensitive)){state.checkoutPending.payload.items=state.checkoutPending.payload.items.map(clean);persistPendingCheckout();}}
  if(syncFinancialVisibility.role===admin)return;syncFinancialVisibility.role=admin;
  for(const id of ['dashboardProfit','dashboardReinvest','dashboardMargin','catalogInventoryValue','cutGrossProfit','cutMargin','inventoryInvestmentValue','inventoryProjectedValue','inventoryProjectedProfit','productInvestmentTotal','productProjectedRevenue','productProjectedProfit','productMarginPercent','productUnitProfit','entryCurrentCost','entryPurchaseTotal','entryProjectedRevenue','entryProjectedProfit','entryMargin','entryWeightedCost']){const node=$(id);node?.closest('article')?.removeAttribute('data-admin-finance');if(node&&!admin)node.textContent='Restringido';}
  document.querySelector('.product-projection-panel')?.removeAttribute('data-admin-finance');
  for(const id of ['productCostInput','inventoryEntryUnitCostInput']){const field=$(id);field?.closest('label')?.setAttribute('data-admin-finance','');if(field&&!admin)field.value='';}
}

function resetPinVisibility(root=document){
  root.querySelectorAll('input[data-pin-protected]').forEach(input=>{if(input.type==='password')return;input.type='password';window.clearTimeout(input.pinVisibilityTimer);const button=input.parentElement.querySelector('.pin-visibility-button');if(button){button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Mostrar PIN');button.title='Mostrar PIN';}});
}
function initPinVisibility(){
  const enhance=()=>{
    document.querySelectorAll('input[type="password"]:not([data-pin-protected])').forEach(input=>{
      input.dataset.pinProtected='';const wrapper=document.createElement('span');wrapper.className='pin-input-control';input.before(wrapper);wrapper.append(input);
      const button=document.createElement('button');button.type='button';button.className='pin-visibility-button';button.setAttribute('aria-label','Mostrar PIN');button.setAttribute('aria-pressed','false');button.title='Mostrar PIN';button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';wrapper.append(button);
      button.addEventListener('click',()=>{const visible=input.type==='password';input.type=visible?'text':'password';button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',visible?'Ocultar PIN':'Mostrar PIN');button.title=visible?'Ocultar PIN':'Mostrar PIN';window.clearTimeout(input.pinVisibilityTimer);if(visible)input.pinVisibilityTimer=window.setTimeout(()=>resetPinVisibility(wrapper),20000);});
    });
    document.querySelectorAll('.hidden input[data-pin-protected], [inert] input[data-pin-protected], dialog:not([open]) input[data-pin-protected]').forEach(input=>resetPinVisibility(input.parentElement));
  };
  enhance();document.addEventListener('reset',event=>resetPinVisibility(event.target),true);document.addEventListener('close',event=>resetPinVisibility(event.target),true);
  initPinVisibility.observer=new MutationObserver(records=>{
    const selector='input[type="password"]:not([data-pin-protected])';
    if(records.some(record=>record.type==='childList'&&[...record.addedNodes].some(node=>node.nodeType===1&&(node.matches(selector)||node.querySelector(selector)))))enhance();
    for(const record of records)if(record.type==='attributes'&&record.target.matches('.modal,dialog,#accessScreen')&&(record.target.classList.contains('hidden')||record.target.inert||record.target.getAttribute('aria-hidden')==='true'||record.target.tagName==='DIALOG'&&!record.target.open))resetPinVisibility(record.target);
  });initPinVisibility.observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-hidden','inert','open']});
}
