// Native transport and decoder state are separate; Web Serial is not used.
scaleState.supported=true;
let androidScaleBusy=false,androidScaleCurrent={connected:false,valid:false,code:'DISCONNECTED',message:'Configura la báscula USB; modelo sin confirmar'};
window.AndroidScaleUi={render(){
 const current=androidScaleCurrent,transportError=!current.connected&&/FAILED|DENIED|DRIVER_NOT_FOUND|PROFILE_INVALID/.test(current.code||'');
 const label=current.valid?'Peso disponible':current.autoPhase==='INCOMPATIBLE'?'Incompatible · '+current.message.replace(/^Incompatible · /,''):current.autoPhase==='CONNECTING'?'Conectando · '+(current.code==='USB_PERMISSION_PENDING'?'permiso USB':'báscula'):current.autoPhase==='DETECTING'||current.profile?.autoBar9&&current.connected?'Detectando · esperando peso válido':current.connected?(current.receivedBytes?'USB abierto · lectura no válida':'USB abierto · sin datos'):current.code==='USB_PERMISSION_PENDING'?'Esperando permiso USB':transportError?'Error USB · '+(current.operation||'conexión'):'Sin conexión USB';
 const weight=current.valid?Number(current.kg).toFixed(3)+' kg':'— kg';
 for(const id of ['scaleWeightText','settingsScaleWeight','personalScaleWeight']){const el=document.getElementById(id);if(el)el.textContent=weight;}
 for(const id of ['scaleStatusText','settingsScaleRaw','scaleRawText']){const el=document.getElementById(id);if(el)el.textContent=(current.code?current.code+' · ':'')+current.message;}
 for(const id of ['scaleStatusPill','settingsScaleStatus','settingsScaleConnectionBadge','personalScaleStatus']){const el=document.getElementById(id);if(el){el.textContent=label;el.dataset.connection=transportError?'error':current.connected?'connected':'disconnected';}}
 for(const id of ['connectScaleBtn','connectScaleBtnSettings']){const el=document.getElementById(id);if(el){el.disabled=false;el.textContent='Configurar USB';}}
 for(const id of ['requestScaleBtn','requestScaleBtnSettings']){const el=document.getElementById(id);if(el)el.disabled=true;}
 const profile=current.profile&&typeof current.profile==='object'?current.profile:null;
 for(const [id,value]of [['scaleModelInput',profile?.configuredModel||'Modelo no confirmado'],['scaleBaudRateInput',profile?.baud||''],['scaleCommandInput',profile?.autoBar9?'P · cada 800 ms':profile?.commandConfirmed?'P confirmado':'Sólo escuchar'],['scaleUnitInput',profile?.detectedUnit||(profile?.unit==='auto'?'kg':profile?.unit||'kg')]]){const el=document.getElementById(id);if(el){el.value=String(value);if(id!=='scaleModelInput')el.disabled=true;}}
 const section=document.querySelector('.settings-protocol-note,.settings-protocol,.scale-protocol-card');if(section)section.textContent='USB nativo · '+(current.driver||'controlador por detectar')+' · '+(current.detectedFormat||'formato pendiente')+(profile?.autoBar9?' · configuración automática BAR-9 · 9600 8N1 · sin flujo · P / 800 ms':' · modelo sin confirmar')+(current.diagnosticSaved?' · diagnóstico guardado automáticamente':'');
 if(state.activeView==='settings'&&document.querySelector('.settings-layout')?.dataset.settingsMode==='scale'){const title=document.getElementById('settingsSectionTitle');if(title)title.textContent='Báscula USB OTG';}
 document.body.classList.toggle('scale-connected',Boolean(current.connected));document.body.classList.toggle('scale-error',transportError);document.querySelector('.scale-card')?.setAttribute('title',label+' · '+current.message);
}};
connectScale=async()=>AndroidShell.devices();
disconnectScale=async()=>{try{await fetchJson('/api/android/native',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'scaleClose'})});}catch(error){showToast(error.message);}};
requestScaleWeight=async()=>{};startScalePolling=()=>{};stopScalePolling=()=>{};
setInterval(async()=>{
 if(androidScaleBusy||!state.sessionAuthenticated)return;androidScaleBusy=true;
 try{
  const current=await fetchJson('/api/android/scale');androidScaleCurrent=current;scaleState.connected=current.connected;scaleState.stable=Boolean(current.valid&&current.stable);scaleState.error=!current.connected&&/FAILED|DENIED/.test(current.code||'');scaleState.weightKg=current.valid?current.kg:0;scaleState.raw=current.message;scaleState.lastRequestAt=current.valid?Date.now():null;
  if(state.selectedProduct?.unit==='kg'&&(state.quantitySource==='scale'||current.valid&&!state.manualAuthorization)){state.detectedQuantity=current.valid?current.kg:0;state.quantitySource='scale';renderWeighPanel();}updateScaleUi();
 }catch{androidScaleCurrent={connected:false,valid:false,code:'STATE_UNAVAILABLE',message:'No se pudo consultar el estado del puente USB'};scaleState.connected=false;scaleState.stable=false;scaleState.weightKg=0;if(state.quantitySource==='scale'){state.detectedQuantity=0;renderWeighPanel();}updateScaleUi();}
 finally{androidScaleBusy=false;}
},350);
