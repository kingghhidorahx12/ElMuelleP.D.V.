// Commercial extensions use the existing document store and outer SQLite transaction.
const crypto=require('node:crypto'),path=require('node:path'),v=require('./validation');
const pricing=require('../public/pricing');
const q=n=>Math.round(n*1000)/1000,m=n=>Math.round((n+Number.EPSILON)*100)/100;
function fail(message,statusCode=409){throw Object.assign(Error(message),{statusCode});}
function today(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day;}
function createCommerce(c){
  const {database,dataDir,readJson,productsPath,salesPath,readCashSessions,encryptSensitivePayload,decryptSensitivePayload}=c;
  const records=name=>readJson(path.join(dataDir,name+'.json'),[]);
  function policy(){const p=database.readDocument('commerce-settings','current',{adminIdleMinutes:0,expiryWarningDays:7});if(![0,30,60,120].includes(p?.adminIdleMinutes)||!Number.isInteger(p?.expiryWarningDays)||p.expiryWarningDays<0||p.expiryWarningDays>90)fail('Las preferencias de sesión y caducidad requieren revisión.',503);return p;}
  function sessionMs(user){return user?.role==='admin'?(policy().adminIdleMinutes===0?Infinity:policy().adminIdleMinutes*60000):30*60000;}
  function customer(id){if(!id)return null;if(typeof id!=='string'||!/^customer:[\w-]{1,100}$/.test(id))v.invalid('Cliente inválido.');const record=database.readDocument('customers',id);if(!record||record.active===false)fail('El cliente ya no está disponible. Selecciona otro cliente.');return {...record,name:decryptSensitivePayload(record.nameEncrypted)?.name||'Cliente',nameEncrypted:undefined};}
  function customers(){return records('customers').filter(x=>x.active!==false).map(x=>customer(x.id));}
  function productFields(body,old,unit){
    const wholesaleMin=v.number(body.wholesaleMin===undefined?old.wholesaleMin??null:body.wholesaleMin,'Cantidad para mayoreo',{nullable:true,decimals:3,integer:unit==='pieza'});
    const wholesalePrice=v.number(body.wholesalePrice===undefined?old.wholesalePrice??null:body.wholesalePrice,'Precio de mayoreo',{nullable:true});
    if((wholesaleMin!==null||wholesalePrice!==null)&&(!(wholesaleMin>0)||!(wholesalePrice>0)))v.invalid('Captura cantidad y precio de mayoreo, o deja ambos vacíos.');
    return {wholesaleMin,wholesalePrice};
  }
  function lots(product){
    const stored=records('inventory-lots').filter(l=>l.productId===product.id);
    const sum=q(stored.reduce((s,l)=>s+l.remaining,0)),stock=product.stockQuantity;
    if(typeof stock!=='number')return stored;
    if(sum>q(stock))fail('Los lotes no coinciden con la existencia; se requiere conciliación.');
    if(sum<q(stock)){if(stored.length)fail('Los lotes no coinciden con la existencia; se requiere conciliación.');stored.push({id:'opening:'+product.id,productId:product.id,remaining:q(stock-sum),receivedAt:product.createdAt?.slice(0,10)||today(),expiresAt:null,kind:'administrative_opening',unitCost:Number(product.costPrice||0),virtual:true});}
    return stored;
  }
  function persist(lot){const clean={...lot};delete clean.virtual;database.saveDocument('inventory-lots',lot.id,clean);}
  function materialize(product){const list=lots(product);for(const l of list)if(l.virtual)persist(l);return list;}
  function availability(product){if(typeof product.stockQuantity!=='number')return {saleableQuantity:null,expiredQuantity:0};const expiredQuantity=q(lots(product).filter(l=>l.expiresAt&&l.expiresAt<today()).reduce((n,l)=>n+l.remaining,0));return {saleableQuantity:q(product.stockQuantity-expiredQuantity),expiredQuantity};}
  function receive(product,amount,entry){
    // Called before the product's aggregate stock changes.
    materialize(product);
    const expiresAt=entry.expiresAt?v.date(entry.expiresAt,'Caducidad'):null;
    const lot={id:'lot:'+entry.id,productId:product.id,remaining:amount,quantity:amount,unitCost:entry.unitCost??product.costPrice??0,receivedAt:entry.receivedAt||today(),expiresAt,reference:entry.lotCode||'',kind:entry.kind||'received'};
    persist(lot);return lot;
  }
  function allocate(product,amount,{sale=false}={}){
    const list=materialize(product).filter(l=>l.remaining>0&&(!sale||!l.expiresAt||l.expiresAt>=today()));
    list.sort((a,b)=>(a.expiresAt||'9999').localeCompare(b.expiresAt||'9999')||a.receivedAt.localeCompare(b.receivedAt)||a.id.localeCompare(b.id));
    if(q(list.reduce((s,l)=>s+l.remaining,0))<q(amount))fail(sale?'La existencia disponible sin caducar es insuficiente. Revisa los lotes en Inventario.':'La cantidad supera la existencia de los lotes.');
    let pending=amount;const allocations=[];
    for(const lot of list){if(pending<=0)break;const quantity=q(Math.min(lot.remaining,pending));lot.remaining=q(lot.remaining-quantity);pending=q(pending-quantity);persist(lot);allocations.push({lotId:lot.id,quantity,expiresAt:lot.expiresAt,unitCost:lot.unitCost});}
    return allocations;
  }
  function adjust(product,amount,entry){if(amount<0)return allocate(product,-amount);if(amount>0)return receive(product,amount,{...entry,kind:'administrative_adjustment'});return [];}
  function restore(product,item,saleId,index){
    if(item.lotAllocations?.length){for(const a of item.lotAllocations){const lot=database.readDocument('inventory-lots',a.lotId);if(!lot)fail('No se encontró el lote original de la venta.');lot.remaining=q(lot.remaining+a.quantity);persist(lot);}}
    else receive(product,item.quantity,{id:'return:'+saleId+':'+index,kind:'sale_cancellation',unitCost:item.costPrice});
  }
  function priceItems(items,products,customerId,submitted){
    const selected=customer(customerId),totals=pricing.quantities(items);
    items.forEach((item,index)=>{const p=products.find(p=>p.id===item.productId),price=pricing.resolve(p,totals.get(p.id),selected);if(submitted[index].price!==undefined&&m(Number(submitted[index].price))!==price.price)fail('El precio cambió. Revisa el ticket antes de cobrar.');Object.assign(item,{price:price.price,priceSource:price.source,publicPrice:p.price,total:m(item.quantity*price.price),grossProfit:m(item.quantity*price.price-item.lineCost)});});
    return selected?{id:selected.id,name:selected.name}:null;
  }
  function financial(from,to){
    if(from)v.date(from,'Desde');if(to)v.date(to,'Hasta');if(from&&to&&from>to)v.invalid('Revisa el periodo.');
    const inside=d=>(!from||d>=from)&&(!to||d<=to),byProduct=new Map();let revenue=0,cost=0,unknownCostLines=0;
    for(const sale of readJson(salesPath,[]).filter(s=>s.status!=='cancelada'&&inside(s.businessDate||s.createdAt.slice(0,10)))){
      let remainingDiscount=Number(sale.discount||0);
      sale.items.forEach((i,index)=>{const discount=index===sale.items.length-1?remainingDiscount:Math.min(remainingDiscount,m((sale.discount||0)*i.total/(sale.subtotal||1)));remainingDiscount=m(remainingDiscount-discount);const net=m(i.total-discount),known=typeof i.lineCost==='number'||typeof i.costPrice==='number',lineCost=Number(i.lineCost??i.quantity*i.costPrice)||0;
        const row=byProduct.get(i.productId)||{id:i.productId,name:i.name,unit:i.unit,quantity:0,revenue:0,totalCost:0,grossProfit:0,unknownCostLines:0};row.quantity=q(row.quantity+i.quantity);row.revenue=m(row.revenue+net);row.totalCost=m(row.totalCost+lineCost);row.grossProfit=m(row.revenue-row.totalCost);if(!known||!lineCost){row.unknownCostLines++;unknownCostLines++;}byProduct.set(i.productId,row);revenue=m(revenue+net);cost=m(cost+lineCost);
      });
    }
    const movements=readCashSessions().flatMap(s=>(s.movements||[]).map(x=>({...x,businessDate:s.businessDate||x.createdAt.slice(0,10)}))).filter(x=>x.type==='out'&&inside(x.businessDate));
    const expenses=m(movements.filter(x=>x.classification==='business_expense').reduce((s,x)=>s+x.amount,0));
    return {revenue,totalCost:cost,grossProfit:m(revenue-cost),expenses,resultAfterExpenses:m(revenue-cost-expenses),unknownCostLines,unclassifiedWithdrawals:m(movements.filter(x=>!x.classification||x.classification==='unclassified').reduce((s,x)=>s+x.amount,0)),products:[...byProduct.values()].map(x=>({...x,profitMarginPercent:x.revenue?m(x.grossProfit/x.revenue*100):0}))};
  }
  function register(){
    const {app,requireAdminUser,requireSessionUser,withDataTransaction,recordAuditEvent}=c;
    app.get('/api/commerce/options',(req,res)=>{if(!requireSessionUser(req,res))return;res.json({customers:customers().map(({id,name,prices})=>({id,name,prices})),policy:req.validatedSessionUser.role==='admin'?policy():null});});
    const draftKind=(req,res)=>{const user=requireAdminUser(req,res);if(!user)return null;if(!['product','inventory'].includes(req.params.kind))v.invalid('Borrador inválido.');return user.id+':'+req.params.kind;};
    app.get('/api/commerce/drafts/:kind',(req,res)=>{const key=draftKind(req,res);if(!key)return;const saved=database.readDocument('commercial-drafts',key);res.json(saved?decryptSensitivePayload(saved.encrypted):null);});
    app.put('/api/commerce/drafts/:kind',(req,res)=>{const key=draftKind(req,res);if(!key)return;const allowed=req.params.kind==='product'?['productNameInput','productCodeInput','productDescriptionInput','productCategoryInput','productUnitInput','productPriceInput','productCostInput','productMinStockInput','productWholesaleMin','productWholesalePrice','productActiveInput']:['inventoryEntryProductInput','inventoryEntryQuantityInput','inventoryEntryUnitCostInput','inventoryEntrySalePriceInput','inventoryEntryDateInput','inventoryEntryNotesInput','inventorySupplierInput','inventoryExpiryInput','inventoryLotInput','inventoryNewProductNameInput','inventoryNewProductCategoryInput','inventoryNewProductUnitInput','inventoryNewProductMinStockInput','inventoryNewProductCodeInput'];v.object(req.body.fields);if(Object.keys(req.body.fields).some(k=>!allowed.includes(k))||Object.values(req.body.fields).some(x=>!['string','boolean'].includes(typeof x)||String(x).length>1000))v.invalid('Campos de borrador inválidos.');const editingId=v.text(req.body.editingId??'','Producto',100,{optional:true});const mode=v.text(req.body.mode??'','Modo',40,{optional:true});withDataTransaction(()=>database.saveDocument('commercial-drafts',key,{encrypted:encryptSensitivePayload({fields:req.body.fields,editingId,mode,updatedAt:new Date().toISOString()})}));res.json({ok:true});});
    app.delete('/api/commerce/drafts/:kind',(req,res)=>{const key=draftKind(req,res);if(!key)return;withDataTransaction(()=>{database.db.prepare("DELETE FROM documents WHERE collection='commercial-drafts' AND document_id=?").run(key);database.transactionDirty=true;});res.json({ok:true});});
    app.put('/api/commerce/policy',(req,res)=>{const user=requireAdminUser(req,res);if(!user)return;const adminIdleMinutes=v.number(req.body.adminIdleMinutes,'Tiempo de sesión',{integer:true});if(![0,30,60,120].includes(adminIdleMinutes))v.invalid('Tiempo de sesión inválido.');const expiryWarningDays=v.number(req.body.expiryWarningDays??7,'Aviso de caducidad',{integer:true});if(expiryWarningDays>90)v.invalid('El aviso debe ser de hasta 90 días.');withDataTransaction(()=>{database.saveDocument('commerce-settings','current',{adminIdleMinutes,expiryWarningDays});recordAuditEvent('commerce_policy_updated','settings','commerce',user,{adminIdleMinutes,expiryWarningDays});});c.onPolicyChanged?.();res.json(policy());});
    app.post('/api/commerce/customers',(req,res)=>{const user=requireAdminUser(req,res);if(!user)return;const id=req.body.id||'customer:'+crypto.randomUUID();if(typeof id!=='string'||!/^customer:[\w-]{1,100}$/.test(id))v.invalid('Cliente inválido.');const name=v.text(req.body.name,'Nombre del cliente',120);if(!Array.isArray(req.body.prices)||req.body.prices.length>500)v.invalid('Precios de cliente inválidos.');const products=readJson(productsPath,[]),seen=new Set(),prices=req.body.prices.map(row=>{if(!products.some(p=>p.id===row.productId)||seen.has(row.productId))v.invalid('Producto de cliente inválido o repetido.');seen.add(row.productId);const price=v.number(row.price,'Precio de cliente');if(price<=0)v.invalid('El precio debe ser mayor a cero.');return {productId:row.productId,price};});withDataTransaction(()=>{database.saveDocument('customers',id,{id,nameEncrypted:encryptSensitivePayload({name}),prices,active:req.body.active===undefined?true:v.boolean(req.body.active,'Cliente activo'),updatedAt:new Date().toISOString()});recordAuditEvent('customer_pricing_saved','customer',id,user,{productCount:prices.length});});res.json({id,name,prices});});
    app.get('/api/commerce/lots',(req,res)=>{if(!requireSessionUser(req,res))return;const day=today(),warning=new Date(day+'T12:00:00Z');warning.setUTCDate(warning.getUTCDate()+policy().expiryWarningDays);res.json(readJson(productsPath,[]).flatMap(p=>lots(p).filter(l=>l.remaining>0).map(l=>({...l,productName:p.name,unit:p.unit,status:!l.expiresAt?'undated':l.expiresAt<day?'expired':l.expiresAt<=warning.toISOString().slice(0,10)?'soon':'available'}))));});
    app.put('/api/commerce/lots/:id',(req,res)=>{const user=requireAdminUser(req,res);if(!user)return;const expiresAt=req.body.expiresAt?v.date(req.body.expiresAt,'Caducidad'):null,reason=v.text(req.body.reason,'Motivo',180);withDataTransaction(()=>{const products=readJson(productsPath,[]),p=products.find(p=>lots(p).some(l=>l.id===req.params.id));if(!p)fail('Lote no encontrado.',404);const lot=materialize(p).find(l=>l.id===req.params.id),previous=lot.expiresAt;lot.expiresAt=expiresAt;persist(lot);recordAuditEvent('lot_expiry_updated','inventory_lot',lot.id,user,{previous,expiresAt,reason});});res.json({ok:true});});
    app.get('/api/commerce/financial',(req,res)=>{if(!requireAdminUser(req,res))return;res.json(financial(req.query.from,req.query.to));});
  }
  return {policy,sessionMs,productFields,customer,customers,lots,receive,allocate,adjust,restore,priceItems,financial,register,availability};
}
module.exports={createCommerce,today};
