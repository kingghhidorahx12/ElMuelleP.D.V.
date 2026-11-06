const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {realStorageRoot}=require('./runtime/storage-root.cjs'),{rejectLinks}=require('../src/persistence');
test('OS private-directory alias resolves without disabling child-link protection',()=>{
 const area=fs.mkdtempSync(path.join(__dirname,'../.dev/android-storage-root-'));let alias;
 try{
  const real=path.join(area,'private-real'),outside=path.join(area,'outside');fs.mkdirSync(real);fs.mkdirSync(outside);alias=path.join(area,'os-alias');fs.symlinkSync(real,alias,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>rejectLinks(path.join(alias,'data')),error=>error.code==='STORAGE_LINK');
  const root=realStorageRoot(alias);assert.equal(root,fs.realpathSync.native(real));assert.doesNotThrow(()=>rejectLinks(path.join(root,'data')));
  fs.symlinkSync(outside,path.join(real,'untrusted-child'),process.platform==='win32'?'junction':'dir');assert.throws(()=>rejectLinks(path.join(root,'untrusted-child','data')),error=>error.code==='STORAGE_LINK');
  assert.throws(()=>realStorageRoot('relative-path'),error=>error.code==='STORAGE_ROOT');
 }finally{assert.ok(area.startsWith(path.resolve(__dirname,'../.dev')+path.sep));fs.rmSync(area,{recursive:true,force:true});}
});
