const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function provision(directory){
 if(!path.isAbsolute(directory||'')||fs.existsSync(directory))throw Error('Selecciona un directorio privado nuevo y absoluto.');
 require('../../src/persistence').privateDirectory(directory);
 const clientId='muelle-'+crypto.randomUUID(),secret=()=>crypto.randomBytes(32).toString('hex');
 fs.writeFileSync(path.join(directory,'clients.json'),JSON.stringify({[clientId]:secret()},null,2)+'\n',{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(directory,'receiver.env'),'MAILBOX_DATA_KEY='+secret()+'\nMAILBOX_ADMIN_TOKEN='+secret()+'\nMAILBOX_DATA_DIR=/data\nMAILBOX_CLIENTS_FILE=/private/clients.json\n',{flag:'wx',mode:0o600});
 for(const name of ['clients.json','receiver.env'])require('../../src/persistence').restrictPrivatePath(path.join(directory,name));
 return {directory,clientId,secretsPrinted:false};
}
module.exports={provision};if(require.main===module){try{console.log(JSON.stringify(provision(process.argv[2])));}catch(error){console.error(error.message);process.exitCode=1;}}
