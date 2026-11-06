// Test double for JNI only. This does not certify SQLCipher or Android execution.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const root=process.env.ANDROID_PRIVATE_ROOT,expected=path.resolve(__dirname,'../.dev')+path.sep;
if(!root||!path.resolve(root).startsWith(expected))throw Error('Se requiere un entorno sintético privado');
let next=0;const handles=new Map(),key=crypto.randomBytes(32);
const p=require(path.join(root,'bundle/app/src/persistence'));
p.privateDirectory=folder=>fs.mkdirSync(folder,{mode:0o700});p.restrictPrivatePath=()=>{};
process.dlopen=module=>{module.exports.command=input=>{const a=JSON.parse(input);let value=null;try{switch(a.op){
 case 'seal':{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),bytes=Buffer.concat([c.update(a.text,'utf8'),c.final()]);value='ak1:'+iv.toString('base64')+':'+Buffer.concat([c.getAuthTag(),bytes]).toString('base64');break;}
 case 'unseal':{const parts=a.text.split(':'),bytes=Buffer.from(parts[2],'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(parts[1],'base64'));d.setAuthTag(bytes.subarray(0,16));value=Buffer.concat([d.update(bytes.subarray(16)),d.final()]).toString();break;}
 case 'dbOpen':value=++next;handles.set(value,new DatabaseSync(a.path,{readOnly:a.readOnly}));break;
 case 'dbClose':handles.get(a.id).close();handles.delete(a.id);break;
 case 'dbExec':handles.get(a.id).exec(a.sql);break;
 case 'dbQuery':{const s=handles.get(a.id).prepare(a.sql);value=a.mode==='run'?s.run(...a.args):s.all(...a.args);break;}
 case 'dbSnapshot':handles.get(a.id).exec("VACUUM INTO '"+a.path.replace(/'/g,"''")+"'");break;
 case 'scaleState':value={valid:false,stable:false,connected:false,kg:null,message:'Dispositivo simulado sin conexión'};break;
 case 'startupFailure':process.stdout.write('STARTUP_FAILURE '+a.code+'\n');value=true;break;
 default:throw Error('No se simula este periférico');
 }return JSON.stringify({ok:true,value});}catch(error){return JSON.stringify({ok:false,error:error.message});}};};
require('./runtime/bootstrap.cjs');
