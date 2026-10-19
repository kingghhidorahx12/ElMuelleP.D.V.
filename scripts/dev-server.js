const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { seedDevelopmentProducts } = require('./development-catalog');

const root = path.resolve(__dirname, '..');
const runtimeDir = path.join(root, '.dev');
const dataDir = path.join(runtimeDir, 'data');
const instancePath = path.join(runtimeDir, 'instance.json');
const url = 'http://localhost:3001';
const controlUrl = 'http://127.0.0.1:3001';
const identity = 'el-muelle-dev-v1';
const token = crypto.randomBytes(32).toString('hex');
const bootId = crypto.randomUUID();
const clients = new Set();
const watchers = [];
let child;
let backendPort;
let ready = false;
let stopping = false;
let reloadTimer;
const signatures = new Map();
const pendingChanges = new Set();
let restartPending = false;
let restarting = false;
let generation = 0;
let revision = 0;
let lastError = '';

function requestJson(address, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(address, { ...options, timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`);
          resolve(JSON.parse(body));
        } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado')));
    req.on('error', reject);
    req.end();
  });
}

function isOurs(status) {
  return status.identity === identity && status.projectRoot === root;
}

function rejectSymlink(directory) {
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
    throw new Error(`No se permite redirigir el entorno de desarrollo: ${directory}`);
  }
}

function prepareFixtures() {
  rejectSymlink(runtimeDir);
  rejectSymlink(dataDir);
  fs.mkdirSync(runtimeDir, { recursive: true });
  const markerPath = path.join(runtimeDir, 'environment.json');
  if (fs.existsSync(markerPath)) {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (marker.identity !== identity || marker.projectRoot !== root) {
      throw new Error('La carpeta .dev pertenece a otro entorno. No se modificó.');
    }
  } else {
    if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length) {
      throw new Error('.dev/data ya contiene datos sin identificar. No se sobrescribieron.');
    }
    fs.writeFileSync(markerPath, JSON.stringify({ identity, projectRoot: root }), { flag: 'wx' });
  }
  fs.mkdirSync(dataDir, { recursive: true });
  // Only the approved product JSON seeds new development data; operational SQLite is never opened.
  seedDevelopmentProducts(root, dataDir);
  const fixtures = {
    sales: [], 'cash-sessions': [], 'cash-shifts': [], 'inventory-entries': []
  };
  if (!fs.existsSync(path.join(dataDir, 'el-muelle-pos.sqlite'))) {
    for (const [name, data] of Object.entries(fixtures)) {
      const target = path.join(dataDir, `${name}.json`);
      if (!fs.existsSync(target)) fs.writeFileSync(target, JSON.stringify(data), { flag: 'wx' });
    }
  }
  const envPath = path.join(runtimeDir, 'empty.env');
  if (!fs.existsSync(envPath)) fs.writeFileSync(envPath, '# Development only; operational .env is not loaded.\n', { flag: 'wx' });
  if (fs.readFileSync(envPath, 'utf8') !== '# Development only; operational .env is not loaded.\n') {
    throw new Error('.dev/empty.env fue modificado; se detuvo el arranque para preservar el aislamiento.');
  }
}

function notifyReload(stylesOnly = false) {
  revision += 1;
  const message = JSON.stringify({ version: `${bootId}:${revision}`, stylesOnly });
  for (const res of clients) res.write(`event: version\ndata: ${message}\n\n`);
}

function signature(file) {
  try {
    if (!fs.statSync(file).isFile()) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function indexFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) indexFiles(file);
    else signatures.set(file, signature(file));
  }
}

function checkChanges() {
  let publicChanged = false;
  let stylesOnly = true;
  let backendChanged = false;
  for (const file of pendingChanges) {
    const next = signature(file);
    if (next === (signatures.get(file) ?? null)) continue;
    signatures.set(file, next);
    console.log(`[dev] Cambio: ${path.relative(root, file)}`);
    if (file.startsWith(path.join(root, 'src') + path.sep)) backendChanged = true;
    else { publicChanged = true; if (!file.endsWith('.css')) stylesOnly = false; }
  }
  pendingChanges.clear();
  if (backendChanged) restartBackend();
  else if (publicChanged) notifyReload(stylesOnly);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function stopChild() {
  const current = child;
  child = undefined;
  if (!current || current.exitCode !== null || current.signalCode !== null) return;
  await new Promise((resolve) => {
    current.once('exit', resolve);
    current.kill();
  });
}

async function restartBackend() {
  restartPending = true;
  if (restarting || stopping) return;
  restarting = true;
  try {
    while (restartPending && !stopping) {
      restartPending = false;
      ready = false;
      await stopChild();
      backendPort = await freePort();
      if (stopping) break;
      const current = spawn(process.execPath, [path.join(root, 'src', 'server.js')], {
        cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env, NODE_OPTIONS: '', NODE_ENV: 'development',
          HOST: '127.0.0.1', PORT: String(backendPort), DATA_DIR: dataDir,
          ENV_FILE: path.join(runtimeDir, 'empty.env'), REQUIRE_HTTPS: 'false',
          CORS_ORIGIN: '', ADMIN_PIN: '864209', EMPLOYEE_PIN: '135790', DATA_ENCRYPTION_KEY: ''
        }
      });
      child = current;
      generation += 1;
      lastError = '';
      let startupOutput = '';
      let listening = false;
      current.stdout.on('data', (chunk) => {
        startupOutput = (startupOutput + chunk.toString()).slice(-2000);
        listening ||= startupOutput.includes('El Muelle POS iniciado correctamente');
        process.stdout.write(chunk);
      });
      current.stderr.on('data', (chunk) => { lastError = chunk.toString().trim(); process.stderr.write(chunk); });
      current.on('error', (error) => { lastError = error.message; ready = false; });
      current.on('exit', (code) => {
        if (child === current) { ready = false; lastError = `Backend detenido (${code}); guarda un archivo de src para reintentar.`; }
      });
      for (let attempt = 0; attempt < 80 && !stopping; attempt += 1) {
        if (current.exitCode !== null || current.signalCode !== null) break;
        try {
          const health = await requestJson(`http://127.0.0.1:${backendPort}/api/health`);
          if (listening && health.ok && health.app === 'El Muelle POS' && child === current) {
            ready = true; lastError = ''; notifyReload(); break;
          }
        } catch { /* The backend is still starting. */ }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (ready) console.log(`[dev] Listo: ${url} (backend ${current.pid}, generación ${generation})`);
      else if (!stopping) console.error(`[dev] Backend no disponible: ${lastError || 'tiempo de espera agotado'}`);
    }
  } catch (error) { lastError = error.message; console.error(`[dev] ${lastError}`); }
  finally { restarting = false; }
}

const gateway = http.createServer((req, res) => {
  if (!['localhost:3001', '127.0.0.1:3001'].includes(req.headers.host)) {
    res.writeHead(403); res.end('Host no autorizado'); return;
  }
  const pathname = new URL(req.url, controlUrl).pathname;
  if (pathname.startsWith('/__dev/')) {
    if (req.headers.origin && req.headers.origin !== url) { res.writeHead(403); res.end(); return; }
    res.setHeader('Cache-Control', 'no-store');
    if (pathname === '/__dev/status' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ identity, projectRoot: root, url, pid: process.pid,
        backendPid: child?.pid || null, backendPort, ready, generation, revision, lastError, dataDir }));
    } else if (pathname === '/__dev/reload.js' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(fs.readFileSync(path.join(__dirname, 'dev-reload.js')));
    } else if (pathname === '/__dev/events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      res.write(`event: version\ndata: ${JSON.stringify({ version: `${bootId}:${revision}`, stylesOnly: false })}\n\n`);
      clients.add(res);
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
      res.on('close', () => { clients.delete(res); clearInterval(heartbeat); });
    } else if (pathname === '/__dev/stop' && req.method === 'POST' && req.headers['x-dev-token'] === token) {
      res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}');
      setImmediate(() => shutdown(0));
    } else { res.writeHead(404); res.end(); }
    return;
  }
  if (req.headers.host === '127.0.0.1:3001') {
    res.writeHead(307, { Location: url + req.url }); res.end(); return;
  }
  if (!ready) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('<!doctype html><title>Desarrollo El Muelle</title><p>Esperando al backend de desarrollo. Revisa .dev/server.err.log si no inicia.</p><script src="/__dev/reload.js"></script>');
    return;
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: backendPort,
    method: req.method, path: req.url, headers: { ...req.headers, 'accept-encoding': 'identity' } }, (incoming) => {
    const headers = { ...incoming.headers, 'cache-control': 'no-store' };
    if (String(headers['content-type']).includes('text/html')) {
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () => {
        delete headers['content-length']; delete headers.etag;
        res.writeHead(incoming.statusCode, headers);
        res.end(Buffer.concat(chunks).toString('utf8').replace('</body>', '<script src="/__dev/reload.js"></script></body>'));
      });
    } else { res.writeHead(incoming.statusCode, headers); incoming.pipe(res); }
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end('Backend reiniciando; vuelve a intentar.'); });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
});

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  clearTimeout(reloadTimer);
  watchers.forEach((watcher) => watcher.close());
  for (const res of clients) res.end();
  gateway.close();
  await stopChild();
  if (fs.existsSync(instancePath)) {
    const instance = JSON.parse(fs.readFileSync(instancePath, 'utf8'));
    if (instance.token === token) fs.unlinkSync(instancePath);
  }
  process.exit(code);
}

async function main() {
  if (process.argv.includes('--stop')) {
    const status = await requestJson(`${controlUrl}/__dev/status`);
    if (!isOurs(status)) throw new Error('El puerto 3001 pertenece a otro proyecto. No se detuvo.');
    const instance = JSON.parse(fs.readFileSync(instancePath, 'utf8'));
    await requestJson(`${controlUrl}/__dev/stop`, { method: 'POST', headers: { 'x-dev-token': instance.token } });
    console.log('[dev] Entorno detenido.'); return;
  }
  try {
    await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(3001, '127.0.0.1', resolve); });
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      const status = await requestJson(`${controlUrl}/__dev/status`).catch(() => null);
      if (status && isOurs(status)) { console.log(`[dev] Se reutiliza la instancia existente: ${url}`); return; }
      throw new Error('Puerto 3001 ocupado por otro proceso. No se cerró ni se cambió de puerto.');
    }
    throw error;
  }
  try {
    prepareFixtures();
    fs.writeFileSync(instancePath, JSON.stringify({ pid: process.pid, token }), { mode: 0o600 });
    for (const directory of ['public', 'src']) {
      indexFiles(path.join(root, directory));
      const watcher = fs.watch(path.join(root, directory), { recursive: true }, (_event, filename) => {
        if (!filename || stopping) return;
        if (directory === 'src' && !/\.(js|json)$/i.test(String(filename))) return;
        pendingChanges.add(path.join(root, directory, String(filename)));
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(checkChanges, 250);
      });
      watcher.on('error', (error) => { console.error(`[dev] Watcher: ${error.message}`); shutdown(1); });
      watchers.push(watcher);
    }
    process.on('SIGINT', () => shutdown(0));
    process.on('SIGTERM', () => shutdown(0));
    await restartBackend();
  } catch (error) { console.error(`[dev] ${error.message}`); await shutdown(1); }
}

main().catch((error) => { console.error(`[dev] ${error.message}`); process.exitCode = 1; });
