// Execute the APK's actual photo adapter; only JNI image decoding is a host double.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),media=require('../src/product-media'),persistence=require('../src/persistence');
if(process.env.NODE_ENV!=='test'||!path.resolve(process.env.DATA_DIR||'').startsWith(path.join(root,'.dev')+path.sep))throw Error('PHOTO_HOST_REQUIRES_SYNTHETIC_STORAGE');
const source=fs.readFileSync(path.join(__dirname,'runtime/bootstrap.cjs'),'utf8');
const start=source.indexOf('media.preparePhoto=async'),end=source.indexOf('// No JSON/operations',start);if(start<0||end<0)throw Error('PHOTO_ADAPTER_NOT_FOUND');
const context={media,fs,path,crypto,persistence,Buffer,global:{androidNative(input){if(input.op!=='image')throw Error('Unsupported host operation');const output=cp.execFileSync(process.execPath,[path.join(__dirname,'test-photo-decode.cjs')],{input:Buffer.from(input.data,'base64'),encoding:'utf8',windowsHide:true,env:process.env,timeout:10000});if(output!=='VALID')throw Error('IMAGE_INVALID');return true;}}};vm.runInNewContext(source.slice(start,end),context);
