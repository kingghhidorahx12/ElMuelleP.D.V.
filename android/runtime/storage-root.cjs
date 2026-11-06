const fs=require('node:fs'),path=require('node:path');
// Android supplies the application-private directory. Resolve OS aliases once;
// the normal persistence checks still reject links within that canonical tree.
function realStorageRoot(supplied){
 if(typeof supplied!=='string'||!path.isAbsolute(supplied))throw Object.assign(Error('Raíz privada inválida'),{code:'STORAGE_ROOT'});
 const root=fs.realpathSync.native(supplied);
 if(!fs.lstatSync(root).isDirectory())throw Object.assign(Error('Raíz privada inválida'),{code:'STORAGE_ROOT'});
 return root;
}
module.exports={realStorageRoot};
