const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const appRoot=path.resolve(__dirname,'..'),p=require('../src/persistence'),{PosDatabase}=require('../src/database');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function initialize(){
  const storage=p.resolveStorage();
  if(!storage.installed)throw Error('La carga inicial requiere almacenamiento de Windows separado.');
  p.rejectLinks(storage.dataDir);
  const marker=path.join(storage.dataDir,'.client-catalog-initializing');
  if(fs.existsSync(storage.databasePath)&&!fs.existsSync(marker))return {preserved:true,initialized:false};
  const seed=path.join(appRoot,'initial-catalog'),manifest=JSON.parse(fs.readFileSync(path.join(seed,'manifest.json'),'utf8'));
  const catalog=path.join(appRoot,'data/products.json');
  assert.equal(sha(catalog),manifest.catalogSHA256,'El catálogo inicial no coincide con el manifiesto');
  const products=JSON.parse(fs.readFileSync(catalog,'utf8'));
  assert.equal(products.length,28);assert.ok(products.every(item=>item.stockQuantity===0));
  for(const item of products){assert.match(item.photoFile,/^[a-zA-Z0-9._-]+$/);assert.equal(sha(path.join(seed,'photos',item.photoFile)),item.photoSHA256);}
  p.prepareInstalledStorage(storage,appRoot);
  if(!fs.existsSync(marker))fs.writeFileSync(marker,'initial-catalog-v1\n',{flag:'wx',mode:0o600});
  const destination=path.join(storage.dataDir,'product-photos');
  if(!fs.existsSync(destination))p.privateDirectory(destination);
  p.rejectLinks(destination);
  for(const item of products){const target=path.join(destination,item.photoFile);p.rejectLinks(target);if(!fs.existsSync(target))fs.copyFileSync(path.join(seed,'photos',item.photoFile),target,fs.constants.COPYFILE_EXCL);assert.equal(sha(target),item.photoSHA256,'Fotografía de destino distinta; no se sobrescribió');}
  const key=p.resolveEncryptionKey(storage.dataDir,''),db=new PosDatabase(storage.dataDir);
  try{
    if(!db.readDocument('meta','administrative-opening-v1')){
      const actual=db.read(path.join(storage.dataDir,'products.json'),[]);
      assert.deepEqual([...actual].sort((a,b)=>a.id.localeCompare(b.id)),[...products].sort((a,b)=>a.id.localeCompare(b.id)));
      assert.equal(db.db.prepare("SELECT COUNT(*) n FROM documents WHERE collection NOT IN ('products','meta')").get().n,0);
      db.suppressBackups=true;
      db.transaction(()=>{
        db.saveDocument('meta','administrative-opening-v1',{id:'administrative-opening-v1',initializedAt:new Date().toISOString(),kind:'administrative-opening-balance',productCount:28,quantity:0,physicalCountPerformed:false,reason:'Saldo administrativo de arranque autorizado por el propietario; no representa un conteo físico.',catalogSHA256:manifest.catalogSHA256});
        for(const item of products)db.addAuditEvent({eventType:'administrative_opening_balance_initialized',entityType:'product',entityId:item.id,actor:null,details:{quantity:0,unit:item.unit,physicalCountPerformed:false,source:'client-initial-catalog',reason:'Saldo administrativo de arranque; sin conteo físico ni recepción de mercancía.'}});
        p.ensureKeyCheck(db,key);
      });
    }
  }finally{db.close();}
  fs.unlinkSync(marker);
  return {initialized:true,preserved:false,products:28,photographs:28,administrativeStock:0,physicalCountPerformed:false};
}
module.exports={initialize};
if(require.main===module){try{console.log(JSON.stringify(initialize()));}catch(error){console.error('No se completó la carga inicial: '+error.message);process.exitCode=1;}}
