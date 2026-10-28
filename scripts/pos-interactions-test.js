const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
function harness() {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) {
      const values = new Set(id.endsWith('Modal') ? ['hidden'] : []);
      nodes.set(id, { value:'', dataset:{}, disabled:false, inert:false, attributes:new Map(),
        classList:{ add:x=>values.add(x), remove:x=>values.delete(x), contains:x=>values.has(x), toggle(x,on){on ? values.add(x) : values.delete(x); } },
        setAttribute(k,v){this.attributes.set(k,v);}, removeAttribute(k){this.attributes.delete(k);},
        toggleAttribute(k,on){on ? this.attributes.set(k,'') : this.attributes.delete(k);},
        focus(){}, select(){}, querySelectorAll(){return [];} });
    }
    return nodes.get(id);
  };
  const kg={id:'kg',name:'Kg',unit:'kg',price:100,costPrice:50,stockQuantity:20};
  const piece={id:'piece',name:'Pieza',unit:'pieza',price:40,costPrice:10,stockQuantity:3};
  const state={products:[kg,piece],selectedProduct:null,pieceQuantityProductId:null,quantityCaptureVersion:0,
    manualCapturePending:false,detectedQuantity:0,quantitySource:'manual',ticket:[],activeView:'pos',sessionAuthenticated:true};
  const calls=[];
  const context={state,console,$:node,$$:()=>[],document:{body:node('body'),querySelector:()=>node('weigh-panel')},
    scaleState:{connected:false,weightKg:0},MIN_SCALE_WEIGHT_KG:.005,MAX_SCALE_WEIGHT_KG:30,
    renderWeighPanel(){},renderTicket(){},renderProducts(){throw Error('Unnecessary catalog redraw');},
    setPosStep(){},requestScaleWeight(){calls.push('scale');},showToast:x=>calls.push(x),
    updateManualQuantityUi(){},verifyAdminPin:async()=>{},money:x=>`$${x}`,pieceStockText:x=>`${x} pzas`,quantityText:x=>String(x),
    getCheckoutIntentId:()=> 'synthetic-intent-0001', getSalesCashShift:()=>({id:'synthetic-cash'}),
    roundCurrency:x=>Math.round(x*100)/100};
  vm.createContext(context);
  for (const name of ['selectProduct','focusCatalogProduct','syncProductSelection','clearSelectedProduct',
    'validatePieceQuantity','updatePieceQuantityModal','openPieceQuantityModal','closePieceQuantityModal',
    'confirmPieceQuantity','getEffectiveQuantity','addCurrentProductToTicket','openManualModal','closeManualModal',
    'saveManualQuantity','getManualQuantityValue']) {
    const match=source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
    assert.ok(match,name); vm.runInContext(match[0],context);
  }
  return {c:context,s:state,n:node,kg,piece,calls};
}
test('kg/piece alternation discards only temporary captures and never redraws the catalog',()=>{
  const h=harness(); h.s.ticket.push({productId:'previous',quantity:2,total:80});
  const ticket=JSON.stringify(h.s.ticket);
  for(let i=0;i<12;i++) {
    h.c.selectProduct(h.kg); h.s.detectedQuantity=1.25; h.c.openManualModal();
    h.c.selectProduct(h.piece);
    assert.equal(h.s.selectedProduct,null); assert.equal(h.s.pieceQuantityProductId,'piece');
    assert.equal(h.n('manualModal').inert,true); assert.equal(h.n('weigh-panel').inert,true);
    assert.equal(h.n('pieceQuantityModal').inert,false);
    h.c.selectProduct(h.kg);
    assert.equal(h.n('pieceQuantityModal').inert,true); assert.equal(h.s.selectedProduct,h.kg);
    assert.equal(h.s.detectedQuantity,0); assert.equal(JSON.stringify(h.s.ticket),ticket);
    h.c.clearSelectedProduct({restoreFocus:true});
  }
});
test('piece validation rejects zero, fractions, and over-stock; double confirmation adds once',()=>{
  const h=harness(); h.c.selectProduct(h.piece);
  for(const q of ['0','1.5','4']) assert.ok(h.c.validatePieceQuantity(h.piece,q).error);
  h.n('pieceQuantityInput').value='2'; h.c.confirmPieceQuantity(); h.c.confirmPieceQuantity();
  assert.equal(h.s.ticket.length,1); assert.equal(h.s.ticket[0].quantity,2); assert.equal(h.s.ticket[0].total,80);
  assert.ok(h.c.validatePieceQuantity(h.piece,'2').error,'Existing ticket reserves stock');
});
test('manual PIN resolution after switching to a piece cannot apply stale kg or change the ticket',async()=>{
  const h=harness(); let release; h.c.verifyAdminPin=()=>new Promise(r=>{release=r;});
  h.c.selectProduct(h.kg); h.c.openManualModal(); h.n('manualQuantityInput').value='1.25';
  const pending=h.c.saveManualQuantity(); h.c.selectProduct(h.piece); release(); await pending;
  assert.equal(h.s.detectedQuantity,0); assert.equal(h.s.ticket.length,0); assert.equal(h.s.pieceQuantityProductId,'piece');
  assert.equal(h.calls.includes('Captura aplicada.'),false);
});
test('manual PIN rejects wrong credentials, blocks duplicate submits, and preserves kg totals',async()=>{
  const h=harness(); h.c.selectProduct(h.kg); h.c.openManualModal(); h.n('manualQuantityInput').value='1.25';
  h.c.verifyAdminPin=async()=>{throw Object.assign(Error('PIN incorrecto.'),{status:401});};
  await h.c.saveManualQuantity(); assert.equal(h.s.detectedQuantity,0); assert.equal(h.n('manualModal').inert,false);
  let release; let requests=0; h.c.verifyAdminPin=()=>{requests++;return new Promise(r=>{release=r;});};
  const first=h.c.saveManualQuantity(); await h.c.saveManualQuantity(); assert.equal(requests,1); release(); await first;
  assert.equal(h.s.detectedQuantity,1.25); assert.equal(h.n('manualModal').inert,true);
  h.c.addCurrentProductToTicket(); h.c.addCurrentProductToTicket();
  assert.equal(h.s.ticket.length,1); assert.equal(h.s.ticket[0].total,125); assert.equal(h.s.ticket[0].lineCost,62.5);
});
test('cancel followed by reopening the same kg ignores the earlier PIN response',async()=>{
  const h=harness(); let release; h.c.verifyAdminPin=()=>new Promise(r=>{release=r;});
  h.c.selectProduct(h.kg); h.c.openManualModal(); h.n('manualQuantityInput').value='2'; const first=h.c.saveManualQuantity();
  h.c.closeManualModal(); h.c.openManualModal(); release(); await first;
  assert.equal(h.s.detectedQuantity,0); assert.equal(h.n('manualModal').inert,false); assert.equal(h.s.manualCapturePending,false);
});
test('existing scale UI distinguishes disconnected, connected and error without hardware access',()=>{
  const h=harness(); h.c.updateAccessStatus=()=>{};
  vm.runInContext(source.match(/^function updateScaleUi\([^]*?^}/m)[0],h.c);
  Object.assign(h.c.scaleState,{supported:true,error:false,raw:'',stable:true});
  h.c.updateScaleUi(); assert.equal(h.n('scaleStatusPill').textContent,'Sin conexión');
  assert.equal(h.n('connectScaleBtn').disabled,false);
  h.c.scaleState.connected=true; h.c.scaleState.weightKg=1.234; h.c.updateScaleUi();
  assert.equal(h.n('scaleStatusPill').textContent,'Conectada'); assert.equal(h.n('scaleWeightText').textContent,'1.234 kg');
  assert.equal(h.n('connectScaleBtn').disabled,true);
  h.c.scaleState.connected=false; h.c.scaleState.error=true; h.c.updateScaleUi();
  assert.equal(h.n('scaleStatusPill').textContent,'Error de báscula');
});
test('micro feedback honors OS preference, internal preference and background visibility',()=>{
  const h=harness(); let count=0;
  Object.assign(h.c,{posMicroMotion:{matches:true},posReducedMotion:false,posFeedbackByElement:new WeakMap(),activePosFeedback:new Set()});
  vm.runInContext(source.match(/^function animatePosFeedback\([^]*?^}/m)[0],h.c);
  const element={animate(){count++;return {cancel(){},finished:Promise.resolve()};}};
  h.c.animatePosFeedback(element); assert.equal(count,0);
  h.c.posMicroMotion.matches=false; h.c.posReducedMotion=true; h.c.animatePosFeedback(element); assert.equal(count,0);
  h.c.posReducedMotion=false; h.c.document.hidden=true; h.c.animatePosFeedback(element); assert.equal(count,0);
  h.c.document.hidden=false; h.c.animatePosFeedback(element); assert.equal(count,1);
});
