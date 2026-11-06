const fs=require('node:fs'),path=require('node:path');
let activeKey='';
const call=(op,values={})=>global.androidNative({op,...values});
function readKey(file){const bytes=fs.readFileSync(file,'utf8');const value=JSON.parse(bytes.startsWith('ak1:')?call('unseal',{text:bytes}):bytes);if(typeof value.dataEncryptionKey!=='string'||!/^[a-f0-9]{64}$/.test(value.dataEncryptionKey))throw Error('Clave original no válida');return value.dataEncryptionKey;}
function keyFor(file){let directory=path.dirname(file);for(let i=0;i<5;i++){const keyFile=path.join(directory,'.secrets.json');if(fs.existsSync(keyFile))return readKey(keyFile);directory=path.dirname(directory);}if(!activeKey)throw Error('Falta la clave de la base');return activeKey;}
class DatabaseSync {
 constructor(file,options={}){this.file=path.resolve(file);this.key=keyFor(this.file);this.id=call('dbOpen',{path:this.file,key:this.key,readOnly:options.readOnly===true});}
 exec(sql){const vacuum=String(sql).trim().match(/^VACUUM INTO '((?:[^']|'')+)'\s*;?$/i);if(vacuum)return call('dbSnapshot',{id:this.id,path:vacuum[1].replace(/''/g,"'"),key:this.key});return call('dbExec',{id:this.id,sql});}
 prepare(sql){const query=(mode,args)=>call('dbQuery',{id:this.id,sql,args,mode});return {all:(...args)=>query('all',args),get:(...args)=>query('all',args)[0],run:(...args)=>query('run',args)};}
 close(){if(this.id!==null){call('dbClose',{id:this.id});this.id=null;}}
}
module.exports={DatabaseSync,readKey,setActiveKey:key=>{activeKey=key;}};
