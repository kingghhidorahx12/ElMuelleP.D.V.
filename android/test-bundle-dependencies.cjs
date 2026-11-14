const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {restrictToBundle}=require('./tools/bundle-dependencies.cjs');
function fixture(work){const area=fs.mkdtempSync(path.resolve(__dirname,'../.dev/module-boundary-')),bundle=path.join(area,'bundle');fs.mkdirSync(path.join(bundle,'runtime'),{recursive:true});const write=(name,source)=>{const file=path.join(area,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);};try{work({area,bundle,write,load:()=>Module.createRequire(path.join(bundle,'runtime','entry.cjs'))('./printer.cjs')});}finally{assert.ok(area.startsWith(path.resolve(__dirname,'../.dev')+path.sep));fs.rmSync(area,{recursive:true,force:true});}}
test('a dependency installed on the build PC cannot conceal a broken APK layout',()=>fixture(({area,bundle,write,load})=>{
 write('node_modules/build-only-encoding/index.js','throw Error("An outside package must never execute");');
 write('bundle/runtime/printer.cjs',"module.exports=require('build-only-encoding');");
 const previous=Module._resolveFilename,restore=restrictToBundle(bundle);try{assert.throws(load,e=>e.code==='MODULE_NOT_FOUND'&&e.moduleRequest==='build-only-encoding'&&e.requiredBy==='runtime/printer.cjs'&&e.externalResolution===true);}finally{restore();}
 assert.equal(Module._resolveFilename,previous);assert.ok(Module.createRequire(path.join(area,'entry.cjs')).resolve('build-only-encoding').startsWith(area));
}));
test('runtime can deliberately load dependencies from its sibling app directory',()=>fixture(({bundle,write,load})=>{
 write('bundle/app/package.json','{}');write('bundle/app/node_modules/bundled-encoding/index.js','module.exports={encode:value=>Buffer.from(value)};');
 write('bundle/runtime/printer.cjs',"const {createRequire}=require('node:module'),path=require('node:path');module.exports=createRequire(path.join(__dirname,'../app/package.json'))('bundled-encoding');");
 const restore=restrictToBundle(bundle);try{assert.equal(load().encode('weight').toString(),'weight');}finally{restore();}
}));
test('the boundary also rejects missing transitive dependencies borrowed from the parent',()=>fixture(({bundle,write,load})=>{
 write('bundle/app/package.json','{}');write('bundle/app/node_modules/bundled-encoding/index.js',"module.exports=require('outside-codepage');");write('node_modules/outside-codepage/index.js','module.exports={};');
 write('bundle/runtime/printer.cjs',"const {createRequire}=require('node:module'),path=require('node:path');module.exports=createRequire(path.join(__dirname,'../app/package.json'))('bundled-encoding');");
 const restore=restrictToBundle(bundle);try{assert.throws(load,e=>e.code==='MODULE_NOT_FOUND'&&e.moduleRequest==='outside-codepage'&&e.externalResolution===true);}finally{restore();}
}));
