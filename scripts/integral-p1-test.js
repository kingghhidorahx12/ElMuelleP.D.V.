// Lote P1: SQLite, límites del ticket, privacidad financiera y tres referencias visuales.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),vm=require('node:vm');
const {spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const {PosDatabase}=require('../src/database'),p=require('../src/persistence');
const root=path.resolve(__dirname,'..'),dev=path.join(root,'.dev'),prefix='em003-integral-p1-',pin='864209';
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),pause=ms=>new Promise(r=>setTimeout(r,ms));
let area,data,child,base,admin,employee;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');
const policy=value=>Object.fromEntries(require('../src/access').MODULES.map(k=>[k,value]));
async function api(route,method='GET',body,cookie=admin){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function stop(){const running=child;child=null;if(running&&running.exitCode===null&&running.signalCode===null){const done=new Promise(r=>running.once('exit',r));running.kill();await done;}}
before(async()=>{
 area=fs.mkdtempSync(path.join(dev,prefix));p.restrictPrivatePath(area,true);data=path.join(area,'data');fs.mkdirSync(data);
 fs.writeFileSync(path.join(area,'clock.js'),'const D=Date;global.Date=class extends D{constructor(...args){super(...(args.length?args:["2026-10-29T02:00:00Z"]));}static now(){return new D("2026-10-29T02:00:00Z").getTime();}};');
 const products=['piece','kg','unknown','zero','inactive','limited','replay'].map(id=>({id,name:'Sintético '+id,category:'Pruebas',unit:id==='kg'?'kg':'pieza',price:100,costPrice:41.73,stockQuantity:id==='unknown'?null:id==='zero'?0:['limited','replay'].includes(id)?1:id==='kg'?2:3,minStock:1,active:id!=='inactive',photoFile:'a'.repeat(64)+'.png',photoSHA256:crypto.createHash('sha256').update(png).digest('hex')}));
 fs.mkdirSync(path.join(data,'product-photos'));fs.writeFileSync(path.join(data,'product-photos','a'.repeat(64)+'.png'),png);fs.writeFileSync(path.join(data,'products.json'),JSON.stringify(products));
 fs.writeFileSync(path.join(data,'cash-sessions.json'),JSON.stringify([['local','2026-10-28','closed'],['utc','2026-10-29','closed'],['old','2020-01-01','closed'],['open','2019-01-01','open']].map(([id,businessDate,status])=>({id,businessDate,status,openingAmount:100,openedAt:businessDate+'T12:00:00Z',movements:[]}))));
 fs.writeFileSync(path.join(data,'sales.json'),JSON.stringify([{id:'T-PRIVATE',createdAt:'2026-10-29T02:00:00Z',status:'completada',operator:{id:'employee',role:'employee'},cashSessionId:'open',total:100,totalCost:41.73,grossProfit:58.27,profitMarginPercent:58.27,items:[{productId:'piece',unit:'pieza',name:'Sintético piece',quantity:1,price:100,total:100,costPrice:41.73,lineCost:41.73}]}]));
 fs.writeFileSync(path.join(data,'inventory-entries.json'),JSON.stringify([{id:'I-PRIVATE',productId:'piece',productName:'Sintético piece',unit:'pieza',quantity:3,type:'received',unitCost:41.73,totalCost:125.19,weightedAverageCost:41.73,projectedRevenue:300,projectedProfit:174.81,previousStock:0,newStock:3,reason:'Recepción sintética',createdAt:'2026-10-29T02:00:00Z'}]));
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>r(n));});});assert.ok(![3000,3001].includes(port));base='http://127.0.0.1:'+port;
 child=spawn(process.execPath,['--require',path.join(area,'clock.js'),'src/server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',TZ:'America/Mexico_City',NODE_ENV:'test',EL_MUELLE_STORAGE_MODE:'',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,ENV_FILE:path.join(area,'missing.env'),ADMIN_PIN:pin,EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',REQUIRE_HTTPS:'false',CORS_ORIGIN:''},stdio:'ignore'});
 for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error('Synthetic startup failure');try{if((await fetch(base+'/api/health')).ok)break;}catch{}await pause(100);}
 admin=(await api('/api/auth/admin','POST',{pin},null)).cookie;
 assert.equal((await api('/api/settings','PUT',{users:[{id:'admin',name:'Admin sintético',role:'admin',active:true},{id:'employee',name:'Empleado sintético',role:'employee',active:true}],employeePins:{employee:'135790'}})).status,200);
 employee=(await api('/api/auth/employee','POST',{userId:'employee',pin:'135790'},null)).cookie;
 assert.equal((await api('/api/users/employee/permissions','PUT',{permissions:policy(true)})).status,200);
});
after(async()=>{await stop();if(area){assert.ok(p.inside(area,dev)&&path.basename(area).startsWith(prefix));p.rejectLinks(area);fs.rmSync(area,{recursive:true,force:true,maxRetries:10,retryDelay:100});assert.equal(fs.existsSync(area),false);}});
function privateFields(value){const found=[];function walk(x){if(!x||typeof x!=='object')return;for(const [k,v]of Object.entries(x)){if(['costPrice','unitCost','lineCost','totalCost','grossProfit','profitMarginPercent','profit','cost','projectedRevenue','projectedProfit','weightedAverageCost'].includes(k))found.push(k);walk(v);}}walk(value);return found;}
test('Privacidad: administrador conserva costos reales y empleados no reciben campos financieros anidados',async()=>{
 const original=(await api('/api/products')).body;assert.equal(original[0].costPrice,41.73);
 for(const route of ['/api/products','/api/products?role=admin','/api/sales','/api/sales/T-PRIVATE','/api/inventory/entries','/api/cash-sessions','/api/cash-shifts','/api/cash-sessions/current']){const response=await api(route,'GET',undefined,employee);assert.equal(response.status,200,route);assert.deepEqual(privateFields(response.body),[],route);assert.ok(!JSON.stringify(response.body).includes('41.73'),route);}
 assert.equal((await api('/api/products')).body[0].costPrice,41.73);
});
test('Caja: medianoche UTC usa calendario local y ambas rutas conservan la misma visibilidad',async()=>{
 for(const route of ['/api/cash-sessions','/api/cash-shifts','/api/cash-shifts?role=admin&all=true&date=2026-10-29']){const response=await api(route,'GET',undefined,employee);assert.equal(response.status,200);assert.deepEqual(response.body.map(s=>s.id).sort(),['local','open']);assert.equal(response.body.find(s=>s.id==='local').businessDate,'2026-10-28');}
 assert.equal((await api('/api/cash-shifts')).body.length,4);
 const perms=policy(true);perms.cash=false;await api('/api/users/employee/permissions','PUT',{permissions:perms});assert.equal((await api('/api/cash-shifts','GET',undefined,employee)).status,403);await api('/api/users/employee/permissions','PUT',{permissions:policy(true)});
});
const sale=(productId,extra={})=>({checkoutIntentId:crypto.randomUUID(),cashSessionId:'open',paymentMethod:'efectivo',items:[{productId,quantity:1,source:'manual'}],...extra});
test('Cobro backend: existencias exactas, concurrencia y reintento conservan una sola salida y no filtran costos',async()=>{
 const concurrent=await Promise.all([api('/api/sales','POST',sale('limited'),employee),api('/api/sales','POST',sale('limited'),employee)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);
 const body=sale('replay'),first=await api('/api/sales','POST',body,employee),retry=await api('/api/sales','POST',body,employee);assert.equal(first.status,201);assert.equal(retry.status,200);assert.equal(first.body.id,retry.body.id);assert.deepEqual(privateFields(first.body),[]);assert.equal((await api('/api/products')).body.find(p=>p.id==='replay').stockQuantity,0);
});
test('SQLite: vacío, ausencia y documentos válidos son distintos de JSON corrupto; no hay sobrescritura ni pérdida',()=>{
 const folder=path.join(area,'sqlite-fixture');fs.mkdirSync(folder);let db=new PosDatabase(folder);const file=path.join(folder,'products.json');assert.deepEqual(db.read(file,[]),[]);assert.equal(db.readDocument('absent','missing','not-found'),'not-found');
 db.transaction(()=>db.saveDocument('products','good',{id:'good',name:'Anterior'}));assert.equal(db.read(file,[])[0].name,'Anterior');
 db.db.prepare('INSERT INTO documents VALUES(?,?,?,?)').run('products','bad','{CORRUPT-SYNTHETIC',new Date().toISOString());
 const rows=()=>JSON.stringify(db.db.prepare('SELECT * FROM documents ORDER BY collection,document_id').all()),before=rows(),backup=path.join(folder,'backups',fs.readdirSync(path.join(folder,'backups'))[0]),backupHash=sha(backup);
 assert.throws(()=>db.transaction(()=>{const products=db.read(file,[]);db.write(file,products.concat({id:'would-replace'}));}),e=>e.code==='STORAGE_READ_FAILED'&&e.statusCode===503);assert.equal(rows(),before);assert.equal(sha(backup),backupHash);
 assert.throws(()=>db.readDocument('products','bad'),e=>e.code==='STORAGE_READ_FAILED');db.close();db=new PosDatabase(folder);assert.equal(rows(),before);assert.throws(()=>db.read(file,[]),e=>e.code==='STORAGE_READ_FAILED');
 const query=db.collectionReadStatement;db.collectionReadStatement={all(){throw Object.assign(Error('controlled'),{code:'SQLITE_BUSY'});}};assert.throws(()=>db.read(file,[]),e=>e.code==='STORAGE_READ_FAILED');db.collectionReadStatement=query;assert.equal(rows(),before);db.close();
});
test('Ticket: unidades, precisión, partidas acumuladas y correcciones se validan antes de mutar',()=>{
 const text=fs.readFileSync(path.join(root,'public/app.js'),'utf8'),state={products:[{id:'kg',name:'Kg',unit:'kg',stockQuantity:1},{id:'piece',name:'Pieza',unit:'pieza',stockQuantity:3},{id:'null',name:'Sin conteo',unit:'pieza',stockQuantity:null},{id:'zero',name:'Agotado',unit:'pieza',stockQuantity:0},{id:'off',name:'Inactivo',unit:'pieza',stockQuantity:5,active:false}],ticket:[]};
 const c={state,MIN_SCALE_WEIGHT_KG:.1,MAX_SCALE_WEIGHT_KG:40,quantityText:(n,u)=>n+' '+u};vm.createContext(c);vm.runInContext(text.match(/^function getTicketStockErrors\([^]*?^}/m)[0],c);
 for(const item of [{productId:'null',unit:'pieza',quantity:1},{productId:'zero',unit:'pieza',quantity:1},{productId:'off',unit:'pieza',quantity:1},{productId:'piece',unit:'pieza',quantity:1.5},{productId:'kg',unit:'kg',quantity:NaN},{productId:'kg',unit:'kg',quantity:.1001}])assert.ok(c.getTicketStockErrors([item]).length);
 assert.equal(c.getTicketStockErrors([{productId:'kg',unit:'kg',quantity:.1},{productId:'kg',unit:'kg',quantity:.2},{productId:'kg',unit:'kg',quantity:.7}]).length,0);
 assert.ok(c.getTicketStockErrors([{productId:'kg',unit:'kg',quantity:.6,source:'scale'},{productId:'kg',unit:'kg',quantity:.5,source:'manual'}]).length);
 assert.equal(c.getTicketStockErrors([{productId:'piece',unit:'pieza',quantity:1},{productId:'piece',unit:'pieza',quantity:2}]).length,0);assert.ok(c.getTicketStockErrors([{productId:'piece',unit:'pieza',quantity:2},{productId:'piece',unit:'pieza',quantity:2}]).length);
});
async function browser(cookie,work){const {chromium}=require(process.env.EL_MUELLE_PLAYWRIGHT||'playwright');const context=await chromium.launchPersistentContext(path.join(area,'browser-'+crypto.randomUUID()),{channel:'msedge',headless:true,viewport:{width:1366,height:768}});try{await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:base}]);const page=context.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.goto(base);await page.waitForFunction(()=>state.sessionAuthenticated&&init.ready);await page.evaluate(()=>window.print=()=>{});await work(page);assert.deepEqual(errors,[]);}finally{await context.close();}}
test('Navegador administrador: carrito, bloqueo fiscal, corrección, etiqueta del ticket, PIN, fotografía y pie accesible',async()=>browser(admin,async page=>{
 await page.evaluate(()=>{setView('pos');const product=state.products.find(p=>p.id==='piece');state.selectedProduct=product;state.detectedQuantity=2;state.quantitySource='manual';addCurrentProductToTicket();});assert.match(await page.locator('#ticketToggleText').textContent(),/^(Venta actual|T-\d+)$/);assert.equal(await page.locator('#ticketToggleArrow').count(),0);
 await page.evaluate(()=>{state.selectedProduct=state.products.find(p=>p.id==='piece');state.detectedQuantity=2;addCurrentProductToTicket();});assert.equal(await page.evaluate(()=>state.ticket[0].quantity),2);
 await page.evaluate(()=>changeTicketQuantity(0,4));assert.equal(await page.evaluate(()=>state.ticket[0].quantity),2);
 await api('/api/products/piece/inventory','PATCH',{operationId:crypto.randomUUID(),stockQuantity:1,reason:'Cambio sintético previo al cobro'});
 await page.evaluate(()=>openInvoiceDecisionModal());assert.equal(await page.locator('#invoiceDecisionModal').isVisible(),false);assert.equal(await page.evaluate(()=>state.ticket[0].quantity),2);
 await page.evaluate(()=>{changeTicketQuantity(0,1);});await page.evaluate(()=>openInvoiceDecisionModal());assert.equal(await page.locator('#invoiceDecisionModal').isVisible(),true);
 await page.evaluate(()=>Promise.all([chargeSale(false),chargeSale(false)]));assert.equal(await page.evaluate(()=>state.ticket.length),0);assert.match(await page.locator('#ticketToggleText').textContent(),/^(Venta actual|T-\d+)$/);
 await page.locator('#ticketToggleBtn').press('Enter');assert.match(await page.locator('#ticketToggleBtn').getAttribute('title'),/Abrir venta actual|Cerrar venta actual/);
 await page.evaluate(()=>{selectProduct(state.products.find(p=>p.id==='kg'));openManualModal();});const eye=page.locator('#adminPinInput').locator('..').locator('button');await page.locator('#adminPinInput').fill(pin);await eye.press('Enter');assert.equal(await page.locator('#adminPinInput').getAttribute('type'),'text');await page.locator('#cancelManualWeightBtn').click();await page.evaluate(()=>openManualModal());assert.equal(await page.locator('#adminPinInput').getAttribute('type'),'password');await page.locator('#cancelManualWeightBtn').click();
 for(const [width,height]of [[1366,768],[1024,600],[390,520],[760,400]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>{document.body.classList.add('sidebar-collapsed');setView('products');fillProductForm(state.products.find(p=>p.id==='kg'));});
  const footer=page.locator('#productEditorDialog .form-actions');for(const scroll of [0,10000]){await page.locator('#productForm').evaluate((f,y)=>f.scrollTop=y,scroll);const rect=await footer.boundingBox();assert.ok(rect&&rect.y>=0&&rect.y+rect.height<=height+1);assert.ok(await page.locator('#saveProductBtn').isVisible());}
  const dimensions=await page.locator('#productEditorDialog').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,wide:[...el.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(n=>n.id||n.className).slice(0,12)}));if(dimensions.scroll>dimensions.client+2)await page.screenshot({path:path.join(dev,'em003-lot-modal-failure.png')});assert.ok(dimensions.scroll<=dimensions.client+2,JSON.stringify({width,height,...dimensions}));if(width===1366||width===390){await page.locator('#productForm').evaluate(f=>f.scrollTop=0);await page.locator('#productEditorDialog').screenshot({path:path.join(dev,'em003-lot-modal-'+width+'.png')});}await page.locator('#cancelProductFormBtn').click();
 }
 await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>{setView('products');fillProductForm(state.products.find(p=>p.id==='kg'));});await page.locator('#productPhotoInput').setInputFiles({name:'foto-sintética.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>!!state.pendingProductPhoto);assert.match(await page.locator('#productPhotoFileName').textContent(),/foto-sintética/);await page.locator('#cancelProductPhotoBtn').click();assert.equal(await page.evaluate(()=>state.pendingProductPhoto),null);await page.locator('#cancelProductFormBtn').click();
 await page.evaluate(()=>setView('dashboard'));const arrow=page.locator('[data-dashboard-cycle="1"]');await arrow.press('Enter');const box=await arrow.boundingBox();assert.equal(box.width,28);assert.equal(box.height,72);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
 const edgeStyle=await arrow.evaluate(el=>({image:getComputedStyle(el,'::before').backgroundImage,visibleWidth:getComputedStyle(el,'::before').width,background:getComputedStyle(el).backgroundColor,padding:getComputedStyle(el.closest('.business-card')).paddingLeft}));
 assert.ok(edgeStyle.image.includes('panel-edge-tab.svg'));assert.equal(edgeStyle.visibleWidth,'19px');assert.equal(edgeStyle.background,'rgba(0, 0, 0, 0)');assert.equal(edgeStyle.padding,'12px');
 await arrow.evaluate(el=>el.blur());
 for(const [width,height] of [[1366,768],[1024,700],[390,700]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>{state.sidebarCollapsed=innerWidth<600;updateShellState();});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const controls=await page.locator('#dashboardView .business-edge-arrow').evaluateAll(nodes=>nodes.filter(el=>getComputedStyle(el).display!=='none').map(el=>{const b=el.getBoundingClientRect(),p=el.closest('.business-card').getBoundingClientRect();return {left:b.left,right:b.right,pLeft:p.left,pRight:p.right};}));
  for(const button of controls){assert.ok(button.left>=button.pLeft);assert.ok(button.right<=button.pRight);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.screenshot({path:path.join(dev,'em003-visual-edge-'+width+'.png')});
 }

 for(const [width,height] of [[1366,768],[1024,600],[390,700]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>{setView('products');state.sidebarCollapsed=innerWidth<600;updateShellState();state.products.find(p=>p.id==='kg').stockQuantity=.5;renderProducts();});
  const badges=await page.locator('#productsView .status-badge').evaluateAll(nodes=>nodes.map(el=>({text:el.textContent,font:getComputedStyle(el).fontSize,wrap:getComputedStyle(el).whiteSpace,height:el.getBoundingClientRect().height})));
  assert.ok(badges.length);for(const badge of badges){assert.equal(badge.font,'10px');assert.equal(badge.wrap,'nowrap');assert.ok(badge.height<=20);}
  await page.screenshot({path:path.join(dev,'em003-visual-status-'+width+'.png')});
 }
 await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>{setView('pos');state.sidebarCollapsed=false;updateShellState();ticketLabelShowsSale=true;updateTicketLabelText();});
 assert.equal(await page.locator('#ticketToggleText').textContent(),'Venta actual');
 const restored=await page.locator('#sidebarToggleBtn').evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderWidth,asset:getComputedStyle(document.getElementById('sidebarToggleAsset')).display}));
 assert.equal(restored.background,'rgba(0, 0, 0, 0)');assert.equal(restored.border,'0px');assert.equal(restored.asset,'block');for(const name of ['abrir.svg','cerrar.svg'])assert.ok(fs.readFileSync(path.join(root,'public/assets/pos',name),'utf8').includes('fill: #1179c7;'));assert.equal(await page.locator('#ticketToggleBtn').evaluate(el=>getComputedStyle(el).fontSize),'11px');
 await page.screenshot({path:path.join(dev,'em003-visual-pos-restored.png')});
 await page.locator('#sidebarToggleBtn').press('Enter');assert.equal(await page.evaluate(()=>state.sidebarCollapsed),true);
 await page.evaluate(()=>{setView('settings');setSettingsMode('general');});await page.locator('#configurationQuickAppearanceLink').waitFor({state:'visible'});
 const type=await page.locator('#configurationQuickAppearanceLink').evaluate(el=>{const s=getComputedStyle(el),range=document.createRange();range.selectNodeContents(el);return {font:s.fontSize,weight:Number(s.fontWeight),lines:range.getClientRects().length,overflow:el.scrollWidth>el.clientWidth};});
 assert.equal(type.font,'12px');assert.equal(type.weight,600);assert.equal(type.lines,1);assert.equal(type.overflow,false);
 await page.locator('#configurationQuickAppearanceLink').click();assert.equal(await page.locator('#settingsTab-appearance').getAttribute('aria-selected'),'true');
 const keyframes=await page.evaluate(()=>[...document.querySelectorAll('.app-view.active')].flatMap(el=>el.getAnimations({subtree:true})).flatMap(a=>a.effect?.getKeyframes()||[]));assert.ok(keyframes.every(f=>!f.transform||f.transform==='none'));
 await page.evaluate(()=>setSettingsMode('general'));await page.screenshot({path:path.join(dev,'em003-visual-settings-type.png')});
 const large=[];for(const view of ['products','inventory','reports','sales','billing','settings']){await page.evaluate(v=>setView(v),view);await page.waitForTimeout(200);large.push(...await page.locator('.app-view.active button:visible').evaluateAll(nodes=>nodes.filter(el=>parseFloat(getComputedStyle(el).fontSize)>14&&el.textContent.trim().length>3).map(el=>({id:el.id,text:el.textContent.trim().slice(0,60),size:getComputedStyle(el).fontSize,weight:getComputedStyle(el).fontWeight}))));}console.log('BUTTON_TYPE_AUDIT '+JSON.stringify(large));

}));
test('Navegador empleado: reportes, CSV, impresión, inventario y estado no conservan costos internos',async()=>browser(employee,async page=>{
 const leaks=await page.evaluate(async()=>{setView('reports');await loadReports();const reports=[];for(const type of ['sales','products','inventory']){$('reportTypeFilter').value=type;reports.push(getGeneratedReport());}return reports;});for(const report of leaks){assert.deepEqual(privateFields(report),[]);assert.ok(!JSON.stringify(report).includes('41.73'));assert.ok(!report.headers.some(h=>/Costo|Margen|Ganancia|Valor/.test(h)));}
 await page.evaluate(()=>{const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.syntheticCSV=blob;return original(blob);};renderReports();exportGeneratedReport();printGeneratedReport();});const csv=await page.evaluate(()=>window.syntheticCSV.text());assert.ok(!/Costo|Ganancia|Margen|41\.73/.test(csv));const printed=await page.locator('#printArea').textContent();assert.ok(!/41\.73|58\.27|125\.19|174\.81/.test(printed));assert.match(printed,/Valor invertido/);assert.match(printed,/Venta proyectada/);assert.match(printed,/Restringido/);
 await page.evaluate(async()=>{setView('inventory');await loadInventoryEntries();});assert.deepEqual(await page.evaluate(()=>Object.keys(state.products[0]).filter(k=>/cost|profit|margin/i.test(k))),[]);
 const privateVisible=await page.locator('[data-admin-finance]').evaluateAll(nodes=>nodes.some(n=>getComputedStyle(n).display!=='none'));assert.equal(privateVisible,false);
 const intent=crypto.randomUUID();await page.evaluate(id=>sessionStorage.setItem('elmuelle.pending-checkout',JSON.stringify({ownerId:state.currentUser.id,payload:{checkoutIntentId:id,cashSessionId:'open',paymentMethod:'efectivo',items:[{productId:'piece',name:'Legado sintético',unit:'pieza',quantity:1,price:100,total:100,costPrice:41.73,lineCost:41.73,grossProfit:58.27,source:'manual'}]}})),intent);
 await page.reload();await page.waitForFunction(()=>state.sessionAuthenticated&&init.ready);const restored=await page.evaluate(()=>({ticket:state.ticket,pending:state.checkoutPending,stored:sessionStorage.getItem('elmuelle.pending-checkout')}));assert.deepEqual(privateFields(restored.ticket),[]);assert.deepEqual(privateFields(restored.pending),[]);assert.ok(!restored.stored.includes('41.73'));assert.equal(restored.pending.payload.checkoutIntentId,intent);
}));
test('KPI por rol: identidad, valores, filtros, cuatro resoluciones y navegación financiera sin cálculos privados',async()=>{
 const identities={};
 const reportLabels={sales:['Total vendido','Ventas','Ticket promedio','Margen'],products:['Ingreso acumulado','Productos con venta','Ventas','Margen'],inventory:['Valor invertido','Productos activos','Inventario bajo','Venta proyectada']};
 for(const [role,cookie] of [['admin',admin],['employee',employee]])await browser(cookie,async page=>{
  // These tripwires reject any employee invocation of private financial calculations.
  if(role==='employee')await page.evaluate(()=>{getSaleProfit=()=>{throw Error('Employee profitability calculation');};calculateFinancialProjection=()=>{throw Error('Employee projection calculation');};});
  for(const [width,height] of [[1366,768],[1024,600],[768,1024],[390,844]]){
   await page.setViewportSize({width,height});
   for(const view of ['dashboard','products','inventory','cash','sales','products-report','inventory-report']){
    const reportType=view.endsWith('-report')?view.replace('-report',''):view==='sales'?'sales':null;
    await page.evaluate(async({view,reportType})=>{
     state.sidebarCollapsed=innerWidth<600;updateShellState();
     if(reportType){setReportsMode('reports');setView('reports');await loadReports();$('reportTypeFilter').value=reportType;$('reportPeriodFilter').value='all';renderReports();}
     else if(view==='cash'){setReportsMode('cash');setView('reports');await loadCashCut();setCashTab('history');}
     else {setView(view);if(view==='dashboard'){$('dashboardPeriodFilter').value='all';await loadDashboard();}if(view==='products')await loadProducts();if(view==='inventory'){await loadProducts();await loadInventoryEntries();document.querySelector('.management-valuation').open=true;}}
     await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    },{view,reportType});
    const selector=reportType?'#reportsView .report-kpis > article':{dashboard:'#dashboardView .business-kpis > article',products:'#productsView .management-indicators > article',inventory:'#inventoryView .inventory-catalog-board .management-indicators > article',cash:'#reportsView .cashdesk-period-kpis > article'}[view];
    const cards=await page.locator(selector).evaluateAll(nodes=>nodes.map(el=>{const b=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect(),note=el.querySelector('small')?.cloneNode(true);note?.querySelectorAll('[id]').forEach(n=>n.textContent='#');return {label:(el.querySelector('div > span')||el.querySelector(':scope > span'))?.textContent.trim(),icon:el.querySelector('svg')?.outerHTML,note:note?.textContent.trim(),position:[b.x-p.x,b.y-p.y,b.width,b.height].map(n=>Math.round(n*10)/10),visible:getComputedStyle(el).display!=='none'};}));
    assert.equal(cards.length,view==='dashboard'?5:4,view);assert.ok(cards.every(c=>c.visible));
    assert.ok(cards.every(c=>c.position[2]>0),JSON.stringify(await page.evaluate(()=>({active:state.activeView,mode:state.reportsMode,user:state.currentUser,reportClass:$('reportsView').className,ancestors:[...document.querySelectorAll('#reportsView, .report-generator-panel, #reportContent, .report-kpis')].map(n=>({id:n.id,cls:n.className,hidden:n.hidden,display:getComputedStyle(n).display}))}))));
    const key=width+'-'+view;if(role==='admin')identities[key]=cards;else assert.deepEqual(cards,identities[key],key+' identity');
    const clipped=await page.locator(selector+' strong').evaluateAll(nodes=>nodes.filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1).map(el=>({id:el.id,text:el.textContent,width:el.clientWidth,scroll:el.scrollWidth})));
    assert.deepEqual(clipped,[],role+' '+key+' clipped values');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,role+' '+key+' document overflow');
    if(reportType){
     const report=await page.evaluate(()=>state.generatedReport);assert.deepEqual(report.kpis.map(k=>k[0]),reportLabels[reportType]);
     const operational=await page.evaluate(type=>{const sales=getCompletedSalesForPeriod('all',getLocalDateString()),total=sales.reduce((n,s)=>n+Number(s.total||0),0);return type==='inventory'?[String(state.products.filter(p=>p.active!==false).length),String(state.products.filter(p=>p.active!==false&&typeof p.stockQuantity==='number'&&p.stockQuantity<=Number(p.minStock||0)).length)]:[money(total),String(sales.length)];},reportType);
     assert.equal(report.kpis[reportType==='inventory'?1:0][1],operational[0]);assert.equal(report.kpis[reportType==='inventory'?2:reportType==='products'?2:1][1],operational[1]);
     if(role==='employee'){assert.deepEqual(privateFields(report),[]);for(const i of reportType==='inventory'?[0,3]:[3])assert.equal(report.kpis[i][1],'Restringido');}
     else if(reportType==='inventory')assert.equal(report.kpis[0][1],'Pendiente'); // Stock without a count remains unknown.
     else {const expected=await page.evaluate(()=>{const sales=getCompletedSalesForPeriod('all',getLocalDateString());const total=sales.reduce((n,s)=>n+s.total,0),profit=sales.reduce((n,s)=>n+s.grossProfit,0);return(total?100*profit/total:0).toFixed(2)+'%';});assert.equal(report.kpis[3][1],expected);}
    }
    if(role==='employee'){
     const ids=view==='dashboard'?['dashboardProfit','dashboardReinvest','dashboardMargin']:view==='products'?['catalogInventoryValue']:view==='inventory'?['inventoryInvestmentValue','inventoryProjectedValue','inventoryProjectedProfit']:view==='cash'?['cutGrossProfit','cutMargin']:[];
     for(const id of ids){assert.equal(await page.locator('#'+id).textContent(),'Restringido');assert.equal(await page.locator('#'+id).isVisible(),true);}
     if(view==='cash')assert.deepEqual(privateFields(await page.evaluate(()=>state.currentCutTotals)),[]);
     if(reportType&&width===1366){await page.evaluate(()=>{window.print=()=>{};const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.syntheticCSV=blob;return original(blob);};exportGeneratedReport();printGeneratedReport();});assert.ok(!/41\.73|58\.27|125\.19|174\.81/.test(await page.evaluate(()=>window.syntheticCSV.text())));assert.ok(!/41\.73|58\.27|125\.19|174\.81/.test(await page.locator('#printArea').textContent()));assert.match(await page.locator('#printArea').textContent(),/Restringido/);}
    }
    if(role==='employee'&&[1366,390].includes(width))await page.screenshot({path:path.join(dev,'em003-kpi-'+role+'-'+view+'-'+width+'.png')});
   }
   await page.evaluate(()=>{setView('dashboard');selectDashboardMetric('sales');$('dashboardView').dataset.trendMetric='profit';renderDashboard();});
   const metrics=[];for(let i=0;i<5;i++){
    await page.locator('[data-dashboard-cycle="1"]').press('Enter');
    const metric=await page.evaluate(()=>$('dashboardView').dataset.metric);metrics.push(metric);
    if(role==='employee'&&['profit','margin'].includes(metric)){assert.equal((await page.locator('#dashboardSalesChart').textContent()).trim(),'Restringido');assert.equal(await page.locator('#dashboardSalesChart svg').count(),0);await page.evaluate(()=>renderDashboard());assert.equal(await page.evaluate(()=>$('dashboardView').dataset.metric),metric);}
   }assert.deepEqual(metrics,['profit','average','count','margin','sales']);
   const trends=[];for(let i=0;i<3;i++){await page.locator('[data-dashboard-trend-cycle="1"]').press('Enter');trends.push(await page.evaluate(()=>$('dashboardView').dataset.trendMetric));}assert.deepEqual(trends,['average','count','profit']);
   if(role==='employee'){assert.equal((await page.locator('#dashboardTrendChart').textContent()).trim(),'Restringido');assert.equal(await page.locator('#dashboardTrendChart svg').count(),0);}
   await page.screenshot({path:path.join(dev,'em003-kpi-'+role+'-'+width+'.png')});
  }
  if(role==='employee'){
   const leak=await page.evaluate(()=>({products:state.products,sales:state.sales,entries:state.inventoryEntries,report:state.generatedReport,totals:getSalesTotals(state.sales),html:document.body.innerHTML,local:{...localStorage},session:{...sessionStorage},costInputs:[$('productCostInput').value,$('inventoryEntryUnitCostInput').value]}));
   for(const item of [leak.products,leak.sales,leak.entries,leak.report,leak.totals])assert.deepEqual(privateFields(item),[]);
   assert.ok(!/41\.73|58\.27|125\.19|174\.81/.test(JSON.stringify(leak)));assert.deepEqual(leak.costInputs,['','']);
  }
 });
 console.log('KPI_ROLE_CHECK '+JSON.stringify({resolutions:4,identityGroups:Object.keys(identities).length,roles:2,metricOptions:5,trendOptions:3}));
});

test('KPI y sesión: administrador → empleado → recarga → administrador sin caché financiera anterior',async()=>{
 const freshAdmin=(await api('/api/auth/admin','POST',{pin},null)).cookie;
 await browser(freshAdmin,async page=>{
  await page.evaluate(async()=>{setView('products');fillProductForm(state.products.find(p=>p.id==='kg'));setReportsMode('reports');setView('reports');await loadReports();$('reportPeriodFilter').value='all';renderReports();printGeneratedReport();});
  assert.ok((await page.locator('#printArea').textContent()).includes('58.27'));
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/auth/logout')),page.evaluate(()=>logoutToAccess())]);
  assert.equal(await page.locator('#printArea').textContent(),'');assert.equal(await page.evaluate(()=>state.generatedReport),null);
  await page.locator('[data-access-user="employee"]').click();await page.locator('#accessPinInput').fill('135790');await page.locator('#accessLoginBtn').click();await page.waitForFunction(()=>state.sessionAuthenticated&&state.currentUser.role==='employee');
  for(const reload of [false,true]){
   if(reload){await page.reload();await page.waitForFunction(()=>state.sessionAuthenticated&&init.ready);await page.evaluate(()=>window.print=()=>{});}
   await page.evaluate(async()=>{setView('dashboard');await loadDashboard();setReportsMode('reports');setView('reports');await loadReports();$('reportPeriodFilter').value='all';renderReports();printGeneratedReport();});
   assert.equal(await page.locator('#reportKpiFourthLabel').textContent(),'Margen');assert.equal(await page.locator('#reportKpiFourth').textContent(),'Restringido');
   const sensitive=await page.evaluate(()=>({products:state.products,sales:state.sales,report:state.generatedReport,html:document.body.innerHTML,local:{...localStorage},session:{...sessionStorage}}));assert.deepEqual(privateFields(sensitive.products),[]);assert.deepEqual(privateFields(sensitive.sales),[]);assert.deepEqual(privateFields(sensitive.report),[]);assert.ok(!/41\.73|58\.27|125\.19|174\.81/.test(JSON.stringify(sensitive)));
  }
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/auth/logout')),page.evaluate(()=>logoutToAccess())]);
  await page.locator('[data-access-user="admin"]').click();await page.locator('#accessPinInput').fill(pin);await page.locator('#accessLoginBtn').click();await page.waitForFunction(()=>state.sessionAuthenticated&&state.currentUser.role==='admin');
  await page.evaluate(async()=>{setReportsMode('reports');setView('reports');await loadReports();$('reportPeriodFilter').value='all';renderReports();});assert.notEqual(await page.locator('#reportKpiFourth').textContent(),'Restringido');assert.equal(await page.evaluate(()=>state.products.find(p=>p.id==='kg').costPrice),41.73);
 });
});

test('API: lectura corrupta devuelve error controlado y bloquea una escritura de inventario sin perder registros',async()=>{
 const file=path.join(data,p.DATABASE_NAME),db=new DatabaseSync(file);try{
  db.prepare("UPDATE documents SET payload=? WHERE collection='inventory-entries' AND document_id='I-PRIVATE'").run('{CORRUPT-SYNTHETIC');
  const state=()=>JSON.stringify(db.prepare('SELECT * FROM documents ORDER BY collection,document_id').all()),before=state(),backups=fs.readdirSync(path.join(data,'backups')).map(name=>[name,sha(path.join(data,'backups',name))]);
  const read=await api('/api/inventory/entries','GET',undefined,employee);assert.equal(read.status,503);assert.ok(!JSON.stringify(read.body).includes('CORRUPT-SYNTHETIC'));assert.ok(!JSON.stringify(read.body).includes(data));
  const write=await api('/api/inventory/entries','POST',{operationId:crypto.randomUUID(),productId:'kg',quantity:1,unitCost:30,reason:'No debe confirmarse'});assert.equal(write.status,503);assert.equal(state(),before);assert.deepEqual(fs.readdirSync(path.join(data,'backups')).map(name=>[name,sha(path.join(data,'backups',name))]),backups);
 }finally{db.close();}
});
