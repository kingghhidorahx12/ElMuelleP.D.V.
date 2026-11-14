const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const android=__dirname,repo=path.resolve(android,'..'),target=path.join(android,'app/src/main/assets/nodeapp');
const source=process.env.MUELLE_ANDROID_CATALOG_SOURCE?path.resolve(process.env.MUELLE_ANDROID_CATALOG_SOURCE):path.join(JSON.parse(fs.readFileSync(path.join(repo,'.dev/em003-final-delivery.json'),'utf8')).privatePreparation,'compilacion');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');fs.mkdirSync(target,{recursive:true});
for(const name of ['src','public','node_modules'])fs.cpSync(path.join(repo,name),path.join(target,'app',name),{recursive:true,filter:file=>!path.basename(file).startsWith('.')});
// A previous generated copy may contain local tool caches. Never package those.
const copiedCache=path.resolve(target,'app/node_modules/.mf');assert.ok(copiedCache.startsWith(path.resolve(target)+path.sep));if(fs.existsSync(copiedCache))fs.rmSync(copiedCache,{recursive:true,force:true});
fs.copyFileSync(path.join(repo,'package.json'),path.join(target,'app/package.json'));fs.cpSync(path.join(android,'runtime'),path.join(target,'runtime'),{recursive:true});
fs.cpSync(path.join(android,'licenses'),path.join(target,'licenses'),{recursive:true});
// Deliberately private, read-only update capability. Never copy publisher/admin
// keys, never commit this generated file, and never require mailbox enrollment.
const updateChannelFile=process.env.MUELLE_ANDROID_UPDATE_CHANNEL_SOURCE||path.join(repo,'.dev/em003-android-update-channel/channel.json');
if(!fs.existsSync(updateChannelFile))throw Error('Falta el canal privado de descarga automática de actualizaciones.');
const updateChannel=JSON.parse(fs.readFileSync(updateChannelFile,'utf8'));
assert.deepEqual(Object.keys(updateChannel).sort(),['downloadToken','endpoint']);assert.match(updateChannel.downloadToken,/^[a-f0-9]{64}$/);assert.equal(new URL(updateChannel.endpoint).protocol,'https:');
fs.writeFileSync(path.join(target,'runtime/update-channel.json'),JSON.stringify(updateChannel));
const catalog=JSON.parse(fs.readFileSync(path.join(source,'data/products.json'),'utf8'));assert.equal(catalog.length,28);assert.ok(catalog.every(p=>p.stockQuantity===0));
const seed=path.join(target,'app/initial-catalog');fs.mkdirSync(path.join(seed,'photos'),{recursive:true});
// Automatic offline setup requested by the owner. No embedded secret or activation.
fs.writeFileSync(path.join(seed,'products.json'),JSON.stringify(catalog));
const oldEnvelope=path.resolve(seed,'catalog.aes.json');assert.ok(oldEnvelope.startsWith(path.resolve(target)+path.sep));if(fs.existsSync(oldEnvelope))fs.unlinkSync(oldEnvelope);
for(const item of catalog){assert.match(item.photoFile,/^[a-f0-9]{64}\.(png|jpg|webp)$/);const bytes=fs.readFileSync(path.join(source,'initial-catalog/photos',item.photoFile));assert.equal(sha(bytes),item.photoSHA256);fs.writeFileSync(path.join(seed,'photos',item.photoFile),bytes);}assert.equal(fs.readdirSync(path.join(seed,'photos')).length,28);
let server=fs.readFileSync(path.join(repo,'src/server.js'),'utf8').replace(/\r\n/g,'\n');
function replace(value,needle,replacement){assert.ok(value.includes(needle),'No se encontró el punto de adaptación: '+needle.slice(0,90));return value.replace(needle,replacement);}
server=replace(server,'const app = express();',`const app = express();\napp.use((req,res,next)=>{if(req.path.startsWith('/api/')&&req.get('X-Android-Access')!==process.env.ANDROID_HTTP_TOKEN)return res.status(401).json({message:'Acceso local no autorizado'});next();});\nconst androidRuntime=require('../../runtime/routes.cjs');`);
// Only the trusted same-origin Android container may frame the desktop POS.
// Windows retains DENY; remote origins remain forbidden in the Android copy.
server=replace(server,'res.setHeader("X-Frame-Options", "DENY");','res.setHeader("X-Frame-Options", "SAMEORIGIN");');
server=replace(server,"frame-ancestors 'none'","frame-ancestors 'self'; frame-src 'self'");
server=replace(server,'app.use((error, _req, res, _next) => {',`androidRuntime.registerAndroid({app,database,requireAdminUser,requireSessionUser,decryptSensitivePayload,access});\napp.use((error, _req, res, _next) => {`);
server=replace(server,'if (submitted.manualAuthorization !== undefined',`if(item.unit==='kg'&&item.source==='scale'){androidRuntime.requireScaleGrant(req,submitted,item,operator);if(consumedAuthorizations.has(submitted.androidWeightGrant))validate.invalid('La lectura de báscula ya se usó en esta venta');consumedAuthorizations.add(submitted.androidWeightGrant);}\n        if (submitted.manualAuthorization !== undefined`);
server=replace(server,'if (!replayed) for (const token of consumedAuthorizations) manualWeightAuthorizations.delete(token);',`if (!replayed) { for (const token of consumedAuthorizations) manualWeightAuthorizations.delete(token); androidRuntime.consumeScaleGrants(req.body.items); }`);fs.writeFileSync(path.join(target,'app/src/server.js'),server);
let app=fs.readFileSync(path.join(repo,'public/app.js'),'utf8').replace(/\r\n/g,'\n');app=replace(app,'function addCurrentProductToTicket() {','async function addCurrentProductToTicket() {');app=replace(app,'  state.detectedQuantity = quantity;\n\n  const price',`  let androidWeightGrant;\n  if(product.unit==='kg'&&state.quantitySource==='scale'){\n    if(state.androidWeightPending)return;\n    const owner=state.currentUser?.id,generation=state.checkoutGeneration;state.androidWeightPending=true;\n    try{const grant=await fetchJson('/api/android/weight-grant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:product.id,quantity})});\n      if(!state.sessionAuthenticated||state.currentUser?.id!==owner||state.checkoutGeneration!==generation||state.selectedProduct!==product||state.quantitySource!=='scale'||state.checkoutPending||state.checkoutProcessing)return;\n      androidWeightGrant=grant.token;\n    }catch(error){showToast(error.message||'Vuelve a pesar el producto');return;}finally{state.androidWeightPending=false;}\n  }\n  state.detectedQuantity = quantity;\n\n  const price`);app=replace(app,'      source: state.quantitySource,','      source: state.quantitySource,\n      ...(androidWeightGrant?{androidWeightGrant}:{}),');
app=replace(app,'function buildReceipt(sale, invoiceRequested = false) {','function buildReceipt(sale, invoiceRequested = false) {\n  if(window.AndroidReceipt)return AndroidReceipt.build(sale,invoiceRequested);');
for(const name of ['keyboard','scale','receipt','ticket-editor','printer','peripherals','updates'])app+='\n'+fs.readFileSync(path.join(android,'web',name+'.js'),'utf8');fs.writeFileSync(path.join(target,'app/public/app.js'),app);
// Event listeners retain function objects. Adapt their original bodies before
// registration; assigning a replacement after app startup would leave Web Serial handlers.
app=replace(app,'async function connectScale() {','async function connectScale() {\n  return AndroidShell.devices();');
app=replace(app,'async function disconnectScale() {',`async function disconnectScale() {\n  return fetchJson('/api/android/native',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'scaleClose'})});`);
for(const signature of ['async function requestScaleWeight() {','function startScalePolling() {','function stopScalePolling() {'])app=replace(app,signature,signature+'\n  return;');
app=replace(app,'function updateScaleUi() {','function updateScaleUi() {androidLegacyScaleUi();if(window.AndroidScaleUi)window.AndroidScaleUi.render();}\nfunction androidLegacyScaleUi() {');
app=app.replace(/RHINO BAR-9/g,'USB OTG');
// Keep the approved final layouts; animate composited layers instead of laying
// out every product card on every intermediate width of the shell transition.
// Shell changes are not authentication changes. Re-notifying subscribers
// reloads settings and overwrites an unsaved printer selection.
app=replace(app,"  window.dispatchEvent?.(new Event('elmuelle:session'));",`  const androidSessionIdentity=JSON.stringify([state.sessionAuthenticated,state.employeeLoginRequired,state.currentUser]);
  if(renderSessionUi.androidSessionIdentity!==androidSessionIdentity){
    renderSessionUi.androidSessionIdentity=androidSessionIdentity;
    window.dispatchEvent?.(new Event('elmuelle:session'));
  }`);
app=replace(app,'function toggleSidebar() {','function toggleSidebar() {return AndroidMotion.run("sidebar",()=>androidToggleSidebar());}\nfunction androidToggleSidebar() {');
app=replace(app,'function toggleTicketPanel(forceOpen = false) {','function toggleTicketPanel(forceOpen = false) {return AndroidMotion.run("ticket",()=>androidToggleTicketPanel(forceOpen));}\nfunction androidToggleTicketPanel(forceOpen = false) {');
app=replace(app,'function closeTicketDrawer() {','function closeTicketDrawer() {return AndroidMotion.run("ticket",()=>androidCloseTicketDrawer());}\nfunction androidCloseTicketDrawer() {');
fs.writeFileSync(path.join(target,'app/public/app.js'),app);
// Use the PC control dimensions even when Android reports a coarse pointer.
const css=fs.readFileSync(path.join(repo,'public/styles.css'),'utf8').replace(/@media\s*\(pointer:\s*coarse\)/g,'@media not all');fs.writeFileSync(path.join(target,'app/public/styles.css'),css);
let html=fs.readFileSync(path.join(repo,'public/index.html'),'utf8');html=replace(html,'</head>','<script src="android-transport.js"></script>\n<script src="android-motion.js"></script>\n<link rel="stylesheet" href="android-tablet.css">\n<link rel="stylesheet" href="android-tour.css">\n</head>');html=replace(html,'</body>','<script src="android-tour-store.js"></script>\n<script src="android-tour.js"></script>\n</body>');fs.writeFileSync(path.join(target,'app/public/index.html'),html);fs.copyFileSync(path.join(android,'web/transport.js'),path.join(target,'app/public/android-transport.js'));fs.copyFileSync(path.join(android,'web/tablet.css'),path.join(target,'app/public/android-tablet.css'));
for(const [name,extension] of [['motion','js'],['tour-store','js'],['tour','js'],['tour','css']])fs.copyFileSync(path.join(android,'web',name+'.'+extension),path.join(target,'app/public','android-'+name+'.'+extension));
for(const extension of ['html','css','js'])fs.copyFileSync(path.join(android,'web/container.'+extension),path.join(target,'app/public/android-container.'+extension));
// Keep Windows unchanged; Android does not infer a scale brand or protocol.
for(const name of ['index.html','settings-center.js']){const file=path.join(target,'app/public',name);let value=fs.readFileSync(file,'utf8').replace(/RHINO BAR-9/g,'USB OTG');if(name==='index.html')value=value.replace('9600 BPS · 8 bits · sin paridad · 1 bit de parada · sin flujo · enviar &quot;P&quot;.','BAR-9: configuración automática USB nativa. Solicitud P adaptativa, 9600 8N1 y sin flujo.');fs.writeFileSync(file,value);}
const runtime=path.join(repo,'.dev/android-tools/node-mobile');fs.mkdirSync(path.join(android,'native-runtime'),{recursive:true});fs.cpSync(path.join(runtime,'include'),path.join(android,'native-runtime/include'),{recursive:true});fs.cpSync(path.join(runtime,'bin'),path.join(android,'app/src/main/jniLibs'),{recursive:true});
const ticketBusiness=path.join(repo,'.dev/em003-ticket-business.json');
if(!fs.existsSync(ticketBusiness))throw Error('Falta la configuración privada del pie del ticket.');
fs.copyFileSync(ticketBusiness,path.join(target,'app/public/android-ticket-business.json'));
fs.mkdirSync(path.join(android,'app/src/main/res/drawable'),{recursive:true});
// Flatten the original artwork plus transparent safe margins into one nodpi
// bitmap. System splash renderers must not reinterpret nested inset/layer sizes.
const jdkRoot=path.join(repo,'.dev/android-tools/jdk'),javaHome=process.env.JAVA_HOME||path.join(jdkRoot,fs.readdirSync(jdkRoot).find(name=>name.startsWith('jdk-')));
require('node:child_process').execFileSync(path.join(javaHome,'bin/java.exe'),[path.join(android,'tools/PrepareSplash.java'),path.join(repo,'public/assets/brand/el-muelle-shortcut-icon.png'),path.join(android,'app/src/main/res/drawable-nodpi/muelle_launch_icon.png'),path.join(android,'app/src/main/res/drawable/muelle_round_icon.png')],{stdio:'inherit',windowsHide:true});
fs.copyFileSync(path.join(android,'app/src/main/res/drawable/muelle_round_icon.png'),path.join(android,'app/src/main/res/drawable/muelle_icon.png'));
const manifest={format:'ElMuellePDV-Android-bundle-v1',products:28,photographs:28,stock:0,physicalCountPerformed:false,files:{}};function walk(folder,prefix=''){for(const item of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,item.name),key=prefix+item.name;if(key==='bundle-manifest.json'||item.name.startsWith('.'))continue;if(item.isDirectory())walk(file,key+'/');else manifest.files[key]=sha(fs.readFileSync(file));}}walk(target);fs.writeFileSync(path.join(target,'bundle-manifest.json'),JSON.stringify(manifest));
const dependencies=require('./tools/bundle-dependencies.cjs').verifyBundle(target);assert.equal(dependencies.dependenciesSelfContained,true);
console.log(JSON.stringify({products:28,photos:28,stock:0,files:Object.keys(manifest.files).length,dependenciesSelfContained:true,publisherCredentialsIncluded:false,readOnlyUpdateCapabilityIncluded:true}));
