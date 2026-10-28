// Interacciones del código real en DOM simulado, sin navegador ni datos del dueño.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
function load(context,names){vm.createContext(context);for(const name of names){const match=source.match(new RegExp('^(?:async )?function '+name+'\\([^]*?^}','m'));assert.ok(match,name);vm.runInContext(match[0],context);}return context;}
function checkoutHarness(storage=new Map()){
  const nodes=new Map(),calls=[],node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,textContent:'',attributes:new Map(),setAttribute(k,v){this.attributes.set(k,v);},focus(){}});return nodes.get(id);};
  const state={sessionAuthenticated:true,currentUser:{id:'owner',role:'admin'},checkoutGeneration:0,ticket:[{productId:'piece',quantity:1,total:100}],sales:[],paymentMethod:'efectivo',paymentReference:'',discount:0};
  const context={state,crypto,console:{error(){}},$:node,$$:()=>[],sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{setTimeout(){},print(){}},getSalesCashShift:()=>({id:'cash',businessDate:'2026-10-28'}),closeInvoiceDecisionModal(){},goToCashRegister(){},setPosStep(){},updatePaymentUi(){},setPaymentMethod:v=>{state.paymentMethod=v;},buildReceipt:sale=>calls.push(['receipt',sale.id]),renderTicket(){},clearSelectedProduct(){},updateTicketId(){},loadProducts:async()=>{},loadCashSessions:async()=>{},renderCashRegister(){},renderWeighPanel(){},updateTotals(){node('chargeBtn').disabled=state.ticket.length===0;node('clearTicketBtn').disabled=state.ticket.length===0;},showToast:message=>calls.push(['toast',message]),canAccessView:()=>true,setView(){}};
  load(context,['getCheckoutIntentId','persistPendingCheckout','restorePendingCheckout','syncCheckoutControls','chargeSale']);return {c:context,s:state,n:node,calls,storage};
}
const result={id:'T-SYNTHETIC',items:[],total:100};

test('Cobrar: doble clic y Enter repetido bloqueados durante procesamiento',async()=>{
  const h=checkoutHarness();let resolve,requests=0;h.c.fetchJson=()=>{requests++;return new Promise(r=>{resolve=r;});};
  const first=h.c.chargeSale(false);await h.c.chargeSale(false);await h.c.chargeSale(true);
  assert.equal(requests,1);assert.equal(h.s.checkoutProcessing,true);assert.equal(h.n('invoiceYesBtn').disabled,true);assert.match(h.n('chargeBtn').textContent,/Procesando/);
  resolve(result);await first;assert.equal(h.s.ticket.length,0);assert.equal(h.s.sales.length,1);assert.equal(h.s.checkoutProcessing,false);assert.equal(h.storage.size,0);
});

test('Respuesta perdida: congela intención y conserva el payload al reintentar incluso con caja distinta',async()=>{
  const h=checkoutHarness(),payloads=[];h.c.fetchJson=async(_url,options)=>{payloads.push(options.body);if(payloads.length===1)throw Error('Respuesta perdida');return result;};
  await h.c.chargeSale(false);assert.ok(h.s.checkoutPending);assert.equal(h.n('ticketItems').inert,true);assert.equal(h.s.ticket.length,1);
  h.c.getSalesCashShift=()=>null;await h.c.chargeSale(true);
  assert.equal(payloads[0],payloads[1]);assert.equal(h.s.sales.length,1);assert.equal(h.s.ticket.length,0);
});

test('Recarga: recupera exclusivamente la intención pendiente del mismo operador',async()=>{
  const h=checkoutHarness();h.c.fetchJson=async()=>{throw Error('Sin respuesta');};await h.c.chargeSale(false);
  const id=h.s.checkoutIntentId,reloaded=checkoutHarness(h.storage);reloaded.c.restorePendingCheckout();assert.equal(reloaded.s.checkoutIntentId,id);
  reloaded.c.fetchJson=async()=>result;await reloaded.c.chargeSale(false);assert.equal(reloaded.s.sales.length,1);
  const other=checkoutHarness(new Map([['elmuelle.pending-checkout',JSON.stringify({ownerId:'another',payload:{checkoutIntentId:id,items:[]}})]]));other.c.restorePendingCheckout();assert.equal(other.s.checkoutPending,undefined);
});

test('Errores definidos desbloquean la captura; una respuesta tardía no modifica otra sesión',async()=>{
  const h=checkoutHarness();h.c.fetchJson=async()=>{throw Object.assign(Error('Dato inválido'),{status:400});};await h.c.chargeSale(false);
  assert.equal(h.s.checkoutPending,null);assert.equal(h.s.ticket.length,1);assert.equal(h.n('ticketItems').inert,false);
  let resolve;h.c.fetchJson=()=>new Promise(r=>{resolve=r;});const pending=h.c.chargeSale(false);
  h.s.checkoutGeneration++;h.s.currentUser={id:'other',role:'employee'};h.s.ticket=[{productId:'another'}];h.s.sales=[];resolve(result);await pending;
  assert.equal(h.s.ticket[0].productId,'another');assert.equal(h.s.sales.length,0);
});

test('Fallo al refrescar después de confirmar no convierte la venta en un nuevo cobro',async()=>{
  const h=checkoutHarness();let requests=0;h.c.fetchJson=async()=>{requests++;return result;};h.c.loadProducts=async()=>{throw Error('Consulta fallida');};await h.c.chargeSale(false);await h.c.chargeSale(false);assert.equal(requests,1);assert.equal(h.s.checkoutPending,null);assert.equal(h.s.ticket.length,0);
});

test('Sesión vencida durante cobro conserva la intención para reautenticar al mismo operador',async()=>{
  const h=checkoutHarness();let preserved=false;h.c.fetchJson=async()=>{throw Object.assign(Error('Sesión vencida'),{status:401});};
  h.c.logoutToAccess=options=>{preserved=options.preservePendingCheckout;h.s.checkoutGeneration++;h.s.sessionAuthenticated=false;h.s.ticket=[];h.s.checkoutPending=null;};
  await h.c.chargeSale(false);assert.equal(preserved,true);assert.ok(h.storage.has('elmuelle.pending-checkout'));
  const returned=checkoutHarness(h.storage);returned.c.restorePendingCheckout();assert.ok(returned.s.checkoutPending);returned.c.fetchJson=async()=>result;await returned.c.chargeSale(false);assert.equal(returned.s.sales.length,1);
});

test('CSV: neutraliza fórmulas y prefijos ocultos; conserva números, acentos y ceros iniciales',()=>{
  const c=load({},['safeCsvCell']);
  for(const text of ['=1+1','+SUM(A1:A2)','-SUM(A1:A2)','@SUM(A1)',' \t=1+1','\r\n@SUM(A1)','\u200b=1+1'])assert.equal(c.safeCsvCell(text),"'"+text);
  for(const value of [-123.45,'-123.45',123,'+12','000123','Camarón, "á"','primera\nsegunda','',null])assert.equal(c.safeCsvCell(value),String(value??''));
});

test('Impresión: 0, 1, 59, 60, 61 y 1000 registros sin truncamiento y con alcance anunciado',()=>{
  const area={innerHTML:''},c=load({state:{},$:()=>area,escapeHtml:value=>String(value).replace(/[&<>"']/g,'_'),window:{print(){}},getGeneratedReport(){throw Error('Se requiere un reporte explícito');}},['printGeneratedReport']);
  for(const count of [0,1,59,60,61,1000]){c.state.generatedReport={title:'Sintético',caption:'Periodo filtrado',kpis:[],rows:Array.from({length:count},(_,i)=>['Fila '+i,'$1.00'])};c.printGeneratedReport();assert.equal((area.innerHTML.match(/class="receipt-row"/g)||[]).length,count);assert.ok(area.innerHTML.includes(`Registros: ${count} de ${count}`));if(count)assert.ok(area.innerHTML.includes('Fila '+(count-1)));}
});

function productHarness(){
  const nodes=new Map(),calls=[],node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',focus(){}});return nodes.get(id);};
  const state={products:[],editingProductId:null};const c=load({state,$:node,console:{error(){}},showToast:message=>calls.push(['toast',message]),money:value=>String(value),getUnitLabel:value=>value,openProductConfirm:async()=>true,fetchJson:async(url,options)=>{calls.push([url,JSON.parse(options.body)]);},loadProducts:async()=>{},resetProductForm:()=>calls.push(['reset']),setProductMode:mode=>calls.push(['mode',mode])},['saveProductFromAdmin']);
  for(const [id,value]of Object.entries({productNameInput:'Producto sintético',productCategoryInput:'Pruebas',productUnitInput:'pieza',productPriceInput:'100',productCostInput:'40',productStockInput:'5',productMinStockInput:'1'}))node(id).value=value;
  return {c,s:state,n:node,calls};
}
test('Agregar producto: formulario completo, confirmación, cancelar, editar y errores',async()=>{
  const h=productHarness();await h.c.saveProductFromAdmin({preventDefault(){}});assert.equal(h.calls[0][0],'/api/products');assert.equal(h.calls[0][1].stockQuantity,5);
  h.calls.length=0;h.c.openProductConfirm=async()=>false;await h.c.saveProductFromAdmin({preventDefault(){}});assert.equal(h.calls.length,0);
  h.c.openProductConfirm=async()=>true;h.s.editingProductId='piece';h.s.products=[{id:'piece',active:false}];await h.c.saveProductFromAdmin({preventDefault(){}});assert.equal(h.calls[0][0],'/api/products/piece');assert.equal(h.calls[0][1].active,false);
  h.calls.length=0;h.n('productStockInput').value='-1';await h.c.saveProductFromAdmin({preventDefault(){}});assert.equal(h.calls.some(call=>call[0].startsWith('/api')),false);
  h.n('productStockInput').value='1';h.c.fetchJson=async()=>{throw Error('Error sintético');};await h.c.saveProductFromAdmin({preventDefault(){}});assert.ok(h.calls.some(call=>call[0]==='toast'&&call[1]==='Error sintético'));
});
