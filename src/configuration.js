const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

const DEFAULT_PREFERENCES = Object.freeze({confirmDrafts:true,sounds:false,notifications:true,timeZone:'America/Mexico_City',dateFormat:'short',hour12:true,locale:'es-MX',numberLocale:'es-MX',theme:'marine',accent:'gold',interfaceMode:'light'});
function invalid(message) { const error = new Error(message); error.statusCode = 400; throw error; }
function text(value, max, label) { if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid(`${label}: formato o longitud inválidos.`); return value.trim(); }
function normalizePreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Preferencias inválidas.');
  const result = {...DEFAULT_PREFERENCES};
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(result,key)) invalid('Preferencia no admitida.');
    const value = input[key];
    if (typeof result[key] === 'boolean') { if (typeof value !== 'boolean') invalid('La preferencia debe ser booleana.'); }
    else if (key === 'timeZone') { try { if(typeof value !== 'string'||value.length>80) throw Error(); new Intl.DateTimeFormat('es-MX',{timeZone:value}).format(); } catch { invalid('Zona horaria inválida.'); } }
    else if (!({dateFormat:['short','long'],locale:['es-MX'],numberLocale:['es-MX','es-ES'],theme:['marine'],accent:['gold','sky'],interfaceMode:['light']}[key] || []).includes(value)) invalid('Valor de preferencia no admitido.');
    result[key] = value;
  }
  return result;
}
function normalizeContact(input = {}) {
  if(!input||typeof input!=='object'||Array.isArray(input)) invalid('Datos de contacto inválidos.');
  const result = {email:text(input.email??'',120,'Correo'),phone:text(input.phone??'',40,'Teléfono')};
  if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) invalid('Correo inválido.');
  if(result.phone&&!/^[+\d ().-]{5,40}$/.test(result.phone)) invalid('Teléfono inválido.');
  return result;
}
function normalizeBusiness(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)) invalid('Datos del negocio inválidos.');
  const out={};
  for(const [key,max] of Object.entries({commercialName:100,businessName:160,rfc:13,address:240,postalCode:5,fiscalRegime:10,email:120,phone:40})) out[key]=text(input[key]??'',max,key);
  if(!out.commercialName) invalid('El nombre comercial es obligatorio.');
  out.rfc=out.rfc.toUpperCase();
  if(out.rfc&&!/^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/.test(out.rfc)) invalid('RFC inválido.');
  if(out.postalCode&&!/^\d{5}$/.test(out.postalCode)) invalid('Código postal inválido.');
  Object.assign(out,normalizeContact(out));
  const logo=input.logo??'';
  if(typeof logo!=='string'||logo.length>360000) invalid('El logotipo excede 256 KB.');
  if(logo) {
    const match=logo.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if(!match) invalid('Usa un logotipo PNG, JPEG o WebP.');
    const bytes=Buffer.from(match[2],'base64');
    const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!valid||bytes.length>262144) invalid('El archivo no es una imagen admitida de hasta 256 KB.');
  }
  out.logo=logo;
  return out;
}
const DEFAULT_PAYMENT_METHODS=Object.freeze({efectivo:true,tarjeta:false,transferencia:true});
function readPaymentMethods(database){return database.readDocument('business-settings','payment-methods',DEFAULT_PAYMENT_METHODS);}
function registerConfiguration({app,database,requireAdminUser,requireSessionUser,encryptSensitivePayload,decryptSensitivePayload,recordAuditEvent,canUsePos,notifyScanner=()=>{},notifyPaymentMethods=()=>{}}) {
  const startedAt=new Date().toISOString();
  const readPrivate=(collection,id,fallback={})=>{const record=database.readDocument(collection,id);return record?decryptSensitivePayload(record.encrypted)||fallback:fallback;};
  const savePrivate=(collection,id,value)=>database.saveDocument(collection,id,{encrypted:encryptSensitivePayload(value)});
  const safe=(fn)=>(req,res)=>{try {res.set('Cache-Control','no-store');fn(req,res);}catch(error){res.status(error.statusCode||500).json({message:error.statusCode?error.message:'No se pudo completar la configuración.'});}};
  const scanner=()=>({enabled:database.readDocument('peripheral-settings','scanner')?.enabled===true});
  app.get('/api/payment-methods',safe((req,res)=>{
    const user=requireSessionUser(req,res);if(!user)return;
    if(user.role!=='admin'&&!canUsePos?.(user))return res.status(403).json({message:'No tienes acceso al Punto de Venta.'});
    res.json(readPaymentMethods(database));
  }));
  app.put('/api/payment-methods',safe((req,res)=>{
    const user=requireAdminUser(req,res);if(!user)return;
    const value=req.body,keys=Object.keys(DEFAULT_PAYMENT_METHODS);
    if(!value||Array.isArray(value)||Object.keys(value).length!==keys.length||!keys.every(key=>typeof value[key]==='boolean'))invalid('Indica qué métodos de pago estarán activos.');
    if(!keys.some(key=>value[key]))invalid('Mantén al menos un método de pago activo para poder cobrar.');
    const saved=database.transaction(()=>{
      const previous=readPaymentMethods(database),next=Object.fromEntries(keys.map(key=>[key,value[key]]));
      if(keys.some(key=>previous[key]!==next[key])){database.saveDocument('business-settings','payment-methods',next);recordAuditEvent('payment_methods_changed','business','payment-methods',user,{previous,next});}
      return next;
    });
    notifyPaymentMethods(saved);res.json(saved);
  }));
  app.get('/api/peripherals/scanner',safe((req,res)=>{
    const user=requireSessionUser(req,res);if(!user)return;
    if(user.role!=='admin'&&!canUsePos?.(user))return res.status(403).json({message:'No tienes autorización para usar el escáner del POS.'});
    res.json(scanner());
  }));
  app.put('/api/peripherals/scanner',safe((req,res)=>{
    const user=requireAdminUser(req,res);if(!user)return;
    if(!req.body||Array.isArray(req.body)||Object.keys(req.body).length!==1||typeof req.body.enabled!=='boolean')invalid('Usar escáner debe ser un valor booleano.');
    const value=database.transaction(()=>{
      const previous=scanner(),next={enabled:req.body.enabled};
      if(previous.enabled!==next.enabled){database.saveDocument('peripheral-settings','scanner',next);recordAuditEvent('scanner_setting_changed','peripheral','scanner',user,{previous:previous.enabled,next:next.enabled});}
      return next;
    });
    notifyScanner(value);res.json(value);
  }));
  app.get('/api/preferences',safe((req,res)=>{const user=requireSessionUser(req,res);if(!user)return;res.json(database.readDocument('ui-preferences',user.id,DEFAULT_PREFERENCES));}));
  app.put('/api/preferences',safe((req,res)=>{const user=requireSessionUser(req,res);if(!user)return;const prefs=normalizePreferences(req.body);database.transaction(()=>{database.saveDocument('ui-preferences',user.id,prefs);recordAuditEvent('preferences_updated','user',user.id,user,{keys:Object.keys(prefs)});});res.json(prefs);}));
  app.get('/api/configuration',safe((req,res)=>{
    const user=requireAdminUser(req,res);if(!user)return;
    let backups=[],backupInspectionFailed=false;
    try {backups=fs.existsSync(database.backupDir)?fs.readdirSync(database.backupDir).filter(n=>/^el-muelle-pos-\d{4}-\d{2}-\d{2}\.sqlite$/.test(n)).sort():[];} catch {backupInspectionFailed=true;}
    res.json({business:readPrivate('business-profile','current'),profile:readPrivate('user-profile',user.id),lastAccess:database.readDocument('user-access',user.id)?.at||null,
      application:{name:'El Muelle POS',version:pkg.version,environment:process.env.NODE_ENV==='development'?'Desarrollo':process.env.NODE_ENV==='production'?'Producción':'Local',startedAt,database:'SQLite',backupCount:backups.length,lastBackup:backups.at(-1)?.match(/\d{4}-\d{2}-\d{2}/)?.[0]||null},
      backupStatus:{...database.backupStatus,failed:database.backupStatus.failed||backupInspectionFailed},
      capabilities:{cfdi:false,requestXml:false,printerDiscovery:false,automaticBackup:true}});
  }));
  app.put('/api/configuration/business',safe((req,res)=>{const user=requireAdminUser(req,res);if(!user)return;const value=normalizeBusiness(req.body);database.transaction(()=>{savePrivate('business-profile','current',value);recordAuditEvent('business_updated','business','current',user,{fields:Object.keys(value)});});res.json(value);}));
  app.get('/api/configuration/integrity',safe((req,res)=>{if(!requireAdminUser(req,res))return;const rows=database.db.prepare('PRAGMA quick_check').all();res.json({ok:rows.length===1&&Object.values(rows[0])[0]==='ok',checkedAt:new Date().toISOString()});}));
  return {normalizeContact,readProfile:id=>readPrivate('user-profile',id),saveProfile:(id,value)=>savePrivate('user-profile',id,value),recordAccess:id=>database.transaction(()=>database.saveDocument('user-access',id,{at:new Date().toISOString()}))};
}
module.exports={registerConfiguration,normalizePreferences,normalizeBusiness,normalizeContact,DEFAULT_PREFERENCES,readPaymentMethods};
