// Vincula la ejecución a una huella del código, sin crear informes ni leer datos.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function fingerprint() {
  const files=['package.json','package-lock.json'];
  for(const base of ['src','public','scripts','portable','installer']) {
    function walk(relative) {
      for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})) {
        const file=relative+'/'+entry.name;
        if(entry.isDirectory())walk(file);
        else if(/\.(js|css|html|ps1|iss|cmd|vbs)$/.test(file))files.push(file);
      }
    }
    walk(base);
  }
  const manifest=files.sort().map(file=>file+'\t'+crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')).join('\n');
  return {files:files.length,sha256:crypto.createHash('sha256').update(manifest).digest('hex')};
}
const before=fingerprint();
console.log(JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceFingerprint:before}));
const tests=['persistence-safety','consolidation','configuration-integration','screen-permissions','navigation-access','session-restore','pos-interactions','p1-regression','recovery-compatibility','stabilization','stabilization-ui'].map(name=>'scripts/'+name+'-test.js');
const suite=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests],{cwd:root,env:{...process.env,NODE_OPTIONS:'',EL_MUELLE_STORAGE_MODE:''},stdio:'inherit',windowsHide:true});
let failed=suite.status!==0;
if(!failed) {
  const smoke=spawnSync(process.execPath,['scripts/security-smoke-test.js'],{cwd:root,env:{...process.env,NODE_OPTIONS:'',EL_MUELLE_STORAGE_MODE:''},stdio:'inherit',windowsHide:true});
  failed=smoke.status!==0;
}
const after=fingerprint(),unchanged=before.sha256===after.sha256;
console.log(JSON.stringify({sourceFingerprint:after,unchanged,passed:!failed&&unchanged}));
process.exitCode=failed||!unchanged?1:0;
