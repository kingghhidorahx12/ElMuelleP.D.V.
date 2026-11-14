const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(reduced=false){
 const classes=new Set(),animations=[],styles=new Map();let measurements=0;
 const classList={contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)};
 const ticket={classList,style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)},getBoundingClientRect:()=>{measurements++;return {left:100,top:50,width:280,height:500};},cloneNode:()=>{throw Error('No clonar');},animate:()=>animation()};
 function animation(){let resolve;const finished=new Promise(r=>resolve=r),a={finished,finish:resolve,cancel:resolve};animations.push(a);return a;}
 const sidebar={animate:()=>animation(),getBoundingClientRect:()=>{throw Error('No medir sidebar');}};
 const context={window:{},document:{hidden:false,body:{classList},querySelector:s=>s==='.sidebar'?sidebar:s==='.ticket-panel'?ticket:null},matchMedia:()=>({matches:reduced}),Promise};
 vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/web/motion.js','utf8'),context);
 return {run:context.window.AndroidMotion.run,classes,animations,styles,get measurements(){return measurements;},async finish(){animations.forEach(a=>a.finish());await new Promise(r=>setImmediate(r));}};
}
test('Sidebar animation does not measure/retexture catalogue or duplicate sale',async()=>{const f=fixture();f.run('sidebar',()=>f.classes.add('sidebar-collapsed'));assert.equal(f.measurements,0);assert.equal(f.animations.length,1);await f.finish();});
test('Closing sale animates original node and clears temporary geometry',async()=>{const f=fixture();f.run('ticket',()=>f.classes.add('ticket-collapsed'));assert.equal(f.measurements,1);assert.equal(f.styles.size,4);assert.ok(f.classes.has('android-ticket-exit'));await f.finish();assert.ok(!f.classes.has('android-ticket-exit'));assert.equal(f.styles.size,0);assert.ok(f.classes.has('ticket-collapsed'));});
test('Rapid reopen cancels exit and cannot hide the reopened sale',async()=>{const f=fixture();f.run('ticket',()=>f.classes.add('ticket-collapsed'));f.run('ticket',()=>f.classes.delete('ticket-collapsed'));await f.finish();assert.ok(!f.classes.has('ticket-collapsed'));assert.ok(!f.classes.has('android-ticket-exit'));assert.equal(f.styles.size,0);});
test('Nested close callbacks share one animation',async()=>{const f=fixture();f.run('ticket',()=>f.run('ticket',()=>f.classes.add('ticket-collapsed')));assert.equal(f.animations.length,1);assert.equal(f.measurements,1);await f.finish();});
test('Reduced motion updates logical visibility without measurements',()=>{const f=fixture(true);f.run('ticket',()=>f.classes.add('ticket-collapsed'));assert.equal(f.measurements,0);assert.equal(f.animations.length,0);assert.ok(f.classes.has('ticket-collapsed'));});
