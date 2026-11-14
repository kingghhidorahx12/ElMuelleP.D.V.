// Model capabilities are explicit. Text can never inject ESC/POS commands.
const crypto=require('node:crypto'),path=require('node:path'),{createRequire}=require('node:module');
// Runtime is a sibling of app; its dependencies live in app/node_modules.
const iconv=createRequire(path.join(__dirname,'../app/package.json'))('iconv-lite');
const defaults={widthMm:80,columns:48,encoding:'ascii',codePage:0,cutter:false,feedLines:8};
function settings(value={}){
 const p={...defaults,...value};
 if(![58,80].includes(p.widthMm)||!Number.isInteger(p.columns)||p.columns<24||p.columns>64||!['ascii','cp850','windows1252'].includes(p.encoding)||!Number.isInteger(p.codePage)||p.codePage<0||p.codePage>255||typeof p.cutter!=='boolean'||!Number.isInteger(p.feedLines)||p.feedLines<5||p.feedLines>16)throw Error('Perfil de impresión inválido. Revisa papel, columnas y codificación.');
 return {widthMm:p.widthMm,columns:p.columns,encoding:p.encoding,codePage:p.codePage,cutter:p.cutter,feedLines:p.feedLines};
}
function configuredProfile(database){const saved=database.readDocument('printer-settings','current')||{};return settings(saved.feedLines===undefined?{...saved,widthMm:80,columns:48,feedLines:8,cutter:true}:saved);}
function encode(text,value){
 const p=settings(value);if(typeof text!=='string'||!text.trim()||text.length>16000)throw Error('Contenido de impresión inválido');
 let cleaned=text.normalize('NFC').replace(/\r\n?/g,'\n').replace(/\t/g,' ').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
 if(p.encoding==='ascii')cleaned=cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e\n]/g,'?');
 const lines=cleaned.split('\n').flatMap(line=>{const chars=Array.from(line),rows=[];while(chars.length)rows.push(chars.splice(0,p.columns).join(''));return rows.length?rows:[''];}).join('\n');
 return Buffer.concat([Buffer.from([27,64,27,116,p.codePage]),iconv.encode(lines,p.encoding),Buffer.from([10,27,100,p.feedLines]),p.cutter?Buffer.from([29,86,1]):Buffer.alloc(0)]);
}
function encodeRaster(image,value){
 const p=settings(value),width=p.widthMm===80?576:384;
 if(!image||Object.keys(image).some(k=>!['width','height','data'].includes(k))||image.width!==width||!Number.isInteger(image.height)||image.height<1||image.height>8192||typeof image.data!=='string'||image.data.length>800000||!/^[A-Za-z0-9+/]*={0,2}$/.test(image.data))throw Error('La imagen del ticket no corresponde al papel configurado.');
 const data=Buffer.from(image.data,'base64'),stride=width/8;
 if(data.length!==stride*image.height||data.toString('base64')!==image.data)throw Error('Imagen del ticket incompleta.');
 const commands=[Buffer.from([27,64,27,50,27,97,1,29,76,0,0,29,87,width&255,width>>8])];
 // Small raster bands keep each printer command bounded. Pixel bytes are data,
 // never interpreted as text or externally supplied ESC/POS instructions.
 for(let y=0;y<image.height;y+=128){const rows=Math.min(128,image.height-y);commands.push(Buffer.from([29,118,48,0,stride&255,stride>>8,rows&255,rows>>8]),data.subarray(y*stride,(y+rows)*stride));}
 commands.push(Buffer.from([10,27,100,p.feedLines]));if(p.cutter)commands.push(Buffer.from([29,86,1]));return Buffer.concat(commands);
}
function print({database,call,text,raster,requestId,profile}){
 if(typeof requestId!=='string'||!/^[-a-zA-Z0-9_]{16,100}$/.test(requestId))throw Error('Falta la identidad de impresión.');
 if(raster!==undefined&&text!==undefined)throw Error('Elige un solo formato de ticket.');
 const bytes=raster===undefined?encode(text,profile):encodeRaster(raster,profile),hash=crypto.createHash('sha256').update(bytes).digest('hex'),old=database.readDocument('print-jobs',requestId);
 if(old){if(old.hash!==hash)throw Error('Esta identidad corresponde a otra impresión.');if(old.status==='sent')return {...old.result,replayed:true};throw Error('La impresión anterior pudo salir en papel. Revísala y utiliza Reimprimir sólo si hace falta.');}
 const save=value=>database.transaction(()=>database.saveDocument('print-jobs',requestId,{hash,...value,createdAt:new Date().toISOString()}));
 save({status:'sending'});
 try{const result=call({op:'printerPrint',data:bytes.toString('base64')});save({status:'sent',result});return result;}
 catch(error){save({status:'uncertain'});throw Error('No se confirmó la impresión. Revisa conexión y papel antes de reimprimir.');}
}
module.exports={settings,configuredProfile,encode,encodeRaster,print,defaults};
