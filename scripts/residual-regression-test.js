// Lote residual: contenido de caja, controles fiscales reales y carga de recuperación.
// Sólo fixtures privados; Playwright se obtiene del entorno de QA existente.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),net=require('node:net'),zlib=require('node:zlib');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const p=require('../src/persistence');
const root=path.resolve(__dirname,'..'),dev=path.join(root,'.dev');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function privateArea(prefix){const area=fs.mkdtempSync(path.join(dev,prefix));p.restrictPrivatePath(area,true);return area;}
function removeArea(area,prefix){assert.ok(p.inside(area,dev)&&path.basename(area).startsWith(prefix));p.rejectLinks(area);fs.rmSync(area,{recursive:true,force:true,maxRetries:10,retryDelay:100});assert.equal(fs.existsSync(area),false);}
function fileState(folder){const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else files.push([path.relative(folder,f),hash(fs.readFileSync(f))]);}}walk(folder);return files.sort((a,b)=>a[0].localeCompare(b[0]));}
function png(width,height){
  const crc=bytes=>{let n=0xffffffff;for(const byte of bytes){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
  const chunk=(type,data)=>{const t=Buffer.from(type),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([length,t,data,checksum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const raster=crypto.randomBytes((width*4+1)*height);for(let row=0;row<height;row++)raster[row*(width*4+1)]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raster,{level:1})),chunk('IEND',Buffer.alloc(0))]);
}
async function photoWorker(){
  assert.ok(os.freemem()>128*1024*1024,'Se requiere margen de memoria para la carga representativa.');
  const prefix='em003-residual-load-',area=privateArea(prefix),data=path.join(area,'source'),runtime=path.join(area,'private-runtime');
  p.privateDirectory(data);p.privateDirectory(runtime);process.env.TEMP=runtime;process.env.TMP=runtime;
  const custody=require('./recovery-custody'),media=require('../src/product-media'),{PosDatabase}=require('../src/database');
  const password='synthetic-load-only',photos=[],sizes=[],dimensions=[[768,1024],[896,1024],[1024,1024],[1260,1024]];
  const archive=path.join(area,'large.emrecovery'),destination=path.join(area,'restored');
  const gc=()=>global.gc?.();let result;
  try{
    const key=p.resolveEncryptionKey(data),db=new PosDatabase(data);p.ensureKeyCheck(db,key);
    try{for(let i=0;i<dimensions.length;i++){
      const bytes=png(...dimensions[i]);assert.ok(bytes.length>2*1024*1024&&bytes.length<media.MAX_PHOTO);
      const photo=await media.preparePhoto({mime:'image/png',data:bytes.toString('base64')},data);photo.committed=true;
      photos.push({id:'synthetic-photo-'+i,photoFile:photo.name,photoSHA256:photo.sha256});sizes.push(bytes.length);gc();
    }db.transaction(()=>{for(const photo of photos)db.saveDocument('products',photo.id,{...photo,name:'Imagen sintética',unit:'pieza',price:100,costPrice:40,stockQuantity:null});});}finally{db.close();}
    const source={databaseFile:path.join(data,p.DATABASE_NAME),keyFile:path.join(data,'.secrets.json'),backupDirectory:path.join(data,'backups')};
    // SQLite WAL prepara auxiliares al abrir una base cerrada, incluso en modo lectura.
    // Completar esa preparación sintética antes de medir todos los archivos del origen.
    p.validateKey(p.readKeyFile(source.keyFile),p.inspectDatabase(source.databaseFile));
    const before=fileState(data);
    let time=performance.now();custody.exportCustody({...source,destination:archive,password});const exportMs=performance.now()-time;gc();
    const archiveBytes=fs.statSync(archive).size,archiveHash=hash(fs.readFileSync(archive));
    // Base64 v1: medir el contenido cifrado sin conservar otra copia grande del sobre.
    let envelope=JSON.parse(fs.readFileSync(archive,'utf8'));assert.equal(envelope.format,'ElMuellePOS-recovery-v1');const ciphertextBytes=Buffer.byteLength(envelope.ciphertext,'base64');envelope=null;gc();
    time=performance.now();const restored=custody.restoreCustody({archive,destination,password});const restoreMs=performance.now()-time;assert.equal(restored.photos,photos.length);gc();
    const recovered=new DatabaseSync(path.join(destination,p.DATABASE_NAME),{readOnly:true});try{
      assert.equal(recovered.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      const rows=recovered.prepare("SELECT payload FROM documents WHERE collection='products'").all().map(r=>JSON.parse(r.payload));assert.equal(rows.length,photos.length);
      for(const photo of photos){const row=rows.find(r=>r.id===photo.id);assert.equal(row.photoFile,photo.photoFile);assert.equal(row.photoSHA256,photo.photoSHA256);assert.equal(hash(fs.readFileSync(path.join(destination,'product-photos',row.photoFile))),photo.photoSHA256);}
    }finally{recovered.close();}
    assert.throws(()=>custody.restoreCustody({archive,destination:path.join(area,'wrong'),password:'incorrect-synthetic'}));assert.equal(fs.existsSync(path.join(area,'wrong')),false);gc();
    const damaged=path.join(area,'damaged.emrecovery');fs.copyFileSync(archive,damaged);const fd=fs.openSync(damaged,'r+');try{const head=Buffer.alloc(512);fs.readSync(fd,head,0,512,0);const offset=head.indexOf(Buffer.from('"ciphertext":"'))+14;assert.ok(offset>14);const byte=Buffer.alloc(1);fs.readSync(fd,byte,0,1,offset);byte[0]=byte[0]===65?66:65;fs.writeSync(fd,byte,0,1,offset);}finally{fs.closeSync(fd);}
    assert.throws(()=>custody.restoreCustody({archive:damaged,destination:path.join(area,'damaged-target'),password}));assert.equal(fs.existsSync(path.join(area,'damaged-target')),false);gc();
    // Fallo real de preparación: fotografía sintética ausente; no debe quedar un archivo de respaldo parcial.
    const missing=path.join(data,'product-photos',photos[0].photoFile),held=path.join(area,'held.png'),failedArchive=path.join(area,'failed.emrecovery');
    assert.ok(p.inside(missing,data)&&p.inside(held,area));fs.renameSync(missing,held);
    try{assert.throws(()=>custody.exportCustody({...source,destination:failedArchive,password}));assert.equal(fs.existsSync(failedArchive),false);}finally{fs.renameSync(held,missing);}
    assert.deepEqual(fileState(data),before);assert.equal(hash(fs.readFileSync(archive)),archiveHash);
    assert.deepEqual(fs.readdirSync(runtime),[]);assert.ok(!fs.readdirSync(area).some(name=>name.startsWith('.el-muelle-restore-')));
    result={photos:photos.length,dimensions,photoBytes:sizes,originalBytes:sizes.reduce((a,b)=>a+b,0),ciphertextBytes,archiveBytes,exportMs,restoreMs,peakRssBytes:process.resourceUsage().maxRSS*1024,sourceUnchanged:true,individualHashesMatch:true,temporaryAreasClean:true,incorrectPasswordRejected:true,damagedArchiveRejected:true,controlledFailureClean:true,format:'ElMuellePOS-recovery-v1'};
  }finally{removeArea(area,prefix);}
  console.log('RECOVERY_LOAD_RESULT '+JSON.stringify(result));
}
if(process.argv.includes('--photo-worker')){
  photoWorker().catch(error=>{console.error(error.stack);process.exitCode=1;});
}else{
  const {test,before,after}=require('node:test');
  const pin='864209',employeePin='135790';let area,data,child,base,admin,employee;
  const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,prefix='em003-residual-';
  const sessions=[['historical-closed','2020-01-01','closed'],['today-closed',today,'closed'],['old-open','2019-01-01','open'],['isolated-closed','2021-02-02','closed']].map(([id,businessDate,status])=>({id,businessDate,status,openedAt:businessDate+'T12:00:00Z',closedAt:status==='closed'?businessDate+'T18:00:00Z':null,openingAmount:20,movements:[],openedBy:{id:'admin',role:'admin'}}));
  async function request(route,method='GET',body,cookie=admin){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  async function stop(){const running=child;child=null;if(running&&running.exitCode===null&&running.signalCode===null){const done=new Promise(r=>running.once('exit',r));running.kill();await done;}}
  const permissions=value=>Object.fromEntries(require('../src/access').MODULES.map(id=>[id,value]));
  async function setCash(value){const all=permissions(true);all.cash=value;assert.equal((await request('/api/users/employee/permissions','PUT',{permissions:all})).status,200);}
  before(async()=>{
    area=privateArea(prefix);data=path.join(area,'data');fs.mkdirSync(data);
    fs.writeFileSync(path.join(data,'products.json'),JSON.stringify([{id:'synthetic',name:'Producto sintético',unit:'pieza',category:'Pruebas',price:100,costPrice:40,stockQuantity:10,active:true}]));
    fs.writeFileSync(path.join(data,'cash-sessions.json'),JSON.stringify(sessions));
    fs.writeFileSync(path.join(data,'sales.json'),JSON.stringify(['WITH','WITHOUT','CANCELED'].map((id,i)=>({id:'T-SYN-'+id,createdAt:new Date().toISOString(),status:i===2?'cancelada':'completada',operator:{id:'employee',name:'Empleado sintético',role:'employee'},total:100,subtotal:100,items:[{productId:'synthetic',name:'Producto sintético',unit:'pieza',price:100,quantity:1,total:100}],invoice:{status:'no_solicitada'}}))));
    const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>r(n));});});assert.ok(![3000,3001].includes(port));base='http://127.0.0.1:'+port;
    child=spawn(process.execPath,['src/server.js'],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',NODE_ENV:'test',EL_MUELLE_STORAGE_MODE:'',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,ENV_FILE:path.join(area,'missing.env'),ADMIN_PIN:pin,EMPLOYEE_PIN:'',DATA_ENCRYPTION_KEY:'',REQUIRE_HTTPS:'false',CORS_ORIGIN:''},stdio:'ignore'});
    for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error('Synthetic server exited');try{if((await fetch(base+'/api/health')).ok)break;}catch{}await pause(100);}
    const login=await request('/api/auth/admin','POST',{pin},null);assert.equal(login.status,200);admin=login.cookie;
    assert.equal((await request('/api/settings','PUT',{users:[{id:'admin',name:'Administrador sintético',role:'admin',active:true},{id:'employee',name:'Empleado sintético',role:'employee',active:true}],employeePins:{employee:employeePin}})).status,200);
    const worker=await request('/api/auth/employee','POST',{userId:'employee',pin:employeePin},null);assert.equal(worker.status,200);employee=worker.cookie;
  });
  after(async()=>{await stop();if(area)removeArea(area,prefix);});
  function records(response,expected){assert.equal(response.status,200);assert.ok(Array.isArray(response.body));assert.deepEqual(response.body.map(s=>s.id).sort(),expected.slice().sort());for(const session of response.body){assert.equal(session.businessDate,sessions.find(s=>s.id===session.id).businessDate);assert.equal(session.status,sessions.find(s=>s.id===session.id).status);assert.ok(Array.isArray(session.movements));assert.equal(typeof session.summary,'object');}return response.body;}
  test('Caja: administrador conserva cuatro sesiones y ambos contratos son compatibles',async()=>{const a=records(await request('/api/cash-shifts'),sessions.map(s=>s.id)),b=records(await request('/api/cash-sessions'),sessions.map(s=>s.id));assert.deepEqual(a.slice().sort((x,y)=>x.id.localeCompare(y.id)),b.slice().sort((x,y)=>x.id.localeCompare(y.id)));});
  test('Caja: empleado sólo recibe abierta y fecha vigente, también con parámetros manipulados',async()=>{await setCash(true);const ids=['old-open','today-closed'];for(const route of ['/api/cash-shifts','/api/cash-sessions','/api/cash-shifts?role=admin&all=true&from=1900-01-01&context=pos'])records(await request(route,'GET',undefined,employee),ids);});
  test('Caja: permiso revocado y sesiones inválidas no exponen contenido',async()=>{await setCash(false);for(const route of ['/api/cash-shifts','/api/cash-sessions'])for(const cookie of [employee,null,'el_muelle_session=invalid-synthetic']){const response=await request(route,'GET',undefined,cookie);assert.equal(response.status,cookie===employee?403:401);assert.ok(!JSON.stringify(response.body).includes('historical-closed'));}await setCash(true);records(await request('/api/cash-shifts','GET',undefined,employee),['old-open','today-closed']);});
  const fiscal={rfc:'XAXX010101000',businessName:'Cliente sintético residual',fiscalZip:'00000',fiscalRegime:'601',cfdiUse:'G03',email:'residual@example.invalid'};
  test('Fiscal: validación, registro, consulta autorizada y cifrado preservados',async()=>{
    assert.equal((await request('/api/sales/T-SYN-WITH/invoice','PATCH',fiscal,employee)).status,403);
    assert.equal((await request('/api/sales/T-SYN-WITH/invoice','PATCH',{...fiscal,rfc:'INVALIDO'})).status,400);
    assert.equal((await request('/api/sales/T-SYN-CANCELED/invoice','PATCH',fiscal)).status,409);
    const saved=await request('/api/sales/T-SYN-WITH/invoice','PATCH',fiscal);assert.equal(saved.status,200);assert.equal(saved.body.invoice.customer.email,fiscal.email);
    const adminSales=(await request('/api/sales')).body;assert.equal(adminSales.find(s=>s.id==='T-SYN-WITH').invoice.status,'solicitada');
    const employeeSales=(await request('/api/sales','GET',undefined,employee)).body;assert.ok(employeeSales.every(s=>s.invoice.customer===null));
    const db=new DatabaseSync(path.join(data,p.DATABASE_NAME),{readOnly:true});try{const raw=JSON.stringify(db.prepare("SELECT payload FROM documents WHERE collection='sales'").all());assert.ok(!raw.includes(fiscal.email)&&!raw.includes(fiscal.rfc));}finally{db.close();}
  });
  test('Fiscal en Edge: tres filtros, selección, validación y guardado sin botón CFDI ni errores JS',async()=>{
    const {chromium}=require(process.env.EL_MUELLE_PLAYWRIGHT||'playwright');let context;const errors=[];
    try{
      if((await request('/api/sales/T-SYN-WITH')).body.invoice.status!=='solicitada')assert.equal((await request('/api/sales/T-SYN-WITH/invoice','PATCH',fiscal)).status,200);
      context=await chromium.launchPersistentContext(path.join(area,'browser'),{channel:'msedge',headless:true,viewport:{width:1366,height:768}});
      // El catálogo ficticio no tiene recursos comerciales; servir su imagen ficticia.
      const fixturePhoto=png(8,8);await context.route('**/assets/products/synthetic.*',route=>route.fulfill({status:200,contentType:'image/png',body:fixturePhoto}));
      await context.addCookies([{name:admin.split('=')[0],value:admin.slice(admin.indexOf('=')+1),url:base}]);
      const page=context.pages()[0];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.setDefaultTimeout(15000);
      await page.goto(base);await page.waitForFunction(()=>state.sessionAuthenticated&&init.ready);await page.evaluate(async()=>{setView('billing');await loadRecentSales();});
      assert.equal(await page.locator('.invoice-status-filters button').count(),3);assert.equal(await page.getByRole('button',{name:/CFDI emitido/}).count(),0);
      const rows=()=>page.locator('#recentSalesList [data-invoice-select]').evaluateAll(nodes=>nodes.map(n=>n.dataset.invoiceSelect).sort());
      for(const [filter,ids]of [['all',['T-SYN-WITH','T-SYN-WITHOUT','T-SYN-CANCELED']],['with',['T-SYN-WITH']],['without',['T-SYN-WITHOUT','T-SYN-CANCELED']]]){await page.locator('[data-invoice-filter="'+filter+'"]').click();assert.deepEqual(await rows(),ids.sort());assert.equal(await page.locator('[data-invoice-filter="'+filter+'"]').getAttribute('aria-pressed'),'true');}
      await page.locator('[data-invoice-select="T-SYN-WITHOUT"]').click();assert.equal(await page.locator('#invoiceSaleId').inputValue(),'T-SYN-WITHOUT');
      await page.locator('#invoiceGenerateBtn').click();assert.equal(await page.locator('#configurationDialog').isVisible(),false);
      for(const [id,value]of Object.entries({invoiceRfc:fiscal.rfc,invoiceName:fiscal.businessName,invoiceZip:fiscal.fiscalZip,invoiceRegime:fiscal.fiscalRegime,invoiceEmail:fiscal.email}))await page.locator('#'+id).fill(value);await page.locator('#invoiceUse').selectOption('G03');
      await page.locator('#invoiceGenerateBtn').click();await page.getByRole('button',{name:'Confirmar y guardar solicitud'}).click();await page.waitForFunction(()=>state.sales.find(s=>s.id==='T-SYN-WITHOUT')?.invoice?.status==='solicitada');
      assert.equal((await request('/api/sales/T-SYN-WITHOUT')).body.invoice.customer.email,fiscal.email);assert.deepEqual(errors,[]);
    }finally{await context?.close();}
  });
  test('Recuperación: cuatro PNG grandes, hashes, referencias, fallos y limpieza aislada',async()=>{
    await stop();
    const result=await new Promise((resolve,reject)=>{const worker=spawn(process.execPath,['--max-old-space-size=384','--expose-gc',__filename,'--photo-worker'],{cwd:root,windowsHide:true,env:{...process.env,NODE_OPTIONS:''},stdio:['ignore','pipe','pipe']});let out='',err='';worker.stdout.on('data',b=>{out+=b;});worker.stderr.on('data',b=>{err+=b;});worker.once('error',reject);worker.once('close',code=>code===0?resolve(out):reject(Error(err||out||'Load worker failed')));});
    const line=result.split(/\r?\n/).find(s=>s.startsWith('RECOVERY_LOAD_RESULT '));assert.ok(line);console.log(line);
  });
}
