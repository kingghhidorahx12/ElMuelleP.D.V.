const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const p = require('./persistence');

async function stopServer(pid, storage=p.resolveStorage()) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('PID inválido.');
  const file = path.join(storage.runtimeDir, `server-${pid}.control.json`);
  p.rejectLinks(file);
  p.verifyPrivatePath(file);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (record.pid !== pid || !/^[a-f0-9]{64}$/.test(record.token)) throw Error('Control inválido.');
  const expected = process.platform === 'win32' ? `\\\\.\\pipe\\ElMuellePOS-${pid}-` : path.join(storage.runtimeDir, `server-${pid}.sock`);
  if (process.platform === 'win32' ? !record.pipe.startsWith(expected) : record.pipe !== expected) throw Error('Canal inválido.');
  await new Promise((resolve,reject) => {
    const socket = net.createConnection(record.pipe);
    let reply = '';
    socket.setTimeout(3000, () => socket.destroy(Error('No respondió el control local.')));
    socket.on('connect', () => socket.write(record.token+'\n'));
    socket.on('data', chunk => { reply += chunk; });
    socket.on('error', reject);
    socket.on('end', () => reply === 'closing\n' ? resolve() : reject(Error('Cierre rechazado.')));
  });
  const deadline = Date.now()+15000;
  while (Date.now()<deadline) {
    try { process.kill(pid,0); } catch(error) { if(error.code==='ESRCH')return; throw error; }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('El proceso sigue activo. No se forzó su terminación.');
}
module.exports = {stopServer};
if(require.main===module)stopServer(Number(process.argv[2])).catch(()=>{console.error('Cierre seguro no completado. No se forzó el proceso ni se borró su registro.');process.exitCode=1;});
