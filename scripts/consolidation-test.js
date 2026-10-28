// Consolidación EM-003: sólo datos sintéticos, puertos efímeros y copias aisladas.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {PosDatabase}=require('../src/database');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dev=path.join(root,'.dev');
let temporary,original,restored,child,base,cookie,sessionId,saleId;
const pin='864209';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function isolated(directory){assert.ok(path.resolve(directory).startsWith(temporary+path.sep));assert.ok(![3000,3001].includes(Number(new URL(base||'http://localhost:1').port)));}
async function stop(){if(child&&child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}}
async function start(directory){isolated(directory);const port=await new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});assert.ok(![3000,3001].includes(port));base='http://127.0.0.1:'+port;
  child=spawn(process.execPath,['src/server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:directory,ENV_FILE:path.join(directory,'absent.env'),ADMIN_PIN:pin,EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',REQUIRE_HTTPS:'false',CORS_ORIGIN:''},stdio:'ignore'});
  let failure='';for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error('No inició la copia aislada');try{const response=await fetch(base+'/api/health');if(response.ok)return;failure='HTTP '+response.status;}catch(error){failure=error.cause?.code||error.message;}await pause(100);}throw Error('Tiempo de inicio agotado: '+failure);
}
async function api(route,method='GET',body){const headers={'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})};if(route==='/api/sales'&&method==='POST')body=await require('./checkout-test-client').completeCheckout(base,body,headers);const response=await fetch(base+route,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function login(){const result=await api('/api/auth/admin','POST',{pin});assert.equal(result.status,200);cookie=result.cookie;}
function snapshot(file){const db=new DatabaseSync(file,{readOnly:true});try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');return {documents:db.prepare('SELECT * FROM documents ORDER BY collection,document_id').all(),audit:db.prepare('SELECT * FROM audit_events ORDER BY id').all()};}finally{db.close();}}
before(async()=>{fs.mkdirSync(dev,{recursive:true});temporary=fs.mkdtempSync(path.join(dev,'em003-consolidation-'));original=path.join(temporary,'source');restored=path.join(temporary,'restored');fs.mkdirSync(original);fs.writeFileSync(path.join(original,'products.json'),JSON.stringify([{id:'test-piece',name:'Producto sintético, "especial"',category:'Pruebas',unit:'pieza',price:100,costPrice:40,stockQuantity:10,minStock:2,active:true}]));await start(original);await login();});
after(async()=>{await stop();if(temporary){assert.ok(path.resolve(temporary).startsWith(dev+path.sep));fs.rmSync(temporary,{recursive:true,force:true});}});
test('Venta, caja, entradas, retiros, cancelación y stock conservan totales y atomicidad',async()=>{
  assert.equal((await api('/api/sales','POST',{items:[{productId:'test-piece',quantity:1}]})).status,409);
  const opening=await api('/api/cash-sessions/open','POST',{openingAmount:200});assert.equal(opening.status,201);sessionId=opening.body.id;
  assert.equal((await api('/api/cash-sessions/open','POST',{openingAmount:1})).status,409);
  for(const [type,amount] of [['in',50],['out',20]])assert.equal((await api('/api/cash-sessions/'+sessionId+'/movements','POST',{type,amount})).status,201);
  const sold=await api('/api/sales','POST',{items:[{productId:'test-piece',quantity:2}],paymentMethod:'efectivo',amountReceived:200});assert.equal(sold.status,201);assert.equal(sold.body.total,200);saleId=sold.body.id;
  const products=await api('/api/products');assert.equal(products.body[0].stockQuantity,8);
  assert.equal((await api('/api/sales','POST',{items:[{productId:'test-piece',quantity:999}],paymentMethod:'efectivo'})).status,400);
  assert.equal((await api('/api/products')).body[0].stockQuantity,8);assert.equal((await api('/api/sales')).body.length,1);
  const cancelSale=await api('/api/sales','POST',{items:[{productId:'test-piece',quantity:1}],paymentMethod:'tarjeta',paymentReference:'SYNTHETIC'});assert.equal(cancelSale.status,201);
  assert.equal((await api('/api/sales/'+cancelSale.body.id+'/cancel','PATCH',{reason:'Cancelación sintética'})).status,200);
  assert.equal((await api('/api/products')).body[0].stockQuantity,8);
  assert.equal((await api('/api/sales/'+cancelSale.body.id+'/cancel','PATCH',{reason:'Duplicada'})).status,400);
  const current=(await api('/api/cash-sessions/current')).body;assert.equal(current.session.summary.expectedCash,430);
  const closed=await api('/api/cash-sessions/'+sessionId+'/close','POST',{countedCash:425,denominations:{100:4,20:1,5:1}});assert.equal(closed.status,200);assert.equal(closed.body.difference,-5);assert.equal(closed.body.expectedCash,430);assert.equal(closed.body.status,'closed');
  assert.equal((await api('/api/cash-sessions')).body.length,1);
});
test('Entradas y merma con motivo: existencias, costo ponderado, historial y rechazo sin motivo',async()=>{
  const entry=await api('/api/inventory/entries','POST',{productId:'test-piece',quantity:2,unitCost:40,salePrice:100,supplier:'Proveedor sintético'});assert.equal(entry.status,201);
  assert.equal((await api('/api/products')).body[0].stockQuantity,10);assert.equal((await api('/api/inventory/entries')).body.length,1);
  assert.equal((await api('/api/products/test-piece/inventory','PATCH',{stockQuantity:1,minStock:2,reason:''})).status,400);
  assert.equal((await api('/api/products/test-piece/inventory','PATCH',{stockQuantity:1,minStock:2,reason:'Merma sintética'})).status,200);
  const product=(await api('/api/products')).body[0];assert.equal(product.stockQuantity,1);assert.ok(product.stockQuantity<=product.minStock);assert.equal(product.costPrice,40);
  const audit=(await api('/api/audit-events')).body;assert.ok(audit.some(e=>e.event_type==='inventory_adjusted'&&e.details.reason==='Merma sintética'));
});
test('Restauración completa: respaldo SQLite + clave recuperan documentos, auditoría, PIN, permisos y datos cifrados',async()=>{
  const fiscal={rfc:'XAXX010101000',businessName:'Cliente sintético',fiscalZip:'00000',fiscalRegime:'601',cfdiUse:'G03',email:'restore@example.com'};
  assert.equal((await api('/api/sales/'+saleId+'/invoice','PATCH',fiscal)).status,200);
  assert.equal((await api('/api/sales/'+saleId+'/invoice','PATCH',fiscal)).status,409);
  const business=(await api('/api/configuration')).body.business;
  assert.equal((await api('/api/configuration/business','PUT',{...business,commercialName:'Restauración sintética',email:'negocio@example.com'})).status,200);
  const users=[{id:'admin',name:'Admin sintético',role:'admin',active:true},{id:'test-worker',name:'Empleado sintético',role:'employee',active:true}];
  assert.equal((await api('/api/settings','PUT',{users,employeePins:{'test-worker':'135790'},adminContact:{email:'admin@example.com',phone:'6690000000'}})).status,200);
  const permissions=Object.fromEntries(require('../src/access').MODULES.map(id=>[id,id==='sales']));assert.equal((await api('/api/users/test-worker/permissions','PUT',{permissions})).status,200);
  const prefs=(await api('/api/preferences')).body;assert.equal((await api('/api/preferences','PUT',{...prefs,accent:'sky',notifications:false})).status,200);
  await stop();
  const file=path.join(original,'el-muelle-pos.sqlite'),saved=snapshot(file);
  assert.ok(!JSON.stringify(saved.documents).includes(fiscal.rfc));assert.ok(!JSON.stringify(saved.documents).includes(fiscal.email));
  const backups=fs.readdirSync(path.join(original,'backups')).filter(name=>name.endsWith('.sqlite'));assert.equal(backups.length,1);
  const backup=path.join(original,'backups',backups[0]);assert.deepEqual(snapshot(backup),saved);
  isolated(restored);fs.mkdirSync(restored);fs.copyFileSync(backup,path.join(restored,'el-muelle-pos.sqlite'));fs.copyFileSync(path.join(original,'.secrets.json'),path.join(restored,'.secrets.json'));
  assert.deepEqual(snapshot(path.join(restored,'el-muelle-pos.sqlite')),saved);
  await start(restored);cookie=null;assert.equal((await api('/api/sales')).status,401);await login();
  assert.equal((await api('/api/configuration/integrity')).body.ok,true);
  const sale=(await api('/api/sales/'+saleId)).body;assert.equal(sale.invoice.customer.rfc,fiscal.rfc);assert.equal(sale.invoice.customer.email,fiscal.email);assert.equal(sale.invoice.status,'solicitada');
  const config=(await api('/api/configuration')).body;assert.equal(config.business.commercialName,'Restauración sintética');assert.equal(config.profile.email,'admin@example.com');
  assert.equal((await api('/api/preferences')).body.accent,'sky');assert.equal((await api('/api/preferences')).body.notifications,false);
  assert.deepEqual((await api('/api/users/test-worker/permissions')).body.permissions,permissions);
  assert.equal((await api('/api/inventory/entries')).body.length,1);assert.equal((await api('/api/products')).body[0].stockQuantity,1);assert.equal((await api('/api/cash-sessions')).body[0].status,'closed');
  assert.ok((await api('/api/audit-events')).body.length>=saved.audit.length);
  const worker=await api('/api/auth/employee','POST',{userId:'test-worker',pin:'135790'});assert.equal(worker.status,200);assert.deepEqual(worker.body.user.permissions,permissions);
});
test('Rollback SQLite conserva documentos y auditoría juntos ante un fallo',()=>{
  const directory=path.join(temporary,'rollback');isolated(directory);const db=new PosDatabase(directory);
  try{assert.throws(()=>db.transaction(()=>{db.saveDocument('synthetic','one',{value:1});db.addAuditEvent({eventType:'synthetic',entityType:'synthetic'});throw Error('rollback');}));assert.equal(db.readDocument('synthetic','one'),null);assert.deepEqual(db.readAuditEvents(),[]);}finally{db.db.close();}
});

const source=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
function reportHarness(){
  const nodes=new Map(),wrapper={hidden:false};
  function node(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,classList:{toggle(){}},closest:()=>wrapper,replaceChildren(){this.innerHTML='';}});return nodes.get(id);}
  const c={console,Intl,Date,Map,Blob,$:node,state:{sales:[],products:[]},getReportFilter:()=>({period:'all',dateString:'2026-10-26',endDateString:'2026-10-26'}),money:x=>'$'+Number(x).toFixed(2),quantityText:x=>String(x),getUnitLabel:x=>x,getStockStatus:()=>['Disponible'],getSaleProfit:s=>({totalCost:s.totalCost||0,grossProfit:s.total-(s.totalCost||0)}),getSaleStatus:s=>s.status||'completada',dashboardSaleMatchesPeriod:()=>true,escapeHtml:s=>String(s).replace(/[&<>"']/g,'_'),getGlassCalendarDateKey:d=>d.toISOString().slice(0,10),parseGlassCalendarDate:key=>new Date(key+'T12:00:00'),showToast(){},window:{print(){}},document:{body:{appendChild(){}},createElement:()=>({click(){},remove(){}})},URL:{createObjectURL(blob){c.blob=blob;return 'blob:test';},revokeObjectURL(){}}};
  vm.createContext(c);
  for(const name of ['getCompletedSalesForPeriod','getSalesTotals','getProductSalesFromSales','getReportPeriodCaption','getGeneratedReport','getReportChartSeries','getReportPaymentSeries','renderReportCharts','safeCsvCell','exportGeneratedReport','printGeneratedReport']){const match=source.match(new RegExp('^function '+name+'\\([^]*?^}','m'));assert.ok(match,name);vm.runInContext(match[0],c);}
  node('reportChartGrouping').value='day';node('reportChartType').value='bar';return {c,node,wrapper};
}
test('Reportes reales: tres tipos, contexto de gráficas y estados vacíos sin cambiar cifras',()=>{
  const {c,node,wrapper}=reportHarness();c.state.sales=[{id:'T1',createdAt:'2026-10-26T12:00:00',total:200,totalCost:80,status:'completada',paymentMethod:'efectivo',items:[{productId:'p',name:'Producto',unit:'pieza',quantity:2,total:200}]},{id:'T2',createdAt:'2026-10-26T13:00:00',total:100,status:'cancelada',items:[]}];c.state.products=[{id:'p',name:'Producto',category:'Pruebas',unit:'pieza',price:100,costPrice:40,stockQuantity:3,minStock:2,active:true}];
  for(const type of ['sales','products','inventory','sales']){node('reportTypeFilter').value=type;const report=c.getGeneratedReport();assert.equal(report.type,type);assert.equal(report.rows.length,1);assert.equal(report.totals.total,200);c.renderReportCharts(report);assert.equal(wrapper.hidden,type==='inventory');if(type==='inventory')assert.equal(node('reportSalesChart').innerHTML,'');else assert.ok(node('reportSalesChart').innerHTML.includes('<svg'));}
  c.state.sales=[];c.renderReportCharts(c.getGeneratedReport());assert.ok(node('reportPaymentsChart').innerHTML.includes('Sin ventas'));assert.ok(!node('reportPaymentsChart').innerHTML.includes('conic-gradient'));
});
test('CSV conserva todas las filas y RFC4180/UTF-8; impresión completa sin límite silencioso',async()=>{
  const {c,node}=reportHarness();c.state.generatedReport={type:'products',title:'Productos vendidos',dateString:'2026-10-26',caption:'Histórico',headers:['Producto','Ingreso'],kpis:[],rows:Array.from({length:65},(_,i)=>['Camarón, "á" '+i,'$100.00'])};c.exportGeneratedReport();const bytes=new Uint8Array(await c.blob.arrayBuffer());assert.deepEqual([...bytes.slice(0,3)],[239,187,191]);const csv=await c.blob.text();assert.equal(csv.split('\r\n').length,66);assert.ok(csv.includes('"Camarón, ""á"" 64","$100.00"'));c.printGeneratedReport();assert.equal((node('printArea').innerHTML.match(/class="receipt-row"/g)||[]).length,65);
  // El texto de fórmula se neutraliza en la salida, sin modificar la fuente.
  c.state.generatedReport.rows=[['=1+1','$100.00']];c.exportGeneratedReport();assert.ok((await c.blob.text()).includes('"' + "'" + '=1+1"'));
});
test('Periodos reales filtran filas, totales y CSV sin incluir cancelaciones ni extremos posteriores',async()=>{
  const {c,node}=reportHarness();
  c.getLocalDateString=()=> '2026-10-27';
  for(const name of ['parseLocalDate','getPeriodRange','saleMatchesPeriod','getDashboardDateRange','dashboardSaleMatchesPeriod','getReportFilter']){
    const match=source.match(new RegExp('^function '+name+'\\([^]*?^}','m'));assert.ok(match,name);vm.runInContext(match[0],c);
  }
  node('reportDateInput').value='2026-10-27';node('reportEndDateInput').value='2026-10-28';node('reportTypeFilter').value='sales';
  c.state.sales=['2025-10-27','2026-10-19','2026-10-26','2026-10-27','2026-10-28','2026-11-01'].map((date,i)=>({id:'S'+i,createdAt:date+'T12:00:00',total:100,status:'completada',items:[]}));
  c.state.sales.push({id:'CANCELADA',createdAt:'2026-10-27T12:00:00',total:900,status:'cancelada',items:[]});
  for(const [period,count] of [['day',1],['week',4],['month',4],['year',5],['all',6],['range',2]]){
    node('reportPeriodFilter').value=period;const report=c.getGeneratedReport();assert.equal(report.rows.length,count,period);assert.equal(report.totals.total,count*100,period);c.state.generatedReport=report;c.exportGeneratedReport();assert.equal((await c.blob.text()).split('\r\n').length,count+1,period);
  }
});
