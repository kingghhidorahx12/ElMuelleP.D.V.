const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
test('Offline Android JS adapter: initialization through OS alias, sales, stock, recovery and permissions (host JNI double)',async()=>{
 const root=fs.mkdtempSync(path.join(__dirname,'../.dev/android-adapter-flow-')),alias=root+'-os-alias';
 fs.symlinkSync(root,alias,process.platform==='win32'?'junction':'dir');
 fs.cpSync(path.join(__dirname,'app/src/main/assets/nodeapp'),path.join(root,'bundle'),{recursive:true});
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const token=crypto.randomBytes(32).toString('hex');let cookie='',logs='';const child=spawn(process.execPath,[path.join(__dirname,'test-host-runtime.cjs')],{env:{...process.env,ANDROID_PRIVATE_ROOT:alias,ANDROID_NATIVE_LIB:root,ANDROID_HTTP_TOKEN:token,TMPDIR:path.join(root,'cache'),PORT:String(port),HOST:'127.0.0.1',NODE_ENV:'test'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);fs.mkdirSync(path.join(root,'cache'));
 const origin='http://127.0.0.1:'+port;
 async function request(route,method='GET',body,expected=200){const r=await fetch(origin+route,{method,headers:{'X-Android-Access':token,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const s=r.headers.get('set-cookie');if(s)cookie=s.split(';')[0];const value=await r.json();assert.equal(r.status,expected,route+' respondió '+r.status+' '+(value.message||''));return value;}
 try{
  let ready=false;for(let i=0;i<180;i++){if(child.exitCode!==null)throw Error('Adaptador no inició: '+logs);try{await request('/api/health');ready=true;break;}catch{}await new Promise(r=>setTimeout(r,300));}assert.ok(ready,'No inició el adaptador: '+logs);
  assert.equal((await request('/api/settings')).setupRequired,true);
  await request('/api/setup/owner','POST',{name:'Administrador sintético Android',pin:'584209'},201);
  const products=await request('/api/products');assert.equal(products.length,28);assert.ok(products.every(p=>p.stockQuantity===0&&p.photoFile&&p.photoSHA256));
  assert.equal((await request('/api/sales')).length,0);assert.equal((await request('/api/inventory/entries')).length,0);
  const cash=await request('/api/cash-sessions/open','POST',{openingAmount:100},201),piece=products.find(p=>p.unit==='pieza'),weighted=products.find(p=>p.unit==='kg');
  const sale={checkoutIntentId:crypto.randomUUID(),cashSessionId:cash.id,items:[{productId:piece.id,quantity:1,source:'manual'}],paymentMethod:'efectivo',discount:0};
  await request('/api/sales','POST',sale,409);
  await request('/api/products/'+piece.id+'/inventory','PATCH',{operationId:crypto.randomUUID(),stockQuantity:5,reason:'Ajuste sintético del adaptador',type:'adjustment'});
  const sold=await request('/api/sales','POST',sale,201);assert.equal(sold.total,piece.price);assert.equal((await request('/api/sales','POST',sale)).id,sold.id);assert.equal((await request('/api/products')).find(p=>p.id===piece.id).stockQuantity,4);
  await request('/api/products/'+weighted.id+'/inventory','PATCH',{operationId:crypto.randomUUID(),stockQuantity:5,reason:'Ajuste sintético de peso',type:'adjustment'});
  await request('/api/sales','POST',{...sale,checkoutIntentId:crypto.randomUUID(),items:[{productId:weighted.id,quantity:1.25,source:'scale'}]},403);
  await request('/api/sales','POST',{...sale,checkoutIntentId:crypto.randomUUID(),items:[{productId:weighted.id,quantity:1.25,source:'manual'}]},403);
  const exported=await request('/api/android/backup/export','POST',{password:'synthetic-only'});
  await request('/api/android/backup/verify','POST',{path:exported.path,password:'incorrect-only'},400);
  const verified=await request('/api/android/backup/verify','POST',{path:exported.path,password:'synthetic-only'});assert.equal(verified.integrity,true);assert.equal(verified.allDocumentsPreserved,true);assert.equal(verified.auditPreserved,true);assert.equal(verified.photos,28);
  await request('/api/sales/'+sold.id+'/cancel','PATCH',{reason:'Cancelación sintética del adaptador'});assert.equal((await request('/api/products')).find(p=>p.id===piece.id).stockQuantity,5);
  const denied=await fetch(origin+'/api/products');assert.equal(denied.status,401);
 }finally{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));assert.ok(root.startsWith(path.resolve(__dirname,'../.dev')+path.sep));fs.rmSync(alias,{recursive:true,force:true,maxRetries:8,retryDelay:200});fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:200});}
});
