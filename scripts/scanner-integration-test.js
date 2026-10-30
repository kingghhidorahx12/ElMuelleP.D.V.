// Escáner de teclado: pruebas aisladas; nunca usa los datos operativos.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {spawn}=require('node:child_process');
const p=require('../src/persistence');
const root=path.resolve(__dirname,'..'),dev=path.join(root,'.dev'),pin='864209',id=()=>crypto.randomUUID();
let area,data,child,base,admin,worker;
const policy=value=>Object.fromEntries(require('../src/access').MODULES.map(k=>[k,value]));
const product=(extra={})=>({name:'Producto sintético',category:'Pescados y mariscos',unit:'pieza',price:100,costPrice:40,stockQuantity:20,minStock:1,active:true,...extra});
async function api(route,method='GET',body,cookie=admin){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control'),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function stop(){if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}}
async function start(){const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>r(n));});});assert.ok(![3000,3001].includes(port));base='http://127.0.0.1:'+port;child=spawn(process.execPath,['src/server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',EL_MUELLE_STORAGE_MODE:'',NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,ENV_FILE:path.join(area,'missing.env'),ADMIN_PIN:pin,EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',REQUIRE_HTTPS:'false',CORS_ORIGIN:''},stdio:'ignore'});for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error('Synthetic server exited');try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Synthetic timeout');}
async function login(){admin=(await api('/api/auth/admin','POST',{pin},null)).cookie;worker=(await api('/api/auth/employee','POST',{userId:'worker',pin:'135790'},null)).cookie;}
before(async()=>{area=fs.mkdtempSync(path.join(dev,'em003-scanner-'));p.restrictPrivatePath(area,true);data=path.join(area,'data');fs.mkdirSync(data);fs.writeFileSync(path.join(data,'products.json'),JSON.stringify([
 product({id:'piece',code:'0000123'}),product({id:'kg',code:'AbC-09',unit:'kg'}),product({id:'unknown',code:'UNKNOWN',stockQuantity:null}),product({id:'zero',code:'ZERO',stockQuantity:0}),product({id:'off',code:'OFF',active:false}),product({id:'dup1',code:'LEGACY'}),product({id:'dup2',code:'LEGACY'}),product({id:'lower',code:'abc-09'})]));await start();admin=(await api('/api/auth/admin','POST',{pin},null)).cookie;assert.equal((await api('/api/settings','PUT',{users:[{id:'admin',name:'Admin sintético',role:'admin',active:true},{id:'worker',name:'Empleado sintético',role:'employee',active:true}],employeePins:{worker:'135790'}})).status,200);await login();await api('/api/users/worker/permissions','PUT',{permissions:policy(true)});});
after(async()=>{await stop();if(area){assert.ok(p.inside(area,dev)&&path.basename(area).startsWith('em003-scanner-'));p.rejectLinks(area);fs.rmSync(area,{recursive:true,force:true,maxRetries:10,retryDelay:100});}});
async function browser(cookie,work,options={}){const {chromium}=require(process.env.EL_MUELLE_PLAYWRIGHT||'playwright');const context=await chromium.launchPersistentContext(path.join(area,'browser-'+id()),{channel:'msedge',headless:true,viewport:{width:1366,height:768},...options});try{await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:base}]);const page=context.pages()[0],errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>state.sessionAuthenticated&&init.ready);await work(page);assert.deepEqual(errors,[]);}finally{await context.close();}}
test('Escáner rendimiento: muestras equivalentes de búsqueda, selección, operación, pestañas y edición',async()=>browser(admin,async page=>{
 const phase=process.env.EL_MUELLE_SCANNER_PHASE||'after';
 const result=await page.evaluate(async()=>{setView('pos');const product=state.products.find(p=>p.id==='piece'),metrics={};const measure=async(name,fn)=>{const samples=[];for(let i=0;i<8;i++){const t=performance.now();await fn();if(i)samples.push(performance.now()-t);}metrics[name]={samples,median:[...samples].sort((a,b)=>a-b)[3]};};
 await measure('manualSearch',()=>{$('searchInput').value='0000';getFilteredProducts();renderProducts();});
 await measure('exactLookup',()=>{if(typeof scannerMatches==='function')scannerMatches('0000123',state.products);else state.products.filter(p=>p.code==='0000123');});
 await measure('productSelection',()=>{selectProduct(product);closePieceQuantityModal(false,true);});setView('inventory');setInventoryMode('entry');
 await measure('inventoryOperation',()=>{setInventoryMovementMode('adjustment');setInventoryMovementMode('receipt');});
 await measure('inventoryTabs',()=>{setInventoryMode('stock');setInventoryMode('entry');});setView('products');fillProductForm(product);
 await measure('codeEdit',()=>{$('productCodeInput').value='0000123';$('productCodeInput').dispatchEvent(new Event('input',{bubbles:true}));});setProductMode('list');return {metrics,products:state.products.length,node:navigator.userAgent};});
 fs.writeFileSync(path.join(dev,'em003-scanner-'+phase+'.json'),JSON.stringify(result,null,2));console.log('SCANNER_PERFORMANCE '+JSON.stringify({phase,...result}));
}));

test('Escáner API: predeterminado, permisos POS, tipos estrictos, no-store y auditoría',async()=>{
 assert.deepEqual((await api('/api/peripherals/scanner')).body,{enabled:false});
 for(const method of ['GET','PUT'])assert.equal((await api('/api/peripherals/scanner',method,method==='PUT'?{enabled:true}:undefined,null)).status,401);
 assert.equal((await api('/api/peripherals/scanner','PUT',{enabled:true},worker)).status,403);
 const permissions=policy(false);permissions.pos=true;await api('/api/users/worker/permissions','PUT',{permissions});
 const read=await api('/api/peripherals/scanner','GET',undefined,worker);assert.equal(read.status,200);assert.equal(read.cache,'no-store');assert.deepEqual(Object.keys(read.body),['enabled']);assert.equal((await api('/api/configuration','GET',undefined,worker)).status,403);
 permissions.pos=false;await api('/api/users/worker/permissions','PUT',{permissions});assert.equal((await api('/api/peripherals/scanner','GET',undefined,worker)).status,403);await api('/api/users/worker/permissions','PUT',{permissions:policy(true)});
 for(const body of [{},{enabled:1},{enabled:'true'},{enabled:null},{enabled:true,extra:true},[]])assert.equal((await api('/api/peripherals/scanner','PUT',body)).status,400);
 assert.deepEqual((await api('/api/peripherals/scanner','PUT',{enabled:true})).body,{enabled:true});assert.equal((await api('/api/peripherals/scanner','PUT',{enabled:true})).status,200);
 const events=(await api('/api/audit-events')).body.filter(e=>e.event_type==='scanner_setting_changed');assert.equal(events.length,1);assert.match(JSON.stringify(events),/previous/);assert.match(JSON.stringify(events),/false/);assert.match(JSON.stringify(events),/true/);assert.ok(!JSON.stringify(events).includes(pin));
 // Una auditoría fallida revierte el ajuste dentro de la misma SQLite aislada.
 const {PosDatabase}=require('../src/database'),db=new PosDatabase(path.join(area,'transaction-test')),routes={};
 require('../src/configuration').registerConfiguration({app:{get(){},put(route,fn){routes[route]=fn;}},database:db,requireAdminUser:()=>({id:'test',role:'admin'}),recordAuditEvent(){throw Error('synthetic audit failure');}});
 const response={code:200,set(){return this;},status(n){this.code=n;return this;},json(){}};routes['/api/peripherals/scanner']({body:{enabled:true}},response);assert.equal(response.code,500);assert.equal(db.readDocument('peripheral-settings','scanner'),null);db.close();
});

test('Códigos: unicidad transaccional, históricos, alta desde Inventario, fotos, concurrencia y replay',async()=>{
 const create=extra=>api('/api/products','POST',{...product(),stockQuantity:undefined,operationId:id(),...extra});
 assert.equal((await create({code:'0000123'})).status,409);assert.equal((await create({code:''})).status,201);assert.equal((await create({code:''})).status,201);
 for(const code of [123,'x'.repeat(81),'a\nb'])assert.equal((await create({code})).status,400);
 assert.equal((await api('/api/products/dup1','PUT',{operationId:id(),name:'Histórico editado',code:'LEGACY'})).status,200);
 assert.equal((await api('/api/products/dup2','PUT',{operationId:id(),name:'Otra edición'})).status,200);
 assert.equal((await api('/api/products/dup1','PUT',{operationId:id(),code:'0000123'})).status,409);
 const body={...product(),stockQuantity:undefined,code:'Concurrent-001',operationId:id()};
 const responses=await Promise.all([api('/api/products','POST',body),api('/api/products','POST',{...body,operationId:id()})]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);const confirmed=responses.find(r=>r.status===201);assert.equal((await api('/api/products','POST',body)).body.id,confirmed.body.id);
 const receipt={operationId:id(),newProduct:{name:'Alta desde inventario',category:'Pruebas',unit:'pieza',code:'0000123'},quantity:2,unitCost:40,salePrice:100,reason:'Recepción sintética'};
 const before=(await api('/api/inventory/entries')).body;assert.equal((await api('/api/inventory/entries','POST',receipt)).status,409);assert.deepEqual((await api('/api/inventory/entries')).body,before);
 receipt.newProduct.code='NEW-INV';const received=await api('/api/inventory/entries','POST',receipt);assert.equal(received.status,201);assert.equal(received.body.product.code,'NEW-INV');assert.equal((await api('/api/inventory/entries','POST',receipt)).body.entry.id,received.body.entry.id);
 await browser(admin,async page=>{
   const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=8;c.getContext('2d').fillRect(0,0,8,8);return {mime:'image/png',data:c.toDataURL('image/png').split(',')[1]};});
   const old=await create({code:'PHOTO-ORIGINAL',photo});assert.equal(old.status,201);const folder=path.join(data,'product-photos'),files=fs.readdirSync(folder),events=(await api('/api/audit-events')).body;
   assert.equal((await api('/api/products/'+old.body.id,'PUT',{operationId:id(),code:'0000123',photo})).status,409);
   assert.deepEqual(fs.readdirSync(folder),files);assert.deepEqual((await api('/api/audit-events')).body,events);assert.equal((await api('/api/products')).body.find(p=>p.id===old.body.id).photoFile,old.body.photoFile);
   assert.equal((await api('/api/inventory/entries','POST',{...receipt,operationId:id(),newProduct:{...receipt.newProduct,code:'0000123',photo}})).status,409);assert.deepEqual(fs.readdirSync(folder),files);
 });
 assert.equal((await api('/api/products/dup1','PUT',{operationId:id(),code:'FREE-NEW'})).status,200);
 assert.equal((await api('/api/products/dup1','PUT',{operationId:id(),code:'LEGACY'})).status,409);
 // Restaurar el duplicado histórico sólo en el fixture para probar rechazo en navegador.
 await stop();const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(path.join(data,p.DATABASE_NAME));const row=db.prepare("SELECT payload FROM documents WHERE collection='products' AND document_id='dup1'").get(),legacy=JSON.parse(row.payload);legacy.code='LEGACY';db.prepare("UPDATE documents SET payload=? WHERE collection='products' AND document_id='dup1'").run(JSON.stringify(legacy));db.close();await start();await login();
 assert.deepEqual((await api('/api/peripherals/scanner')).body,{enabled:true});
});

test('Escáner navegador: Enter exacto, ceros, errores, ambigüedad, doble evento y capturas consecutivas',async()=>browser(worker,async page=>{
 await api('/api/peripherals/scanner','PUT',{enabled:true});await page.evaluate(()=>{setView('pos');refreshScannerSettings();});await page.waitForFunction(()=>scannerState.enabled);assert.equal(await page.locator('#scanProductBtn').count(),1);
 const open=async()=>{await page.locator('#scanProductBtn').click();await page.waitForFunction(()=>document.getElementById('scannerCaptureDialog').open);};
 for(const [code,message]of [['','Escanea o escribe'],['MISSING','no encontrado'],['OFF','inactivo'],['LEGACY','ambiguo'],['UNKNOWN','sin verificar'],['ZERO','agotado'],['Abc-09','no encontrado']]){
   await open();await page.locator('#scannerCodeInput').fill(code);await page.locator('#scannerCodeInput').press('Enter');await page.waitForFunction(text=>document.getElementById('scannerCaptureStatus').textContent.includes(text),message);assert.equal(await page.evaluate(()=>state.ticket.length),0);await page.locator('#closeScannerBtn').click();
 }
 await page.evaluate(()=>{window.scannerSelections=0;const select=selectProduct;window.selectProduct=product=>{window.scannerSelections++;return select(product);};});
 for(let i=0;i<2;i++){
   await open();await page.locator('#scannerCodeInput').fill('0000123');await page.locator('#scannerCodeInput').evaluate(field=>{field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true}));});assert.equal(await page.evaluate(()=>scannerSelections),i);
   await page.locator('#scannerCodeInput').evaluate(field=>{for(let j=0;j<2;j++)field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});
   await page.waitForFunction(n=>window.scannerSelections===n,i+1);assert.equal(await page.evaluate(()=>state.pieceQuantityProductId),'piece');await page.evaluate(()=>closePieceQuantityModal(false,true));
 }
 assert.equal(await page.evaluate(()=>state.ticket.length),0);
 await open();await page.locator('#scannerCodeInput').fill('AbC-09');await page.locator('#scannerCodeInput').press('Enter');await page.waitForFunction(()=>state.selectedProduct?.id==='kg');assert.equal(await page.evaluate(()=>state.quantitySource),'manual');assert.equal(await page.evaluate(()=>state.detectedQuantity),0);
 await page.evaluate(()=>clearSelectedProduct({immediate:true}));
 await open();await page.locator('#scannerCodeInput').fill('abc-09');await page.locator('#scannerCodeInput').press('Enter');await page.waitForFunction(()=>state.pieceQuantityProductId==='lower');await page.evaluate(()=>closePieceQuantityModal(false,true));
 // El buscador manual incluye código y conserva sus filtros; nunca se vuelve lector.
 await page.locator('#searchInput').fill('0000');assert.deepEqual(await page.evaluate(()=>getFilteredProducts().map(p=>p.id)),['piece']);assert.equal(await page.evaluate(()=>scannerSelections),4);
 await page.evaluate(()=>{state.activeCategory='favorites';toggleProductFavorite('kg');$('searchInput').value='AbC';});assert.deepEqual(await page.evaluate(()=>getFilteredProducts().map(p=>p.id)),['kg']);
}));

test('Escáner aislamiento: PIN, buscadores, cierre, navegación, sesión y desactivación remota',async()=>browser(worker,async page=>{
 await api('/api/peripherals/scanner','PUT',{enabled:true});await page.evaluate(()=>{setView('pos');refreshScannerSettings();});await page.waitForFunction(()=>scannerState.enabled);
 await page.locator('#searchInput').fill('MISSING');await page.locator('#searchInput').press('Enter');assert.equal(await page.locator('#scannerCaptureDialog').evaluate(d=>d.open),false);
 await page.evaluate(()=>{selectProduct(state.products.find(p=>p.id==='kg'));openManualModal();});
 await page.locator('#adminPinInput').fill('0000123');await page.locator('#adminPinInput').press('Enter');assert.equal(await page.evaluate(()=>scannerState.pending),false);assert.equal(await page.locator('#scannerCaptureDialog').evaluate(d=>d.open),false);await page.locator('#cancelManualWeightBtn').click();await page.evaluate(()=>clearSelectedProduct({immediate:true}));
 await page.locator('#scanProductBtn').click();await page.waitForFunction(()=>document.getElementById('scannerCaptureDialog').open);await page.locator('#scannerCodeInput').fill('0000123');await page.locator('#scannerCodeInput').press('Escape');assert.equal(await page.locator('#scannerCodeInput').inputValue(),'');assert.equal(await page.evaluate(()=>state.ticket.length),0);
 let release;const gate=new Promise(r=>release=r);await page.route('**/api/products',async route=>{await gate;try{await route.continue();}catch(error){if(!/already handled|closed|aborted/i.test(error.message))throw error;}});
 await page.locator('#scanProductBtn').click();await page.waitForFunction(()=>document.getElementById('scannerCaptureDialog').open);await page.locator('#scannerCodeInput').fill('0000123');await page.locator('#scannerCodeInput').press('Enter');await page.waitForFunction(()=>scannerState.pending);
 await api('/api/peripherals/scanner','PUT',{enabled:false});await page.waitForFunction(()=>!scannerState.enabled&&!document.getElementById('scannerCaptureDialog').open);release();await page.unroute('**/api/products');assert.equal(await page.evaluate(()=>state.ticket.length),0);assert.equal(await page.locator('#scanProductBtn').isVisible(),false);
 await api('/api/peripherals/scanner','PUT',{enabled:true});await page.waitForFunction(()=>scannerState.enabled);
 await page.locator('#scanProductBtn').click();await page.waitForFunction(()=>document.getElementById('scannerCaptureDialog').open);await page.locator('#scannerCodeInput').fill('0000123');await page.evaluate(()=>setView('inventory'));assert.equal(await page.locator('#scannerCaptureDialog').evaluate(d=>d.open),false);assert.equal(await page.locator('#scannerCodeInput').inputValue(),'');
 await page.evaluate(()=>{setView('pos');state.checkoutPending={id:'synthetic-pending'};});await page.evaluate(()=>openScannerCapture());assert.equal(await page.locator('#scannerCaptureDialog').evaluate(d=>d.open),false);await page.evaluate(()=>state.checkoutPending=null);
 let releaseOld;const oldGate=new Promise(r=>releaseOld=r);await page.route('**/api/products',async route=>{await oldGate;try{await route.continue();}catch(error){if(!/already handled|closed|aborted/i.test(error.message))throw error;}});
 await page.locator('#scanProductBtn').click();await page.waitForFunction(()=>document.getElementById('scannerCaptureDialog').open);await page.locator('#scannerCodeInput').fill('0000123');await page.locator('#scannerCodeInput').press('Enter');await page.waitForFunction(()=>scannerState.pending);await page.evaluate(()=>logoutToAccess());releaseOld();await page.unroute('**/api/products');assert.equal(await page.locator('#scannerCodeInput').inputValue(),'');assert.equal(await page.locator('#scannerCaptureDialog').evaluate(d=>d.open),false);assert.equal(await page.locator('#scanProductBtn').isVisible(),false);assert.equal(await page.evaluate(()=>state.ticket.length),0);
}));

test('Escáner interfaz: ajuste administrativo, ayuda, cuatro tamaños y captura sin superposición',async()=>browser(admin,async page=>{
 assert.equal((await api('/api/peripherals/scanner','PUT',{enabled:true})).status,200);await page.evaluate(()=>refreshScannerSettings());await page.waitForFunction(()=>scannerState.enabled);
 await page.evaluate(()=>{setView('settings');setSettingsMode('peripherals');});await page.waitForFunction(()=>!document.getElementById('scannerEnabledInput').disabled);
 const toggle=page.locator('#scannerEnabledInput');await toggle.setChecked(false);await page.waitForFunction(()=>document.getElementById('scannerSettingStatus').textContent.includes('guardado'));assert.deepEqual((await api('/api/peripherals/scanner')).body,{enabled:false});
 await toggle.setChecked(true);await page.waitForFunction(()=>scannerState.enabled);assert.deepEqual((await api('/api/peripherals/scanner')).body,{enabled:true});
 await page.locator('[data-context-help="settings"]').focus();await page.waitForFunction(()=>document.querySelector('[role="tooltip"]')?.textContent.includes('lector de códigos'));assert.match(await page.locator('[role="tooltip"]').textContent(),/administración/);assert.match(await page.locator('[role="tooltip"]').textContent(),/establecimiento/);await page.keyboard.press('Escape');
 for(const [width,height]of [[1366,598],[1366,768],[1440,900],[390,844]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>{state.sidebarCollapsed=true;setView('pos');if(innerWidth<700)closeTicketDrawer();});await page.waitForFunction(()=>scannerState.enabled);await page.locator('#scanProductBtn').click();await page.waitForFunction(()=>document.getElementById('scannerCaptureDialog').open);
   assert.equal(await page.locator('#scannerCodeInput').getAttribute('type'),'text');assert.equal(await page.locator('#scannerCodeInput').getAttribute('autocomplete'),'off');const box=await page.locator('#scannerCaptureDialog').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);await page.screenshot({path:path.join(dev,'em003-scanner-'+width+'x'+height+'.png')});
   await page.locator('#closeScannerBtn').click();await page.evaluate(()=>{selectProduct(state.products.find(p=>p.id==='piece'));});await page.evaluate(()=>openScannerCapture());assert.equal(await page.locator('#scannerCaptureDialog').evaluate(d=>d.open),false);await page.evaluate(()=>closePieceQuantityModal(false,true));
 }
}));

test('Inventario residual: barra única estable, operaciones, motivos, borradores y cuatro resoluciones',async()=>browser(admin,async page=>{
 for(const [width,height]of [[1366,598],[1366,768],[1440,900],[390,844]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>{state.sidebarCollapsed=true;setView('inventory');});
   for(const mode of ['stock','entry','history','stock','entry']){await page.evaluate(mode=>setInventoryMode(mode),mode);assert.equal(await page.locator('.inventory-subview-tabs').count(),1);assert.equal(await page.locator('.inventory-subview-tabs').isVisible(),true);assert.equal(await page.locator('[data-inventory-mode-btn="'+mode+'"]').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#inventoryOperationTabs').isVisible(),mode==='entry');}
   await page.locator('#inventoryEntryProductInput').selectOption('piece');await page.locator('#inventoryEntryNotesInput').fill('Borrador conservado');
   for(const [mode,label]of [['adjustment','ajuste'],['waste','merma'],['receipt','recepción']]){
     await page.locator('[data-inventory-operation="'+mode+'"]').click();assert.equal(await page.locator('#inventoryReasonLabel').textContent(),'Motivo de '+label);assert.equal(await page.locator('#inventoryEntryNotesInput').getAttribute('aria-label'),'Motivo de '+label);assert.equal(await page.locator('#inventoryEntryNotesInput').inputValue(),'Borrador conservado');assert.equal(await page.locator('.entry-mode-toggle').isVisible(),mode==='receipt');
     await page.evaluate(()=>setInventoryEntryMode('new'));assert.equal(await page.evaluate(()=>getInventoryEntryMode()),mode==='receipt'?'new':'existing');
   }
   await page.evaluate(()=>setInventoryEntryMode('existing'));assert.equal(await page.locator('#inventoryEntryProductInput').inputValue(),'piece');
   await page.locator('#resetInventoryEntryBtn').click();assert.equal(await page.locator('#inventoryEntryNotesInput').inputValue(),'');assert.equal(await page.locator('#inventoryReasonLabel').textContent(),'Motivo de recepción');
   await page.locator('[data-inventory-operation="receipt"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-inventory-operation="adjustment"]').getAttribute('aria-selected'),'true');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 }
}));

test('Escáner comercio: piezas acumuladas, báscula simulada, peso autorizado y cobro único real aislado',async()=>{
 await api('/api/peripherals/scanner','PUT',{enabled:true});assert.equal((await api('/api/cash-sessions/open','POST',{openingAmount:100})).status,201);
 await browser(admin,async page=>{
   await page.evaluate(async()=>{setView('pos');await loadCashSessions();});await page.waitForFunction(()=>scannerState.enabled);
   const scan=async code=>{await page.locator('#scanProductBtn').click();await page.waitForFunction(()=>document.getElementById('scannerCaptureDialog').open);await page.locator('#scannerCodeInput').fill(code);await page.locator('#scannerCodeInput').press('Enter');};
   for(const quantity of [2,1]){await scan('0000123');await page.waitForFunction(()=>state.pieceQuantityProductId==='piece');await page.locator('#pieceQuantityInput').fill('21');assert.equal(await page.locator('#confirmPieceQuantityBtn').isDisabled(),true);await page.locator('#pieceQuantityInput').fill(String(quantity));await page.locator('#confirmPieceQuantityBtn').click();await page.waitForFunction(()=>state.pieceQuantityProductId===null);}
   assert.equal(await page.evaluate(()=>state.ticket.length),1);assert.equal(await page.evaluate(()=>state.ticket[0].quantity),3);
   await page.evaluate(()=>{scaleState.connected=true;scaleState.weightKg=1.25;window.syntheticScaleRequests=0;window.requestScaleWeight=()=>window.syntheticScaleRequests++;});await scan('AbC-09');await page.waitForFunction(()=>state.selectedProduct?.id==='kg');assert.equal(await page.evaluate(()=>state.quantitySource),'scale');assert.equal(await page.evaluate(()=>state.detectedQuantity),1.25);assert.equal(await page.evaluate(()=>window.syntheticScaleRequests),1);
   await page.evaluate(()=>{clearSelectedProduct({immediate:true});scaleState.connected=false;});await scan('AbC-09');await page.waitForFunction(()=>state.selectedProduct?.id==='kg');await page.evaluate(()=>openManualModal());
   await page.locator('#manualQuantityInput').fill('1250');await page.locator('#manualReasonInput').selectOption('otro');await page.locator('#adminPinInput').fill(pin);await page.locator('#saveManualWeightBtn').click();assert.equal(await page.evaluate(()=>state.manualAuthorization),null);await page.locator('#manualExplanationInput').fill('Lectura sintética autorizada');await page.locator('#saveManualWeightBtn').click();await page.waitForFunction(()=>Boolean(state.manualAuthorization));await page.evaluate(()=>addCurrentProductToTicket());assert.equal(await page.evaluate(()=>state.ticket.find(p=>p.productId==='kg').quantity),1.25);
   let requests=0,payload;page.on('request',request=>{if(request.url()===base+'/api/sales'&&request.method()==='POST'){requests++;payload=JSON.parse(request.postData());}});
   await page.evaluate(()=>Promise.all([chargeSale(false),chargeSale(false)]));assert.equal(requests,1);assert.equal(await page.evaluate(()=>state.ticket.length),0);const sales=(await api('/api/sales')).body;assert.equal(sales.length,1);assert.equal((await api('/api/sales','POST',payload)).body.id,sales[0].id);
   const products=(await api('/api/products')).body;assert.equal(products.find(p=>p.id==='piece').stockQuantity,17);assert.equal(products.find(p=>p.id==='kg').stockQuantity,18.75);
 });
});
