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
async function browser(cookie,work,options={}){const {chromium}=require(process.env.EL_MUELLE_PLAYWRIGHT||'playwright');const {reference,...launchOptions}=options;const context=await chromium.launchPersistentContext(path.join(area,'browser-'+crypto.randomUUID()),{channel:'msedge',headless:true,viewport:{width:1366,height:768},...launchOptions});try{await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:base}]);const page=context.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);if(reference){for(const name of ['index.html','app.js','catalog-workflows.js','styles.css','settings-center.js','configuration.css']){const content=require('node:child_process').execFileSync('git',['show',reference+':public/'+name],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});await page.route(name==='index.html'?base+'/':'**/'+name,route=>route.fulfill({body:content,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'}));}}await page.goto(base);await page.waitForFunction(()=>state.sessionAuthenticated&&init.ready);await page.evaluate(()=>window.print=()=>{});await work(page);assert.deepEqual(errors,[]);}finally{await context.close();}}
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
  await page.evaluate(async()=>{setView('inventory');await loadInventoryEntries();setInventoryMode('history');setView('products');fillProductForm(state.products.find(p=>p.id==='kg'));setReportsMode('reports');setView('reports');await loadReports();$('reportPeriodFilter').value='all';renderReports();printGeneratedReport();});
  await page.evaluate(async()=>{setProductMode('list');setView('inventory');setInventoryMode('history');await loadInventoryEntries();});await page.locator('.inventory-history-finance summary').first().click();await page.waitForFunction(()=>!!document.querySelector('.inventory-history-finance dl'));assert.match(await page.locator('#inventoryEntriesList').innerHTML(),/41\.73/);assert.ok(!await page.evaluate(()=>renderInventoryEntries.cache.html.includes('41.73')));
  assert.ok((await page.locator('#printArea').textContent()).includes('58.27'));
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/auth/logout')),page.evaluate(()=>logoutToAccess())]);
  assert.equal(await page.locator('#printArea').textContent(),'');assert.equal(await page.locator('#inventoryEntriesList').textContent(),'');assert.equal(await page.evaluate(()=>renderInventoryEntries.cache),null);assert.equal(await page.evaluate(()=>state.generatedReport),null);
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

test('Compacto funcional: navegación contextual, borrador, operaciones, fotografía y reintento seguro',async()=>{
 const product=(await api('/api/products','POST',{operationId:crypto.randomUUID(),name:'Flujo compacto sintético',category:'Pescados y mariscos',unit:'pieza',price:100,costPrice:40,minStock:1,active:true})).body;
 assert.equal((await api('/api/inventory/counts','POST',{operationId:crypto.randomUUID(),productId:product.id,quantity:3,reason:'Conteo sintético de la prueba compacta'})).status,201);
 await browser(admin,async page=>{
  await page.evaluate(async id=>{await loadProducts();setView('products');fillProductForm(state.products.find(p=>p.id===id));},product.id);
  await page.locator('#productNameInput').fill('Borrador que no debe perderse');await page.locator('#productInventoryShortcutBtn').click();await page.locator('#productConfirmNoBtn').click();assert.equal(await page.locator('#productNameInput').inputValue(),'Borrador que no debe perderse');assert.equal(await page.locator('#productEditorDialog').isVisible(),true);
  const stockBefore=(await api('/api/products')).body.find(p=>p.id===product.id).stockQuantity;
  await page.locator('#productInventoryShortcutBtn').click();await page.locator('#productConfirmYesBtn').click();await page.waitForFunction(id=>state.activeView==='inventory'&&$('inventoryEntryProductInput').value===id,product.id);
  assert.equal((await api('/api/products')).body.find(p=>p.id===product.id).stockQuantity,stockBefore);assert.equal(await page.evaluate(()=>document.querySelector('.inventory-management-layout').dataset.inventoryMode),'entry');assert.equal(await page.evaluate(()=>getInventoryEntryMode()),'existing');
  await page.locator('#inventoryEntryQuantityInput').fill('2');await page.locator('#inventoryEntryUnitCostInput').fill('40');await page.locator('#inventoryEntrySalePriceInput').fill('100');await page.locator('#inventoryEntryNotesInput').fill('Recepción compacta sintética');await page.locator('#saveInventoryEntryBtn').click();await page.locator('#productConfirmYesBtn').click();await page.waitForFunction(id=>state.products.find(p=>p.id===id)?.stockQuantity===5,product.id);
  for(const [mode,quantity,result] of [['adjustment','4',4],['waste','1',3]]){
   await page.waitForFunction(()=>!state.inventorySaving);
   await page.evaluate(({id,mode})=>{setInventoryMode('entry');setInventoryMovementMode(mode);$('inventoryEntryProductInput').value=id;populateInventoryEntryDefaults();},{id:product.id,mode});
   assert.equal(await page.locator('.entry-mode-toggle').isVisible(),false);
   await page.locator('#inventoryEntryQuantityInput').fill(quantity);await page.locator('#inventoryEntryNotesInput').fill('Motivo '+mode+' sintético');await page.locator('#saveInventoryEntryBtn').click();await page.locator('#productConfirmYesBtn').click();await page.waitForFunction(({id,result})=>state.products.find(p=>p.id===id)?.stockQuantity===result,{id:product.id,result});
  }
  await page.waitForFunction(()=>!state.inventorySaving);
  await page.evaluate(()=>{setInventoryMovementMode('receipt');setInventoryEntryMode('new');});await page.locator('#inventoryNewProductNameInput').fill('Alta con recepción compacta');await page.evaluate(()=>$('inventoryNewProductUnitInput').value='pieza');await page.locator('#inventoryEntryQuantityInput').fill('2');await page.locator('#inventoryEntryUnitCostInput').fill('20');await page.locator('#inventoryEntrySalePriceInput').fill('70');await page.locator('#inventoryEntryNotesInput').fill('Alta y recepción sintética');await page.locator('#saveInventoryEntryBtn').click();await page.locator('#productConfirmYesBtn').click();await page.waitForFunction(()=>state.products.some(p=>p.name==='Alta con recepción compacta'&&p.stockQuantity===2));
  await page.locator('#inventoryEntryQuantityInput').fill('9');await page.locator('#resetInventoryEntryBtn').click();assert.equal(await page.locator('#inventoryEntryQuantityInput').inputValue(),'');assert.equal(await page.evaluate(()=>getInventoryEntryMode()),'existing');
  await page.evaluate(async()=>{await openProductInventoryEntry('unknown');});assert.equal(await page.locator('#entryCurrentStock').textContent(),'Sin verificar');assert.equal(await page.locator('#entryNewStock').textContent(),'Requiere conteo inicial');await page.locator('#inventoryEntryQuantityInput').fill('1');await page.locator('#inventoryEntryNotesInput').fill('No se permite sin conteo');await page.locator('#saveInventoryEntryBtn').click();assert.equal(await page.locator('#productConfirmModal').isVisible(),false);assert.equal((await api('/api/products')).body.find(p=>p.id==='unknown').stockQuantity,null);
  assert.equal(await page.evaluate(()=>openProductInventoryEntry('inactive')),false);assert.equal(await page.evaluate(()=>openProductInventoryEntry('missing-synthetic')),false);
  // The server commits once, but the first response is lost. The UI retries its original operation.
  await page.evaluate(id=>{setView('products');fillProductForm(state.products.find(p=>p.id===id));},product.id);await page.locator('#productNameInput').fill('Producto editado compacto');await page.locator('#productPhotoInput').setInputFiles({name:'compacto.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>!!state.pendingProductPhoto);
  let lost=false;await page.route('**/api/products/'+product.id,async route=>{if(route.request().method()==='PUT'&&!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await page.locator('#saveProductBtn').click();await page.locator('#productConfirmYesBtn').click();await page.waitForFunction(()=>!state.productSaving);assert.equal(await page.locator('#productEditorDialog').isVisible(),true);assert.equal(await page.evaluate(()=>!!state.pendingProductPhoto),true);
  const committed=(await api('/api/products')).body.find(p=>p.id===product.id),photoHash=committed.photoSHA256;assert.ok(photoHash);assert.equal(committed.stockQuantity,3);
  await page.locator('#saveProductBtn').click();await page.locator('#productConfirmYesBtn').click();await page.waitForFunction(()=>!$('productEditorDialog').open);assert.equal((await api('/api/products')).body.find(p=>p.id===product.id).photoSHA256,photoHash);await page.unroute('**/api/products/'+product.id);
  await page.evaluate(id=>fillProductForm(state.products.find(p=>p.id===id)),product.id);await page.locator('#productPhotoInput').setInputFiles({name:'cancelada.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>!!state.pendingProductPhoto);await page.locator('#cancelProductFormBtn').click();assert.equal(await page.evaluate(()=>state.pendingProductPhoto),null);assert.equal((await api('/api/products')).body.find(p=>p.id===product.id).photoSHA256,photoHash);
  const count=(await api('/api/products')).body.length;await page.evaluate(()=>{resetProductForm();setProductMode('form');});await page.locator('#productNameInput').fill('Alta comercial compacta');await page.locator('#productPriceInput').fill('25');await page.locator('#productCostInput').fill('10');await page.locator('#saveProductBtn').click();await page.locator('#productConfirmYesBtn').click();await page.waitForFunction(()=>!$('productEditorDialog').open);const made=(await api('/api/products')).body;assert.equal(made.length,count+1);assert.equal(made.find(p=>p.name==='Alta comercial compacta').stockQuantity,null);
 });
});

test('Compacto ayudas: hover, teclado, toque, cierre, límites y nueve secciones reales',async()=>browser(admin,async page=>{
 await page.evaluate(()=>{setView('inventory');setInventoryMode('entry');});const help=page.locator('#inventoryEntryForm [data-context-help="inventory-entry"]');
 const before=await page.locator('#inventoryEntryForm').boundingBox();await help.hover();const tip=page.locator('.context-help-tooltip');assert.equal(await tip.isVisible(),true);assert.equal(await help.getAttribute('aria-expanded'),'true');assert.equal(await tip.getAttribute('role'),'tooltip');assert.equal(await help.getAttribute('aria-describedby'),await tip.getAttribute('id'));assert.equal((await page.locator('#inventoryEntryForm').boundingBox()).height,before.height);
 await page.mouse.move(1,1);await page.waitForFunction(()=>!document.querySelector('.context-help-tooltip'));await help.focus();assert.equal(await tip.isVisible(),true);await page.keyboard.press('Escape');assert.equal(await tip.count(),0);assert.equal(await help.getAttribute('aria-expanded'),'false');
 await help.click();assert.equal(await tip.isVisible(),true);await page.locator('#inventoryEntryQuantityInput').click();assert.equal(await tip.count(),0);
 await page.evaluate(()=>{setView('settings');setSettingsMode('general');});
 const sections=['general','business','scale','users','peripherals','fiscal','appearance','audit','maintenance'];for(const section of sections){await page.evaluate(s=>setSettingsMode(s),section);const button=page.locator('[data-context-help="settings"]');await button.click();assert.equal(await tip.isVisible(),true);assert.ok((await tip.textContent()).length>100);const b=await tip.boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=1367&&b.y+b.height<=769);if(section==='fiscal')assert.match(await tip.textContent(),/no es un CFDI emitido/);await page.keyboard.press('Escape');assert.equal(await tip.count(),0);}
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{state.sidebarCollapsed=true;setView('inventory');setInventoryMode('entry');updateShellState();});await help.scrollIntoViewIfNeeded();const rect=await help.boundingBox();await page.touchscreen.tap(rect.x+rect.width/2,rect.y+rect.height/2);assert.equal(await tip.isVisible(),true);let b=await tip.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=391&&b.y>=0&&b.y+b.height<=845);await page.touchscreen.tap(4,4);assert.equal(await tip.count(),0);
 await page.evaluate(()=>{setView('products');fillProductForm(state.products.find(p=>p.id==='kg'));});const dialogHelp=page.locator('#productForm [data-context-help="products"]');await dialogHelp.focus();assert.equal(await tip.isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#productEditorDialog').isVisible(),true);assert.equal(await tip.count(),0);await page.locator('#cancelProductFormBtn').click();
 await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>{state.sidebarCollapsed=false;setView('inventory');setInventoryMode('entry');updateShellState();});await page.locator('[data-inventory-mode-btn="entry"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.querySelector('.inventory-management-layout').dataset.inventoryMode),'history');await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>document.querySelector('.inventory-management-layout').dataset.inventoryMode),'entry');await page.locator('[data-inventory-operation="receipt"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>state.inventoryMovementMode),'adjustment');await page.keyboard.press('Home');await page.locator('[data-entry-product-mode="existing"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>getInventoryEntryMode()),'new');
},{hasTouch:true}));

test('Compacto permisos: consulta sin costos, entrada prohibida y ayudas autorizadas',async()=>browser(employee,async page=>{
 await page.evaluate(async()=>{setView('products');await loadProducts();});assert.equal(await page.locator('[data-entry-for-product]').count(),0);assert.equal(await page.evaluate(()=>openProductInventoryEntry('kg')),false);
 await page.evaluate(async()=>{setView('inventory');setInventoryMode('history');await loadInventoryEntries();});const mode=await page.evaluate(()=>document.querySelector('.inventory-management-layout').dataset.inventoryMode);await page.evaluate(()=>setInventoryMode('entry'));assert.equal(await page.evaluate(()=>document.querySelector('.inventory-management-layout').dataset.inventoryMode),mode);assert.equal(await page.locator('.inventory-history-finance').count(),0);assert.ok(!/41\.73|58\.27/.test(await page.locator('#inventoryEntriesList').innerHTML()));assert.deepEqual(privateFields(await page.evaluate(()=>state.inventoryEntries)),[]);
 await page.evaluate(()=>{setView('settings');setSettingsMode('general');});for(const section of ['business','users','fiscal','audit','maintenance']){await page.evaluate(s=>setSettingsMode(s),section);assert.equal(await page.evaluate(()=>document.querySelector('.settings-layout').dataset.settingsMode),'general');}
 await api('/api/users/employee/permissions','PUT',{permissions:{...policy(true),inventory:false}});await page.waitForFunction(()=>state.currentUser.permissions.inventory===false);assert.equal(await page.evaluate(()=>renderInventoryEntries.cache),null);assert.equal((await api('/api/inventory/entries','GET',undefined,employee)).status,403);await api('/api/users/employee/permissions','PUT',{permissions:policy(true)});
}));

test('Compacto: composición, proyecciones y rendimiento sobre la misma muestra sintética',async()=>{
 const phase=process.env.EL_MUELLE_COMPACT_PHASE||'after';assert.ok(['before','after'].includes(phase));
 const entries=Array.from({length:36},(_,i)=>({id:'I-COMPACT-'+String(i).padStart(2,'0'),productId:'kg',productName:'Producto sintético con nombre extenso '+i,unit:'kg',type:['received','adjustment','waste','initial_count','restitution','initial_receipt'][i%6],quantity:i%6===2?-1:2,previousStock:i%6===3?null:2,newStock:i%6===2?1:4,reason:'Motivo sintético verificable '+i+' · Recepción, conteo o conciliación registrada para comprobar la lectura de un historial extenso.',receivedAt:'2026-10-'+String(28-i%5),createdAt:'2026-10-'+String(28-i%5)+'T12:00:00Z',createdBy:{id:'admin',name:'Responsable sintético',role:'admin'},unitCost:41.73,totalCost:83.46,weightedAverageCost:41.73,projectedRevenue:200,projectedProfit:116.54,supplier:'Proveedor sintético'}));
 const baseEntry=(await api('/api/inventory/entries')).body.find(entry=>entry.id==='I-PRIVATE');assert.ok(baseEntry);
 const db=new DatabaseSync(path.join(data,p.DATABASE_NAME));try{db.prepare("DELETE FROM documents WHERE collection='inventory-entries'").run();const insert=db.prepare('INSERT OR REPLACE INTO documents VALUES(?,?,?,?)');for(const entry of [baseEntry,...entries])insert.run('inventory-entries',entry.id,JSON.stringify(entry),entry.createdAt);}finally{db.close();}
 const result={phase,conditions:{entries:37,products:(await api('/api/products')).body.length,samples:7,warmups:1,node:process.version,headlessEdge:true,fixtureSHA256:crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex')},layouts:{},projections:null,performance:null};
 await browser(admin,async page=>{
  await page.evaluate(async()=>{setView('inventory');await loadInventoryEntries();setInventoryMode('entry');$('inventoryEntryProductInput').value='kg';populateInventoryEntryDefaults();$('inventoryEntryQuantityInput').value='2';updateInventoryEntryProjection();});
  result.projections=await page.locator('.inventory-entry-metrics > article').evaluateAll(nodes=>nodes.map(n=>({label:n.querySelector('span').textContent,value:n.querySelector('strong').textContent,id:n.querySelector('strong').id})));
  for(const [width,height] of [[1366,598],[1366,768],[1440,900],[390,844]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>{state.sidebarCollapsed=innerWidth<600;updateShellState();setView('inventory');setInventoryMode('entry');});await page.waitForTimeout(250);
   const rect=async selector=>page.locator(selector).evaluate(n=>{const b=n.getBoundingClientRect();return {height:b.height,width:b.width,scroll:n.scrollHeight,client:n.clientHeight,overflow:getComputedStyle(n).overflowY};});
   result.layouts[width+'x'+height]={entry:await rect('#inventoryEntryForm'),analysis:await rect('.inventory-analysis-panel')};
   if(phase==='after'){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);assert.equal(result.layouts[width+'x'+height].entry.overflow,'visible');assert.equal(await page.locator('.inventory-entry-metrics > article').count(),8);await page.waitForFunction(()=>getComputedStyle(document.querySelector('.inventory-subview-tabs [aria-selected="true"]')).color.match(/\d+/g).slice(0,3).every(n=>Number(n)>=250));}
   await page.screenshot({path:path.join(dev,'em003-compact-'+phase+'-entry-'+width+'x'+height+'.png')});
   if(phase==='after'){await page.evaluate(()=>setInventoryEntryMode('new'));for(const id of ['inventoryNewProductNameInput','inventoryNewProductCategoryInput','inventoryNewProductUnitInput','inventoryNewProductMinStockInput'])assert.equal(await page.locator('#'+id).isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.screenshot({path:path.join(dev,'em003-compact-after-new-entry-'+width+'x'+height+'.png')});await page.evaluate(()=>{setInventoryEntryMode('existing');$('inventoryEntryProductInput').value='kg';populateInventoryEntryDefaults();$('inventoryEntryQuantityInput').value='2';updateInventoryEntryProjection();});}
   await page.evaluate(()=>setInventoryMode('history'));if(phase==='after'){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);const scroll=await page.locator('.inventory-history-scroll').evaluate(n=>({scroll:n.scrollWidth,client:n.clientWidth}));assert.ok(width>650||scroll.scroll>scroll.client);}
   await page.screenshot({path:path.join(dev,'em003-compact-'+phase+'-history-'+width+'x'+height+'.png')});
   await page.evaluate(()=>{setView('products');fillProductForm(state.products.find(p=>p.id==='kg'));});result.layouts[width+'x'+height].product=await rect('#productForm');await page.screenshot({path:path.join(dev,'em003-compact-'+phase+'-product-'+width+'x'+height+'.png')});await page.locator('#cancelProductFormBtn').click();
   if(phase==='after')assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  }
  if(phase==='after'){
   await page.evaluate(async()=>{setView('inventory');await loadInventoryEntries();setInventoryMode('history');});assert.equal(await page.locator('.inventory-history-row').count(),37);
   await page.locator('.inventory-history-finance summary').first().click();await page.waitForFunction(()=>!!document.querySelector('.inventory-history-finance dl'));assert.match(await page.locator('.inventory-history-finance dl').first().textContent(),/Costo por unidad.*41\.73/);await page.locator('.inventory-history-finance summary').first().click();
   await page.locator('#inventoryEntrySearchInput').fill('I-COMPACT-01');assert.equal(await page.locator('.inventory-history-row').count(),1);assert.match(await page.locator('#inventoryEntriesList').textContent(),/Responsable sintético/);await page.locator('#clearInventoryHistoryBtn').click();
   await page.evaluate(()=>{$('inventoryHistoryType').value='waste';$('inventoryHistoryType').dispatchEvent(new Event('change'));});assert.equal(await page.locator('.inventory-history-row').count(),6);
   await page.evaluate(()=>{$('inventoryHistoryFrom').value='2026-10-26';$('inventoryHistoryTo').value='2026-10-27';$('inventoryHistoryFrom').dispatchEvent(new Event('change'));});assert.equal(await page.locator('.inventory-history-row').count(),3);
   await page.locator('#inventoryEntrySearchInput').fill('no existe este movimiento');assert.equal(await page.locator('.inventory-history-row').count(),0);assert.match(await page.locator('#inventoryEntriesList').textContent(),/No hay movimientos/);await page.locator('#clearInventoryHistoryBtn').click();assert.equal(await page.locator('.inventory-history-row').count(),37);
   await page.evaluate(()=>{state.inventoryEntries=[];renderInventoryEntries();});assert.equal(await page.locator('.inventory-history-row').count(),0);await page.evaluate(()=>loadInventoryEntries());assert.match(await page.locator('#inventoryEntriesList').textContent(),/Sin responsable registrado/);
  }
  await page.setViewportSize({width:1366,height:598});
  result.performance=await page.evaluate(async()=>{
   const original=fetchJson;let pending=0;fetchJson=async(...args)=>{pending++;try{return await original(...args);}finally{pending--;}};
   const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),next=async()=>{await frames();while(pending)await new Promise(r=>setTimeout(r,5));await frames();},samples={entry:[],tabs:[],history:[],product:[],navigation:[],helpOpen:[],helpClose:[]};
   for(let i=0;i<8;i++){
    setView('inventory');await loadInventoryEntries();setInventoryMode('stock');await next();let t=performance.now();setInventoryMode('entry');await next();if(i)samples.entry.push(performance.now()-t);
    t=performance.now();setInventoryEntryMode(i%2?'existing':'new');await next();if(i)samples.tabs.push(performance.now()-t);setInventoryEntryMode('existing');
    const historyRendered=$('inventoryEntriesList').childElementCount>0;t=performance.now();setInventoryMode('history');if(historyRendered)renderInventoryEntries();await next();if(i)samples.history.push(performance.now()-t);
    setView('products');await next();t=performance.now();fillProductForm(state.products.find(p=>p.id==='kg'));await next();if(i)samples.product.push(performance.now()-t);setProductMode('list');await next();
    t=performance.now();setView('inventory');setInventoryMode('entry');await next();if(i)samples.navigation.push(performance.now()-t);
    const trigger=document.querySelector('#inventoryEntryForm [data-context-help]')||document.querySelector('.inventory-entry-panel .context-help summary');t=performance.now();trigger.click();await next();if(i)samples.helpOpen.push(performance.now()-t);t=performance.now();trigger.click();await next();if(i)samples.helpClose.push(performance.now()-t);
   }
   fetchJson=original;return Object.fromEntries(Object.entries(samples).map(([key,values])=>[key,{samples:values,median:values.slice().sort((a,b)=>a-b)[3]}]));
  });
 },process.env.EL_MUELLE_COMPACT_REFERENCE?{reference:process.env.EL_MUELLE_COMPACT_REFERENCE}:{});
 if(phase==='after'&&fs.existsSync(path.join(dev,'em003-compact-before.json'))){const before=JSON.parse(fs.readFileSync(path.join(dev,'em003-compact-before.json'),'utf8'));assert.equal(result.conditions.fixtureSHA256,before.conditions.fixtureSHA256);assert.deepEqual(result.projections,before.projections,'Eight projection contracts changed');assert.ok(result.layouts['1366x598'].entry.height<before.layouts['1366x598'].entry.height);assert.ok(result.layouts['1366x598'].product.scroll<before.layouts['1366x598'].product.scroll);}
 fs.writeFileSync(path.join(dev,'em003-compact-'+phase+'.json'),JSON.stringify(result));console.log('COMPACT_VISUAL_RESULT '+JSON.stringify(result));
});


test('Ayudas de panel: textos claros, lado derecho, secciones, movimientos, teclado y móvil',async()=>browser(admin,async page=>{
 let checked=0;
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 for(const [width,height]of [[1366,598],[1366,768],[1440,900],[390,844]]){
  await page.setViewportSize({width,height});
  for(const view of ['pos','sales','inventory','entry','history','billing','reports','cash','dashboard','settings']){
   await page.evaluate(async view=>{state.sidebarCollapsed=true;state.ticketCollapsed=true;if(['entry','history'].includes(view)){setView('inventory');setInventoryMode(view);}else if(view==='cash'){setView('reports');setReportsMode('cash');await loadCashCut();setCashTab('current');}else{if(view==='reports')setReportsMode('reports');setView(view);if(view==='inventory')setInventoryMode('stock');if(view==='dashboard')await loadDashboard();if(view==='settings')setSettingsMode('general');}resetNavigationScroll();},view);
   await settle();
   const helps=page.locator('#pageTitle > button.context-help-trigger:visible,.app-view.active button.context-help-trigger:visible,#currentSalePanel button.context-help-trigger:visible');
   assert.ok(await helps.count(),view+' has help');
   const invalid=await helps.evaluateAll(nodes=>nodes.filter(b=>!b.querySelector('circle')||!b.getAttribute('aria-label')||contextHelpText(b).length<40).map(b=>b.outerHTML));assert.deepEqual(invalid,[],view);
   const first=helps.first();await first.focus();await page.waitForFunction(()=>Boolean(document.querySelector('[role="tooltip"]')));
   const layout=await first.evaluate(button=>{const tip=document.querySelector('[role="tooltip"]'),b=button.getBoundingClientRect(),t=tip.getBoundingClientRect();return {fits:t.left>=7&&t.right<=innerWidth-7&&t.top>=7&&t.bottom<=innerHeight-7,rightRoom:innerWidth-b.right-16,placement:tip.dataset.placement,right:t.left>=b.right+7};});
   assert.ok(layout.fits,view+' tooltip fits '+width);if(layout.rightRoom>=200){assert.equal(layout.placement,'right');assert.ok(layout.right);}
   await page.keyboard.press('Escape');assert.equal(await page.locator('[role="tooltip"]').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,view+' overflow '+width);checked+=await helps.count();
   if((width===1366&&height===768&&['dashboard','billing','settings'].includes(view))||(width===390&&view==='entry'))await page.screenshot({path:path.join(dev,'em003-panel-help-'+view+'-'+width+'.png')});
  }
 }
 await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>{setView('inventory');setInventoryMode('entry');});await settle();
 assert.equal(await page.locator('#inventoryOperationTabs [data-context-help]').count(),3);
 for(const mode of ['receipt','adjustment','waste']){
  const current=await page.evaluate(()=>state.inventoryMovementMode||'receipt');
  await page.locator('[data-context-help="movement-'+mode+'"]').click();assert.equal(await page.evaluate(()=>state.inventoryMovementMode||'receipt'),current);
  assert.ok((await page.locator('[role="tooltip"]').textContent()).length>60);await page.keyboard.press('Escape');
  await page.locator('[data-inventory-operation="'+mode+'"]').click();assert.equal(await page.evaluate(()=>state.inventoryMovementMode),mode);
 }
 await page.evaluate(async()=>{setView('dashboard');await loadDashboard();});await settle();await page.waitForFunction(()=>document.querySelectorAll('#dashboardView .business-card h3 > [data-context-help]').length===7);assert.equal(await page.locator('#dashboardView .business-card h3 > [data-context-help]').count(),7);
 await page.locator('[data-dashboard-cycle="1"]').click();await settle();assert.equal(await page.locator('#dashboardSalesChartCaption > [data-context-help]').count(),1);
 await page.evaluate(()=>{setView('settings');});await settle();
 for(const section of ['general','business','scale','users','peripherals','fiscal','appearance','audit','maintenance']){
  await page.evaluate(mode=>setSettingsMode(mode),section);await settle();assert.equal(await page.locator('[data-context-help="settings"]').count(),1);
  const cards=page.locator('#settingsPane-'+section+' h4');for(let i=0;i<await cards.count();i++)assert.equal(await cards.nth(i).locator('[data-context-help]').count(),1,section+' panel help');
 }
 await page.evaluate(()=>{setView('products');fillProductForm(state.products.find(p=>p.id==='kg'));});await settle();assert.equal(await page.locator('#productFormStatusTitle > [data-context-help="products"]').count(),1);await page.evaluate(()=>{resetProductForm();});await settle();assert.equal(await page.locator('#productFormStatusTitle > [data-context-help="products"]').count(),1);
 await page.locator('#productFormStatusTitle > [data-context-help]').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#productEditorDialog').evaluate(d=>d.open),true);await page.evaluate(()=>setProductMode('list'));
 console.log('PANEL_HELP_CHECK '+JSON.stringify({checked,resolutions:4,dashboardPanels:7,inventoryMovements:3,settingsSections:9}));
}));


test('Venta actual: apertura automática, contador compacto, botones, límites y bloqueo de cobro',async()=>browser(admin,async page=>{
 await page.evaluate(()=>window.requestScaleWeight=()=>{});
 for(const [width,height]of [[1366,598],[1366,768],[1440,900],[390,844]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>{state.sidebarCollapsed=true;state.ticket=[];state.checkoutPending=null;state.checkoutProcessing=false;state.checkoutPreparing=false;setView('pos');closeTicketDrawer();renderTicket();selectProduct(state.products.find(p=>p.id==='piece'));});
  await page.locator('#pieceQuantityInput').fill('1');await page.locator('#confirmPieceQuantityBtn').click();
  assert.equal(await page.evaluate(()=>state.ticketCollapsed),false);assert.equal(await page.locator('#currentSalePanel').getAttribute('aria-hidden'),'false');assert.equal(await page.locator('#currentSalePanel').isVisible(),true);
  const quantity=page.locator('[data-ticket-quantity="0"]'),plus=page.locator('[data-ticket-index="0"][data-ticket-step="1"]'),minus=page.locator('[data-ticket-index="0"][data-ticket-step="-1"]');
  const box=await quantity.boundingBox();assert.ok(box.width<=32&&box.height<=28,JSON.stringify(box));assert.equal(await quantity.evaluate(e=>getComputedStyle(e).textAlign),'center');assert.equal(await page.locator('.ticket-item .pos-ticket-quantity').count(),0);assert.equal(await page.locator('.ticket-item .ticket-piece-unit').count(),1);assert.match(await page.locator('.pos-ticket-unit').textContent(),/c\/u/);assert.equal(await minus.isDisabled(),true);
  await plus.click();assert.equal(await quantity.inputValue(),'2');assert.equal(await page.evaluate(()=>state.ticket[0].total),200);
  await plus.click();assert.equal(await quantity.inputValue(),'3');assert.equal(await plus.isDisabled(),true);
  await minus.click();assert.equal(await quantity.inputValue(),'2');
  // Editar y pulsar + no pierde el click al salir del campo ni confirma dos veces.
  await quantity.fill('1');await plus.click();assert.equal(await quantity.inputValue(),'2');assert.equal(await page.evaluate(()=>state.ticket[0].quantity),2);
  for(const invalid of ['0','1.5','4','']){await quantity.fill(invalid);await quantity.press('Enter');assert.equal(await quantity.inputValue(),'2');assert.equal(await page.evaluate(()=>state.ticket[0].quantity),2);}
  await minus.focus();await page.keyboard.press('Enter');assert.equal(await quantity.inputValue(),'1');assert.equal(await minus.isDisabled(),true);
  await page.evaluate(()=>{closeTicketDrawer();selectProduct(state.products.find(p=>p.id==='piece'));});await page.locator('#pieceQuantityInput').fill('1');await page.locator('#confirmPieceQuantityBtn').click();assert.equal(await page.evaluate(()=>state.ticketCollapsed),false);assert.equal(await page.evaluate(()=>state.ticket.length),1);assert.equal(await quantity.inputValue(),'2');
  await page.evaluate(()=>{state.checkoutPending={payload:{items:[]}};syncCheckoutControls();stepTicketQuantity(0,1);});assert.equal(await page.evaluate(()=>state.ticket[0].quantity),2);assert.equal(await page.locator('#ticketItems').evaluate(e=>e.inert),true);
  await page.evaluate(()=>{state.checkoutPending=null;syncCheckoutControls();});assert.equal(await page.locator('#ticketItems').evaluate(e=>e.inert),false);assert.equal(await quantity.isDisabled(),false);
  await page.evaluate(()=>{closeTicketDrawer();scaleState.connected=true;scaleState.weightKg=.2;selectProduct(state.products.find(p=>p.id==='kg'));});await page.locator('#confirmWeightBtn').click();assert.equal(await page.evaluate(()=>state.ticketCollapsed),false);assert.equal(await page.evaluate(()=>state.ticket.length),2);assert.equal(await page.locator('[data-ticket-quantity]').count(),1);assert.match(await page.locator('.ticket-item').last().textContent(),/kg/);
  await page.evaluate(()=>{closeTicketDrawer();state.selectedProduct=state.products.find(p=>p.id==='piece');state.detectedQuantity=99;state.quantitySource='manual';addCurrentProductToTicket();});assert.equal(await page.evaluate(()=>state.ticketCollapsed),true);assert.equal(await page.evaluate(()=>state.ticket.length),2);await page.evaluate(()=>{clearSelectedProduct({immediate:true});toggleTicketPanel(true);scaleState.connected=false;});
  await page.screenshot({path:path.join(dev,'em003-ticket-compact-'+width+'x'+height+'.png')});
 }
}));


test('Pagos compartidos: permisos, valores válidos, rechazo atómico y reintento confirmado',async()=>{
 const defaults={efectivo:true,tarjeta:false,transferencia:true};
 assert.deepEqual((await api('/api/payment-methods')).body,defaults);
 assert.equal((await api('/api/payment-methods','GET',undefined,null)).status,401);
 assert.equal((await api('/api/payment-methods','PUT',defaults,employee)).status,403);
 assert.deepEqual((await api('/api/payment-methods','GET',undefined,employee)).body,defaults);
 const permissions=policy(true);permissions.pos=false;await api('/api/users/employee/permissions','PUT',{permissions});
 assert.equal((await api('/api/payment-methods','GET',undefined,employee)).status,403);await api('/api/users/employee/permissions','PUT',{permissions:policy(true)});
 for(const bad of [{},{...defaults,tarjeta:'true'},{...defaults,extra:true},{efectivo:false,tarjeta:false,transferencia:false}])assert.equal((await api('/api/payment-methods','PUT',bad)).status,400);
 const snapshot=()=>{const db=new DatabaseSync(path.join(data,'el-muelle-pos.sqlite'),{readOnly:true});try{return {docs:db.prepare('SELECT * FROM documents ORDER BY collection,document_id').all(),audit:db.prepare('SELECT * FROM audit_events ORDER BY id').all()};}finally{db.close();}};
 const body=sale('kg',{paymentMethod:'tarjeta',paymentDetails:{reference:'SINTETICA'},items:[{productId:'kg',quantity:.1,source:'scale'}]}),before=snapshot();
 assert.equal((await api('/api/sales','POST',body,employee)).status,409);assert.deepEqual(snapshot(),before);
 assert.equal((await api('/api/payment-methods','PUT',{...defaults,tarjeta:true})).status,200);
 const first=await api('/api/sales','POST',body,employee);assert.equal(first.status,201);
 assert.equal((await api('/api/payment-methods','PUT',defaults)).status,200);
 const beforeReplay=snapshot(),replay=await api('/api/sales','POST',body,employee);assert.equal(replay.status,200);assert.equal(replay.body.id,first.body.id);assert.deepEqual(snapshot(),beforeReplay);
 const audit=(await api('/api/audit-events')).body.filter(row=>row.event_type==='payment_methods_changed');assert.equal(audit.length,2);assert.match(JSON.stringify(audit),/previous/);
 const response=await fetch(base+'/api/payment-methods',{headers:{Cookie:employee}});assert.match(response.headers.get('cache-control'),/no-store/);
});
test('Pagos en pantalla: configuración, tarjeta inicialmente bloqueada, cambios en otra sesión y móvil',async()=>{
 const defaults={efectivo:true,tarjeta:false,transferencia:true};await api('/api/payment-methods','PUT',defaults);
 await browser(admin,async page=>{
  await page.waitForFunction(()=>isPaymentMethodEnabled('efectivo'));await page.evaluate(()=>setView('pos'));
  assert.equal(await page.locator('.pay-method[data-method="tarjeta"]').isDisabled(),true);
  assert.equal(await page.locator('.pay-method[data-method="tarjeta"]').isHidden(),true);
  await page.evaluate(()=>{setPaymentMethod('tarjeta');});assert.equal(await page.evaluate(()=>state.paymentMethod),'efectivo');
  await page.evaluate(()=>{setView('settings');setSettingsMode('business');});
  const card=page.locator('[data-payment-setting="tarjeta"]').locator('..').locator('..');
  await page.locator('[data-payment-setting="tarjeta"]').check();await page.locator('#paymentMethodsSaveBtn').click();await page.waitForFunction(()=>isPaymentMethodEnabled('tarjeta'));
  assert.equal((await api('/api/payment-methods','GET',undefined,employee)).body.tarjeta,true);
  await page.evaluate(()=>{setView('pos');toggleTicketPanel(true);setPaymentMethod('tarjeta');});assert.equal(await page.evaluate(()=>state.paymentMethod),'tarjeta');
  assert.equal(await page.locator('.pay-method[data-method="tarjeta"]').isVisible(),true);
  await api('/api/payment-methods','PUT',defaults);await page.waitForFunction(()=>!isPaymentMethodEnabled('tarjeta'));
  assert.equal(await page.evaluate(()=>state.paymentMethod),'efectivo');assert.equal(await page.locator('.pay-method[data-method="tarjeta"]').isDisabled(),true);
  assert.equal(await page.locator('.pay-method[data-method="tarjeta"]').isHidden(),true);
  await page.evaluate(()=>{state.checkoutPending={payload:{paymentMethod:'tarjeta'}};state.paymentMethod='tarjeta';syncCheckoutControls();});
  await page.evaluate(()=>applyPaymentMethods({efectivo:true,tarjeta:false,transferencia:true}));assert.equal(await page.evaluate(()=>state.paymentMethod),'tarjeta');
  assert.equal(await page.locator('.pay-method[data-method="efectivo"]').isVisible(),true);assert.equal(await page.locator('.pay-method[data-method="efectivo"]').isDisabled(),true);
  await page.evaluate(()=>{state.checkoutPending=null;syncCheckoutControls();});assert.equal(await page.evaluate(()=>state.paymentMethod),'efectivo');
  await page.evaluate(()=>{setView('settings');setSettingsMode('business');});
  for(const [width,height]of [[1366,768],[390,844]]){await page.setViewportSize({width,height});await page.evaluate(()=>{state.sidebarCollapsed=true;updateShellState();});await page.locator('#paymentMethodsSaveBtn').scrollIntoViewIfNeeded();assert.equal(await card.isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(dev,'em003-payment-methods-'+width+'.png')});}
  await page.reload();await page.waitForFunction(()=>typeof isPaymentMethodEnabled==='function'&&isPaymentMethodEnabled('efectivo'));assert.equal(await page.evaluate(()=>isPaymentMethodEnabled('tarjeta')),false);
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
