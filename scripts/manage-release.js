// Único flujo controlado de reemplazo/reparación: ejecuta sólo un instalador
// cuyo recibo técnico y paquete corresponden al SHA-256 aprobado externamente.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const c=require('../src/release-compatibility');
function preflight({receipt,expectedSHA256,packageRoot,dataDir,envFile,installDir}){
  c.noLinks(receipt);
  if(!/^[a-f0-9]{64}$/.test(expectedSHA256||'')||c.sha256(receipt)!==expectedSHA256)throw Error('RELEASE_HASH: El recibo no coincide con el SHA-256 aprobado.');
  const value=JSON.parse(fs.readFileSync(receipt,'utf8'));
  if(value.format!=='ElMuellePOS-installer-release-v1'||!value.installer||path.basename(value.installer)!==value.installer||value.installer.includes(':')||value.installer.includes('\\')||![value.manifestSHA256,value.installerSHA256,value.revisionSHA256].every(hash=>/^[a-f0-9]{64}$/.test(hash)))throw Error('RELEASE_FORMAT: Recibo inválido.');
  const revision=c.verifyPackage(packageRoot,value.manifestSHA256);
  if(revision.revisionSHA256!==value.revisionSHA256)throw Error('RELEASE_IDENTITY: Revisión diferente de la aprobada.');
  const installer=path.join(path.dirname(receipt),value.installer);c.noLinks(installer);
  if(c.sha256(installer)!==value.installerSHA256)throw Error('RELEASE_HASH: Instalador distinto de la revisión aprobada.');
  c.checkInstalled(installDir);c.checkData(dataDir,{envFile});return {installer,revisionSHA256:revision.revisionSHA256};
}
function installRelease(options,{installDir,silent=false,log}={}){
  if(!installDir||!options.dataDir)throw Error('Selecciona explícitamente datos e instalación.');
  const install=path.resolve(installDir),data=path.resolve(options.dataDir);c.noLinks(install);c.noLinks(data);
  const inside=(a,b)=>{const r=path.relative(a,b);return !r||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
  if(inside(install,data)||inside(data,install))throw Error('Datos e instalación deben estar separados.');
  const result=preflight({...options,installDir:install}),args=['/DIR='+install];
  if(silent)args.push('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/TASKS=');
  if(log){c.noLinks(log);args.push('/LOG='+path.resolve(log));}
  const run=spawnSync(result.installer,args,{windowsHide:true,stdio:'inherit',timeout:180000});
  if(run.error)throw run.error;if(run.status!==0)throw Error('El instalador no completó la operación: '+run.status);
  return {installed:true,revisionSHA256:result.revisionSHA256};
}
module.exports={preflight,installRelease};
if(require.main===module){try{
  const args=process.argv.slice(2),v={};let checkOnly=false;
  for(let i=0;i<args.length;i++){if(args[i]==='--check-only'){checkOnly=true;continue;}if(!['--release','--sha256','--package','--data-dir','--install-dir','--configuration-file'].includes(args[i])||!args[i+1]||Object.hasOwn(v,args[i]))throw Error('Argumentos inválidos.');v[args[i]]=args[++i];}
  if(!v['--data-dir']||!v['--install-dir'])throw Error('Selecciona explícitamente datos e instalación.');
  const install=path.resolve(v['--install-dir']),data=path.resolve(v['--data-dir']);c.noLinks(install);c.noLinks(data);
  const overlaps=(a,b)=>{const r=path.relative(a,b);return !r||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
  if(overlaps(install,data)||overlaps(data,install))throw Error('Datos e instalación deben estar separados.');
  const options={receipt:v['--release'],expectedSHA256:v['--sha256'],packageRoot:v['--package'],dataDir:data,envFile:v['--configuration-file'],installDir:install};
  const result=preflight(options);
  console.log('RELEASE_PREFLIGHT '+JSON.stringify({passed:true,revisionSHA256:result.revisionSHA256}));
  if(!checkOnly)console.log(JSON.stringify(installRelease(options,{installDir:install})));
}catch(error){console.error('Operación rechazada: '+error.message);process.exitCode=1;}}
