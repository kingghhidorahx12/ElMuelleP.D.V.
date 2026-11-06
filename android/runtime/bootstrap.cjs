try {
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const addon={exports:{}};process.dlopen(addon,path.join(process.env.ANDROID_NATIVE_LIB,'libmuelle.so'));
global.androidNative=input=>{const answer=JSON.parse(addon.exports.command(JSON.stringify(input)));if(!answer.ok)throw Error(answer.error||'Operación nativa rechazada');return answer.value;};
const sqlite=require('./sqlite-android.cjs'),load=Module._load;Module._load=function(request,...args){return request==='node:sqlite'?sqlite:load.call(this,request,...args);};
const root=require('./storage-root.cjs').realStorageRoot(process.env.ANDROID_PRIVATE_ROOT),app=path.join(root,'bundle/app'),pointer=path.join(root,'active-data.json');let data=path.join(root,'data');if(fs.existsSync(pointer)){const selected=fs.realpathSync.native(JSON.parse(fs.readFileSync(pointer,'utf8')).path);if(!selected.startsWith(root+'/restorations/'))throw Error('Selección de datos inválida');data=selected;}
process.env.DATA_DIR=data;process.env.ENV_FILE=path.join(root,'no-configuration.env');process.env.EL_MUELLE_STORAGE_MODE='';process.env.ADMIN_PIN='';process.env.EMPLOYEE_PIN='';process.env.DATA_ENCRYPTION_KEY='';process.chdir(app);
const persistence=require(path.join(app,'src/persistence'));
persistence.readKeyFile=sqlite.readKey;
persistence.resolveEncryptionKey=(directory)=>{const file=path.join(directory,'.secrets.json');if(!fs.existsSync(file)){if(fs.existsSync(path.join(directory,persistence.DATABASE_NAME)))throw Error('Falta la clave original; no se crea una sustituta');fs.writeFileSync(file,global.androidNative({op:'seal',text:JSON.stringify({dataEncryptionKey:crypto.randomBytes(32).toString('hex')})}),{flag:'wx',mode:0o600});}const key=sqlite.readKey(file);sqlite.setActiveKey(key);return key;};
// The Windows source is reused unchanged; only its image decoder is native.
const media=require(path.join(app,'src/product-media'));media.preparePhoto=async(input,directory)=>{if(input===undefined)return null;if(!input||!['image/png','image/jpeg','image/webp'].includes(input.mime)||typeof input.data!=='string'||input.data.length>6990508||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))throw Error('Fotografía inválida');const bytes=Buffer.from(input.data,'base64');if(bytes.toString('base64')!==input.data||bytes.length>5242880)throw Error('Fotografía inválida');const actual=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':null;if(actual!==input.mime)throw Error('El formato de la fotografía no coincide');global.androidNative({op:'image',data:input.data});const ext=input.mime==='image/png'?'png':input.mime==='image/jpeg'?'jpg':'webp',folder=path.join(directory,'product-photos');if(!fs.existsSync(folder))persistence.privateDirectory(folder);const name=crypto.randomBytes(32).toString('hex')+'.'+ext,file=path.join(folder,name);fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});return {name,file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),committed:false};};
// No JSON/operations are imported. The private seed contains only catalog/photos.
if(!fs.existsSync(path.join(data,persistence.DATABASE_NAME))){
 if(fs.existsSync(pointer)||fs.existsSync(data))throw Error('Falta la base activa; no se crea una sustituta');
 const staging=path.join(root,'initial-data');if(fs.existsSync(staging))throw Error('Inicialización anterior incompleta; los archivos se conservaron');
 const products=require('./catalog.cjs').readCatalog(app,root);
 if(products.length!==28||products.some(p=>p.stockQuantity!==0))throw Error('Catálogo inicial inválido');
 persistence.privateDirectory(staging);const photos=path.join(staging,'product-photos');persistence.privateDirectory(photos);
 for(const product of products){if(!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(product.photoFile))throw Error('Referencia fotográfica inválida');const bytes=fs.readFileSync(path.join(app,'initial-catalog/photos',product.photoFile));if(crypto.createHash('sha256').update(bytes).digest('hex')!==product.photoSHA256)throw Error('Fotografía alterada');fs.writeFileSync(path.join(photos,product.photoFile),bytes,{flag:'wx',mode:0o600});}
 const key=persistence.resolveEncryptionKey(staging),{PosDatabase}=require(path.join(app,'src/database')),database=new PosDatabase(staging);
 try{database.suppressBackups=true;database.transaction(()=>{database.replaceCollection('products',products);persistence.ensureKeyCheck(database,key);database.saveDocument('meta','administrative-opening-v1',{quantity:0,physicalCountPerformed:false,source:'android-initial-catalog'});for(const product of products)database.addAuditEvent({eventType:'administrative_opening_balance_initialized',entityType:'product',entityId:product.id,details:{quantity:0,physicalCountPerformed:false}});});}finally{database.close();}
 fs.renameSync(staging,data);
}
persistence.resolveEncryptionKey(data);
require(path.join(app,'src/server.js'));

} catch(error) {
 const code=String(error.code||error.name||"STARTUP_ERROR");
 try { if(typeof global.androidNative==="function")global.androidNative({op:"startupFailure",code:/^[A-Za-z0-9_]{1,60}$/.test(code)?code:"STARTUP_ERROR"}); } catch {}
 console.error("El almacenamiento Android no pudo iniciar; los datos existentes se conservaron.");process.exitCode=1;
}
