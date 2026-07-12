const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const SESSION_KEY = "elMuelleSession";
const SESSION_TOKEN_KEY = "elMuelleSessionToken";
const SESSION_EXPIRES_KEY = "elMuelleSessionExpiresAt";
const SESSION_PERSIST_MS = 8 * 60 * 60 * 1000;
const LAST_USER_KEY = "elMuelleLastUser";
const ADMIN_VIEWS = new Set(["dashboard", "products", "inventory", "settings"]);
const USERS = {
  employee: { id: "mostrador", name: "Encargado", role: "employee" },
  admin: { id: "admin", name: "Administrador", role: "admin" }
};
const MIN_SCALE_WEIGHT_KG = 0.1;
const MAX_SCALE_WEIGHT_KG = 40;
const PAGE_SIZE = 12;
const CASH_SHIFTS_KEY = "elMuelleCashShifts";
const CASH_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5];
const DEFAULT_CATEGORIES = [
  "Pescados y mariscos",
  "Carnes selectas",
  "Para el antojo",
  "Condimentos y salsas"
];

const viewLabels = {
  pos: ["Punto de Venta", ""],
  dashboard: ["Panel Administrativo", ""],
  sales: ["Ventas", ""],
  products: ["Productos", ""],
  inventory: ["Inventario", ""],
  billing: ["Facturación", ""],
  reports: ["Corte de Caja", ""],
  settings: ["Configuración", ""]
};

const categoryDescriptions = {
  "Pescados y mariscos": "Fresco",
  "Carnes selectas": "Preparado",
  "Para el antojo": "Congelado",
  "Condimentos y salsas": "Pieza"
};

const categoryBadges = {
  "Pescados y mariscos": "MAR",
  "Carnes selectas": "CAR",
  "Para el antojo": "ANT",
  "Condimentos y salsas": "SAL"
};

const PRODUCT_IMAGE_BASE = "/assets/products";

const productIconSvgs = {
  shrimp: `
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M35 19c-1-7-7-11-15-10-7 1-12 6-12 13 0 8 7 13 15 13h4" />
      <path d="M15 20c4 2 9 2 13-1" />
      <path d="M33 26l7 5M33 31l7 4M20 35l-4 5" />
      <circle cx="18" cy="17" r="1.5" />
    </svg>
  `,
  fish: `
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M6 24c7-9 20-10 31 0-11 10-24 9-31 0Z" />
      <path d="M37 24l6-7v14l-6-7Z" />
      <circle cx="16" cy="22" r="1.5" />
      <path d="M24 16c2 3 2 12 0 16" />
    </svg>
  `,
  meat: `
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M17 28c-6-1-9-6-7-11 2-6 9-8 16-5 8 3 14 10 12 17-2 6-9 9-15 6l-5 5-5-5 4-7Z" />
      <circle cx="25" cy="24" r="5" />
    </svg>
  `,
  snack: `
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M13 16h22l-3 25H16l-3-25Z" />
      <path d="M18 16l2-8h8l2 8M20 23h8M19 30h10" />
    </svg>
  `,
  sauce: `
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M19 7h10v8l4 7v17c0 2-2 4-4 4H19c-2 0-4-2-4-4V22l4-7V7Z" />
      <path d="M19 15h10M17 28h14" />
    </svg>
  `
};

const storedSidebarCollapsed = localStorage.getItem("sidebarCollapsed");
const storedTicketCollapsed = localStorage.getItem("ticketCollapsed");

function loadStoredCashShifts() {
  try {
    const shifts = JSON.parse(localStorage.getItem(CASH_SHIFTS_KEY) || "[]");
    return Array.isArray(shifts) ? shifts : [];
  } catch (error) {
    return [];
  }
}


function normalizeSessionUser(user) {
  const role = user?.role === "admin" ? "admin" : "employee";
  const fallback = role === "admin" ? USERS.admin : USERS.employee;
  const id = String(user?.id || fallback.id);
  const rawName = String(user?.name || fallback.name);
  const name = role === "employee" && id === "mostrador" && rawName.toLowerCase() === "mostrador"
    ? "Encargado"
    : rawName;

  return {
    id,
    name,
    role,
    active: user?.active !== false,
    hasPin: user?.hasPin !== false
  };
}

function clearStoredAuthSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_EXPIRES_KEY);

  // Clean keys from older builds too.
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

function getStoredSessionExpiry() {
  return Number(localStorage.getItem(SESSION_EXPIRES_KEY) || 0);
}

function hasValidStoredSession() {
  const expiresAt = getStoredSessionExpiry();

  if (!expiresAt || expiresAt <= Date.now()) {
    clearStoredAuthSession();
    return false;
  }

  return true;
}

function refreshStoredSessionExpiry() {
  localStorage.setItem(
    SESSION_EXPIRES_KEY,
    String(Date.now() + SESSION_PERSIST_MS)
  );
}

function loadStoredSession() {
  try {
    if (!hasValidStoredSession()) return null;

    const rawSession = localStorage.getItem(SESSION_KEY);
    if (!rawSession) return null;

    return normalizeSessionUser(JSON.parse(rawSession));
  } catch (error) {
    clearStoredAuthSession();
    return null;
  }
}

function loadStoredSessionToken() {
  if (!hasValidStoredSession()) return "";
  return String(localStorage.getItem(SESSION_TOKEN_KEY) || "");
}

function saveSessionToken(token) {
  const normalizedToken = String(token || "");

  if (!normalizedToken) {
    clearStoredAuthSession();
    return;
  }

  localStorage.setItem(SESSION_TOKEN_KEY, normalizedToken);
  refreshStoredSessionExpiry();
}

function getEmployeeSessionUser() {
  const employee = state.settings?.users?.find((user) => {
    return user.role === "employee" && user.active !== false;
  });

  return normalizeSessionUser(employee || USERS.employee);
}

function saveSessionUser(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  refreshStoredSessionExpiry();
}

function isAdminUser() {
  return state.currentUser?.role === "admin";
}

function isAdminView(viewName) {
  return ADMIN_VIEWS.has(viewName);
}

function canAccessView(viewName) {
  return !isAdminView(viewName) || isAdminUser();
}

function getRoleLabel(role) {
  return role === "admin" ? "Administrador" : "Encargado";
}

function setCurrentUser(user) {
  state.currentUser = normalizeSessionUser(user);
  saveSessionUser(state.currentUser);
  renderSessionUi();
}

function renderSessionUi() {
  if (!state.currentUser) return;

  const isAdminMode = isAdminUser();
  document.body.classList.toggle("role-admin", isAdminMode);
  document.body.classList.toggle("role-employee", !isAdminMode);

  if ($("sessionRoleLabel")) $("sessionRoleLabel").textContent = getRoleLabel(state.currentUser.role);
  if ($("sessionUserName")) $("sessionUserName").textContent = state.currentUser.name;
  if ($("sessionSwitchBtn")) {
    $("sessionSwitchBtn").setAttribute("title", "Cambiar usuario");
  }

  $$(".nav-item").forEach((button) => {
    const adminOnly = isAdminView(button.dataset.view);
    const shouldHide = adminOnly && !isAdminMode;
    button.hidden = shouldHide;
    button.classList.remove("locked");
    button.setAttribute("aria-label", button.dataset.label);
  });

  updateNavGroupVisibility();
}

function updateNavGroupVisibility() {
  const nav = document.querySelector(".nav");
  if (!nav) return;

  const children = Array.from(nav.children);
  children.forEach((child, index) => {
    if (!child.classList.contains("nav-group-label")) return;

    let hasVisibleButton = false;
    for (let cursor = index + 1; cursor < children.length; cursor += 1) {
      const next = children[cursor];
      if (next.classList.contains("nav-group-label")) break;
      if (next.classList.contains("nav-item") && !next.hidden) {
        hasVisibleButton = true;
        break;
      }
    }

    child.hidden = !hasVisibleButton;
  });
}

function getActiveEmployees() {
  return (state.settings?.users || [])
    .filter((user) => user.role === "employee" && user.active !== false)
    .map((user) => normalizeSessionUser(user));
}

function getAccessUsers() {
  const admin = normalizeSessionUser(
    (state.settings?.users || []).find((user) => user.role === "admin" && user.active !== false) || USERS.admin
  );
  return [...getActiveEmployees(), admin];
}

function getLastAccessUserId() {
  return localStorage.getItem(LAST_USER_KEY) || USERS.employee.id;
}

function setAccessLocked(isLocked) {
  document.body.classList.toggle("auth-locked", isLocked);
  $("accessScreen")?.classList.toggle("hidden", !isLocked);
}

function selectAccessUser(userId) {
  const users = getAccessUsers();
  const selected = users.find((user) => user.id === userId) || users[0] || getEmployeeSessionUser();
  state.accessSelectedUserId = selected.id;
  localStorage.setItem(LAST_USER_KEY, selected.id);

  $$('[data-access-user]').forEach((button) => {
    const active = button.dataset.accessUser === selected.id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  if ($("accessSelectedName")) {
    $("accessSelectedName").textContent = selected.role === "admin" ? "Cuenta administrativa" : "Cuenta de mostrador";
  }

  if ($("accessPinLabelText")) {
    $("accessPinLabelText").textContent = selected.role === "admin" ? "PIN administrador" : "PIN personal";
  }

  if ($("accessLoginBtn")) {
    $("accessLoginBtn").textContent = selected.role === "admin" ? "Entrar al panel" : "Entrar";
  }
}

function renderAccessScreen() {
  const list = $("accessUserList");
  if (!list) return;

  const users = getAccessUsers();
  list.innerHTML = users
    .map((user) => {
      const isAdmin = user.role === "admin";
      const initial = isAdmin ? "A" : ((user.name || "E").trim().charAt(0).toUpperCase() || "E");
      return [
        '<button class="access-user-card ' + (isAdmin ? 'admin' : '') + '" type="button" data-access-user="' + escapeHtml(user.id) + '">',
        '<span>' + escapeHtml(initial) + '</span>',
        '<strong>' + escapeHtml(user.name) + '</strong>',
        '</button>'
      ].join('');
    })
    .join("");

  $$('[data-access-user]').forEach((button) => {
    button.addEventListener("click", () => selectAccessUser(button.dataset.accessUser));
  });

  const lastUser = users.some((user) => user.id === state.accessSelectedUserId)
    ? state.accessSelectedUserId
    : getLastAccessUserId();
  selectAccessUser(lastUser);
  updateAccessStatus();
}
function updateAccessStatus() {
  if ($("accessServerStatus")) {
    $("accessServerStatus").textContent = "Servidor listo";
  }

  if ($("accessScaleStatus")) {
    $("accessScaleStatus").textContent = scaleState.connected
      ? "Bascula conectada"
      : scaleState.supported
        ? "Bascula lista"
        : "Bascula no disponible en este navegador";
  }
}

function appendAccessPin(value) {
  const input = $("accessPinInput");
  if (!input) return;
  input.value = `${input.value || ""}${value}`.slice(0, 12);
  input.focus();
}

function backspaceAccessPin() {
  const input = $("accessPinInput");
  if (!input) return;
  input.value = input.value.slice(0, -1);
  input.focus();
}

function clearAccessPin() {
  if ($("accessPinInput")) {
    $("accessPinInput").value = "";
    $("accessPinInput").focus();
  }
}

async function confirmAccessLogin() {
  const userId = String(state.accessSelectedUserId || $("employeeUserSelect")?.value || "").trim();
  const pin = String($("accessPinInput")?.value || "").trim();
  const selectedUser = getAccessUsers().find((user) => user.id === userId);

  if (!selectedUser || !pin) {
    showToast("Selecciona usuario e ingresa tu PIN.");
    $("accessPinInput")?.focus();
    return;
  }

  const button = $("accessLoginBtn");
  if (button) button.disabled = true;

  try {
    const result = selectedUser.role === "admin"
      ? await verifyAdminPin(pin)
      : await fetchJson("/api/auth/employee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, pin })
        });

    applyPublicSettings(result.settings);
    state.adminPin = selectedUser.role === "admin" ? pin : "";
    state.sessionToken = result.sessionToken || "";
    state.sessionAuthenticated = Boolean(state.sessionToken);
    saveSessionToken(state.sessionToken);
    setCurrentUser(result.user);
    state.employeeLoginRequired = false;
    clearAccessPin();
    setAccessLocked(false);
    setView(selectedUser.role === "admin" ? "dashboard" : "pos");
    showToast("Sesion iniciada: " + result.user.name + ".");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Usuario o PIN incorrecto.");
    $("accessPinInput")?.focus();
    $("accessPinInput")?.select();
  } finally {
    if (button) button.disabled = false;
  }
}
function logoutToAccess() {
  state.adminPin = "";
  state.sessionToken = "";
  state.sessionAuthenticated = false;
  state.employeeLoginRequired = true;
  clearStoredAuthSession();
  renderAccessScreen();
  setAccessLocked(true);
  updateShellState();
  window.setTimeout(() => $("accessPinInput")?.focus(), 0);
}
function renderEmployeeLogin() {
  const select = $("employeeUserSelect");
  if (!select) return;

  const employees = getActiveEmployees();
  select.innerHTML = employees
    .map((employee) => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)}</option>`)
    .join("");

  if (state.currentUser?.role === "employee") {
    select.value = state.currentUser.id;
  }
}

function openEmployeeAccess(required = false) {
  state.employeeLoginRequired = required || !state.sessionAuthenticated;
  logoutToAccess();
}

function closeEmployeeAccess() {
  if (state.employeeLoginRequired && !state.sessionAuthenticated) {
    showToast("Debes iniciar sesión para usar el punto de venta.");
    return;
  }

  $("employeeAuthModal")?.classList.add("hidden");
  state.employeeLoginRequired = false;
}

async function confirmEmployeeAccess() {
  const userId = String($("employeeUserSelect")?.value || "").trim();
  const pin = String($("employeePinInput")?.value || "").trim();

  if (!userId || !pin) {
    showToast("Selecciona tu usuario e ingresa tu PIN.");
    $("employeePinInput")?.focus();
    return;
  }

  const button = $("employeeAuthConfirmBtn");
  if (button) button.disabled = true;

  try {
    const result = await fetchJson("/api/auth/employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, pin })
    });

    applyPublicSettings(result.settings);
    state.adminPin = "";
    state.sessionToken = result.sessionToken || "";
    state.sessionAuthenticated = Boolean(state.sessionToken);
    saveSessionToken(state.sessionToken);
    setCurrentUser(result.user);
    state.employeeLoginRequired = false;
    $("employeeAuthModal")?.classList.add("hidden");
    setView("pos");
    showToast(`Sesión iniciada: ${result.user.name}.`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Usuario o PIN incorrecto.");
    $("employeePinInput")?.focus();
    $("employeePinInput")?.select();
  } finally {
    if (button) button.disabled = false;
  }
}

function openAdminAccess(viewName = null) {
  state.pendingAdminView = viewName;
  const label = viewLabels[viewName]?.[0] || "administracion";

  if ($("authMessage")) {
    $("authMessage").textContent = viewName
      ? `Ingresa el PIN para abrir ${label}.`
      : "Ingresa el PIN para activar el modo administrador.";
  }

  if ($("authPinInput")) $("authPinInput").value = "";
  $("authModal")?.classList.remove("hidden");
  window.setTimeout(() => $("authPinInput")?.focus(), 0);
}

function closeAuthModal() {
  $("authModal")?.classList.add("hidden");
  state.pendingAdminView = null;
}

async function confirmAdminAccess() {
  const pin = String($("authPinInput")?.value || "").trim();

  if (!pin) {
    showToast("Ingresa el PIN de administrador.");
    $("authPinInput")?.focus();
    return;
  }

  const confirmButton = $("authConfirmBtn");
  if (confirmButton) confirmButton.disabled = true;

  try {
    const result = await verifyAdminPin(pin);
    const nextView = state.pendingAdminView;

    state.adminPin = pin;
    state.sessionToken = result.sessionToken || "";
    state.sessionAuthenticated = Boolean(state.sessionToken);
    saveSessionToken(state.sessionToken);
    applyPublicSettings(result.settings);
    setCurrentUser(result.user || USERS.admin);
    $("employeeAuthModal")?.classList.add("hidden");
    closeAuthModal();
    showToast("Modo administrador activo.");

    if (nextView) {
      setView(nextView);
    } else {
      updateShellState();
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "PIN incorrecto.");
    $("authPinInput")?.focus();
    $("authPinInput")?.select();
  } finally {
    if (confirmButton) confirmButton.disabled = false;
  }
}

function useEmployeeSession() {
  closeAuthModal();
  logoutToAccess();
}

function getCashShiftTimestamp(shift) {
  return new Date(shift?.closedAt || shift?.openedAt || 0).getTime() || 0;
}

function mergeCashShifts(...shiftGroups) {
  const shiftMap = new Map();

  shiftGroups.flat().forEach((shift) => {
    if (!shift?.id) return;

    const current = shiftMap.get(shift.id);
    const shouldReplace =
      !current ||
      (shift.status === "closed" && current.status !== "closed") ||
      getCashShiftTimestamp(shift) >= getCashShiftTimestamp(current);

    if (shouldReplace) {
      shiftMap.set(shift.id, shift);
    }
  });

  return [...shiftMap.values()].sort((a, b) => {
    return getCashShiftTimestamp(a) - getCashShiftTimestamp(b);
  });
}

const storedSessionUser = loadStoredSession();
const storedSessionToken = loadStoredSessionToken();

const state = {
  products: [],
  sales: [],
  inventoryEntries: [],
  currentUser: storedSessionUser || normalizeSessionUser(USERS.employee),
  sessionToken: storedSessionToken,
  sessionAuthenticated: Boolean(storedSessionUser && storedSessionToken),
  employeeLoginRequired: false,
  adminPin: "",
  settings: {
    users: [normalizeSessionUser(USERS.employee), normalizeSessionUser(USERS.admin)],
    updatedAt: null
  },
  settingsDraft: null,
  employeePinDrafts: {},
  pendingAdminView: null,
  activeView: "pos",
  activeCategory: "all",
  activeUnitFilter: "all",
  currentPage: 1,
  selectedProduct: null,
  detectedQuantity: 0,
  quantitySource: "manual",
  ticket: [],
  paymentMethod: "efectivo",
  discount: 0,
  editingProductId: null,
  inventoryEditingId: null,
  selectedSaleId: null,
  productConfirmResolver: null,
  posStep: "product",
  cashShifts: loadStoredCashShifts(),
  cashCounterVisible: false,
  currentCutTotals: {
    total: 0,
    profit: 0,
    count: 0,
    cash: 0,
    card: 0,
    transfer: 0,
    canceled: 0
  },
  sidebarCollapsed:
    storedSidebarCollapsed === null
      ? window.innerWidth < 760
      : storedSidebarCollapsed === "true",
  ticketCollapsed: true
};

const scaleState = {
  supported: "serial" in navigator,
  connected: false,
  port: null,
  reader: null,
  requestTimer: null,
  raw: "",
  buffer: "",
  weightKg: 0,
  stable: false,
  baudRate: Number(localStorage.getItem("scaleBaudRate") || 9600),
  unit: localStorage.getItem("scaleUnit") || "kg",
  command: localStorage.getItem("scaleCommand") || "P",
  pollMs: Number(localStorage.getItem("scalePollMs") || 800),
  lastRequestAt: null
};

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function on(element, eventName, handler) {
  if (element) {
    element.addEventListener(eventName, handler);
  }
}

function money(value) {
  return Number(value || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN"
  });
}


function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function closeTicketDrawer() {
  if (state.activeView === "pos" && !state.ticketCollapsed) {
    setPosStep("product");
  }
}

function handleTicketOutsideClick(event) {
  if (state.activeView !== "pos" || state.ticketCollapsed) return;
  const target = event.target;
  if (
    target.closest(".ticket-panel") ||
    target.closest("#ticketToggleBtn") ||
    target.closest("#ticketSideToggleBtn") ||
    target.closest(".modal")
  ) {
    return;
  }
  closeTicketDrawer();
}

function getManualQuantityValue() {
  const product = state.selectedProduct;
  const value = String($("manualQuantityInput")?.value || "").trim();
  if (product?.unit === "kg") return Number(value.replace(",", ".") || 0);
  return Number(value.replace(/\D/g, "") || 0);
}

function formatManualQuantityInput() {
  const input = $("manualQuantityInput");
  const product = state.selectedProduct;
  if (!input || !product) return;

  if (product.unit === "kg") {
    const digits = input.value.replace(/\D/g, "").slice(0, 6);
    input.dataset.rawDigits = digits;
    input.value = (Number(digits || 0) / 1000).toFixed(3);
    input.setSelectionRange(input.value.length, input.value.length);
    return;
  }

  const digits = input.value.replace(/\D/g, "").slice(0, 3);
  input.value = digits || "1";
  input.setSelectionRange(input.value.length, input.value.length);
}

function updateManualQuantityUi() {
  const product = state.selectedProduct;
  const isKg = product?.unit === "kg";
  if ($("manualQuantityLabelText")) {
    $("manualQuantityLabelText").textContent = isKg ? "Peso manual (kg)" : "Cantidad (pzas)";
  }
  if ($("manualQuantityHint")) {
    $("manualQuantityHint").textContent = isKg
      ? "Escribe gramos: 1250 = 1.250 kg."
      : "Escribe el numero de piezas.";
  }
  if ($("manualQuantityInput")) {
    $("manualQuantityInput").placeholder = isKg ? "0.000" : "1";
    $("manualQuantityInput").inputMode = isKg ? "numeric" : "numeric";
  }
}

function setPaymentMethod(method = "efectivo") {
  const nextMethod = ["efectivo", "tarjeta", "transferencia"].includes(method) ? method : "efectivo";
  state.paymentMethod = nextMethod;
  $$(".pay-method").forEach((button) => {
    button.classList.toggle("active", button.dataset.method === nextMethod);
  });
  updatePaymentUi();
}

function updatePaymentUi() {
  const panel = $("paymentReferencePanel");
  const input = $("paymentReferenceInput");
  const label = $("paymentReferenceLabel");
  const requiresReference = state.paymentMethod === "tarjeta" || state.paymentMethod === "transferencia";

  if (panel) panel.hidden = !requiresReference;
  if (!input) return;

  if (!requiresReference) {
    input.value = "";
    state.paymentReference = "";
    return;
  }

  if (label) {
    label.textContent = state.paymentMethod === "tarjeta"
      ? "Autorizacion de tarjeta"
      : "Referencia de transferencia";
  }
  input.placeholder = state.paymentMethod === "tarjeta"
    ? "Ej. voucher, ultimos 4 o autorizacion"
    : "Ej. folio, cuenta o banco";
}

function setInventoryMode(mode = "entry") {
  const validMode = ["entry", "stock", "history"].includes(mode) ? mode : "entry";
  const root = document.querySelector(".inventory-management-layout");
  if (root) root.dataset.inventoryMode = validMode;
  $$('[data-inventory-mode-btn]').forEach((button) => {
    button.classList.toggle("active", button.dataset.inventoryModeBtn === validMode);
  });
}

function setSettingsMode(mode = "scale") {
  const validMode = ["scale", "users"].includes(mode) ? mode : "scale";
  const root = document.querySelector(".settings-layout");
  if (root) root.dataset.settingsMode = validMode;
  $$('[data-settings-mode-btn]').forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsModeBtn === validMode);
  });
}
function quantityText(quantity, unit) {
  return unit === "kg"
    ? `${Number(quantity || 0).toFixed(3)} kg`
    : `${Number(quantity || 0).toFixed(0)} pza`;
}

function getEffectiveQuantity(product) {
  const detectedQuantity = Number(state.detectedQuantity || 0);

  if (
    product?.unit === "kg" &&
    detectedQuantity <= 0 &&
    scaleState.connected &&
    Number(scaleState.weightKg || 0) > 0
  ) {
    return Number(scaleState.weightKg || 0);
  }

  return detectedQuantity;
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

function getCategories() {
  const categoriesFromProducts = [
    ...new Set(state.products.map((product) => product.category).filter(Boolean))
  ];

  return [
    "all",
    ...DEFAULT_CATEGORIES,
    ...categoriesFromProducts.filter((category) => {
      return !DEFAULT_CATEGORIES.includes(category);
    })
  ];
}

function getUnitLabel(unit) {
  return unit === "kg" ? "kg" : "pieza";
}

function getProductIconKey(product) {
  const text = `${product?.name || ""} ${product?.category || ""}`.toLowerCase();

  if (/camaron|camarón|surimi|pulpo|calamar|jaiba|marisco/.test(text)) return "shrimp";
  if (/carne|arrachera|costilla|chistorra|pastor|hamburguesa/.test(text)) return "meat";
  if (/salsa|condimento|aderezo/.test(text)) return "sauce";
  if (/nugget|boneless|dedo|papa|antojo/.test(text)) return "snack";
  return "fish";
}

function getProductIcon(product) {
  return productIconSvgs[getProductIconKey(product)] || productIconSvgs.fish;
}

function getProductImagePath(product, extension = "png") {
  return `${PRODUCT_IMAGE_BASE}/${encodeURIComponent(product.id)}.${extension}`;
}

function getProductSalesMap() {
  const productMap = new Map();

  state.sales
    .filter((sale) => getSaleStatus(sale) !== "cancelada")
    .forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const current = productMap.get(item.productId) || {
          quantity: 0,
          total: 0
        };

        current.quantity += Number(item.quantity || 0);
        current.total += Number(item.total || 0);
        productMap.set(item.productId, current);
      });
    });

  return productMap;
}

function getProductHeatClass(product, productSalesMap) {
  const values = [...productSalesMap.values()].map((item) => Number(item.total || 0));
  const max = Math.max(...values, 0);
  const productTotal = Number(productSalesMap.get(product.id)?.total || 0);

  if (max <= 0 || productTotal <= 0) return "heat-none";

  const ratio = productTotal / max;

  if (ratio >= 0.75) return "heat-best";
  if (ratio >= 0.35) return "heat-good";
  return "heat-slow";
}

function updateClock() {
  const clockText = $("clockText");
  if (!clockText) return;

  const parts = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).formatToParts(new Date());

  const hour = parts.find((part) => part.type === "hour")?.value || "--";
  const minute = parts.find((part) => part.type === "minute")?.value || "--";
  const period = (parts.find((part) => part.type === "dayPeriod")?.value || "")
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  clockText.innerHTML = `
    <span class="sidebar-clock-time">${hour}:${minute}</span>
    <span class="sidebar-clock-period">${period}</span>
  `;
  clockText.setAttribute("aria-label", `${hour}:${minute} ${period}`.trim());
}

function estimateNextTicketId() {
  const maxNumber = state.sales.reduce((max, sale) => {
    const match = String(sale.id || "").match(/^T-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `T-${String(maxNumber + 1).padStart(6, "0")}`;
}

function updateTicketId() {
  const nextTicketId = estimateNextTicketId();
  const ticketId = $("ticketId");
  const drawerTicketId = $("drawerTicketId");

  if (ticketId) ticketId.textContent = nextTicketId;
  if (drawerTicketId) drawerTicketId.textContent = nextTicketId;
}

function getTicketTotal() {
  const subtotal = state.ticket.reduce((sum, item) => sum + Number(item.total || 0), 0);
  return Math.max(subtotal - state.discount, 0);
}

function setPosStep(step) {
  const nextStep = ["product", "checkout"].includes(step) ? step : "product";

  state.posStep = nextStep;
  state.ticketCollapsed = nextStep !== "checkout";
  localStorage.setItem("ticketCollapsed", String(state.ticketCollapsed));
  updateShellState();
}

function updateShellState() {
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  document.body.classList.toggle("ticket-collapsed", state.ticketCollapsed);
  document.body.classList.toggle("not-pos", state.activeView !== "pos");
  document.body.classList.toggle("ticket-has-items", state.ticket.length > 0);
  renderSessionUi();
  document.body.classList.toggle(
    "product-selected",
    state.activeView === "pos" && state.posStep === "product" && Boolean(state.selectedProduct)
  );
  document.body.classList.toggle("pos-step-product", state.activeView === "pos" && state.posStep === "product");
  document.body.classList.remove("pos-step-weight");
  document.body.classList.toggle("pos-step-checkout", state.activeView === "pos" && state.posStep === "checkout");

  const posLayout = document.querySelector(".pos-layout");
  if (posLayout) {
    posLayout.dataset.step = state.posStep;
  }

  const sidebarButton = $("sidebarToggleBtn");
  const mobileSidebarButton = $("mobileSidebarToggleBtn");
  const sidebarToggleIcon = $("sidebarToggleIcon");
  const ticketButton = $("ticketToggleBtn");
  const ticketSideButton = $("ticketSideToggleBtn");
  const ticketSideIcon = $("ticketSideToggleIcon");
  const ticketSideCount = $("ticketSideCount");

  if (sidebarButton) {
    sidebarButton.setAttribute(
      "aria-label",
      state.sidebarCollapsed ? "Mostrar menú" : "Ocultar menú"
    );
    sidebarButton.setAttribute("title", state.sidebarCollapsed ? "Mostrar menú" : "Ocultar menú");
  }

  if (mobileSidebarButton) {
    mobileSidebarButton.textContent = state.sidebarCollapsed ? "›" : "‹";
    mobileSidebarButton.setAttribute(
      "aria-label",
      state.sidebarCollapsed ? "Mostrar menú" : "Ocultar menú"
    );
    mobileSidebarButton.setAttribute("title", state.sidebarCollapsed ? "Mostrar menú" : "Ocultar menú");
  }

  if (sidebarToggleIcon) {
    sidebarToggleIcon.textContent = state.sidebarCollapsed ? "›" : "‹";
  }

  if (ticketButton) {
    const count = state.ticket.length;
    const countText = count === 0 ? "0" : String(count);
    const isCompactTopbar = window.innerWidth < 760;
    ticketButton.textContent =
      isCompactTopbar
        ? `${count} - ${money(getTicketTotal())}`
        : `Venta - ${countText} - ${money(getTicketTotal())}`;
    const ticketLabel = state.activeView === "pos" && state.posStep === "checkout"
      ? "Cerrar venta actual"
      : "Abrir venta actual";
    ticketButton.setAttribute("aria-label", ticketLabel);
    ticketButton.setAttribute("title", ticketLabel);
    ticketButton.setAttribute(
      "aria-expanded",
      String(state.activeView === "pos" && state.posStep === "checkout")
    );
    ticketButton.classList.toggle("active", state.activeView === "pos" && state.posStep === "checkout");
  }

  if (ticketSideButton) {
    const isOpen = state.activeView === "pos" && !state.ticketCollapsed;
    ticketSideButton.setAttribute("aria-label", isOpen ? "Ocultar venta" : "Mostrar venta");
    ticketSideButton.setAttribute("title", isOpen ? "Ocultar venta" : "Mostrar venta");
  }

  if (ticketSideIcon) {
    ticketSideIcon.textContent = state.ticketCollapsed ? "‹" : "›";
  }

  if (ticketSideCount) {
    ticketSideCount.textContent = String(state.ticket.length);
    ticketSideCount.hidden = state.ticket.length === 0;
  }

  $$("[data-pos-step]").forEach((button) => {
    const isActive = button.dataset.posStep === state.posStep;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "step" : "false");
  });
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  localStorage.setItem("sidebarCollapsed", String(state.sidebarCollapsed));
  updateShellState();
}

function toggleTicketPanel(forceOpen = false) {
  if (forceOpen || state.posStep !== "checkout") {
    setPosStep("checkout");
    return;
  }

  setPosStep("product");
}

function setView(viewName) {
  if (!canAccessView(viewName)) {
    openAdminAccess(viewName);
    return;
  }

  state.activeView = viewName;

  $$(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  $$(".app-view").forEach((view) => {
    view.classList.toggle("active", view.id === `${viewName}View`);
  });

  const [title, subtitle] = viewLabels[viewName] || viewLabels.pos;
  $("pageTitle").textContent = title;
  $("pageSubtitle").textContent = subtitle;
  updateShellState();

  if (viewName === "sales") loadSalesAdmin();
  if (viewName === "dashboard") loadDashboard();
  if (viewName === "billing") loadRecentSales();
  if (viewName === "reports") loadCashCut();
  if (viewName === "inventory") loadInventoryEntries();
  if (viewName === "products") renderAdminProducts();
  if (viewName === "settings") {
    updateScaleUi();
    renderUserSettings();
  }
}

async function fetchJson(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.sessionToken) {
    headers.set("X-Session-Token", state.sessionToken);
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "No se pudo completar la operación.");
  }

  return response.json();
}

function normalizePublicSettings(settings = {}) {
  const incomingUsers = Array.isArray(settings.users) ? settings.users : [];
  const users = incomingUsers
    .map((user) => normalizeSessionUser(user))
    .filter((user) => user.active !== false);

  if (!users.some((user) => user.role === "admin")) {
    users.push(normalizeSessionUser(USERS.admin));
  }

  if (!users.some((user) => user.role === "employee")) {
    users.push(normalizeSessionUser(USERS.employee));
  }

  return {
    users,
    updatedAt: settings.updatedAt || null
  };
}

function cloneSettingsUsers(users = []) {
  return users.map((user) => ({ ...normalizeSessionUser(user) }));
}

function applyPublicSettings(settings = {}) {
  state.settings = normalizePublicSettings(settings);
  state.settingsDraft = cloneSettingsUsers(state.settings.users);

  if (!isAdminUser()) {
    const matchingEmployee = state.settings.users.find((user) => {
      return user.role === "employee" && user.id === state.currentUser?.id;
    });

    state.currentUser = normalizeSessionUser(matchingEmployee || getEmployeeSessionUser());
    saveSessionUser(state.currentUser);
  } else {
    const adminUser = state.settings.users.find((user) => user.role === "admin");
    if (adminUser) {
      state.currentUser = normalizeSessionUser(adminUser);
      saveSessionUser(state.currentUser);
    }
  }

  renderSessionUi();
  if ($("accessScreen") && !$("accessScreen").classList.contains("hidden")) {
    renderAccessScreen();
  }
}

async function loadSettings() {
  try {
    const settings = await fetchJson("/api/settings");
    applyPublicSettings(settings);
  } catch (error) {
    console.error(error);
    applyPublicSettings(state.settings);
    showToast("No se pudo cargar la configuración de usuarios.");
  }
}

async function verifyAdminPin(pin) {
  const normalizedPin = String(pin || "").trim();

  if (!normalizedPin) {
    throw new Error("Ingresa el PIN de administrador.");
  }

  return fetchJson("/api/auth/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ pin: normalizedPin })
  });
}

async function restoreAuthSession() {
  if (!state.sessionToken) return false;

  try {
    const result = await fetchJson("/api/auth/session");
    applyPublicSettings(result.settings);
    state.sessionAuthenticated = true;
    saveSessionToken(state.sessionToken);
    setCurrentUser(result.user);
    return true;
  } catch (error) {
    console.warn(error.message || error);
    state.sessionToken = "";
    state.sessionAuthenticated = false;
    clearStoredAuthSession();
    return false;
  }
}

function getSettingsDraftUsers() {
  if (!Array.isArray(state.settingsDraft)) {
    state.settingsDraft = cloneSettingsUsers(state.settings.users);
  }

  return state.settingsDraft;
}

function renderUserSettings() {
  const adminNameInput = $("adminUserNameInput");
  const employeesList = $("employeesList");

  if (!adminNameInput || !employeesList) return;

  const draftUsers = getSettingsDraftUsers();
  const adminUser = draftUsers.find((user) => user.role === "admin") || normalizeSessionUser(USERS.admin);
  const employees = draftUsers.filter((user) => user.role === "employee");

  adminNameInput.value = adminUser.name;

  if (employees.length === 0) {
    employeesList.innerHTML = '<p class="empty-list">Agrega al menos un empleado de mostrador.</p>';
    return;
  }

  employeesList.innerHTML = employees
    .map((employee) => {
      return `
        <article class="user-row">
          <div class="user-row-identity">
            <strong>${escapeHtml(employee.name)}</strong>
            <span>Empleado de mostrador · PIN ${employee.hasPin ? "configurado" : "pendiente"}</span>
          </div>
          <label class="user-pin-reset">
            <span>Nuevo PIN</span>
            <input
              type="password"
              inputmode="numeric"
              maxlength="12"
              placeholder="Conservar"
              data-employee-pin="${escapeHtml(employee.id)}"
              value="${escapeHtml(employee.pendingPin || state.employeePinDrafts[employee.id] || "")}"
            />
          </label>
          <button class="user-remove-btn" type="button" data-remove-employee="${escapeHtml(employee.id)}">
            Quitar
          </button>
        </article>
      `;
    })
    .join("");

  employeesList.querySelectorAll("[data-employee-pin]").forEach((input) => {
    input.addEventListener("input", () => {
      const employeeId = input.dataset.employeePin;
      state.employeePinDrafts[employeeId] = input.value.trim();
      const employee = getSettingsDraftUsers().find((user) => user.id === employeeId);
      if (employee) employee.pendingPin = input.value.trim();
    });
  });

  employeesList.querySelectorAll("[data-remove-employee]").forEach((button) => {
    button.addEventListener("click", () => removeEmployeeDraft(button.dataset.removeEmployee));
  });
}

function updateAdminNameDraft() {
  const input = $("adminUserNameInput");
  const draftUsers = getSettingsDraftUsers();
  const adminUser = draftUsers.find((user) => user.role === "admin");

  if (input && adminUser) {
    adminUser.name = input.value;
  }
}

function addEmployeeDraft() {
  const nameInput = $("newEmployeeNameInput");
  const pinInput = $("newEmployeePinInput");
  const name = String(nameInput?.value || "").trim();
  const pin = String(pinInput?.value || "").trim();

  if (!name) {
    showToast("Escribe el nombre del empleado.");
    nameInput?.focus();
    return;
  }

  if (!/^\d{4,12}$/.test(pin)) {
    showToast("El PIN inicial debe tener de 4 a 12 dígitos.");
    pinInput?.focus();
    return;
  }

  const draftUsers = getSettingsDraftUsers();
  const duplicated = draftUsers.some((user) => {
    return user.name.toLocaleLowerCase("es-MX") === name.toLocaleLowerCase("es-MX");
  });

  if (duplicated) {
    showToast("Ya existe un usuario con ese nombre.");
    nameInput?.focus();
    return;
  }

  const employeeId = `empleado-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
  state.employeePinDrafts[employeeId] = pin;
  draftUsers.push({
    id: employeeId,
    name,
    role: "employee",
    active: true,
    hasPin: false,
    pendingPin: pin
  });

  nameInput.value = "";
  pinInput.value = "";
  renderUserSettings();
  nameInput.focus();
}

function removeEmployeeDraft(employeeId) {
  const draftUsers = getSettingsDraftUsers();
  const employees = draftUsers.filter((user) => user.role === "employee");

  if (employees.length <= 1) {
    showToast("Debe quedar al menos un empleado de mostrador.");
    return;
  }

  state.settingsDraft = draftUsers.filter((user) => user.id !== employeeId);
  delete state.employeePinDrafts[employeeId];
  renderUserSettings();
}

function resetUserSettings() {
  state.settingsDraft = cloneSettingsUsers(state.settings.users);
  state.employeePinDrafts = {};

  ["currentAdminPinInput", "newAdminPinInput", "confirmAdminPinInput", "newEmployeeNameInput", "newEmployeePinInput"].forEach((id) => {
    const input = $(id);
    if (input) input.value = "";
  });

  renderUserSettings();
  showToast("Cambios descartados.");
}

async function saveUserSettings() {
  const currentPin = String($("currentAdminPinInput")?.value || "").trim();
  const newPin = String($("newAdminPinInput")?.value || "").trim();
  const confirmPin = String($("confirmAdminPinInput")?.value || "").trim();
  const adminName = String($("adminUserNameInput")?.value || "").trim();

  if (!adminName) {
    showToast("Escribe el nombre del administrador.");
    $("adminUserNameInput")?.focus();
    return;
  }

  if (!currentPin) {
    showToast("Ingresa el PIN actual para guardar.");
    $("currentAdminPinInput")?.focus();
    return;
  }

  if (newPin && !/^\d{4,12}$/.test(newPin)) {
    showToast("El PIN nuevo debe tener de 4 a 12 dígitos.");
    $("newAdminPinInput")?.focus();
    return;
  }

  if (newPin !== confirmPin) {
    showToast("La confirmación del PIN no coincide.");
    $("confirmAdminPinInput")?.focus();
    return;
  }

  const draftUsers = getSettingsDraftUsers();
  const employees = draftUsers.filter((user) => user.role === "employee");

  if (employees.length === 0) {
    showToast("Agrega al menos un empleado de mostrador.");
    return;
  }

  const users = [
    {
      ...(draftUsers.find((user) => user.role === "admin") || USERS.admin),
      name: adminName,
      role: "admin",
      active: true
    },
    ...employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      role: "employee",
      active: true
    }))
  ];

  const employeePins = Object.fromEntries(
    employees
      .map((employee) => [employee.id, String(employee.pendingPin || state.employeePinDrafts[employee.id] || "").trim()])
      .filter(([, pin]) => Boolean(pin))
  );

  const saveButton = $("saveUserSettingsBtn");
  if (saveButton) saveButton.disabled = true;

  try {
    const settings = await fetchJson("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        adminPin: currentPin,
        newAdminPin: newPin,
        users,
        employeePins
      })
    });

    state.adminPin = newPin || currentPin;
    applyPublicSettings(settings);

    state.employeePinDrafts = {};

    ["currentAdminPinInput", "newAdminPinInput", "confirmAdminPinInput", "newEmployeeNameInput", "newEmployeePinInput"].forEach((id) => {
      const input = $(id);
      if (input) input.value = "";
    });

    renderUserSettings();
    updateShellState();
    showToast("Usuarios y PIN actualizados.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo guardar la configuración.");
    $("currentAdminPinInput")?.focus();
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

async function loadCashShifts() {
  try {
    const serverShifts = await fetchJson("/api/cash-shifts");
    state.cashShifts = mergeCashShifts(serverShifts, loadStoredCashShifts());
    localStorage.setItem(CASH_SHIFTS_KEY, JSON.stringify(state.cashShifts));

    if (state.cashShifts.length !== serverShifts.length) {
      saveCashShifts();
    }
  } catch (error) {
    console.warn("No se pudieron sincronizar los cortes.", error);
    state.cashShifts = loadStoredCashShifts();
  }
}

async function loadProducts() {
  try {
    state.products = await fetchJson("/api/products");

    renderCategories();
    renderProducts();
    renderWeighPanel();
    renderAdminProducts();
    renderInventoryEntryProductOptions();
    renderInventory();
    renderInventorySummary();
    updateProductProjection();
    updateInventoryEntryProjection();
    if (state.activeView === "dashboard") renderDashboard();
  } catch (error) {
    console.error(error);
    showToast("No se pudieron cargar los productos.");
  }
}

async function loadSales() {
  try {
    state.sales = await fetchJson("/api/sales");
    updateTicketId();
    renderProducts();
    if (state.activeView === "dashboard") renderDashboard();
  } catch (error) {
    console.error(error);
  }
}

function getFilteredProducts() {
  const query = $("searchInput").value.trim().toLowerCase();

  return state.products.filter((product) => {
    const isActive = product.active !== false;
    const matchesCategory =
      state.activeCategory === "all" || product.category === state.activeCategory;
    const matchesUnit =
      state.activeUnitFilter === "all" || product.unit === state.activeUnitFilter;
    const matchesSearch = product.name.toLowerCase().includes(query);

    return isActive && matchesCategory && matchesUnit && matchesSearch;
  });
}

function renderCategories() {
  const categoryGrid = $("categoryGrid");
  if (!categoryGrid) return;

  categoryGrid.innerHTML = getCategories()
    .map((category) => {
      const label = category === "all" ? "Todos" : category;

      return `
        <button class="category-card ${state.activeCategory === category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">
          <strong>${escapeHtml(label)}</strong>
        </button>
      `;
    })
    .join("");

  $$(".category-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.category;
      state.currentPage = 1;
      renderCategories();
      renderProducts();
    });
  });
}

function renderProducts() {
  const productGrid = $("productGrid");
  if (!productGrid) return;

  const filteredProducts = getFilteredProducts();
  const totalPages = Math.max(Math.ceil(filteredProducts.length / PAGE_SIZE), 1);

  if (state.currentPage > totalPages) {
    state.currentPage = totalPages;
  }

  const start = (state.currentPage - 1) * PAGE_SIZE;
  const visibleProducts = filteredProducts.slice(start, start + PAGE_SIZE);

  $("pageIndicator").textContent = `Página ${state.currentPage} de ${totalPages}`;
  $("prevPageBtn").disabled = state.currentPage <= 1;
  $("nextPageBtn").disabled = state.currentPage >= totalPages;

  if (visibleProducts.length === 0) {
    productGrid.innerHTML = `<p class="empty-state">No hay productos con ese filtro.</p>`;
    return;
  }

  const productSalesMap = getProductSalesMap();

  productGrid.innerHTML = visibleProducts
    .map((product) => {
      const badge = categoryBadges[product.category] || "PRO";
      const stock =
        typeof product.stockQuantity === "number"
          ? quantityText(product.stockQuantity, product.unit)
          : "Sin conteo";
      const stockLabel = stock === "Sin conteo" ? stock : `Disp. ${stock}`;
      const iconKey = getProductIconKey(product);
      const heatClass = getProductHeatClass(product, productSalesMap);
      const imagePath = getProductImagePath(product, "jpg");
      const imageFallbackPath = getProductImagePath(product, "png");

      return `
        <button class="product-card ${escapeHtml(heatClass)} ${state.selectedProduct?.id === product.id ? "selected" : ""}" type="button" data-id="${escapeHtml(product.id)}">
          <span class="product-media">
            <img src="${escapeHtml(imagePath)}" data-fallback="${escapeHtml(imageFallbackPath)}" alt="" loading="lazy" onerror="if (!this.dataset.fallbackTried) { this.dataset.fallbackTried = '1'; this.src = this.dataset.fallback; } else { this.parentElement.classList.add('missing'); this.remove(); }" />
            <span class="product-icon icon-${escapeHtml(iconKey)}">${getProductIcon(product)}</span>
            <span class="product-badge">${escapeHtml(badge)}</span>
          </span>
          <strong>${escapeHtml(product.name)}</strong>
          <span class="product-price">${money(product.price)} / ${escapeHtml(getUnitLabel(product.unit))}</span>
          <small class="product-stock">${escapeHtml(stockLabel)}</small>
        </button>
      `;
    })
    .join("");

  $$(".product-card").forEach((button) => {
    button.addEventListener("click", () => {
      const product = state.products.find((item) => item.id === button.dataset.id);
      selectProduct(product);
    });
  });
}

function setFilter(filter) {
  state.activeUnitFilter = filter;
  state.currentPage = 1;

  $("filterAll").classList.toggle("active", filter === "all");
  $("filterKg").classList.toggle("active", filter === "kg");
  $("filterPiece").classList.toggle("active", filter === "pieza");

  renderProducts();
}

function selectProduct(product) {
  if (!product) return;

  if (state.selectedProduct?.id === product.id) {
    clearSelectedProduct();
    setPosStep("product");
    return;
  }

  state.selectedProduct = product;
  state.quantitySource = product.unit === "kg" && scaleState.connected ? "scale" : "manual";
  state.detectedQuantity = product.unit === "kg" ? (scaleState.connected ? scaleState.weightKg : 0) : 1;

  if (product.unit === "pieza") {
    addCurrentProductToTicket({ nextStep: "product" });
    return;
  }

  renderWeighPanel();
  renderProducts();
  setPosStep("product");

  if (scaleState.connected) {
    requestScaleWeight();
  }
}

function clearSelectedProduct() {
  state.selectedProduct = null;
  state.detectedQuantity = 0;
  state.quantitySource = "manual";
  renderWeighPanel();
  renderProducts();
}

function renderWeighPanel() {
  const product = state.selectedProduct;

  if (!product) {
    $("weighProductName").textContent = "Selecciona un producto";
    $("weighDescription").textContent = "El peso entra automático al conectar la báscula.";
    $("weighPrice").textContent = "$0.00";
    $("weighQuantityLabel").textContent = "Peso";
    $("weighQuantity").textContent = "0.000 kg";
    $("weighTotal").textContent = "$0.00";
    $("confirmWeightBtn").disabled = true;
    return;
  }

  const isKg = product.unit === "kg";
  const quantity = getEffectiveQuantity(product);
  const total = quantity * Number(product.price || 0);
  const lowKgWeight = isKg && quantity > 0 && quantity < MIN_SCALE_WEIGHT_KG;
  const invalidKgWeight = isKg && quantity > MAX_SCALE_WEIGHT_KG;

  if (isKg && quantity > 0 && quantity !== Number(state.detectedQuantity || 0)) {
    state.detectedQuantity = quantity;
    state.quantitySource = "scale";
  }

  $("weighProductName").textContent = product.name;
  $("weighDescription").textContent = isKg
    ? invalidKgWeight
      ? `Peso máximo permitido: ${MAX_SCALE_WEIGHT_KG.toFixed(0)} kg.`
      : lowKgWeight
        ? "Lectura baja; confirma que el producto esté sobre la báscula."
      : scaleState.connected
        ? "Lectura tomada desde la báscula conectada."
        : "Captura manual disponible solo con PIN."
    : "Producto por pieza listo para agregar.";
  $("weighPrice").textContent = `${money(product.price)} / ${getUnitLabel(product.unit)}`;
  $("weighQuantityLabel").textContent = isKg ? "Peso" : "Cantidad";
  $("weighQuantity").textContent = quantityText(state.detectedQuantity, product.unit);
  $("weighTotal").textContent = money(total);
  $("confirmWeightBtn").disabled = quantity <= 0 || invalidKgWeight;
}

function addCurrentProductToTicket({ nextStep = "checkout" } = {}) {
  const product = state.selectedProduct;

  if (!product) {
    showToast("Selecciona un producto.");
    return;
  }

  const quantity = getEffectiveQuantity(product);

  if (quantity <= 0) {
    showToast("Falta peso o cantidad.");
    return;
  }

  if (product.unit === "kg" && quantity > MAX_SCALE_WEIGHT_KG) {
    showToast(`Peso maximo permitido: ${MAX_SCALE_WEIGHT_KG.toFixed(0)} kg.`);
    return;
  }

  state.detectedQuantity = quantity;

  const price = Number(product.price || 0);
  const costPrice = Number(product.costPrice || 0);
  const total = roundCurrency(quantity * price);
  const lineCost = roundCurrency(quantity * costPrice);
  const existingIndex = product.unit === "pieza"
    ? state.ticket.findIndex((item) => item.productId === product.id && item.unit === product.unit && Number(item.price) === price)
    : -1;
  let toastMessage = "Producto agregado.";

  if (existingIndex >= 0) {
    const existing = state.ticket[existingIndex];
    const nextQuantity = Number(existing.quantity || 0) + quantity;
    existing.quantity = nextQuantity;
    existing.total = roundCurrency(nextQuantity * price);
    existing.lineCost = roundCurrency(nextQuantity * costPrice);
    existing.grossProfit = roundCurrency(existing.total - existing.lineCost);
    existing.source = state.quantitySource;
    toastMessage = `${product.name}: ${quantityText(nextQuantity, product.unit)} en venta.`;
  } else {
    state.ticket.push({
      productId: product.id,
      name: product.name,
      category: product.category,
      unit: product.unit,
      price,
      costPrice,
      quantity,
      total,
      lineCost,
      grossProfit: roundCurrency(total - lineCost),
      source: state.quantitySource
    });
    toastMessage = product.unit === "pieza"
      ? `${product.name}: ${quantityText(quantity, product.unit)} en venta.`
      : "Producto agregado.";
  }

  clearSelectedProduct();
  renderTicket();
  setPosStep(nextStep);
  showToast(toastMessage);
}

function renderTicket() {
  const ticketItems = $("ticketItems");

  if (state.ticket.length === 0) {
    ticketItems.innerHTML = `<p class="empty-state">Agrega productos para iniciar.</p>`;
  } else {
    ticketItems.innerHTML = state.ticket
      .map((item, index) => {
        return `
          <article class="ticket-item">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(quantityText(item.quantity, item.unit))} × ${money(item.price)}</span>
              <small>${item.source === "scale" ? "Báscula" : "Manual"}</small>
            </div>
            <b>${money(item.total)}</b>
            <button class="icon-btn" type="button" data-remove-item="${index}" aria-label="Quitar producto">×</button>
          </article>
        `;
      })
      .join("");
  }

  $$("[data-remove-item]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ticket.splice(Number(button.dataset.removeItem), 1);
      renderTicket();
    });
  });

  updateTotals();
}

function updateTotals() {
  const subtotal = state.ticket.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const total = getTicketTotal();
  const count = state.ticket.length;
  const cashOpen = hasOpenCashForSales();

  const saleLabel = count === 0 ? "Sin productos" : `${count} producto${count === 1 ? "" : "s"}`;

  if ($("subtotalText")) $("subtotalText").textContent = money(subtotal);
  if ($("discountText")) $("discountText").textContent = money(state.discount);
  if ($("totalText")) $("totalText").textContent = money(total);
  if ($("saleBarCount")) $("saleBarCount").textContent = saleLabel;
  if ($("ticketToggleBtn")) {
    $("ticketToggleBtn").textContent = `Venta - ${count} - ${money(total)}`;
  }
  if ($("chargeBtn")) {
    $("chargeBtn").textContent = cashOpen
      ? `Cobrar ${money(total)}`
      : count === 0
        ? "Abrir caja para vender"
        : "Abrir caja para cobrar";
    $("chargeBtn").disabled = count === 0 || !cashOpen;
  }
  if ($("clearTicketBtn")) $("clearTicketBtn").disabled = count === 0;
  updateCashGateUi();
  updateShellState();
}

function clearTicket() {
  if (state.ticket.length === 0) return;

  if (!window.confirm("¿Vaciar la venta actual?")) return;

  state.ticket = [];
  state.discount = 0;
  clearSelectedProduct();
  renderTicket();
  setPosStep("product");
}

function openManualModal() {
  if (!state.selectedProduct) {
    showToast("Selecciona un producto.");
    return;
  }

  const quantityInput = $("manualQuantityInput");
  $("adminPinInput").value = isAdminUser() ? state.adminPin : "";
  quantityInput.value = state.selectedProduct.unit === "pieza" ? "1" : "0.000";
  quantityInput.dataset.rawDigits = state.selectedProduct.unit === "kg" ? "" : "1";
  updateManualQuantityUi();
  $("manualModal").classList.remove("hidden");
  const focusTarget = isAdminUser() ? quantityInput : $("adminPinInput");
  focusTarget?.focus();
  focusTarget?.select?.();
}

function closeManualModal() {
  $("manualModal").classList.add("hidden");
}

async function saveManualQuantity() {
  const pin = $("adminPinInput").value.trim();
  const quantity = getManualQuantityValue();

  if (!isAdminUser()) {
    try {
      await verifyAdminPin(pin);
    } catch (error) {
      console.error(error);
      showToast(error.message || "PIN incorrecto.");
      $("adminPinInput")?.focus();
      return;
    }
  }

  if (quantity <= 0) {
    showToast("Ingresa una cantidad válida.");
    return;
  }

  if (
    state.selectedProduct?.unit === "kg" &&
    (quantity < MIN_SCALE_WEIGHT_KG || quantity > MAX_SCALE_WEIGHT_KG)
  ) {
    showToast(`Peso permitido: ${MIN_SCALE_WEIGHT_KG.toFixed(3)} a ${MAX_SCALE_WEIGHT_KG.toFixed(0)} kg.`);
    return;
  }

  state.detectedQuantity = quantity;
  state.quantitySource = "manual";
  closeManualModal();
  renderWeighPanel();
  showToast("Captura aplicada.");
}

function openInvoiceDecisionModal() {
  if (state.ticket.length === 0) return;

  if (!hasOpenCashForSales()) {
    showToast("Abre caja antes de cobrar.");
    goToCashRegister();
    return;
  }

  $("invoiceDecisionModal").classList.remove("hidden");
}

function closeInvoiceDecisionModal() {
  $("invoiceDecisionModal").classList.add("hidden");
}

async function chargeSale(invoiceRequested = false) {
  if (state.ticket.length === 0) {
    showToast("No hay productos en la venta.");
    return;
  }

  const cashShift = getSalesCashShift();
  if (!cashShift) {
    closeInvoiceDecisionModal();
    showToast("Abre caja antes de guardar la venta.");
    goToCashRegister();
    return;
  }

  const requiresReference = state.paymentMethod === "tarjeta" || state.paymentMethod === "transferencia";
  const referenceInput = $("paymentReferenceInput");
  state.paymentReference = String(referenceInput?.value || state.paymentReference || "").trim();

  if (requiresReference && !state.paymentReference) {
    closeInvoiceDecisionModal();
    setPosStep("checkout");
    updatePaymentUi();
    showToast(state.paymentMethod === "tarjeta" ? "Captura la autorizacion de la tarjeta." : "Captura la referencia de transferencia.");
    window.setTimeout(() => referenceInput?.focus(), 80);
    return;
  }

  const subtotal = state.ticket.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const total = Math.max(subtotal - state.discount, 0);

  try {
    const sale = await fetchJson("/api/sales", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: state.ticket,
        paymentMethod: state.paymentMethod,
        paymentDetails: {
          reference: state.paymentReference
        },
        subtotal,
        discount: state.discount,
        total,
        invoiceRequested,
        cashShiftId: cashShift.id,
        cashShiftDate: cashShift.date
      })
    });

    buildReceipt(sale, invoiceRequested);

    state.ticket = [];
    state.discount = 0;
    state.paymentReference = "";
    if (referenceInput) referenceInput.value = "";
    setPaymentMethod("efectivo");
    state.sales.push(sale);
    closeInvoiceDecisionModal();
    renderTicket();
    clearSelectedProduct();
    setPosStep("product");
    await loadProducts();
    updateTicketId();
    renderCashRegister();

    showToast(`Venta ${sale.id} guardada.`);

    window.setTimeout(() => {
      window.print();
    }, 200);

    if (invoiceRequested) {
      setView("billing");
      $("invoiceSaleId").value = sale.id;
      window.setTimeout(() => $("invoiceRfc").focus(), 100);
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo guardar la venta.");
  }
}

function buildReceipt(sale, invoiceRequested = false) {
  const itemsHtml = (sale.items || [])
    .map((item) => {
      return `
        <div class="receipt-item">
          <span>${escapeHtml(item.name)}</span>
          <span>${escapeHtml(quantityText(item.quantity, item.unit))}</span>
          <span>${money(item.total)}</span>
        </div>
      `;
    })
    .join("");
  const paymentReference = String(sale.paymentDetails?.reference || sale.paymentReference || "").trim();
  const referenceHtml = paymentReference
    ? `<div class="receipt-row"><span>Referencia</span><strong>${escapeHtml(paymentReference)}</strong></div>`
    : "";

  $("printArea").innerHTML = `
    <div class="receipt">
      <img class="receipt-logo" src="/assets/brand/el-muelle-logo.png" alt="El Muelle" />
      <h1>EL MUELLE</h1>
      <h2>Pescaderia</h2>
      <p>${escapeHtml(sale.id)} - ${new Date(sale.createdAt).toLocaleString("es-MX")}</p>
      <div class="line"></div>
      ${itemsHtml}
      <div class="line"></div>
      <div class="receipt-row"><span>Subtotal</span><strong>${money(sale.subtotal)}</strong></div>
      <div class="receipt-row"><span>Total</span><strong>${money(sale.total)}</strong></div>
      <div class="receipt-row"><span>Pago</span><strong>${escapeHtml(getPaymentLabel(sale.paymentMethod))}</strong></div>
      ${referenceHtml}
      <div class="receipt-row"><span>Atendio</span><strong>${escapeHtml(sale.operator?.name || state.currentUser?.name || "Encargado")}</strong></div>
      <div class="line"></div>
      <p>${invoiceRequested ? "Factura pendiente de datos fiscales." : "Gracias por su compra."}</p>
    </div>
  `;
}

function openProductConfirm({ title, message, summary, confirmLabel = "Confirmar" }) {
  $("productConfirmTitle").textContent = title;
  $("productConfirmMessage").textContent = message;
  $("productConfirmSummary").textContent = summary;
  $("productConfirmYesBtn").textContent = confirmLabel;
  $("productConfirmModal").classList.remove("hidden");

  return new Promise((resolve) => {
    state.productConfirmResolver = resolve;
  });
}

function closeProductConfirm(value = false) {
  $("productConfirmModal").classList.add("hidden");

  if (typeof state.productConfirmResolver === "function") {
    state.productConfirmResolver(value);
    state.productConfirmResolver = null;
  }
}

function calculateFinancialProjection(quantity, unitCost, salePrice) {
  const normalizedQuantity = Math.max(Number(quantity || 0), 0);
  const normalizedCost = Math.max(Number(unitCost || 0), 0);
  const normalizedPrice = Math.max(Number(salePrice || 0), 0);
  const investment = normalizedQuantity * normalizedCost;
  const revenue = normalizedQuantity * normalizedPrice;
  const profit = revenue - investment;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  return {
    quantity: normalizedQuantity,
    unitCost: normalizedCost,
    salePrice: normalizedPrice,
    investment,
    revenue,
    profit,
    margin,
    unitProfit: normalizedPrice - normalizedCost
  };
}

function updateProductProjection() {
  if (!$('productInvestmentTotal')) return;

  const projection = calculateFinancialProjection(
    $('productStockInput')?.value,
    $('productCostInput')?.value,
    $('productPriceInput')?.value
  );
  const unit = getUnitLabel($('productUnitInput')?.value || 'kg');

  const hasUsefulData = projection.quantity > 0 && projection.unitCost > 0 && projection.salePrice > 0;

  $('productInvestmentTotal').textContent = money(projection.investment);
  $('productProjectedRevenue').textContent = money(projection.revenue);
  $('productProjectedProfit').textContent = hasUsefulData ? money(projection.profit) : 'Pendiente';
  $('productMarginPercent').textContent = hasUsefulData ? `${projection.margin.toFixed(2)}%` : 'Pendiente';
  $('productUnitProfit').textContent = hasUsefulData ? `${money(projection.unitProfit)} / ${unit}` : 'Pendiente';
  $('productProjectionStatus').textContent = hasUsefulData
    ? `${quantityText(projection.quantity, $('productUnitInput')?.value || 'kg')} disponibles`
    : 'Captura costo y existencia';
  $('productProjectedProfit').classList.toggle('negative-value', hasUsefulData && projection.profit < 0);
}

function resetProductForm() {
  state.editingProductId = null;
  $("productForm").reset();
  $("productCategoryInput").value = "Pescados y mariscos";
  $("productUnitInput").value = "kg";
  $("productFormStatusTitle").textContent = "Agregar producto";
  $("productFormStatusText").textContent = "";
  $("saveProductBtn").textContent = "Guardar";
  updateProductProjection();
}

function fillProductForm(product) {
  state.editingProductId = product.id;
  $("productNameInput").value = product.name;
  $("productCategoryInput").value = product.category;
  $("productUnitInput").value = product.unit;
  $("productPriceInput").value = product.price;
  $("productCostInput").value = product.costPrice || "";
  $("productStockInput").value =
    typeof product.stockQuantity === "number" ? product.stockQuantity : "";
  $("productMinStockInput").value =
    typeof product.minStock === "number" ? product.minStock : "";
  $("productFormStatusTitle").textContent = "Editar producto";
  $("productFormStatusText").textContent = "";
  $("saveProductBtn").textContent = "Actualizar";
  updateProductProjection();
  $("productNameInput").focus();
}

async function saveProductFromAdmin(event) {
  event.preventDefault();

  const payload = {
    name: $("productNameInput").value.trim(),
    category: $("productCategoryInput").value,
    unit: $("productUnitInput").value,
    price: Number($("productPriceInput").value || 0),
    costPrice: Number($("productCostInput").value || 0),
    stockQuantity: $("productStockInput").value === "" ? null : Number($("productStockInput").value),
    minStock: $("productMinStockInput").value === "" ? null : Number($("productMinStockInput").value)
  };

  if (!payload.name || payload.price <= 0) {
    showToast("Completa producto y precio.");
    return;
  }

  const isEditing = Boolean(state.editingProductId);
  const currentProduct = state.products.find((product) => product.id === state.editingProductId);

  if (currentProduct) {
    payload.active = currentProduct.active !== false;
  }

  const confirmed = await openProductConfirm({
    title: isEditing ? "Actualizar producto" : "Agregar producto",
    message: "Confirma el movimiento de catálogo.",
    summary: `${payload.name} · ${money(payload.price)} / ${getUnitLabel(payload.unit)}`,
    confirmLabel: isEditing ? "Actualizar" : "Agregar"
  });

  if (!confirmed) return;

  try {
    await fetchJson(isEditing ? `/api/products/${state.editingProductId}` : "/api/products", {
      method: isEditing ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    await loadProducts();
    resetProductForm();
    showToast(isEditing ? "Producto actualizado." : "Producto agregado.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo guardar.");
  }
}

function renderAdminProducts() {
  const list = $("productAdminList");
  if (!list) return;

  const query = $("productAdminSearch").value.trim().toLowerCase();
  const category = $("productAdminCategoryFilter").value;
  const filteredProducts = state.products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(query);
    const matchesCategory = category === "all" || product.category === category;
    return matchesSearch && matchesCategory;
  });

  if (filteredProducts.length === 0) {
    list.innerHTML = `<p class="empty-state">No hay productos con esos filtros.</p>`;
    return;
  }

  list.innerHTML = filteredProducts
    .map((product) => {
      const isActive = product.active !== false;

      const stock = typeof product.stockQuantity === "number" ? Number(product.stockQuantity) : 0;
      const projection = calculateFinancialProjection(stock, product.costPrice, product.price);
      const stockLabel = typeof product.stockQuantity === "number"
        ? quantityText(product.stockQuantity, product.unit)
        : "Sin conteo";

      return `
        <article class="admin-row ${isActive ? "" : "muted-row"}">
          <div class="admin-product-main">
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(product.category)} · Stock ${escapeHtml(stockLabel)}</span>
            <small>${Number(product.costPrice || 0) > 0 && typeof product.stockQuantity === "number"
              ? `Costo ${money(product.costPrice)} · Margen ${projection.margin.toFixed(2)}% · Ganancia inventario ${money(projection.profit)}`
              : "Costo o existencia pendiente de capturar"}</small>
          </div>
          <b>${money(product.price)} / ${escapeHtml(getUnitLabel(product.unit))}</b>
          <span class="status-badge ${isActive ? "ok" : "off"}">${isActive ? "Activo" : "Inactivo"}</span>
          <div class="row-actions">
            <button class="quiet-btn" type="button" data-edit-product="${escapeHtml(product.id)}">Editar</button>
            <button class="quiet-btn" type="button" data-toggle-product="${escapeHtml(product.id)}">
              ${isActive ? "Pausar" : "Activar"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  $$("[data-edit-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = state.products.find((item) => item.id === button.dataset.editProduct);
      if (product) fillProductForm(product);
    });
  });

  $$("[data-toggle-product]").forEach((button) => {
    button.addEventListener("click", () => toggleProductStatus(button.dataset.toggleProduct));
  });
}

async function toggleProductStatus(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  const isActive = product.active !== false;
  const confirmed = await openProductConfirm({
    title: isActive ? "Pausar producto" : "Activar producto",
    message: "Confirma el cambio de disponibilidad.",
    summary: product.name,
    confirmLabel: isActive ? "Pausar" : "Activar"
  });

  if (!confirmed) return;

  try {
    await fetchJson(`/api/products/${product.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...product,
        active: !isActive
      })
    });

    await loadProducts();
    showToast(isActive ? "Producto pausado." : "Producto activo.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo cambiar el producto.");
  }
}

function getStockStatus(product) {
  if (typeof product.stockQuantity !== "number") return ["Sin conteo", "neutral"];
  if (typeof product.minStock === "number" && product.stockQuantity <= product.minStock) {
    return ["Bajo", "warn"];
  }
  return ["Ok", "ok"];
}

function renderInventoryEntryProductOptions() {
  const select = $("inventoryEntryProductInput");
  if (!select) return;

  const currentValue = select.value;
  const options = [...state.products]
    .filter((product) => product.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((product) => {
      return `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} · ${escapeHtml(getUnitLabel(product.unit))}</option>`;
    })
    .join("");

  select.innerHTML = `<option value="">Selecciona un producto</option>${options}`;

  if (state.products.some((product) => product.id === currentValue)) {
    select.value = currentValue;
  }
}

function getSelectedInventoryEntryProduct() {
  const productId = $("inventoryEntryProductInput")?.value || "";
  return state.products.find((product) => product.id === productId) || null;
}

function populateInventoryEntryDefaults() {
  const product = getSelectedInventoryEntryProduct();

  if (!product) {
    updateInventoryEntryProjection();
    return;
  }

  $("inventoryEntryUnitCostInput").value = Number(product.costPrice || 0) || "";
  $("inventoryEntrySalePriceInput").value = Number(product.price || 0) || "";
  updateInventoryEntryProjection();
}

function updateInventoryEntryProjection() {
  if (!$("entryPurchaseTotal")) return;

  const product = getSelectedInventoryEntryProduct();
  const quantity = Number($("inventoryEntryQuantityInput")?.value || 0);
  const unitCost = Number($("inventoryEntryUnitCostInput")?.value || 0);
  const salePrice = Number($("inventoryEntrySalePriceInput")?.value || 0);
  const currentStock = product && typeof product.stockQuantity === "number"
    ? Number(product.stockQuantity)
    : 0;
  const currentCost = product ? Number(product.costPrice || 0) : 0;
  const newStock = currentStock + Math.max(quantity, 0);
  const currentValue = currentStock * currentCost;
  const purchaseValue = Math.max(quantity, 0) * Math.max(unitCost, 0);
  const weightedCost = newStock > 0 ? (currentValue + purchaseValue) / newStock : 0;
  const projection = calculateFinancialProjection(quantity, unitCost, salePrice);
  const unit = product?.unit || "kg";

  $("inventoryEntryProductName").textContent = product?.name || "Selecciona un producto";
  $("inventoryEntryProductMeta").textContent = product
    ? `${product.category} · Compra y venta por ${getUnitLabel(product.unit)}`
    : "La inversión y ganancia aparecerán aquí.";
  $("entryCurrentStock").textContent = quantityText(currentStock, unit);
  $("entryCurrentCost").textContent = `${money(currentCost)} / ${getUnitLabel(unit)}`;
  $("entryPurchaseTotal").textContent = money(projection.investment);
  $("entryProjectedRevenue").textContent = money(projection.revenue);
  $("entryProjectedProfit").textContent = money(projection.profit);
  $("entryMargin").textContent = `${projection.margin.toFixed(2)}%`;
  $("entryNewStock").textContent = quantityText(newStock, unit);
  $("entryWeightedCost").textContent = `${money(weightedCost)} / ${getUnitLabel(unit)}`;
  $("entryProjectedProfit").classList.toggle("negative-value", projection.profit < 0);
}

function resetInventoryEntryForm() {
  $("inventoryEntryForm")?.reset();
  if ($("inventoryEntryDateInput")) {
    $("inventoryEntryDateInput").value = getLocalDateString();
  }
  updateInventoryEntryProjection();
}

async function loadInventoryEntries() {
  try {
    state.inventoryEntries = await fetchJson("/api/inventory/entries");
    renderInventoryEntryProductOptions();
    renderInventory();
    renderInventorySummary();
    renderInventoryEntries();
    updateInventoryEntryProjection();
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudieron cargar las entradas de inventario.");
  }
}

async function saveInventoryEntry(event) {
  event.preventDefault();

  const product = getSelectedInventoryEntryProduct();
  const payload = {
    productId: product?.id || "",
    quantity: Number($("inventoryEntryQuantityInput")?.value || 0),
    unitCost: Number($("inventoryEntryUnitCostInput")?.value || 0),
    salePrice: Number($("inventoryEntrySalePriceInput")?.value || 0),
    supplier: $("inventoryEntrySupplierInput")?.value.trim() || "",
    receivedAt: $("inventoryEntryDateInput")?.value || getLocalDateString(),
    notes: $("inventoryEntryNotesInput")?.value.trim() || ""
  };

  if (!payload.productId || payload.quantity <= 0 || payload.unitCost <= 0) {
    showToast("Selecciona producto, cantidad y costo de compra.");
    return;
  }

  const projection = calculateFinancialProjection(payload.quantity, payload.unitCost, payload.salePrice);
  const confirmed = await openProductConfirm({
    title: "Registrar entrada",
    message: "La existencia y el costo promedio del producto se actualizarán.",
    summary: `${product.name} · ${quantityText(payload.quantity, product.unit)} · Inversión ${money(projection.investment)} · Ganancia proyectada ${money(projection.profit)}`,
    confirmLabel: "Registrar"
  });

  if (!confirmed) return;

  const button = $("saveInventoryEntryBtn");
  if (button) button.disabled = true;

  try {
    await fetchJson("/api/inventory/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    resetInventoryEntryForm();
    await Promise.all([loadProducts(), loadInventoryEntries()]);
    showToast("Entrada registrada y costo promedio actualizado.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo registrar la entrada.");
  } finally {
    if (button) button.disabled = false;
  }
}

function renderInventorySummary() {
  if (!$("inventoryInvestmentValue")) return;

  const totals = state.products.reduce((acc, product) => {
    if (typeof product.stockQuantity !== "number") return acc;

    const stock = Math.max(Number(product.stockQuantity || 0), 0);
    const cost = Math.max(Number(product.costPrice || 0), 0);
    const price = Math.max(Number(product.price || 0), 0);
    acc.investment += stock * cost;
    acc.revenue += stock * price;
    return acc;
  }, { investment: 0, revenue: 0 });

  $("inventoryInvestmentValue").textContent = money(totals.investment);
  $("inventoryProjectedValue").textContent = money(totals.revenue);
  $("inventoryProjectedProfit").textContent = money(totals.revenue - totals.investment);
  $("inventoryEntriesCount").textContent = String(state.inventoryEntries.length);
}

function renderInventoryEntries() {
  const list = $("inventoryEntriesList");
  if (!list) return;

  const query = $("inventoryEntrySearchInput")?.value.trim().toLowerCase() || "";
  const entries = state.inventoryEntries.filter((entry) => {
    const haystack = `${entry.id || ""} ${entry.productName || ""} ${entry.supplier || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  if (entries.length === 0) {
    list.innerHTML = `<p class="empty-state">No hay entradas con esos criterios.</p>`;
    return;
  }

  list.innerHTML = entries.map((entry) => {
    const date = entry.receivedAt
      ? new Date(`${entry.receivedAt}T12:00:00`).toLocaleDateString("es-MX")
      : new Date(entry.createdAt).toLocaleDateString("es-MX");

    return `
      <article class="inventory-entry-row">
        <div class="inventory-entry-main">
          <strong>${escapeHtml(entry.productName)}</strong>
          <span>${escapeHtml(entry.id)} · ${escapeHtml(date)}${entry.supplier ? ` · ${escapeHtml(entry.supplier)}` : ""}</span>
          <small>${quantityText(entry.quantity, entry.unit)} a ${money(entry.unitCost)} · Costo promedio ${money(entry.weightedAverageCost)}</small>
        </div>
        <div class="inventory-entry-value"><span>Inversión</span><strong>${money(entry.totalCost)}</strong></div>
        <div class="inventory-entry-value"><span>Venta proyectada</span><strong>${money(entry.projectedRevenue)}</strong></div>
        <div class="inventory-entry-value profit"><span>Ganancia</span><strong>${money(entry.projectedProfit)}</strong></div>
        <span class="status-badge ${Number(entry.projectedProfit) >= 0 ? "ok" : "warn"}">${Number(entry.marginPercent || 0).toFixed(2)}%</span>
      </article>
    `;
  }).join("");
}

function renderInventory() {
  const list = $("inventoryList");
  if (!list) return;

  const query = $("inventorySearchInput").value.trim().toLowerCase();
  const category = $("inventoryCategoryFilter").value;
  const filteredProducts = state.products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(query);
    const matchesCategory = category === "all" || product.category === category;
    return matchesSearch && matchesCategory;
  });

  if (filteredProducts.length === 0) {
    list.innerHTML = `<p class="empty-state">No hay productos para mostrar.</p>`;
    return;
  }

  list.innerHTML = filteredProducts
    .map((product) => {
      const [statusLabel, statusKind] = getStockStatus(product);
      const isEditing = state.inventoryEditingId === product.id;
      const stock = typeof product.stockQuantity === "number" ? Number(product.stockQuantity) : 0;
      const stockText = typeof product.stockQuantity === "number"
        ? quantityText(product.stockQuantity, product.unit)
        : "Sin conteo";
      const minText = typeof product.minStock === "number"
        ? quantityText(product.minStock, product.unit)
        : "Sin mínimo";
      const projection = calculateFinancialProjection(stock, product.costPrice, product.price);

      if (isEditing) {
        return `
          <article class="inventory-row editing">
            <div>
              <strong>${escapeHtml(product.name)}</strong>
              <span>${escapeHtml(product.category)} · ${escapeHtml(getUnitLabel(product.unit))}</span>
            </div>
            <label>
              Existencia
              <input type="number" min="0" step="0.001" value="${typeof product.stockQuantity === "number" ? product.stockQuantity : ""}" data-stock-product="${escapeHtml(product.id)}" />
            </label>
            <label>
              Mínimo
              <input type="number" min="0" step="0.001" value="${typeof product.minStock === "number" ? product.minStock : ""}" data-min-product="${escapeHtml(product.id)}" />
            </label>
            <span class="status-badge ${statusKind}">${statusLabel}</span>
            <div class="inventory-actions">
              <button class="solid-btn" type="button" data-save-inventory="${escapeHtml(product.id)}">Guardar</button>
              <button class="quiet-btn" type="button" data-cancel-inventory="${escapeHtml(product.id)}">Cancelar</button>
            </div>
          </article>
        `;
      }

      return `
        <article class="inventory-row financial">
          <div>
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(product.category)} · ${escapeHtml(getUnitLabel(product.unit))}</span>
            <small>Proveedor: ${escapeHtml(product.lastSupplier || "Sin registrar")}</small>
          </div>
          <div class="inventory-metric"><span>Existencia</span><strong>${escapeHtml(stockText)}</strong><small>Mín. ${escapeHtml(minText)}</small></div>
          <div class="inventory-metric"><span>Costo promedio</span><strong>${money(product.costPrice || 0)}</strong><small>Venta ${money(product.price || 0)}</small></div>
          <div class="inventory-metric"><span>Inversión</span><strong>${money(projection.investment)}</strong><small>Ganancia ${money(projection.profit)}</small></div>
          <span class="status-badge ${statusKind}">${statusLabel}</span>
          <button class="quiet-btn" type="button" data-edit-inventory="${escapeHtml(product.id)}">Ajustar</button>
        </article>
      `;
    })
    .join("");

  $$('[data-edit-inventory]').forEach((button) => {
    button.addEventListener('click', () => {
      state.inventoryEditingId = button.dataset.editInventory;
      renderInventory();
    });
  });

  $$('[data-cancel-inventory]').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.inventoryEditingId === button.dataset.cancelInventory) {
        state.inventoryEditingId = null;
      }
      renderInventory();
    });
  });

  $$('[data-save-inventory]').forEach((button) => {
    button.addEventListener('click', () => saveInventory(button.dataset.saveInventory));
  });
}

async function saveInventory(productId) {
  const escapedId = window.CSS && CSS.escape
    ? CSS.escape(productId)
    : String(productId).replace(/"/g, '\"');
  const stockInput = document.querySelector(`[data-stock-product="${escapedId}"]`);
  const minInput = document.querySelector(`[data-min-product="${escapedId}"]`);

  try {
    await fetchJson(`/api/products/${productId}/inventory`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stockQuantity: stockInput.value === "" ? null : Number(stockInput.value),
        minStock: minInput.value === "" ? null : Number(minInput.value)
      })
    });

    await loadProducts();
    state.inventoryEditingId = null;
    showToast("Inventario actualizado.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo actualizar inventario.");
  }
}

function getSaleStatus(sale) {
  return sale.status || "completada";
}

function getPaymentLabel(method) {
  return {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia"
  }[method] || "Efectivo";
}

function getInvoiceLabel(sale) {
  if (!sale.invoice || sale.invoice.status === "no_solicitada") return "Sin factura";
  if (sale.invoice.status === "pendiente_datos") return "Pendiente";
  if (sale.invoice.status === "solicitada") return "Solicitada";
  return "Factura";
}

async function loadSalesAdmin() {
  try {
    state.sales = await fetchJson("/api/sales");
    updateTicketId();
    renderSalesAdmin();
  } catch (error) {
    console.error(error);
    showToast("No se pudieron cargar las ventas.");
  }
}

function renderSalesAdmin() {
  const list = $("salesList");
  if (!list) return;

  syncPeriodInput("salesPeriodFilter", "salesDateInput");
  const query = $("salesSearchInput").value.trim().toLowerCase();
  const filter = $("salesStatusFilter").value;
  const period = $("salesPeriodFilter")?.value || "day";
  const dateString = $("salesDateInput")?.value || getLocalDateString();
  let sales = [...state.sales].reverse();

  sales = sales.filter((sale) => {
    const hasInvoice = getInvoiceLabel(sale) !== "Sin factura";
    const status = getSaleStatus(sale);

    return (
      sale.id.toLowerCase().includes(query) &&
      saleMatchesPeriod(sale, period, dateString) &&
      (filter === "all" || status === filter || (filter === "factura" && hasInvoice))
    );
  });

  if (sales.length === 0) {
    list.innerHTML = `<p class="empty-state">No hay ventas con esos filtros.</p>`;
    renderSaleDetail(null);
    return;
  }

  if (!state.selectedSaleId || !sales.some((sale) => sale.id === state.selectedSaleId)) {
    state.selectedSaleId = sales[0].id;
  }

  list.innerHTML = sales
    .map((sale) => {
      const status = getSaleStatus(sale);
      const invoice = getInvoiceLabel(sale);

      return `
        <button class="sale-row ${sale.id === state.selectedSaleId ? "active" : ""}" type="button" data-sale-id="${escapeHtml(sale.id)}">
          <div>
            <strong>${escapeHtml(sale.id)}</strong>
            <span>${new Date(sale.createdAt).toLocaleString("es-MX")}</span>
          </div>
          <b>${money(sale.total)}</b>
          <span class="status-badge ${status === "cancelada" ? "off" : "ok"}">${status === "cancelada" ? "Cancelada" : "Completada"}</span>
          <small>${escapeHtml(invoice)}</small>
        </button>
      `;
    })
    .join("");

  $$(".sale-row").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSaleId = button.dataset.saleId;
      renderSalesAdmin();
    });
  });

  renderSaleDetail(state.selectedSaleId);
}

function renderSaleDetail(saleId) {
  const panel = $("salesDetail");
  if (!panel) return;

  const sale = state.sales.find((item) => item.id === saleId);

  if (!sale) {
    panel.innerHTML = `
      <div class="empty-detail">
        <span class="eyebrow">Detalle</span>
        <h3>Selecciona una venta</h3>
      </div>
    `;
    return;
  }

  const itemsHtml = (sale.items || [])
    .map((item) => {
      return `
        <article class="detail-item">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(quantityText(item.quantity, item.unit))} × ${money(item.price)}</span>
          <b>${money(item.total)}</b>
        </article>
      `;
    })
    .join("");

  panel.innerHTML = `
    <div class="detail-head">
      <span class="eyebrow">Detalle</span>
      <h3>${escapeHtml(sale.id)}</h3>
      <p>${new Date(sale.createdAt).toLocaleString("es-MX")}</p>
    </div>
    <div class="detail-kpis">
      <article><span>Total</span><strong>${money(sale.total)}</strong></article>
      <article><span>Pago</span><strong>${escapeHtml(getPaymentLabel(sale.paymentMethod))}</strong></article>
      <article><span>Estado</span><strong>${escapeHtml(getSaleStatus(sale))}</strong></article>
      <article><span>Factura</span><strong>${escapeHtml(getInvoiceLabel(sale))}</strong></article>
    </div>
    <div class="detail-items">${itemsHtml}</div>
    <div class="detail-actions">
      <button class="solid-btn" type="button" data-reprint-sale="${escapeHtml(sale.id)}">Reimprimir</button>
      <button class="quiet-btn" type="button" data-invoice-sale="${escapeHtml(sale.id)}">Facturar</button>
      <button class="danger-soft-btn" type="button" data-cancel-sale="${escapeHtml(sale.id)}" ${getSaleStatus(sale) === "cancelada" ? "disabled" : ""}>Cancelar</button>
    </div>
  `;

  on(panel.querySelector("[data-reprint-sale]"), "click", () => {
    buildReceipt(sale, getInvoiceLabel(sale) !== "Sin factura");
    window.print();
  });

  on(panel.querySelector("[data-invoice-sale]"), "click", () => {
    setView("billing");
    $("invoiceSaleId").value = sale.id;
    $("invoiceRfc").focus();
  });

  on(panel.querySelector("[data-cancel-sale]"), "click", () => cancelSale(sale.id));
}

async function cancelSale(saleId) {
  const adminPin = isAdminUser()
    ? state.adminPin
    : window.prompt("PIN de administrador:");

  if (!adminPin) {
    showToast("Se requiere el PIN de administrador.");
    return;
  }

  const reason = window.prompt("Motivo de cancelacion:", "Cancelacion en caja") || "";

  try {
    const updatedSale = await fetchJson(`/api/sales/${saleId}/cancel`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        adminPin,
        reason
      })
    });

    state.sales = state.sales.map((sale) => {
      return sale.id === updatedSale.id ? updatedSale : sale;
    });

    renderSalesAdmin();
    showToast("Venta cancelada.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo cancelar.");
  }
}

async function loadRecentSales() {
  const list = $("recentSalesList");
  if (!list) return;

  try {
    state.sales = await fetchJson("/api/sales");
    updateTicketId();

    syncPeriodInput("recentSalesPeriodFilter", "recentSalesDateInput");
    const period = $("recentSalesPeriodFilter")?.value || "day";
    const dateString = $("recentSalesDateInput")?.value || getLocalDateString();
    const recentSales = [...state.sales]
      .filter((sale) => saleMatchesPeriod(sale, period, dateString))
      .reverse()
      .slice(0, 18);

    if (recentSales.length === 0) {
      list.innerHTML = `<p class="empty-state">Aún no hay ventas.</p>`;
      return;
    }

    list.innerHTML = recentSales
      .map((sale) => {
        return `
          <article class="recent-sale-card">
            <div>
              <strong>${escapeHtml(sale.id)}</strong>
              <span>${new Date(sale.createdAt).toLocaleString("es-MX")}</span>
            </div>
            <b>${money(sale.total)}</b>
            <button class="quiet-btn" type="button" data-sale-id="${escapeHtml(sale.id)}">Usar</button>
          </article>
        `;
      })
      .join("");

    $$("[data-sale-id]").forEach((button) => {
      button.addEventListener("click", () => {
        $("invoiceSaleId").value = button.dataset.saleId;
        $("invoiceRfc").focus();
      });
    });
  } catch (error) {
    console.error(error);
    showToast("No se pudieron cargar los tickets.");
  }
}

async function saveInvoiceRequest(event) {
  event.preventDefault();

  const saleId = $("invoiceSaleId").value.trim();
  const payload = {
    rfc: $("invoiceRfc").value.trim(),
    businessName: $("invoiceName").value.trim(),
    fiscalZip: $("invoiceZip").value.trim(),
    fiscalRegime: $("invoiceRegime").value.trim(),
    cfdiUse: $("invoiceUse").value,
    email: $("invoiceEmail").value.trim()
  };

  if (!saleId || !payload.rfc || !payload.businessName || !payload.fiscalZip || !payload.fiscalRegime || !payload.cfdiUse) {
    showToast("Faltan datos fiscales.");
    return;
  }

  try {
    await fetchJson(`/api/sales/${saleId}/invoice`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    $("invoiceForm").reset();
    await loadRecentSales();
    showToast("Solicitud registrada.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo registrar.");
  }
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  const fallback = getLocalDateString();
  const [year, month, day] = String(dateString || fallback)
    .split("-")
    .map((value) => Number(value));
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
}

function getPeriodRange(period = "day", dateString = getLocalDateString()) {
  if (period === "all") return null;

  const start = parseLocalDate(dateString);
  const end = new Date(start);

  if (period === "week") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 7);
  } else if (period === "month") {
    start.setDate(1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 1);
  } else if (period === "year") {
    start.setMonth(0, 1);
    end.setFullYear(start.getFullYear() + 1, 0, 1);
  } else {
    end.setDate(start.getDate() + 1);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  return { start, end };
}

function saleMatchesPeriod(sale, period, dateString) {
  const range = getPeriodRange(period, dateString);
  if (!range) return true;

  const createdAt = new Date(sale.createdAt);
  return createdAt >= range.start && createdAt < range.end;
}

function syncPeriodInput(periodId, dateId) {
  const periodInput = $(periodId);
  const dateInput = $(dateId);
  if (!periodInput || !dateInput) return;

  if (!dateInput.value) dateInput.value = getLocalDateString();
  dateInput.disabled = periodInput.value === "all";
}

function getSaleProfit(sale) {
  const total = Number(sale.total || 0);

  if (typeof sale.totalCost === "number" && typeof sale.grossProfit === "number") {
    return {
      totalCost: Number(sale.totalCost || 0),
      grossProfit: Number(sale.grossProfit || 0),
      margin: total > 0 ? (Number(sale.grossProfit || 0) / total) * 100 : 0
    };
  }

  const totalCost = (sale.items || []).reduce((sum, item) => {
    return sum + Number(item.quantity || 0) * Number(item.costPrice || 0);
  }, 0);
  const grossProfit = total - totalCost;

  return {
    totalCost,
    grossProfit,
    margin: total > 0 ? (grossProfit / total) * 100 : 0
  };
}

async function loadDashboard() {
  try {
    if (state.products.length === 0) {
      state.products = await fetchJson("/api/products");
    }

    state.sales = await fetchJson("/api/sales");
    updateTicketId();
    renderProducts();
    renderDashboard();
  } catch (error) {
    console.error(error);
    showToast("No se pudo cargar el panel.");
  }
}

function getCompletedSalesForPeriod(period, dateString) {
  return state.sales.filter((sale) => {
    return getSaleStatus(sale) !== "cancelada" && saleMatchesPeriod(sale, period, dateString);
  });
}

function getSalesTotals(sales) {
  return sales.reduce(
    (acc, sale) => {
      const total = Number(sale.total || 0);
      const profit = getSaleProfit(sale);

      acc.total += total;
      acc.cost += profit.totalCost;
      acc.profit += profit.grossProfit;
      acc.count += 1;

      if (sale.paymentMethod === "tarjeta") acc.card += total;
      else if (sale.paymentMethod === "transferencia") acc.transfer += total;
      else acc.cash += total;

      return acc;
    },
    { total: 0, cost: 0, profit: 0, count: 0, cash: 0, card: 0, transfer: 0 }
  );
}

function getProductSalesFromSales(sales) {
  const productMap = new Map();

  sales.forEach((sale) => {
    (sale.items || []).forEach((item) => {
      const current = productMap.get(item.productId) || {
        productId: item.productId,
        name: item.name,
        unit: item.unit,
        quantity: 0,
        total: 0
      };

      current.quantity += Number(item.quantity || 0);
      current.total += Number(item.total || 0);
      productMap.set(item.productId, current);
    });
  });

  return productMap;
}

function renderDashboardList(elementId, items, emptyText, options = {}) {
  const list = $(elementId);
  if (!list) return;

  if (items.length === 0) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
    return;
  }

  list.innerHTML = items
    .map((item, index) => {
      const noRank = options.showRank === false;
      const rank = noRank ? "" : `<span class="dashboard-rank">${index + 1}</span>`;
      const quantity = item.unit ? quantityText(item.quantity || 0, item.unit) : item.detail || "";
      const amount =
        typeof item.total === "number"
          ? `<b>${money(item.total)}</b>`
          : `<b class="${item.kind || ""}">${escapeHtml(item.value || "")}</b>`;

      return `
        <article class="dashboard-row ${noRank ? "no-rank" : ""} ${escapeHtml(item.kind || "")}">
          ${rank}
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(quantity)}</span>
          </div>
          ${amount}
        </article>
      `;
    })
    .join("");
}

function getInventoryAlerts() {
  return state.products
    .filter((product) => {
      return typeof product.stockQuantity === "number" && typeof product.minStock === "number";
    })
    .map((product) => {
      const minStock = Number(product.minStock || 0);
      const stock = Number(product.stockQuantity || 0);
      const ratio = minStock > 0 ? stock / minStock : stock > 0 ? 999 : 0;

      return {
        name: product.name,
        detail: `Existencia ${quantityText(stock, product.unit)} · mínimo ${quantityText(minStock, product.unit)}`,
        value: ratio <= 1 ? "Bajo" : "Ok",
        kind: ratio <= 1 ? "warn" : "ok",
        ratio
      };
    })
    .filter((item) => item.ratio <= 1.25)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 6);
}

function renderDashboard() {
  if (!$("dashboardView")) return;

  syncPeriodInput("dashboardPeriodFilter", "dashboardDateInput");

  const period = $("dashboardPeriodFilter")?.value || "day";
  const dateString = $("dashboardDateInput")?.value || getLocalDateString();
  const sales = getCompletedSalesForPeriod(period, dateString);
  const totals = getSalesTotals(sales);
  const margin = totals.total > 0 ? (totals.profit / totals.total) * 100 : 0;
  const averageTicket = totals.count > 0 ? totals.total / totals.count : 0;
  const productSales = getProductSalesFromSales(sales);
  const topProducts = [...productSales.values()].sort((a, b) => b.total - a.total).slice(0, 6);
  const slowProducts = state.products
    .filter((product) => product.active !== false)
    .map((product) => {
      const sold = productSales.get(product.id);
      return {
        productId: product.id,
        name: product.name,
        unit: product.unit,
        quantity: sold?.quantity || 0,
        total: sold?.total || 0
      };
    })
    .sort((a, b) => a.total - b.total || a.name.localeCompare(b.name))
    .slice(0, 6);
  const todaysSales = getCompletedSalesForPeriod("day", getLocalDateString());
  const todaysTotals = getSalesTotals(todaysSales);
  const activeShift = getSalesCashShift();
  const expectedCash = activeShift ? Number(activeShift.openingAmount || 0) + todaysTotals.cash : 0;

  $("dashboardProfit").textContent = money(totals.profit);
  $("dashboardReinvest").textContent = money(totals.cost);
  $("dashboardCashStatus").textContent = activeShift ? `Abierta · ${money(expectedCash)}` : "Cerrada";
  $("dashboardCashStatus").classList.toggle("ok", Boolean(activeShift));
  $("dashboardCashStatus").classList.toggle("warn", !activeShift);
  $("dashboardTotalSales").textContent = money(totals.total);
  $("dashboardSalesCount").textContent = String(totals.count);
  $("dashboardAverageTicket").textContent = money(averageTicket);
  $("dashboardMargin").textContent = `${margin.toFixed(2)}%`;
  $("dashboardCash").textContent = money(totals.cash);
  $("dashboardCard").textContent = money(totals.card);
  $("dashboardTransfer").textContent = money(totals.transfer);
  $("dashboardExpectedCash").textContent = money(expectedCash);

  renderDashboardList("dashboardTopProducts", topProducts, "Sin ventas en este periodo.");
  renderDashboardList("dashboardSlowProducts", slowProducts, "Sin productos activos.");
  renderDashboardList("dashboardInventoryAlerts", getInventoryAlerts(), "Sin productos en alerta.", {
    showRank: false
  });
}

async function loadCashCut() {
  if (!$("cutDateInput").value) {
    $("cutDateInput").value = getLocalDateString();
  }

  try {
    state.sales = await fetchJson("/api/sales");
    updateTicketId();
    renderCashCut();
  } catch (error) {
    console.error(error);
    showToast("No se pudo cargar el corte.");
  }
}

function renderCashCut() {
  syncPeriodInput("cutPeriodFilter", "cutDateInput");
  const period = $("cutPeriodFilter")?.value || "day";
  const dateString = $("cutDateInput").value || getLocalDateString();
  const periodSales = state.sales.filter((sale) => saleMatchesPeriod(sale, period, dateString));
  const completedSales = periodSales.filter((sale) => getSaleStatus(sale) !== "cancelada");
  const canceledSales = periodSales.length - completedSales.length;
  const totals = completedSales.reduce(
    (acc, sale) => {
      const profit = getSaleProfit(sale);
      const total = Number(sale.total || 0);

      acc.total += total;
      acc.profit += profit.grossProfit;
      acc.count += 1;

      if (sale.paymentMethod === "tarjeta") acc.card += total;
      else if (sale.paymentMethod === "transferencia") acc.transfer += total;
      else acc.cash += total;

      return acc;
    },
    { total: 0, profit: 0, count: 0, cash: 0, card: 0, transfer: 0 }
  );
  const margin = totals.total > 0 ? (totals.profit / totals.total) * 100 : 0;
  state.currentCutTotals = {
    ...totals,
    canceled: canceledSales
  };

  $("cutTotalSales").textContent = money(totals.total);
  $("cutGrossProfit").textContent = money(totals.profit);
  $("cutMargin").textContent = `${margin.toFixed(2)}%`;
  $("cutSalesCount").textContent = String(totals.count);
  $("cutCash").textContent = money(totals.cash);
  $("cutCard").textContent = money(totals.card);
  $("cutTransfer").textContent = money(totals.transfer);
  $("cutCanceled").textContent = String(canceledSales);

  renderCashRegister();
  renderCashHistory();
  renderTopProducts(completedSales);
}

function renderTopProducts(sales) {
  const list = $("topProductsList");
  const productMap = new Map();

  sales.forEach((sale) => {
    (sale.items || []).forEach((item) => {
      const current = productMap.get(item.productId) || {
        name: item.name,
        unit: item.unit,
        quantity: 0,
        total: 0
      };

      current.quantity += Number(item.quantity || 0);
      current.total += Number(item.total || 0);
      productMap.set(item.productId, current);
    });
  });

  const products = [...productMap.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  if (products.length === 0) {
    list.innerHTML = `<p class="empty-state">Sin ventas en esta fecha.</p>`;
    return;
  }

  list.innerHTML = products
    .map((product) => {
      return `
        <article class="top-product-item">
          <div>
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(quantityText(product.quantity, product.unit))}</span>
          </div>
          <b>${money(product.total)}</b>
        </article>
      `;
    })
    .join("");
}

function saveCashShifts() {
  localStorage.setItem(CASH_SHIFTS_KEY, JSON.stringify(state.cashShifts));
  fetchJson("/api/cash-shifts", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      shifts: state.cashShifts
    })
  }).catch((error) => {
    console.warn("No se pudo guardar el corte en servidor.", error);
  });
}

function getCutDateString() {
  return $("cutDateInput")?.value || getLocalDateString();
}

function getCashShiftForDate(dateString = getCutDateString()) {
  return [...state.cashShifts]
    .reverse()
    .find((shift) => shift.date === dateString && shift.status === "open");
}

function getSalesCashShift() {
  return getCashShiftForDate(getLocalDateString());
}

function hasOpenCashForSales() {
  return Boolean(getSalesCashShift());
}

function goToCashRegister() {
  const periodInput = $("cutPeriodFilter");
  const dateInput = $("cutDateInput");

  if (periodInput) periodInput.value = "day";
  if (dateInput) dateInput.value = getLocalDateString();

  setView("reports");
  renderCashCut();
  window.setTimeout(() => $("openingCashInput")?.focus(), 0);
}

function updateCashGateUi() {
  const cashShift = getSalesCashShift();
  const isOpen = Boolean(cashShift);
  const statusButton = $("cashStatusBtn");
  const notice = $("cashGateNotice");

  document.body.classList.toggle("cash-open", isOpen);
  document.body.classList.toggle("cash-closed", !isOpen);

  if (statusButton) {
    statusButton.textContent = isOpen ? "Caja abierta" : "Caja cerrada";
    statusButton.classList.toggle("open", isOpen);
    statusButton.classList.toggle("closed", !isOpen);
    statusButton.setAttribute(
      "title",
      isOpen
        ? `Caja abierta con ${money(cashShift.openingAmount)}`
        : "Abrir caja para vender"
    );
  }

  if (notice) {
    notice.hidden = isOpen;
  }

  if (state.activeView === "dashboard") {
    renderDashboard();
  }
}

function getCashShiftLogForDate(dateString = getCutDateString()) {
  return state.cashShifts
    .filter((shift) => shift.date === dateString)
    .sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
}

function shiftMatchesPeriod(shift, period, dateString) {
  const range = getPeriodRange(period, dateString);
  if (!range) return true;

  const shiftDate = parseLocalDate(shift.date);
  return shiftDate >= range.start && shiftDate < range.end;
}

function getDenominationCounts() {
  const counts = {};
  CASH_DENOMINATIONS.forEach((denomination) => {
    const input = document.querySelector(`[data-denomination="${denomination}"]`);
    counts[denomination] = Number(input?.value || 0);
  });
  return counts;
}

function calculateCashCounterTotal() {
  const counts = getDenominationCounts();
  return CASH_DENOMINATIONS.reduce((sum, denomination) => {
    return sum + denomination * Number(counts[denomination] || 0);
  }, 0);
}

function updateCashCounterTotal() {
  const total = calculateCashCounterTotal();
  const counterTotal = $("cashCounterTotal");
  const countedInput = $("countedCashInput");

  if (counterTotal) counterTotal.textContent = money(total);
  if (countedInput && state.cashCounterVisible) countedInput.value = total.toFixed(2);
  renderCashRegisterSummary();
}

function renderCashDenominations() {
  const container = $("cashDenominations");
  if (!container) return;

  container.innerHTML = CASH_DENOMINATIONS.map((denomination) => {
    return `
      <label>
        ${money(denomination)}
        <input type="number" min="0" step="1" value="0" data-denomination="${denomination}" />
      </label>
    `;
  }).join("");

  $$("[data-denomination]").forEach((input) => {
    input.addEventListener("input", updateCashCounterTotal);
  });
}

function renderCashRegisterSummary() {
  const activeShift = getCashShiftForDate();
  const counted = Number($("countedCashInput")?.value || 0);
  const expected = Number(activeShift?.openingAmount || 0) + Number(state.currentCutTotals.cash || 0);
  const difference = activeShift ? counted - expected : 0;

  if ($("cashShiftDifference")) {
    $("cashShiftDifference").textContent = activeShift ? money(difference) : money(0);
    $("cashShiftDifference").classList.toggle("negative", difference < 0);
  }
}

function renderCashRegister() {
  const dateString = getCutDateString();
  const period = $("cutPeriodFilter")?.value || "day";
  const activeShift = getCashShiftForDate(dateString);
  const isDailyCut = period === "day";
  const expectedCash = Number(activeShift?.openingAmount || 0) + Number(state.currentCutTotals.cash || 0);

  if ($("cashShiftStatus")) {
    $("cashShiftStatus").textContent = !isDailyCut
      ? "La apertura se maneja por dia; cambia el filtro a Dia para abrir o cerrar caja."
      : activeShift
        ? `Abierta con ${money(activeShift.openingAmount)}. Efectivo esperado: ${money(expectedCash)}.`
        : "Sin caja abierta.";
  }

  if ($("openCashShiftBtn")) $("openCashShiftBtn").disabled = !isDailyCut || Boolean(activeShift);
  if ($("closeCashShiftBtn")) $("closeCashShiftBtn").disabled = !isDailyCut || !activeShift;
  if ($("countedCashInput")) $("countedCashInput").disabled = !isDailyCut || !activeShift;
  if ($("toggleCashCounterBtn")) $("toggleCashCounterBtn").disabled = !isDailyCut || !activeShift;

  const counterPanel = $("cashCounterPanel");
  if (counterPanel) {
    counterPanel.classList.toggle("hidden", !state.cashCounterVisible || !activeShift);
  }

  const log = $("cashShiftLog");
  if (log) {
    const shifts = getCashShiftLogForDate(dateString);
    log.innerHTML = shifts.length === 0
      ? `<p class="empty-state">Sin registros de caja para este dia.</p>`
      : shifts.map((shift) => {
          const closedText = shift.status === "closed"
            ? `Cierre ${money(shift.countedAmount)} · diferencia ${money(shift.difference)}`
            : "Caja abierta";

          return `
            <article>
              <strong>${new Date(shift.openedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</strong>
              <span>Fondo ${money(shift.openingAmount)} · ${closedText}</span>
            </article>
          `;
        }).join("");
  }

  renderCashRegisterSummary();
  updateCashGateUi();
}

function renderCashHistory() {
  const list = $("cashHistoryList");
  if (!list) return;

  const period = $("cutPeriodFilter")?.value || "day";
  const dateString = $("cutDateInput")?.value || getLocalDateString();
  const shifts = state.cashShifts
    .filter((shift) => shiftMatchesPeriod(shift, period, dateString))
    .sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));

  if (shifts.length === 0) {
    list.innerHTML = `<p class="empty-state">Sin cortes guardados en este periodo.</p>`;
    return;
  }

  list.innerHTML = shifts
    .map((shift) => {
      const isClosed = shift.status === "closed";
      const difference = Number(shift.difference || 0);

      return `
        <article class="cash-history-row ${isClosed ? "closed" : "open"}">
          <div>
            <strong>${escapeHtml(shift.date)}</strong>
            <span>${isClosed ? "Cerrado" : "Abierto"} · fondo ${money(shift.openingAmount)}</span>
          </div>
          <div><span>Esperado</span><strong>${isClosed ? money(shift.expectedCash) : "-"}</strong></div>
          <div><span>Contado</span><strong>${isClosed ? money(shift.countedAmount) : "-"}</strong></div>
          <div><span>Diferencia</span><strong class="${difference < 0 ? "negative" : ""}">${isClosed ? money(difference) : "-"}</strong></div>
        </article>
      `;
    })
    .join("");
}

function openCashShift() {
  const dateString = getCutDateString();
  const amount = Number($("openingCashInput")?.value || 0);

  if (($("cutPeriodFilter")?.value || "day") !== "day") {
    showToast("La caja se abre por dia.");
    return;
  }

  if (getCashShiftForDate(dateString)) {
    showToast("Ya hay una caja abierta.");
    return;
  }

  if (amount < 0) {
    showToast("Revisa el fondo inicial.");
    return;
  }

  state.cashShifts.push({
    id: `C-${dateString}-${Date.now()}`,
    date: dateString,
    status: "open",
    openingAmount: Math.round(amount * 100) / 100,
    openedAt: new Date().toISOString(),
    closedAt: null,
    expectedCash: null,
    countedAmount: null,
    difference: null,
    denominations: null
  });
  saveCashShifts();
  $("openingCashInput").value = "";
  renderCashRegister();
  renderCashHistory();
  renderTicket();
  showToast("Caja abierta.");
}

function closeCashShift() {
  const dateString = getCutDateString();
  const shift = getCashShiftForDate(dateString);
  if (!shift) {
    showToast("Primero abre la caja.");
    return;
  }

  const counted = Number($("countedCashInput")?.value || 0);
  const expectedCash = Number(shift.openingAmount || 0) + Number(state.currentCutTotals.cash || 0);
  const difference = Math.round((counted - expectedCash) * 100) / 100;

  shift.status = "closed";
  shift.closedAt = new Date().toISOString();
  shift.expectedCash = Math.round(expectedCash * 100) / 100;
  shift.countedAmount = Math.round(counted * 100) / 100;
  shift.difference = difference;
  shift.denominations = state.cashCounterVisible ? getDenominationCounts() : null;
  saveCashShifts();

  $("countedCashInput").value = "";
  state.cashCounterVisible = false;
  renderCashRegister();
  renderCashHistory();
  renderTicket();
  showToast("Corte cerrado.");
}

function toggleCashCounter() {
  state.cashCounterVisible = !state.cashCounterVisible;
  renderCashRegister();
}

function printCashCut() {
  const dateString = $("cutDateInput").value || getLocalDateString();

  $("printArea").innerHTML = `
    <div class="receipt">
      <h1>EL MUELLE</h1>
      <h2>Corte de Caja</h2>
      <p>${escapeHtml(dateString)}</p>
      <div class="line"></div>
      <div class="receipt-row"><span>Total</span><strong>${$("cutTotalSales").textContent}</strong></div>
      <div class="receipt-row"><span>Ganancia</span><strong>${$("cutGrossProfit").textContent}</strong></div>
      <div class="receipt-row"><span>Margen</span><strong>${$("cutMargin").textContent}</strong></div>
      <div class="receipt-row"><span>Ventas</span><strong>${$("cutSalesCount").textContent}</strong></div>
      <div class="line"></div>
      <div class="receipt-row"><span>Efectivo</span><strong>${$("cutCash").textContent}</strong></div>
      <div class="receipt-row"><span>Tarjeta</span><strong>${$("cutCard").textContent}</strong></div>
      <div class="receipt-row"><span>Transferencia</span><strong>${$("cutTransfer").textContent}</strong></div>
      <div class="receipt-row"><span>Canceladas</span><strong>${$("cutCanceled").textContent}</strong></div>
    </div>
  `;

  window.print();
}

function applyScaleSettings() {
  scaleState.baudRate = Number($("scaleBaudRateInput").value || 9600);
  scaleState.unit = $("scaleUnitInput").value || "kg";
  scaleState.command = ($("scaleCommandInput").value || "P").trim() || "P";
  scaleState.pollMs = Number($("scalePollMsInput").value || 800);
  localStorage.setItem("scaleBaudRate", String(scaleState.baudRate));
  localStorage.setItem("scaleUnit", scaleState.unit);
  localStorage.setItem("scaleCommand", scaleState.command);
  localStorage.setItem("scalePollMs", String(scaleState.pollMs));

  if (scaleState.connected) {
    startScalePolling();
  }
}

function parseScaleWeight(text) {
  const normalized = String(text || "").replace(/,/g, ".").replace(/\u2212/g, "-");
  const chunks = normalized
    .split(/[\r\n]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(-5)
    .reverse();
  const sources = chunks.length > 0 ? chunks : [normalized.slice(-120)];

  for (const source of sources) {
    const matches = [
      ...source.matchAll(/([-+]?\d{1,5}(?:\.\d{1,4})?)\s*(kg|kgs|g|gr|gramos|lb|lbs)?/gi)
    ];
    const candidates = matches
      .map((match) => {
        const rawValue = Number(match[1]);
        const unit = (match[2] || "").toLowerCase();

        if (!Number.isFinite(rawValue)) return null;

        let kg = rawValue;

        if (unit === "g" || unit === "gr" || unit === "gramos") {
          kg = rawValue / 1000;
        } else if (unit === "lb" || unit === "lbs") {
          kg = rawValue * 0.45359237;
        } else if (
          !unit &&
          rawValue >= MIN_SCALE_WEIGHT_KG * 1000 &&
          rawValue <= MAX_SCALE_WEIGHT_KG * 1000
        ) {
          kg = rawValue / 1000;
        }

        return {
          kg: Math.round(kg * 1000) / 1000,
          hasUnit: Boolean(unit)
        };
      })
      .filter((candidate) => {
        return candidate && candidate.kg >= 0 && candidate.kg <= MAX_SCALE_WEIGHT_KG;
      });

    const unitCandidate = candidates.find((candidate) => candidate.hasUnit);
    const candidate = unitCandidate || candidates[0];

    if (candidate) {
      return candidate.kg;
    }
  }

  return null;
}

function handleScaleChunk(chunk) {
  scaleState.raw = `${scaleState.raw}${chunk}`.slice(-240);
  scaleState.buffer = `${scaleState.buffer}${chunk}`.slice(-240);
  scaleState.stable = /\bST\b|stable|estable/i.test(scaleState.raw);

  const parsed = parseScaleWeight(scaleState.buffer);

  if (parsed !== null) {
    scaleState.weightKg = parsed;

    if (state.selectedProduct && state.selectedProduct.unit === "kg") {
      state.detectedQuantity = parsed;
      state.quantitySource = "scale";
      renderWeighPanel();
    }
  }

  updateScaleUi();
}

async function readScaleLoop() {
  const decoder = new TextDecoder();

  while (scaleState.port && scaleState.port.readable) {
    scaleState.reader = scaleState.port.readable.getReader();

    try {
      while (true) {
        const { value, done } = await scaleState.reader.read();

        if (done) break;
        if (value) handleScaleChunk(decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      if (scaleState.connected) {
        console.error(error);
        showToast("Se perdió lectura de báscula.");
      }
    } finally {
      scaleState.reader.releaseLock();
      scaleState.reader = null;
    }
  }
}

function getScaleCommandBytes() {
  const command = scaleState.command || "P";

  if (/^0x[0-9a-f]+$/i.test(command)) {
    return Uint8Array.from([Number.parseInt(command.slice(2), 16)]);
  }

  if (/^\d+$/.test(command) && Number(command) >= 0 && Number(command) <= 255) {
    return Uint8Array.from([Number(command)]);
  }

  return new TextEncoder().encode(command);
}

async function requestScaleWeight() {
  if (!scaleState.connected || !scaleState.port || !scaleState.port.writable) return;

  try {
    const writer = scaleState.port.writable.getWriter();

    try {
      await writer.write(getScaleCommandBytes());
      scaleState.lastRequestAt = Date.now();
    } finally {
      writer.releaseLock();
    }
  } catch (error) {
    console.error(error);
    showToast("No se pudo pedir peso a la báscula.");
  }
}

function startScalePolling() {
  stopScalePolling();

  if (!scaleState.connected) return;

  requestScaleWeight();
  scaleState.requestTimer = window.setInterval(() => {
    requestScaleWeight();
  }, scaleState.pollMs);
}

function stopScalePolling() {
  if (scaleState.requestTimer) {
    window.clearInterval(scaleState.requestTimer);
    scaleState.requestTimer = null;
  }
}

async function connectScale() {
  if (!scaleState.supported) {
    showToast("Usa Chrome o Edge para conectar la báscula.");
    updateScaleUi();
    return;
  }

  if (scaleState.connected) return;

  applyScaleSettings();

  try {
    const port = await navigator.serial.requestPort();
    await port.open({
      baudRate: scaleState.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: "none"
    });

    scaleState.port = port;
    scaleState.connected = true;
    scaleState.raw = "";
    scaleState.buffer = "";
    updateScaleUi();
    showToast("Báscula RHINO BAR-9 conectada.");
    readScaleLoop();
    startScalePolling();
  } catch (error) {
    console.error(error);
    showToast("No se pudo conectar la báscula.");
    updateScaleUi();
  }
}

async function disconnectScale() {
  try {
    stopScalePolling();

    if (scaleState.reader) {
      await scaleState.reader.cancel();
    }

    if (scaleState.port) {
      await scaleState.port.close();
    }
  } catch (error) {
    console.error(error);
  } finally {
    scaleState.connected = false;
    scaleState.port = null;
    scaleState.reader = null;
    scaleState.weightKg = 0;
    scaleState.raw = "";
    scaleState.buffer = "";
    scaleState.lastRequestAt = null;
    updateScaleUi();
    renderWeighPanel();
  }
}

function updateScaleUi() {
  const weightText = `${Number(scaleState.weightKg || 0).toFixed(3)} kg`;
  const statusText = !scaleState.supported
    ? "Navegador sin Web Serial."
    : scaleState.connected
      ? scaleState.stable
        ? "RHINO BAR-9 conectada · peso estable"
        : `RHINO BAR-9 conectada · solicitando con ${scaleState.command}`
      : "RHINO BAR-9 · 9600 8N1 · comando P.";

  $("scaleStatusPill").textContent = scaleState.connected
    ? "Conectada"
    : scaleState.supported
      ? "Sin conexión"
      : "No compatible";
  $("scaleWeightText").textContent = weightText;
  $("scaleStatusText").textContent = statusText;
  $("scaleRawText").textContent = scaleState.raw.trim() || "Sin lectura";
  $("settingsScaleWeight").textContent = weightText;
  $("settingsScaleStatus").textContent = statusText;
  $("settingsScaleRaw").textContent = scaleState.raw.trim() || "Sin datos";

  [$("disconnectScaleBtn"), $("disconnectScaleBtnSettings"), $("requestScaleBtn"), $("requestScaleBtnSettings")].forEach((button) => {
    if (button) button.disabled = !scaleState.connected;
  });

  [$("connectScaleBtn"), $("connectScaleBtnSettings")].forEach((button) => {
    if (button) button.disabled = scaleState.connected || !scaleState.supported;
  });

  document.body.classList.toggle("scale-connected", scaleState.connected);
  document.body.classList.toggle("scale-unsupported", !scaleState.supported);
  updateAccessStatus();
}

function bindEvents() {
  on($("sidebarToggleBtn"), "click", toggleSidebar);
  on($("mobileSidebarToggleBtn"), "click", toggleSidebar);
  on($("ticketToggleBtn"), "click", () => toggleTicketPanel());
  on($("cashStatusBtn"), "click", goToCashRegister);
  on($("openCashFromSaleBtn"), "click", goToCashRegister);
  on($("ticketSideToggleBtn"), "click", () => toggleTicketPanel());
  on($("closeTicketPanelBtn"), "click", closeTicketDrawer);
  document.addEventListener("pointerdown", handleTicketOutsideClick);
  on($("sessionSwitchBtn"), "click", logoutToAccess);
  on($("accessLoginBtn"), "click", confirmAccessLogin);
  on($("accessPinInput"), "keydown", (event) => {
    if (event.key === "Enter") confirmAccessLogin();
  });
  on($("authConfirmBtn"), "click", confirmAdminAccess);
  on($("authEmployeeBtn"), "click", () => {
    closeAuthModal();
    logoutToAccess();
  });
  on($("authCloseBtn"), "click", closeAuthModal);
  on($("authPinInput"), "keydown", (event) => {
    if (event.key === "Enter") confirmAdminAccess();
  });
  on($("authModal"), "click", (event) => {
    if (event.target === $("authModal")) closeAuthModal();
  });

  on($("employeeAuthConfirmBtn"), "click", confirmEmployeeAccess);
  on($("employeeAuthCloseBtn"), "click", closeEmployeeAccess);
  on($("employeeOpenAdminBtn"), "click", () => {
    $("employeeAuthModal")?.classList.add("hidden");
    openAdminAccess();
  });
  on($("employeePinInput"), "keydown", (event) => {
    if (event.key === "Enter") confirmEmployeeAccess();
  });
  on($("employeeAuthModal"), "click", (event) => {
    if (event.target === $("employeeAuthModal")) closeEmployeeAccess();
  });

  $$("[data-pos-step]").forEach((button) => {
    button.addEventListener("click", () => setPosStep(button.dataset.posStep));
  });

  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  on($("searchInput"), "input", () => {
    state.currentPage = 1;
    renderProducts();
  });
  on($("prevPageBtn"), "click", () => {
    if (state.currentPage <= 1) return;
    state.currentPage -= 1;
    renderProducts();
  });
  on($("nextPageBtn"), "click", () => {
    const totalPages = Math.max(Math.ceil(getFilteredProducts().length / PAGE_SIZE), 1);
    if (state.currentPage >= totalPages) return;
    state.currentPage += 1;
    renderProducts();
  });
  on($("filterAll"), "click", () => setFilter("all"));
  on($("filterKg"), "click", () => setFilter("kg"));
  on($("filterPiece"), "click", () => setFilter("pieza"));

  on($("confirmWeightBtn"), "click", addCurrentProductToTicket);
  on($("manualWeightBtn"), "click", openManualModal);
  on($("changeProductBtn"), "click", () => {
    clearSelectedProduct();
    setPosStep("product");
  });
  on($("clearTicketBtn"), "click", clearTicket);
  on($("chargeBtn"), "click", openInvoiceDecisionModal);

  on($("manualQuantityInput"), "input", formatManualQuantityInput);
  on($("saveManualWeightBtn"), "click", saveManualQuantity);
  on($("cancelManualWeightBtn"), "click", closeManualModal);
  on($("closeManualModalBtn"), "click", closeManualModal);

  on($("invoiceYesBtn"), "click", () => chargeSale(true));
  on($("invoiceNoBtn"), "click", () => chargeSale(false));
  on($("closeInvoiceDecisionBtn"), "click", closeInvoiceDecisionModal);
  on($("invoiceDecisionModal"), "click", (event) => {
    if (event.target === $("invoiceDecisionModal")) closeInvoiceDecisionModal();
  });
  $$(".pay-method").forEach((button) => {
    button.addEventListener("click", () => setPaymentMethod(button.dataset.method));
  });
  on($("paymentReferenceInput"), "input", () => {
    state.paymentReference = String($("paymentReferenceInput")?.value || "").trim();
  });

  on($("productForm"), "submit", saveProductFromAdmin);
  on($("resetProductFormBtn"), "click", resetProductForm);
  ["productPriceInput", "productCostInput", "productStockInput", "productUnitInput"].forEach((id) => {
    on($(id), "input", updateProductProjection);
    on($(id), "change", updateProductProjection);
  });
  on($("productAdminSearch"), "input", renderAdminProducts);
  on($("productAdminCategoryFilter"), "change", renderAdminProducts);

  on($("inventoryEntryForm"), "submit", saveInventoryEntry);
  on($("resetInventoryEntryBtn"), "click", resetInventoryEntryForm);
  on($("inventoryEntryProductInput"), "change", populateInventoryEntryDefaults);
  ["inventoryEntryQuantityInput", "inventoryEntryUnitCostInput", "inventoryEntrySalePriceInput"].forEach((id) => {
    on($(id), "input", updateInventoryEntryProjection);
  });
  on($("inventoryEntrySearchInput"), "input", renderInventoryEntries);
  on($("inventorySearchInput"), "input", renderInventory);
  on($("inventoryCategoryFilter"), "change", renderInventory);
  $$(`[data-inventory-mode-btn]`).forEach((button) => {
    button.addEventListener("click", () => setInventoryMode(button.dataset.inventoryModeBtn));
  });
  $$(`[data-settings-mode-btn]`).forEach((button) => {
    button.addEventListener("click", () => setSettingsMode(button.dataset.settingsModeBtn));
  });

  on($("salesSearchInput"), "input", renderSalesAdmin);
  on($("salesStatusFilter"), "change", renderSalesAdmin);
  on($("salesPeriodFilter"), "change", renderSalesAdmin);
  on($("salesDateInput"), "change", renderSalesAdmin);
  on($("dashboardPeriodFilter"), "change", renderDashboard);
  on($("dashboardDateInput"), "change", renderDashboard);
  on($("refreshDashboardBtn"), "click", loadDashboard);
  on($("recentSalesPeriodFilter"), "change", loadRecentSales);
  on($("recentSalesDateInput"), "change", loadRecentSales);
  on($("refreshSalesBtn"), "click", loadRecentSales);
  on($("invoiceForm"), "submit", saveInvoiceRequest);

  on($("cutPeriodFilter"), "change", renderCashCut);
  on($("cutDateInput"), "change", renderCashCut);
  on($("refreshCutBtn"), "click", loadCashCut);
  on($("printCutBtn"), "click", printCashCut);
  on($("openCashShiftBtn"), "click", openCashShift);
  on($("closeCashShiftBtn"), "click", closeCashShift);
  on($("toggleCashCounterBtn"), "click", toggleCashCounter);
  on($("countedCashInput"), "input", renderCashRegisterSummary);

  on($("productConfirmYesBtn"), "click", () => closeProductConfirm(true));
  on($("productConfirmNoBtn"), "click", () => closeProductConfirm(false));
  on($("productConfirmCloseBtn"), "click", () => closeProductConfirm(false));
  on($("productConfirmModal"), "click", (event) => {
    if (event.target === $("productConfirmModal")) closeProductConfirm(false);
  });

  on($("adminUserNameInput"), "input", updateAdminNameDraft);
  on($("addEmployeeBtn"), "click", addEmployeeDraft);
  on($("newEmployeeNameInput"), "keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addEmployeeDraft();
    }
  });
  on($("newEmployeePinInput"), "keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addEmployeeDraft();
    }
  });
  on($("saveUserSettingsBtn"), "click", saveUserSettings);
  on($("resetUserSettingsBtn"), "click", resetUserSettings);

  on($("connectScaleBtn"), "click", connectScale);
  on($("requestScaleBtn"), "click", requestScaleWeight);
  on($("disconnectScaleBtn"), "click", disconnectScale);
  on($("connectScaleBtnSettings"), "click", connectScale);
  on($("requestScaleBtnSettings"), "click", requestScaleWeight);
  on($("disconnectScaleBtnSettings"), "click", disconnectScale);
  on($("scaleBaudRateInput"), "change", applyScaleSettings);
  on($("scaleUnitInput"), "change", applyScaleSettings);
  on($("scaleCommandInput"), "change", applyScaleSettings);
  on($("scalePollMsInput"), "change", applyScaleSettings);
}

function initSettings() {
  $("scaleBaudRateInput").value = String(scaleState.baudRate);
  $("scaleUnitInput").value = scaleState.unit;
  $("scaleCommandInput").value = scaleState.command;
  $("scalePollMsInput").value = String(scaleState.pollMs);
}

async function init() {
  bindEvents();
  initSettings();
  await loadSettings();
  const sessionRestored = await restoreAuthSession();
  if (!sessionRestored) {
    logoutToAccess();
  }
  ["salesDateInput", "dashboardDateInput", "recentSalesDateInput", "cutDateInput", "inventoryEntryDateInput"].forEach((id) => {
    const input = $(id);
    if (input && !input.value) input.value = getLocalDateString();
  });
  renderCashDenominations();
  updateClock();
  window.setInterval(updateClock, 30000);
  resetProductForm();
  resetInventoryEntryForm();
  await loadCashShifts();
  renderTicket();
  setPaymentMethod(state.paymentMethod);
  setInventoryMode();
  setSettingsMode();
  updateShellState();
  updateScaleUi();
  updateCashGateUi();
  await Promise.all([loadProducts(), loadSales()]);
}

init();
