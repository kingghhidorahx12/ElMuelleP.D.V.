// Metadatos técnicos de compilación; nunca incluye datos operativos ni secretos.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const c=require('../src/release-compatibility');
function sealPackage(root){
  c.noLinks(root);const files={};
  function collect(directory,prefix=''){
    for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      const name=prefix+entry.name,file=path.join(directory,entry.name);c.noLinks(file);
      if([c.MANIFEST,'LEEME-ENTREGA.txt'].includes(name))continue;
      if(name==='app/data'){
        if(fs.readdirSync(file).some(value=>value!=='products.json'))throw Error('El paquete contiene datos operativos.');
        const seed=path.join(file,'products.json');if(fs.existsSync(seed))files['app/data/products.json']=c.sha256(seed);
        continue;
      }
      if(name==='app/.env'||name==='browser-profile')throw Error('El paquete contiene configuración privada.');
      if(entry.isDirectory())collect(file,name+'/');else files[name]=c.sha256(file);
    }
  }
  collect(root);
  const manifest={format:'ElMuellePOS-release-v1',version:require('../package.json').version,capabilities:c.REQUIRED,revisionSHA256:crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
  fs.writeFileSync(path.join(root,c.MANIFEST),JSON.stringify(manifest,null,2)+'\n');c.verifyPackage(root);
  return {manifestSHA256:c.sha256(path.join(root,c.MANIFEST)),revisionSHA256:manifest.revisionSHA256};
}
function sealInstaller(root,installer){
  const manifest=c.verifyPackage(root),receipt={format:'ElMuellePOS-installer-release-v1',installer:path.basename(installer),installerSHA256:c.sha256(installer),manifestSHA256:c.sha256(path.join(root,c.MANIFEST)),revisionSHA256:manifest.revisionSHA256};
  const file=installer+'.release.json';fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return {receipt:file,receiptSHA256:c.sha256(file),...receipt};
}
module.exports={sealPackage,sealInstaller};
if(require.main===module){try{console.log(JSON.stringify(process.argv[2]==='installer'?sealInstaller(process.argv[3],process.argv[4]):sealPackage(process.argv[3])));}catch(error){console.error(error.message);process.exitCode=1;}}
