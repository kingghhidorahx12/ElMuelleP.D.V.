'use strict';

// Development-only catalog seeding and explicitly requested one-time recovery.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const RECOVERY_EVENT = 'development_catalog_recovered_v1';
const LEGACY_DIGEST = 'd2089ec2c2978899f7c68eb8af45aee7b239304fa0642ea07ec7d0180ff5e280';
const DATABASE_NAME = 'el-muelle-pos.sqlite';

function check(condition, reason) {
  if (!condition) throw new Error(reason);
}

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function catalogDigest(products) {
  const sorted = [...products].sort((a, b) => a.id.localeCompare(b.id));
  return crypto.createHash('sha256').update(stable(sorted)).digest('hex');
}

function requireDevelopmentPath(root, target) {
  const directory = path.join(root, '.dev');
  const relative = path.relative(directory, path.resolve(target));
  check(relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'outside_development_directory');
  for (let current = path.resolve(target); current !== path.dirname(current); current = path.dirname(current)) {
    if (fs.existsSync(current)) check(!fs.lstatSync(current).isSymbolicLink(), 'redirected_development_path');
    if (current === root) break;
  }
}

function validateCatalog(products, imageDirectory) {
  check(Array.isArray(products) && products.length === 28, 'canonical_count_must_be_28');
  check(new Set(products.map(product => product.id)).size === 28, 'duplicate_canonical_ids');
  const categories = {}, units = {};
  for (const product of products) {
    check(typeof product.id === 'string' && /^[a-z0-9_-]+$/.test(product.id), 'invalid_canonical_id');
    check(typeof product.name === 'string' && product.name.trim() && product.active === true, 'invalid_canonical_identity');
    check(Number.isFinite(product.price) && product.price > 0 && Number.isFinite(product.costPrice) && product.costPrice >= 0,
      'invalid_canonical_prices');
    check(Number.isFinite(product.stockQuantity) && product.stockQuantity >= 0, 'invalid_canonical_stock');
    check(product.minStock === null || Number.isFinite(product.minStock) && product.minStock >= 0, 'invalid_canonical_minimum');
    check(['kg', 'pieza'].includes(product.unit), 'invalid_canonical_unit');
    categories[product.category] = (categories[product.category] || 0) + 1;
    units[product.unit] = (units[product.unit] || 0) + 1;
    check(fs.existsSync(path.join(imageDirectory, product.id + '.jpg')), 'canonical_photo_missing');
  }
  assert.deepEqual(categories, { 'Pescados y mariscos': 14, 'Carnes selectas': 8, 'Para el antojo': 4, 'Condimentos y salsas': 2 });
  assert.deepEqual(units, { kg: 19, pieza: 9 });
  return products;
}

function loadApprovedCatalog(root) {
  return validateCatalog(JSON.parse(fs.readFileSync(path.join(root, 'data', 'products.json'), 'utf8')),
    path.join(root, 'public', 'assets', 'products'));
}

function seedDevelopmentProducts(root, dataDir) {
  requireDevelopmentPath(root, dataDir);
  // Existing SQLite always wins, including later edits to its catalog.
  if (fs.existsSync(path.join(dataDir, DATABASE_NAME))) return false;
  const products = loadApprovedCatalog(root);
  const target = path.join(dataDir, 'products.json');
  requireDevelopmentPath(root, target);
  if (fs.existsSync(target)) {
    const previous = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (catalogDigest(previous) === catalogDigest(products)) return false;
    check(catalogDigest(previous) === LEGACY_DIGEST, 'existing_legacy_catalog_requires_review');
    for (const name of ['sales', 'inventory-entries', 'cash-sessions', 'cash-shifts']) {
      const file = path.join(dataDir, name + '.json');
      if (fs.existsSync(file)) {
        const documents = JSON.parse(fs.readFileSync(file, 'utf8'));
        check(Array.isArray(documents) && documents.length === 0, 'existing_legacy_operations_require_review');
      }
    }
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(products));
  return true;
}

function rows(database, sql) {
  return JSON.parse(JSON.stringify(database.prepare(sql).all()));
}

function snapshot(database) {
  return {
    documents: rows(database, 'SELECT * FROM documents ORDER BY collection,document_id'),
    audits: rows(database, 'SELECT * FROM audit_events ORDER BY id'),
    sequence: rows(database, 'SELECT * FROM sqlite_sequence ORDER BY name'),
    schema: rows(database, 'SELECT type,name,sql FROM sqlite_master ORDER BY type,name')
  };
}

function integrity(database) {
  assert.deepEqual(rows(database, 'PRAGMA integrity_check'), [{ integrity_check: 'ok' }]);
}

function inspectRecovery(database, canonical) {
  assert.deepEqual(rows(database, 'PRAGMA table_info(documents)').map(column => column.name),
    ['collection', 'document_id', 'payload', 'updated_at']);
  assert.deepEqual(rows(database, 'PRAGMA table_info(audit_events)').map(column => column.name),
    ['id', 'event_type', 'entity_type', 'entity_id', 'actor_id', 'actor_name', 'details', 'created_at']);
  const before = snapshot(database);
  check(!before.schema.some(item => item.type === 'trigger'), 'unexpected_database_triggers');
  const products = before.documents.filter(row => row.collection === 'products').map(row => JSON.parse(row.payload));
  if (catalogDigest(products) === catalogDigest(canonical)) return { before, unchanged: true };
  check(!before.audits.some(row => row.event_type === RECOVERY_EVENT), 'catalog_modified_after_recovery');
  check(products.length === 6 && catalogDigest(products) === LEGACY_DIGEST, 'current_catalog_is_not_the_approved_synthetic_baseline');
  const ids = new Set(products.map(product => product.id));
  function references(value) {
    if (typeof value === 'string') return ids.has(value);
    return value && typeof value === 'object' && Object.values(value).some(references);
  }
  for (const document of before.documents) {
    if (['products', 'settings', 'meta'].includes(document.collection)) continue;
    check(!references(JSON.parse(document.payload)), 'historical_product_dependency_requires_review');
  }
  for (const audit of before.audits) {
    check(!ids.has(audit.entity_id) && !references(JSON.parse(audit.details)), 'historical_product_audit_requires_review');
  }
  return { before, unchanged: false };
}

function replaceCatalog(database, canonical, expectedBefore) {
  const inspection = inspectRecovery(database, canonical);
  if (inspection.unchanged) return { changed: false, count: 28 };
  const before = inspection.before;
  if (expectedBefore) assert.deepEqual(before, expectedBefore);
  const timestamp = new Date().toISOString();
  let transaction = false;
  try {
    database.exec('BEGIN IMMEDIATE'); transaction = true;
    assert.deepEqual(snapshot(database), before);
    database.prepare("DELETE FROM documents WHERE collection='products'").run();
    const insert = database.prepare('INSERT INTO documents(collection,document_id,payload,updated_at) VALUES (?,?,?,?)');
    for (const product of canonical) insert.run('products', product.id, JSON.stringify(product), timestamp);
    const details = JSON.stringify({ source: 'data/products.json', sourceDigest: catalogDigest(canonical),
      previousCount: 6, count: 28, stockPolicy: 'historical_fictitious_development_only' });
    const audit = database.prepare('INSERT INTO audit_events(event_type,entity_type,entity_id,actor_id,actor_name,details,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(RECOVERY_EVENT, 'products', 'canonical-products-v1', null, null, details, timestamp);
    const expected = structuredClone(before);
    expected.documents = before.documents.filter(row => row.collection !== 'products').concat(canonical.map(product => ({
      collection: 'products', document_id: product.id, payload: JSON.stringify(product), updated_at: timestamp
    }))).sort((a, b) => a.collection < b.collection ? -1 : a.collection > b.collection ? 1 : a.document_id < b.document_id ? -1 : a.document_id > b.document_id ? 1 : 0);
    expected.audits.push({ id: Number(audit.lastInsertRowid), event_type: RECOVERY_EVENT, entity_type: 'products',
      entity_id: 'canonical-products-v1', actor_id: null, actor_name: null, details, created_at: timestamp });
    const sequence = expected.sequence.find(row => row.name === 'audit_events');
    if (sequence) sequence.seq = Number(audit.lastInsertRowid);
    else expected.sequence.push({ name: 'audit_events', seq: Number(audit.lastInsertRowid) });
    expected.sequence.sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(snapshot(database), expected);
    const written = rows(database, "SELECT payload FROM documents WHERE collection='products' ORDER BY document_id").map(row => JSON.parse(row.payload));
    check(written.length === 28 && new Set(written.map(product => product.id)).size === 28 &&
      catalogDigest(written) === catalogDigest(canonical), 'written_catalog_does_not_match_source');
    integrity(database);
    database.exec('COMMIT'); transaction = false;
    return { changed: true, count: 28, auditId: Number(audit.lastInsertRowid) };
  } catch (error) {
    if (transaction) database.exec('ROLLBACK');
    throw error;
  }
}

function developmentStatus() {
  return new Promise((resolve, reject) => {
    const request = http.get('http://127.0.0.1:3001/__dev/status', { timeout: 5000 }, response => {
      let body = ''; response.on('data', data => { body += data; });
      response.on('end', () => {
        try { check(response.statusCode === 200, 'development_status_failed'); resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
    });
    request.on('error', () => reject(new Error('development_not_available')));
    request.on('timeout', () => request.destroy());
  });
}

async function recoverDevelopment(root) {
  const dataDir = path.join(root, '.dev', 'data');
  const databasePath = path.join(dataDir, DATABASE_NAME);
  const initial = await developmentStatus();
  check(initial.identity === 'el-muelle-dev-v1' && initial.projectRoot === root && initial.dataDir === dataDir && initial.ready,
    'active_development_identity_mismatch');
  requireDevelopmentPath(root, databasePath);
  check(fs.existsSync(databasePath), 'existing_development_database_required');
  const canonical = loadApprovedCatalog(root);
  const database = new DatabaseSync(databasePath);
  let backupPath;
  try {
    database.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
    integrity(database);
    const inspection = inspectRecovery(database, canonical);
    if (inspection.unchanged) return { changed: false, count: 28, integrity: 'ok' };
    const directory = path.join(root, '.dev', 'recovery-backups');
    requireDevelopmentPath(root, directory); fs.mkdirSync(directory, { recursive: true });
    backupPath = path.join(directory, 'catalog-recovery-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex') + '.sqlite');
    database.exec("VACUUM INTO '" + backupPath.replace(/'/g, "''") + "'");
    const backup = new DatabaseSync(backupPath, { readOnly: true });
    try { integrity(backup); assert.deepEqual(snapshot(backup), inspection.before); } finally { backup.close(); }
    const current = await developmentStatus();
    for (const key of ['identity', 'projectRoot', 'dataDir', 'pid', 'backendPid', 'ready']) assert.deepEqual(current[key], initial[key]);
    check(catalogDigest(loadApprovedCatalog(root)) === catalogDigest(canonical), 'canonical_source_changed_during_preparation');
    const outcome = replaceCatalog(database, canonical, inspection.before);
    integrity(database);
    return { ...outcome, databasePath, backupPath, integrity: 'ok', backupIntegrity: 'ok' };
  } catch (error) {
    // Keep the verified backup on any failure; never retry a data change implicitly.
    if (backupPath) error.backupPath = backupPath;
    throw error;
  } finally { database.close(); }
}

module.exports = { RECOVERY_EVENT, catalogDigest, loadApprovedCatalog, validateCatalog,
  requireDevelopmentPath, seedDevelopmentProducts, snapshot, integrity, inspectRecovery, replaceCatalog, recoverDevelopment };

if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== '--recover') {
    console.error('Uso explícito: node scripts/development-catalog.js --recover'); process.exitCode = 1;
  } else {
    recoverDevelopment(path.resolve(__dirname, '..')).then(result => console.log(JSON.stringify(result))).catch(error => {
      console.error(JSON.stringify({ success: false, reason: error.code === 'ERR_ASSERTION' ? 'integrity_or_preservation_check_failed' : error.message,
        backupPath: error.backupPath || null })); process.exitCode = 1;
    });
  }
}
