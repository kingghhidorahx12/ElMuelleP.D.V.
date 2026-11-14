// Checks the packaged module graph without using dependencies from the build PC.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
function inside(root,file){if(typeof file!=='string'||!path.isAbsolute(file))return false;const actual=fs.existsSync(file)?fs.realpathSync.native(file):path.resolve(file),relative=path.relative(root,actual);return relative===''||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
function restrictToBundle(directory){
 const root=fs.realpathSync.native(directory),resolve=Module._resolveFilename;
 Module._resolveFilename=function(request,parent,...rest){
  const owned=parent?.filename&&inside(root,parent.filename);let resolved;
  try{resolved=resolve.call(this,request,parent,...rest);}catch(error){if(owned&&error.code==='MODULE_NOT_FOUND'){error.moduleRequest=request;error.requiredBy=path.relative(root,parent.filename).replaceAll('\\','/');}throw error;}
  if(owned&&!Module.isBuiltin(request)&&!inside(root,resolved)){
   const error=Object.assign(Error('A packaged module resolves outside the Android bundle.'),{code:'MODULE_NOT_FOUND',moduleRequest:request,requiredBy:path.relative(root,parent.filename).replaceAll('\\','/'),externalResolution:true});throw error;
  }
  return resolved;
 };
 return ()=>{Module._resolveFilename=resolve;};
}
function verifyBundle(directory){
 const root=fs.realpathSync.native(directory),restore=restrictToBundle(root);
 try{
  const runtimeRequire=Module.createRequire(path.join(root,'runtime','dependency-entry.cjs'));
  const appRequire=Module.createRequire(path.join(root,'app','package.json'));
  const printer=runtimeRequire('./printer.cjs');
  for(const [encoding,codePage]of [['ascii',0],['cp850',2],['windows1252',16]])if(!printer.encode('Árbol Ññ €',{encoding,codePage}).length)throw Error('Empty printer encoding');
  runtimeRequire('./routes.cjs');appRequire('express');appRequire('cors');appRequire('./src/commerce.js');appRequire('./src/catalog-operations.js');
  return {passed:true,dependenciesSelfContained:true,runtimeModulesLoaded:true,encodings:['ascii','cp850','windows1252'],repositoryFallbackAllowed:false};
 }finally{restore();}
}
if(require.main===module){try{console.log(JSON.stringify(verifyBundle(process.argv[2])));}catch(error){const request=error.moduleRequest||'unknown';console.log(JSON.stringify({passed:false,code:error.code||'BUNDLE_DEPENDENCY_FAILED',module:path.isAbsolute(request)?'<absolute-module>':request,requiredBy:error.requiredBy||'unknown',externalResolution:error.externalResolution===true}));process.exitCode=1;}}
module.exports={restrictToBundle,verifyBundle};
