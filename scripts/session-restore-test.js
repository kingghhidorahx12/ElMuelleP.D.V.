const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');

function extract(source, name) {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, `Missing function ${name}`);
  return match[0];
}

function harness(response, options = {}) {
  const calls = [];
  const element = () => ({
    value: 'previous draft', textContent: 'previous operator data', resetCount: 0,
    reset() { this.value = ''; this.resetCount += 1; },
    attributes: new Map(), listeners: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    addEventListener(name, handler) { this.listeners.set(name, handler); },
    classList: { values: new Set(),
      add(name) { this.values.add(name); },
      remove(name) { this.values.delete(name); },
      toggle(name, force) { if (force) this.values.add(name); else this.values.delete(name); }
    }, focus() {}
  });
  const nodes = new Map();
  const form = element();
  const password = element();
  const modal = element();
  const preferences = new Map();
  const documentListeners = new Map();
  const document = { body: element(), hidden: false,
    addEventListener(name, handler) { documentListeners.set(name, handler); }
  };
  const state = {
    sessionAuthenticated: true, sessionToken: 'cached-indicator',
    currentUser: { id: 'cached-user', role: 'admin' },
    settings: {}, ticket: [], products: [], sales: [], inventoryEntries: [],
    paymentMethod: 'efectivo', setupRequired: false
  };
  const context = {
    state, calls, document, console: { warn() {} },
    POS_MOTION_KEY: 'elMuellePosReducedMotion:v1', posReducedMotion: false,
    ticketLabelInterval: 0, ticketLabelTimeout: 0, ticketLabelShowsSale: false,
    localStorage: {
      getItem(key) { return preferences.get(key) ?? null; },
      setItem(key, value) { preferences.set(key, value); }
    },
    $: (id) => {
      if (!nodes.has(id)) nodes.set(id, element());
      return nodes.get(id);
    },
    $$: (selector) => selector === '.app-view form' ? [form]
      : selector === 'input[type="password"]' ? [password] : [modal],
    window: { setTimeout() {}, setInterval() {}, clearTimeout() {}, clearInterval() {} },
    fetch: async () => ({ ok: true }),
    fetchJson: async () => { if (options.error) throw options.error; return response; },
    applyPublicSettings(settings) { state.settings = settings; },
    saveSessionToken() {},
    setCurrentUser(user) { state.currentUser = user; },
    clearStoredAuthSession() { calls.push('clear-auth'); },
    setAccessLocked(locked) { calls.push(locked ? 'lock' : 'unlock'); },
    clearSelectedProduct() { state.selectedProduct = null; state.detectedQuantity = 0; },
    setPaymentMethod(method) { state.paymentMethod = method; },
    renderTicket() {}, renderAccessScreen() {}, updateShellState() {},
    bindEvents() {}, initSettings() {}, loadSettings: async () => {},
    getLocalDateString: () => '2026-10-16', updateClock() {},
    resetProductForm() {}, resetInventoryEntryForm() {},
    loadCashSessions: async () => { calls.push('cash'); },
    loadProducts: async () => { calls.push('products'); if (options.productsReady) await options.productsReady; },
    loadSales: async () => { calls.push('sales'); },
    setInventoryMode() {}, setProductMode() {}, setSettingsMode() {}, setReportsMode() {},
    updateScaleUi() {}, updateCashGateUi() {}, maximizeApplicationWindow() {}
  };
  vm.createContext(context);
  vm.runInContext(['saveLocalPreference', 'applyPosMotionPreference', 'updateTicketLabelText',
    'syncTicketLabelRotation', 'closeProductConfirm', 'logoutToAccess', 'restoreAuthSession', 'init']
    .map((name) => extract(frontend, name)).join('\n'), context);
  return { context, state, calls, nodes, form, password, preferences, documentListeners };
}

for (const role of ['admin', 'employee']) {
  test(`server-confirmed ${role}: identity restored before unlocking`, async () => {
    let release;
    const productsReady = new Promise((resolve) => { release = resolve; });
    const user = { id: `synthetic-${role}`, name: `Prueba ${role}`, role };
    const h = harness({ authenticated: true, user, settings: {} }, { productsReady });
    const initialization = h.context.init();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.calls.includes('unlock'), false, 'Must wait for initialization');
    assert.equal(h.state.currentUser.id, user.id, 'Use server identity, not cached identity');
    assert.equal(h.state.currentUser.role, role);
    release();
    await initialization;
    assert.equal(h.state.sessionAuthenticated, true);
    assert.equal(h.calls.filter((call) => call === 'unlock').length, 1);
    assert.equal(h.calls.at(-1), 'unlock');
    assert.equal(h.state.ticket.length, 0, 'Do not restore an old ticket');
    assert.equal(h.nodes.get('posMotionToggle').attributes.get('aria-pressed'), 'false');
    assert.equal(h.documentListeners.has('visibilitychange'), true);
    h.nodes.get('posMotionToggle').listeners.get('click')();
    assert.equal(h.preferences.get(h.context.POS_MOTION_KEY), 'true');
    assert.equal(h.context.document.body.classList.values.has('pos-motion-reduced'), true);
    assert.equal(h.state.sessionAuthenticated, true, 'Motion preference cannot change authentication');
    assert.equal(h.state.currentUser.id, user.id);
  });
}

for (const name of ['absent', 'invalid-or-expired']) {
  test(`${name} session: cached admin cannot unlock the UI`, async () => {
    const h = harness({ authenticated: false, user: null, settings: {} });
    await h.context.init();
    assert.equal(h.state.sessionAuthenticated, false);
    assert.equal(h.state.sessionToken, '');
    assert.equal(h.calls.includes('unlock'), false);
    assert.equal(h.calls.includes('lock'), true);
    assert.equal(h.calls.includes('products'), false);
  });
}

test('session request failure keeps UI locked', async () => {
  const h = harness(null, { error: Object.assign(new Error('Unauthorized'), { status: 401 }) });
  await h.context.init();
  assert.equal(h.calls.includes('unlock'), false);
  assert.equal(h.calls.includes('lock'), true);
});

test('logout discards prior operator drafts, cached records and rendered sensitive data', () => {
  const h = harness(null);
  Object.assign(h.state, {
    ticket: [{ productId: 'synthetic-item' }], sales: [{ id: 'synthetic-sale' }],
    products: [{}], inventoryEntries: [{}], generatedReport: { rows: [['previous operator']] },
    discount: 10, paymentReference: 'previous reference', employeePinDrafts: { synthetic: 'draft' },
    settingsDraft: [{}], selectedSaleId: 'synthetic-sale'
  });
  for (const id of ['salesList', 'salesDetail', 'recentSalesList', 'reportTableBody', 'printArea']) h.context.$(id);
  h.context.logoutToAccess();
  for (const key of ['ticket', 'sales', 'products', 'inventoryEntries']) assert.equal(h.state[key].length, 0);
  assert.equal(h.state.generatedReport, null);
  assert.equal(h.state.settingsDraft, null);
  assert.equal(Object.keys(h.state.employeePinDrafts).length, 0);
  assert.equal(h.state.paymentReference, '');
  assert.equal(h.state.discount, 0);
  assert.equal(h.state.selectedSaleId, null);
  for (const id of ['salesList', 'salesDetail', 'recentSalesList', 'reportTableBody', 'printArea']) {
    assert.equal(h.nodes.get(id).textContent, '');
  }
  assert.equal(h.form.resetCount, 1);
  assert.equal(h.password.value, '');
  assert.equal(h.calls.includes('lock'), true);
});

test('expired backend session is rejected using a simulated clock, without running the server', () => {
  const sessions = new Map([['synthetic-expired', { userId: 'synthetic-admin', expiresAt: 100 }]]);
  const context = {
    authSessions: sessions, Date: { now: () => 101 },
    getCookies: () => ({ el_muelle_session: 'synthetic-expired' }),
    readSettings: () => { throw new Error('An expired session must not read user data'); }
  };
  vm.createContext(context);
  vm.runInContext(extract(backend, 'getSessionUser'), context);
  assert.equal(context.getSessionUser({}), null);
  assert.equal(sessions.size, 0);
});
