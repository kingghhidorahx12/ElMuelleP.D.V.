// Canal local autenticado: no agrega endpoints HTTP ni expone el control a la red.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const p = require('./persistence');

function registerShutdown({server, database, storage}) {
  let closing = false;
  let control;
  let record;
  function shutdown() {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => server.closeAllConnections(), 10000);
    timer.unref();
    control?.close();
    server.close(() => {
      clearTimeout(timer);
      let exitCode = 0;
      try { database.close(); } catch { exitCode = 1; }
      try { if (record) fs.unlinkSync(record); } catch { exitCode = 1; }
      process.exit(exitCode);
    });
    server.closeIdleConnections();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  if (storage.installed) {
    const token = crypto.randomBytes(32).toString('hex');
    const pipe = process.platform === 'win32'
      ? `\\\\.\\pipe\\ElMuellePOS-${process.pid}-${crypto.randomBytes(8).toString('hex')}`
      : path.join(storage.runtimeDir, `server-${process.pid}.sock`);
    record = path.join(storage.runtimeDir, `server-${process.pid}.control.json`);
    control = net.createServer(socket => {
      socket.setTimeout(2000, () => socket.destroy());
      let input = '';
      socket.on('error', () => {});
      socket.on('data', chunk => {
        input += chunk;
        if (input.length > 1024) return socket.destroy();
        if (!input.includes('\n')) return;
        const supplied = Buffer.from(input.slice(0, input.indexOf('\n')));
        if (supplied.length !== 64 || !crypto.timingSafeEqual(supplied, Buffer.from(token))) return socket.destroy();
        socket.end('closing\n', shutdown);
      });
    });
    control.on('error', error => { console.error('No se pudo habilitar el cierre seguro local: '+error.code); shutdown(); });
    control.listen(pipe, () => {
      try {
        p.rejectLinks(record);
        fs.writeFileSync(record, JSON.stringify({pid:process.pid, pipe, token}), {flag:'wx', mode:0o600});
        p.restrictPrivatePath(record);
      } catch { console.error('No se pudo proteger el control de cierre.'); shutdown(); }
    });
  }
  return shutdown;
}

module.exports = {registerShutdown};
