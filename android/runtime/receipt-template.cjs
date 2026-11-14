// Plain content and bounded styles only; financial values always come from the sale.
const fs=require('node:fs'),path=require('node:path');
const blocks=['header','sale','items','totals','payment','footer'];
function defaults(){let business={};try{business=JSON.parse(fs.readFileSync(path.join(__dirname,'../app/public/android-ticket-business.json'),'utf8'));}catch{}return {logo:{enabled:true,data:null,width:150,align:'center'},header:'',footer:['Gracias por su compra.',business.footerTitle,business.address,business.telephone?'Tel. '+business.telephone:''].filter(Boolean).join('\n'),spacing:8,styles:Object.fromEntries(blocks.map(id=>[id,{size:id==='items'?20:24,bold:id==='totals',align:'center'}]))};}
function validate(value,decode){
 if(!value||Object.keys(value).some(k=>!['logo','header','footer','spacing','styles'].includes(k)))throw Error('Diseño de ticket inválido.');
 const out=structuredClone(value),text=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\x00-\x08\x0b-\x1f\x7f]/.test(s),align=a=>['left','center','right'].includes(a);
 if(!text(out.header,300)||!text(out.footer,800)||!Number.isInteger(out.spacing)||out.spacing<0||out.spacing>24)throw Error('Revisa el texto y el espaciado.');
 if(!out.logo||Object.keys(out.logo).some(k=>!['enabled','data','width','align'].includes(k))||typeof out.logo.enabled!=='boolean'||!Number.isInteger(out.logo.width)||out.logo.width<60||out.logo.width>280||!align(out.logo.align))throw Error('Revisa el tamaño y alineación del logo.');
 if(out.logo.data!==null){const match=typeof out.logo.data==='string'&&/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(out.logo.data);if(!match)throw Error('Usa una imagen PNG, JPEG o WebP.');const bytes=Buffer.from(match[2],'base64');if(bytes.length>262144||bytes.toString('base64')!==match[2]||!(match[1]==='png'&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||match[1]==='jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255||match[1]==='webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'))throw Error('Imagen inválida o mayor a 256 KiB.');if(!decode||decode(match[2])!==true)throw Error('La imagen no se pudo abrir.');}
 if(!out.styles||Object.keys(out.styles).length!==blocks.length||blocks.some(id=>{const s=out.styles[id];return !s||Object.keys(s).some(k=>!['size','bold','align'].includes(k))||!Number.isInteger(s.size)||s.size<16||s.size>36||typeof s.bold!=='boolean'||!align(s.align);}))throw Error('Formato de texto inválido.');
 return out;
}
function create(database,decode){
 const read=()=>{const saved=database.readDocument('receipt-template','current');return saved?{revision:saved.revision,template:saved.template,canRestore:!!saved.previous}:{revision:0,template:defaults(),canRestore:false};};
 const save=(revision,template,restore=false)=>database.transaction(()=>{const old=database.readDocument('receipt-template','current'),current=read();if(!Number.isInteger(revision)||revision!==current.revision)throw Object.assign(Error('El diseño cambió en otra ventana. Ábrelo de nuevo antes de guardar.'),{statusCode:409});if(restore&&!old?.previous)throw Error('No hay un diseño anterior.');const next=restore?old.previous:validate(template,decode);database.saveDocument('receipt-template','current',{revision:current.revision+1,template:next,previous:current.template});return read();});
 return {read,save};
}
module.exports={defaults,validate,create};
