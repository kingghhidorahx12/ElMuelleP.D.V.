'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { PosDatabase } = require('../src/database');
const { RECOVERY_EVENT, catalogDigest, loadApprovedCatalog, validateCatalog, requireDevelopmentPath, seedDevelopmentProducts,
  snapshot, integrity, replaceCatalog } = require('./development-catalog');

const root = path.resolve(__dirname, '..');
const pin = fs.readFileSync(0, 'utf8').trim();
const passed = [];
let stage = 'preparation', temporaryRoot, server;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;

function run(name, work) {
  stage = name;
  return Promise.resolve().then(work).then(() => passed.push(name));
}

function catalog(database) {
  return database.prepare("SELECT payload FROM documents WHERE collection='products' ORDER BY document_id").all().map(row => JSON.parse(row.payload));
}

function copyCase(name, source) {
  const directory = path.join(temporaryRoot, name);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'el-muelle-pos.sqlite');
  fs.copyFileSync(source, file);
  return { directory, file };
}

async function freePort() {
  const listener = net.createServer();
  return new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const port = listener.address().port;
      listener.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const current = server;
  await new Promise(resolve => { current.once('exit', resolve); current.kill(); });
  server = undefined;
}

async function startServer(directory) {
  const port = await freePort();
  assert.notEqual(port, 3000); assert.notEqual(port, 3001);
  const base = 'http://127.0.0.1:' + port;
  const environment = path.join(directory, 'empty.env');
  fs.writeFileSync(environment, '# Isolated catalog tests only.\n');
  server = spawn(process.execPath, [path.join(root, 'src', 'server.js')], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: '', NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port),
      DATA_DIR: directory, ENV_FILE: environment, ADMIN_PIN: '', EMPLOYEE_PIN: '', DATA_ENCRYPTION_KEY: '',
      REQUIRE_HTTPS: 'false', CORS_ORIGIN: '' }
  });
  // Drain output without recording credentials, application data or logs.
  server.stdout.resume(); server.stderr.resume();
  for (let attempt = 0; attempt < 80; attempt++) {
    assert.equal(server.exitCode, null, 'isolated_server_exited');
    try { if ((await fetch(base + '/api/health')).ok) return base; } catch {}
    await delay(100);
  }
  throw new Error('isolated_server_not_ready');
}

async function main() {
  assert.match(pin, /^\d{6,12}$/);
  assert.ok(process.argv.length === 2 || process.argv.length === 4 && process.argv[2] === '--baseline', 'invalid_test_arguments');
  const approved = loadApprovedCatalog(root);
  temporaryRoot = fs.mkdtempSync(path.join(root, '.dev', '.catalog-tests-'));
  const baseline = path.join(temporaryRoot, 'baseline.sqlite');
  // A verified pre-recovery backup makes this suite repeatable after recovery.
  const sourcePath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, '.dev', 'data', 'el-muelle-pos.sqlite');
  requireDevelopmentPath(root, sourcePath);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try { source.exec("VACUUM INTO '" + baseline.replace(/'/g, "''") + "'"); } finally { source.close(); }
  const baseDatabase = new DatabaseSync(baseline, { readOnly: true });
  const baselineCatalog = catalog(baseDatabase);
  integrity(baseDatabase); baseDatabase.close();
  assert.equal(baselineCatalog.length, 6, 'isolated_suite_requires_original_synthetic_baseline');

  await run('canonical_validation_and_negative_inputs', () => {
    assert.equal(approved.length, 28);
    const invalid = structuredClone(approved); invalid[0].stockQuantity = null;
    assert.throws(() => validateCatalog(invalid, path.join(root, 'public/assets/products')), /invalid_canonical_stock/);
    const duplicate = structuredClone(approved); duplicate[1].id = duplicate[0].id;
    assert.throws(() => validateCatalog(duplicate, path.join(root, 'public/assets/products')), /duplicate_canonical_ids/);
  });

  await run('historical_dependency_blocks_replacement', () => {
    const test = copyCase('references', baseline), database = new DatabaseSync(test.file);
    try {
      database.prepare('INSERT INTO documents VALUES (?,?,?,?)').run('sales', 'test-reference',
        JSON.stringify({ id: 'test-reference', items: [{ productId: baselineCatalog[0].id, unit: baselineCatalog[0].unit }] }), new Date().toISOString());
      const before = snapshot(database);
      assert.throws(() => replaceCatalog(database, approved), /historical_product_dependency_requires_review/);
      assert.deepEqual(snapshot(database), before);
    } finally { database.close(); }
  });

  await run('complete_rollback_after_partial_insert_failure', () => {
    const test = copyCase('rollback', baseline), database = new DatabaseSync(test.file);
    try {
      const before = snapshot(database); let insertions = 0;
      const failing = {
        exec: sql => database.exec(sql),
        prepare(sql) {
          const statement = database.prepare(sql);
          return {
            all: (...values) => statement.all(...values),
            run(...values) {
              if (sql.startsWith('INSERT INTO documents') && ++insertions === 4) throw new Error('simulated_insert_failure');
              return statement.run(...values);
            }
          };
        }
      };
      assert.throws(() => replaceCatalog(failing, approved), /simulated_insert_failure/);
      assert.equal(insertions, 4); assert.deepEqual(snapshot(database), before); integrity(database);
    } finally { database.close(); }
  });

  const recovered = copyCase('recovered', baseline);
  await run('atomic_replacement_preserves_every_other_document', () => {
    const database = new DatabaseSync(recovered.file);
    try {
      const before = snapshot(database);
      const result = replaceCatalog(database, approved);
      assert.equal(result.changed, true); assert.equal(catalogDigest(catalog(database)), catalogDigest(approved));
      assert.deepEqual(snapshot(database).documents.filter(row => row.collection !== 'products'), before.documents.filter(row => row.collection !== 'products'));
      assert.deepEqual(snapshot(database).audits.slice(0, -1), before.audits);
      assert.equal(snapshot(database).audits.at(-1).event_type, RECOVERY_EVENT); integrity(database);
    } finally { database.close(); }
  });

  await run('second_recovery_is_exact_noop', () => {
    const database = new DatabaseSync(recovered.file);
    try {
      const before = snapshot(database);
      assert.deepEqual(replaceCatalog(database, approved), { changed: false, count: 28 });
      assert.deepEqual(snapshot(database), before);
    } finally { database.close(); }
  });

  await run('later_catalog_edits_are_not_overwritten', () => {
    const test = copyCase('later-edits', recovered.file), database = new DatabaseSync(test.file);
    try {
      const changed = structuredClone(approved[0]); changed.price = money(changed.price + 0.01);
      database.prepare("UPDATE documents SET payload=? WHERE collection='products' AND document_id=?").run(JSON.stringify(changed), changed.id);
      const before = snapshot(database);
      assert.throws(() => replaceCatalog(database, approved), /catalog_modified_after_recovery/);
      assert.deepEqual(snapshot(database), before);
    } finally { database.close(); }
  });

  await run('clean_development_imports_28_and_preserves_existing_database', () => {
    const directory = path.join(temporaryRoot, 'clean');
    assert.equal(seedDevelopmentProducts(root, directory), true);
    const fresh = new PosDatabase(directory);
    try {
      assert.equal(catalogDigest(catalog(fresh.db)), catalogDigest(approved));
      const before = snapshot(fresh.db);
      assert.equal(seedDevelopmentProducts(root, directory), false);
      assert.deepEqual(snapshot(fresh.db), before);
    } finally { fresh.db.close(); }
    const legacyDirectory = path.join(temporaryRoot, 'legacy-without-database'); fs.mkdirSync(legacyDirectory);
    fs.writeFileSync(path.join(legacyDirectory, 'products.json'), JSON.stringify(baselineCatalog));
    assert.equal(seedDevelopmentProducts(root, legacyDirectory), true);
    assert.equal(catalogDigest(JSON.parse(fs.readFileSync(path.join(legacyDirectory, 'products.json'), 'utf8'))), catalogDigest(approved));
    const referencedLegacy = path.join(temporaryRoot, 'legacy-operations'); fs.mkdirSync(referencedLegacy);
    const legacyFile = path.join(referencedLegacy, 'products.json');
    fs.writeFileSync(legacyFile, JSON.stringify(baselineCatalog));
    fs.writeFileSync(path.join(referencedLegacy, 'sales.json'), JSON.stringify([{ items: [{ productId: baselineCatalog[0].id }] }]));
    const legacyBefore = fs.readFileSync(legacyFile, 'utf8');
    assert.throws(() => seedDevelopmentProducts(root, referencedLegacy), /existing_legacy_operations_require_review/);
    assert.equal(fs.readFileSync(legacyFile, 'utf8'), legacyBefore);
    assert.throws(() => seedDevelopmentProducts(root, path.join(root, 'data')), /outside_development_directory/);
  });

  const integration = copyCase('integration', recovered.file);
  let base = await startServer(integration.directory), cookie = '';
  async function request(route, method = 'GET', body, authenticated = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (authenticated && cookie) headers.Cookie = cookie;
    const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: (response.headers.get('set-cookie') || '').split(';')[0] };
  }
  async function login() {
    const response = await request('/api/auth/admin', 'POST', { pin }, false);
    assert.equal(response.status, 200, 'isolated_admin_login_failed'); cookie = response.cookie;
  }
  async function products() { const response = await request('/api/products'); assert.equal(response.status, 200); return response.body; }
  await login();
  const kg = approved.find(product => product.unit === 'kg' && product.stockQuantity >= 1);
  const piece = approved.find(product => product.unit === 'pieza' && product.stockQuantity >= 2);
  const saleBody = items => ({ items, paymentMethod: 'efectivo', discount: 0, invoiceRequested: false });
  let cashId, kgSale, pieceSale;

  await run('closed_cash_and_unauthenticated_requests_are_rejected', async () => {
    assert.equal((await request('/api/products', 'GET', undefined, false)).status, 401);
    assert.equal((await request('/api/sales', 'POST', saleBody([{ productId: kg.id, quantity: 0.5 }]))).status, 409);
  });

  await run('cash_open_and_sale_by_kg', async () => {
    const opened = await request('/api/cash-sessions/open', 'POST', { openingAmount: 100 });
    assert.equal(opened.status, 201); cashId = opened.body.id;
    const sold = await request('/api/sales', 'POST', saleBody([{ productId: kg.id, quantity: 0.5, price: 0.01, total: 0.01 }]));
    assert.equal(sold.status, 201); kgSale = sold.body;
    assert.equal(sold.body.items[0].price, kg.price); assert.equal(sold.body.items[0].unit, 'kg');
    assert.equal(sold.body.total, money(0.5 * kg.price));
    assert.equal((await products()).find(product => product.id === kg.id).stockQuantity, money(kg.stockQuantity - 0.5));
  });

  await run('sale_by_piece_uses_original_price_and_stock', async () => {
    const sold = await request('/api/sales', 'POST', saleBody([{ productId: piece.id, quantity: 2 }]));
    assert.equal(sold.status, 201); pieceSale = sold.body;
    assert.equal(sold.body.items[0].unit, 'pieza'); assert.equal(sold.body.total, money(2 * piece.price));
    assert.equal((await products()).find(product => product.id === piece.id).stockQuantity, piece.stockQuantity - 2);
  });

  await run('invalid_operations_do_not_change_stock_or_sales', async () => {
    const beforeProducts = await products(), beforeSales = (await request('/api/sales')).body;
    for (const [body, status] of [
      [saleBody([{ productId: piece.id, quantity: 0.5 }]), 400],
      [saleBody([{ productId: kg.id, quantity: -1 }]), 400],
      [saleBody([{ productId: piece.id, quantity: piece.stockQuantity + 1 }]), 409],
      [{ ...saleBody([{ productId: kg.id, quantity: 0.5 }]), discount: 99999 }, 400],
      [{ ...saleBody([{ productId: kg.id, quantity: 0.5 }]), paymentMethod: 'tarjeta' }, 400]
    ]) assert.equal((await request('/api/sales', 'POST', body)).status, status);
    assert.deepEqual(await products(), beforeProducts); assert.deepEqual((await request('/api/sales')).body, beforeSales);
  });

  await run('cancellation_restores_stock_once_and_preserves_sale_details', async () => {
    const cancel = await request('/api/sales/' + kgSale.id + '/cancel', 'PATCH', { reason: 'Cancelación de prueba aislada' });
    assert.equal(cancel.status, 200); assert.equal(cancel.body.status, 'cancelada');
    assert.deepEqual(cancel.body.items, kgSale.items); assert.equal(cancel.body.total, kgSale.total);
    assert.equal((await products()).find(product => product.id === kg.id).stockQuantity, kg.stockQuantity);
    assert.equal((await request('/api/sales/' + kgSale.id + '/cancel', 'PATCH', { reason: 'Segundo intento de prueba' })).status, 400);
    assert.equal((await products()).find(product => product.id === kg.id).stockQuantity, kg.stockQuantity);
  });

  await run('inventory_receipt_preserves_weighted_cost_rules', async () => {
    const unitCost = money(kg.costPrice + 1), quantity = 2;
    const receipt = await request('/api/inventory/entries', 'POST', { productId: kg.id, quantity, unitCost, salePrice: kg.price, supplier: 'Prueba aislada' });
    assert.equal(receipt.status, 201); assert.equal(receipt.body.product.stockQuantity, money(kg.stockQuantity + quantity));
    assert.equal(receipt.body.product.costPrice, money((money(kg.stockQuantity * kg.costPrice) + money(quantity * unitCost)) / (kg.stockQuantity + quantity)));
    assert.equal(receipt.body.product.price, kg.price);
    const before = await products();
    assert.equal((await request('/api/inventory/entries', 'POST', { productId: kg.id, quantity: -1, unitCost })).status, 400);
    assert.deepEqual(await products(), before);
  });

  await run('cash_movements_reports_and_closing', async () => {
    const movement = await request('/api/cash-sessions/' + cashId + '/movements', 'POST', { type: 'in', amount: 10 });
    assert.equal(movement.status, 201);
    const current = await request('/api/cash-sessions/current');
    assert.equal(current.status, 200); assert.equal(current.body.session.summary.totalSales, pieceSale.total);
    assert.equal(current.body.session.summary.canceledCount, 1);
    const expected = money(100 + pieceSale.total + 10);
    assert.equal(current.body.session.expectedCash, expected);
    const history = await request('/api/cash-sessions'); assert.equal(history.status, 200); assert.equal(history.body.length, 1);
    const closed = await request('/api/cash-sessions/' + cashId + '/close', 'POST', { countedCash: expected });
    assert.equal(closed.status, 200); assert.equal(closed.body.status, 'closed'); assert.equal(closed.body.difference, 0);
  });

  await run('isolated_restart_preserves_catalog_sales_receipts_and_cash', async () => {
    const before = { products: await products(), sales: (await request('/api/sales')).body,
      entries: (await request('/api/inventory/entries')).body, cash: (await request('/api/cash-sessions')).body };
    await stopServer(); base = await startServer(integration.directory); await login();
    assert.deepEqual(await products(), before.products);
    assert.deepEqual((await request('/api/sales')).body, before.sales);
    assert.deepEqual((await request('/api/inventory/entries')).body, before.entries);
    assert.deepEqual((await request('/api/cash-sessions')).body, before.cash);
    const checkDatabase = new DatabaseSync(integration.file, { readOnly: true });
    try { integrity(checkDatabase); } finally { checkDatabase.close(); }
  });
}

main().then(() => console.log(JSON.stringify({ success: true, passed, tests: passed.length }))).catch(error => {
  console.error(JSON.stringify({ success: false, stage, passed, reason: error.code === 'ERR_ASSERTION' ? 'assertion_failed' :
    /^[a-z_]+$/.test(error.message || '') ? error.message : 'isolated_test_failed' })); process.exitCode = 1;
}).finally(async () => {
  await stopServer();
  if (temporaryRoot) {
    const allowed = path.resolve(root, '.dev') + path.sep;
    assert.ok(path.resolve(temporaryRoot).startsWith(allowed) && path.basename(temporaryRoot).startsWith('.catalog-tests-'));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
