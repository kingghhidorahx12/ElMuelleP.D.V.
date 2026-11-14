const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),{spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),pin='864209',id=()=>crypto.randomUUID(),wait=ms=>new Promise(r=>setTimeout(r,ms));
let area,data,child,base,admin,employee,cash,customer,sale,clock=0;
const date=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10);};
async function api(route,method='GET',body,cookie=admin){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};}
const receipt=(productId,quantity,expiresAt,lotCode)=>api('/api/inventory/entries','POST',{operationId:id(),productId,quantity,unitCost:40,salePrice:100,receivedAt:date(0),expiresAt,lotCode,reasonCode:'compra'});
const checkout=(extra={})=>({checkoutIntentId:id(),cashSessionId:cash,items:[{productId:'p',quantity:1,source:'manual',price:100}],paymentMethod:'efectivo',...extra});
before(async()=>{
 area=fs.mkdtempSync(path.join(root,'.dev/commerce-test-'));require('../src/persistence').restrictPrivatePath(area,true);data=path.join(area,'data');fs.mkdirSync(data);
 fs.writeFileSync(path.join(data,'products.json'),JSON.stringify([{id:'p',name:'Producto sintético',unit:'pieza',category:'Prueba',price:100,costPrice:40,stockQuantity:0,wholesaleMin:5,wholesalePrice:90},{id:'expired',name:'Producto caducado sintético',unit:'pieza',category:'Prueba',price:100,costPrice:40,stockQuantity:0}]));
 fs.writeFileSync(path.join(area,'offset'),'0');fs.writeFileSync(path.join(area,'clock.cjs'),"const fs=require('fs'),path=require('path'),now=Date.now;Date.now=()=>now()+Number(fs.readFileSync(path.join(__dirname,'offset'),'utf8'));\n");
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});base='http://127.0.0.1:'+port;
 const log=fs.openSync(path.join(area,'server.log'),'a');child=spawn(process.execPath,['--require',path.join(area,'clock.cjs'),'src/server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',NODE_ENV:'test',EL_MUELLE_STORAGE_MODE:'',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,ENV_FILE:path.join(area,'none.env'),ADMIN_PIN:pin,EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',REQUIRE_HTTPS:'false',CORS_ORIGIN:''},stdio:['ignore',log,log]});fs.closeSync(log);
 for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(fs.readFileSync(path.join(area,'server.log'),'utf8'));try{if((await fetch(base+'/api/health')).ok)break;}catch{}await wait(100);}
 const login=await api('/api/auth/admin','POST',{pin},null);assert.equal(login.status,200);assert.ok(!login.cookie.includes('Max-Age'));admin=login.cookie.split(';')[0];
 const settings=await api('/api/settings','PUT',{users:[{id:'admin',name:'Dueño sintético',role:'admin',active:true},{id:'employee',name:'Empleado sintético',role:'employee',active:true}],employeePins:{employee:'135790'}});assert.equal(settings.status,200);
 const e=await api('/api/auth/employee','POST',{userId:'employee',pin:'135790'},null);assert.equal(e.status,200);employee=e.cookie.split(';')[0];cash=(await api('/api/cash-sessions/open','POST',{openingAmount:0})).body.id;
});
after(async()=>{if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}if(area)fs.rmSync(area,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
test('01 precios particulares: autorización, cifrado y productos válidos',async()=>{
 const body={name:'Cliente sintético privado',prices:[{productId:'p',price:85}]};assert.equal((await api('/api/commerce/customers','POST',body,employee)).status,403);
 const made=await api('/api/commerce/customers','POST',body);assert.equal(made.status,200);customer=made.body;
 const db=new DatabaseSync(path.join(data,'el-muelle-pos.sqlite'),{readOnly:true});try{assert.ok(!db.prepare("SELECT payload FROM documents WHERE collection='customers'").get().payload.includes(body.name));}finally{db.close();}
 assert.equal((await api('/api/commerce/customers','POST',{name:'Otro',prices:[{productId:'missing',price:1}]})).status,400);
});
test('02 recepción guarda dos caducidades diferentes y una vencida sin fingir conteos',async()=>{
 assert.equal((await receipt('p',6,date(5),'Temprano')).status,201);assert.equal((await receipt('p',6,date(30),'Tardío')).status,201);assert.equal((await receipt('expired',3,date(-1),'Vencido')).status,201);
 const rows=(await api('/api/commerce/lots')).body;assert.equal(rows.length,3);assert.equal(rows.find(l=>l.productId==='expired').status,'expired');assert.ok(rows.every(l=>l.kind==='received'));
});
test('03 mayoreo suma partidas del mismo producto y conserva el menor precio autorizado',async()=>{
 const result=await api('/api/sales','POST',checkout({customerId:customer.id,items:[{productId:'p',quantity:2,price:85},{productId:'p',quantity:3,price:85}]}));assert.equal(result.status,201,JSON.stringify(result.body));sale=result.body;assert.equal(sale.total,425);assert.equal(sale.totalCost,200);assert.equal(sale.grossProfit,225);assert.ok(sale.items.every(i=>i.priceSource==='customer'&&i.lotAllocations[0].expiresAt===date(5)));
 const replay=await api('/api/sales','POST',{...checkout(),checkoutIntentId:'different-intent',customerId:customer.id,items:[{productId:'p',quantity:1,price:1}]});assert.equal(replay.status,409);
});
test('04 cancelación recupera los lotes originales y su caducidad sin duplicarlos',async()=>{
 assert.equal((await api('/api/sales/'+sale.id+'/cancel','PATCH',{reason:'Cancelación sintética'})).status,200);
 const rows=(await api('/api/commerce/lots')).body.filter(l=>l.productId==='p');assert.equal(rows.reduce((n,l)=>n+l.remaining,0),12);assert.equal(rows.find(l=>l.reference==='Temprano').remaining,6);
});
test('05 mayoreo aplica sin cliente, con idempotencia y sin depender del precio enviado',async()=>{
 const body=checkout({items:[{productId:'p',quantity:3,price:90},{productId:'p',quantity:2,price:90}]});const made=await api('/api/sales','POST',body);assert.equal(made.status,201,JSON.stringify(made.body));assert.equal(made.body.total,450);assert.ok(made.body.items.every(i=>i.priceSource==='wholesale'));const repeat=await api('/api/sales','POST',body);assert.equal(repeat.status,200);assert.equal(repeat.body.id,made.body.id);
});
test('06 peso o stock caducado y precios adulterados no se venden',async()=>{
 assert.equal((await api('/api/sales','POST',checkout({items:[{productId:'expired',quantity:1,price:100}]}))).status,409);
 assert.equal((await api('/api/sales','POST',checkout({items:[{productId:'p',quantity:1,price:1}]}))).status,409);
});
test('07 el precio público también gana si el acuerdo de cliente es más caro',async()=>{
 assert.equal((await api('/api/commerce/customers','POST',{id:customer.id,name:customer.name,prices:[{productId:'p',price:120}]})).status,200);
 const made=await api('/api/sales','POST',checkout({customerId:customer.id}));assert.equal(made.status,201);assert.equal(made.body.items[0].price,100);assert.equal(made.body.items[0].priceSource,'public');
});
test('08 ajustes y mermas mantienen suma de lotes y no eliminan fechas',async()=>{
 let result=await api('/api/products/p/inventory','PATCH',{operationId:id(),stockQuantity:8,reasonCode:'conteo'});assert.equal(result.status,200,JSON.stringify(result.body));
 result=await api('/api/products/p/inventory','PATCH',{operationId:id(),stockQuantity:7,type:'waste',reasonCode:'deterioro'});assert.equal(result.status,200);
 const rows=(await api('/api/commerce/lots')).body.filter(l=>l.productId==='p');assert.equal(rows.reduce((n,l)=>n+l.remaining,0),7);assert.ok(rows.some(l=>l.expiresAt===date(30)));
});
test('09 clasificación de caja distingue gastos, compras y retiros del propietario',async()=>{
 for(const [classification,amount]of [['business_expense',20],['inventory_purchase',30],['owner_withdrawal',40]])assert.equal((await api('/api/cash-sessions/'+cash+'/movements','POST',{type:'out',classification,amount,description:'Movimiento sintético'})).status,201);
 const f=await api('/api/commerce/financial');assert.equal(f.status,200);assert.equal(f.body.revenue,550);assert.equal(f.body.totalCost,240);assert.equal(f.body.grossProfit,310);assert.equal(f.body.expenses,20);assert.equal(f.body.resultAfterExpenses,290);
 assert.equal((await api('/api/commerce/financial','GET',undefined,employee)).status,403);
});
test('10 el reporte usa precios y costos históricos después de editar el producto',async()=>{
 assert.equal((await api('/api/products/p','PUT',{operationId:id(),price:200,costPrice:150})).status,200);const f=(await api('/api/commerce/financial')).body;assert.equal(f.grossProfit,310);assert.equal(f.products[0].totalCost,240);
});
test('11 cambiar caducidad requiere administrador, motivo y conserva existencias',async()=>{
 const row=(await api('/api/commerce/lots')).body.find(l=>l.productId==='expired');assert.equal((await api('/api/commerce/lots/'+encodeURIComponent(row.id),'PUT',{expiresAt:date(3),reason:'Fecha corregida'},employee)).status,403);
 assert.equal((await api('/api/commerce/lots/'+encodeURIComponent(row.id),'PUT',{expiresAt:date(3),reason:'Fecha corregida'})).status,200);assert.equal((await api('/api/commerce/lots')).body.find(l=>l.id===row.id).remaining,3);
});
test('12 borrador cifrado, aislado por usuario, sin PIN ni campos arbitrarios',async()=>{
 const draft={fields:{productNameInput:'Borrador privado',productCostInput:'42'},editingId:'p'};assert.equal((await api('/api/commerce/drafts/product','PUT',draft)).status,200);
 assert.equal((await api('/api/commerce/drafts/product')).body.fields.productNameInput,'Borrador privado');assert.equal((await api('/api/commerce/drafts/product','GET',undefined,employee)).status,403);
 assert.equal((await api('/api/commerce/drafts/product','PUT',{fields:{pin:'123456'}})).status,400);
 const db=new DatabaseSync(path.join(data,'el-muelle-pos.sqlite'),{readOnly:true});try{assert.ok(!db.prepare("SELECT payload FROM documents WHERE collection='commercial-drafts'").get().payload.includes('Borrador privado'));}finally{db.close();}
});
test('13 administrador sin vencimiento tras una hora; empleado conserva vencimiento',async()=>{
 clock+=3600000;fs.writeFileSync(path.join(area,'offset'),String(clock));const a=await api('/api/auth/session');assert.equal(a.body.authenticated,true);assert.ok(!a.cookie.includes('Max-Age'));assert.equal((await api('/api/auth/session','GET',undefined,employee)).body.authenticated,false);
});
test('14 configurar vencimiento administrativo sigue requiriendo autenticación',async()=>{
 assert.equal((await api('/api/commerce/policy','PUT',{adminIdleMinutes:30,expiryWarningDays:7})).status,200);await api('/api/auth/session');clock+=31*60000;fs.writeFileSync(path.join(area,'offset'),String(clock));assert.equal((await api('/api/auth/session')).body.authenticated,false);
});
