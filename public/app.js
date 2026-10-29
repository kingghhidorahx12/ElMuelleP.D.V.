function readLocalPreference(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
}

function saveLocalPreference(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
}

function removeLocalPreference(key) {
  try { localStorage.removeItem(key); } catch (_) { /* El navegador puede bloquear el almacenamiento local. */ }
}

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const POS_MOTION_KEY = "elMuellePosReducedMotion:v1";
let posReducedMotion = readLocalPreference(POS_MOTION_KEY) === "true";
const posMicroMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const posFeedbackByElement = new WeakMap();
const activePosFeedback = new Set();

function cancelPosFeedback() {
  for (const animation of activePosFeedback) animation.cancel();
}

function animatePosFeedback(element, kind = "catalog") {
  if (!element?.animate || document.hidden || posReducedMotion || posMicroMotion.matches || !state.sessionAuthenticated) return;
  if (kind === "catalog" && state.activeView !== "pos") return;
  posFeedbackByElement.get(element)?.cancel();
  const frames = kind === "navigation"
    ? [{ opacity: .94, transform: "translateY(2px)" }, { opacity: 1, transform: "none" }]
    : [{ opacity: kind === "control" ? .78 : .94 }, { opacity: 1 }];
  const animation = element.animate(frames, {
    duration: kind === "navigation" ? 180 : 150, easing: "ease-out"
  });
  posFeedbackByElement.set(element, animation);
  activePosFeedback.add(animation);
  const finish = () => {
    activePosFeedback.delete(animation);
    if (posFeedbackByElement.get(element) === animation) posFeedbackByElement.delete(element);
  };
  animation.finished.then(finish, finish);
}

function applyPosMotionPreference() {
  document.body.classList.toggle("pos-motion-reduced", posReducedMotion);
  document.body.classList.toggle("pos-motion-paused", document.hidden);
  const button = $("posMotionToggle");
  if (button) {
    button.setAttribute("aria-pressed", String(posReducedMotion));
    button.textContent = posReducedMotion ? "Activar movimiento" : "Reducir movimiento";
  }
  window.clearTimeout(ticketLabelTimeout);
  ticketLabelTimeout = 0;
  $("ticketToggleBtn")?.classList.remove("ticket-label-out");
  updateTicketLabelText();
  syncTicketLabelRotation();
}

const SESSION_KEY = "elMuelleSession";
const SESSION_EXPIRES_KEY = "elMuelleSessionExpiresAt";
const SESSION_PERSIST_MS = 10 * 60 * 1000;
const LAST_USER_KEY = "elMuelleLastUser";
const ADMIN_VIEWS = new Set(["dashboard", "products", "inventory", "settings"]);
const USERS = {
  employee: { id: "mostrador", name: "Encargado", role: "employee" },
  admin: { id: "admin", name: "Administrador", role: "admin" }
};
const MIN_SCALE_WEIGHT_KG = 0.1;
const MAX_SCALE_WEIGHT_KG = 40;
const FAVORITES_PREFIX = "elMuelleFavorites:v1:";
const favoriteMemory = new Map();
const favoriteStorageWarnings = new Set();
const FAVORITE_STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 3 1.1-6.3L3 9.6l6.2-.9Z"/></svg>';
const DEFAULT_CATEGORIES = [
  "Pescados y mariscos",
  "Carnes selectas",
  "Para el antojo",
  "Condimentos y salsas"
];

const CASH_COUNT_DENOMINATIONS = [
  { label: "$1,000", value: 1000 },
  { label: "$500", value: 500 },
  { label: "$200", value: 200 },
  { label: "$100", value: 100 },
  { label: "$50", value: 50 },
  { label: "$20", value: 20 },
  { label: "$10", value: 10 },
  { label: "$5", value: 5 },
  { label: "$2", value: 2 },
  { label: "$1", value: 1 },
  { label: "50 c", value: 0.5 }
];

const viewLabels = {
  pos: ["Punto de Venta", ""],
  dashboard: ["Resumen del negocio", ""],
  sales: ["Ventas", ""],
  products: ["Productos", ""],
  inventory: ["Inventario", ""],
  billing: ["Solicitudes de factura", "Registra datos fiscales; el timbrado CFDI se gestiona fuera de esta aplicación."],
  reports: ["Reportes", ""],
  settings: ["Configuración", ""],
  restricted: ["Acceso restringido", ""]
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
const OPTIMIZED_POS_IMAGES = new Set([
  "arrachera-1kg", "arrachera-finas-hierbas", "arrachera-medio", "arrachera-taquera", "atun", "boneless", "calamar",
  "camaron-41-50", "camaron-61-70", "camaron-chiapaneco", "camaron-coctelero", "carne-al-pastor-1kg", "carne-asada",
  "carne-hamburguesa", "costilla-ranch", "dedos-queso", "filete-basa", "filete-tilapia", "mojarra", "nuggets-pollo",
  "papa-francesa", "pulpo-cocido", "salmon", "salsa-macha-1783450631255", "salsa-tabasco-1783722675721",
  "sopa-mariscos", "surimi-economico", "surimi-neptuno"
]);

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

const storedSidebarCollapsed = readLocalPreference("sidebarCollapsed");
const storedTicketCollapsed = readLocalPreference("ticketCollapsed");

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
    hasPin: user?.hasPin !== false,
    ...(user?.permissions ? {permissions:{...user.permissions}} : {})
  };
}

function clearStoredAuthSession() {
  // Remove tokens created by earlier versions before using session-only state.
  removeLocalPreference(SESSION_KEY);
  removeLocalPreference("elMuelleSessionToken");
  removeLocalPreference(SESSION_EXPIRES_KEY);

  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_EXPIRES_KEY);
}

function getStoredSessionExpiry() {
  return Number(sessionStorage.getItem(SESSION_EXPIRES_KEY) || 0);
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
  sessionStorage.setItem(
    SESSION_EXPIRES_KEY,
    String(Date.now() + SESSION_PERSIST_MS)
  );
}

let sessionExpiryTimer = null;

function getSessionMsRemaining() {
  return getStoredSessionExpiry() - Date.now();
}

function scheduleSessionExpiryLogout() {
  window.clearTimeout(sessionExpiryTimer);

  if (!state?.sessionAuthenticated) return;

  const remaining = getSessionMsRemaining();
  if (remaining <= 0) {
    logoutToAccess({preservePendingCheckout:Boolean(state.checkoutPending)});
    return;
  }

  sessionExpiryTimer = window.setTimeout(() => {
    if (!hasValidStoredSession()) {
      logoutToAccess({preservePendingCheckout:Boolean(state.checkoutPending)});
      return;
    }
    scheduleSessionExpiryLogout();
  }, remaining + 250);
}

function markSessionActivity() {
  if (!state?.sessionAuthenticated || !state.sessionToken) return;
  refreshStoredSessionExpiry();
  scheduleSessionExpiryLogout();
}

function bindSessionActivityTracking() {
  ["click", "keydown", "pointerdown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, markSessionActivity, { passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !state?.sessionAuthenticated) return;

    if (!hasValidStoredSession()) {
      logoutToAccess();
      return;
    }

    markSessionActivity();
  });

  scheduleSessionExpiryLogout();
}

function loadStoredSession() {
  try {
    if (!hasValidStoredSession()) return null;

    const rawSession = sessionStorage.getItem(SESSION_KEY);
    if (!rawSession) return null;

    return normalizeSessionUser(JSON.parse(rawSession));
  } catch (error) {
    clearStoredAuthSession();
    return null;
  }
}

function loadStoredSessionToken() {
  return hasValidStoredSession() ? "cookie-session" : "";
}

function saveSessionToken(isAuthenticated) {
  if (!isAuthenticated) {
    clearStoredAuthSession();
    return;
  }
  refreshStoredSessionExpiry();
}

function getEmployeeSessionUser() {
  const employee = state.settings?.users?.find((user) => {
    return user.role === "employee" && user.active !== false;
  });

  return normalizeSessionUser(employee || USERS.employee);
}

function saveSessionUser(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  refreshStoredSessionExpiry();
}

function isAdminUser() {
  return state.currentUser?.role === "admin";
}

function isAdminView(viewName) {
  return ADMIN_VIEWS.has(viewName);
}

function canAccessView(viewName, reportsMode = state.reportsMode) {
  if (viewName === 'restricted') return true;
  if (isAdminUser()) return true;
  const module = viewName === 'reports' ? (reportsMode === 'cash' ? 'cash' : 'reports') : viewName;
  if (state.currentUser?.permissions) return state.currentUser.permissions[module] === true;
  return !isAdminView(viewName);
}

function getRoleLabel(role) {
  return role === "admin" ? "Administrador" : "Encargado";
}

function setCurrentUser(user) {
  state.currentUser = normalizeSessionUser(user);
  syncFavoritesForUser();
  saveSessionUser(state.currentUser);
  if (typeof restorePendingCheckout === 'function') restorePendingCheckout();
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
    $("sessionSwitchBtn").setAttribute("title", "Mi cuenta");
    $("accountUserName").textContent = state.currentUser.name;
    $("accountUserRole").textContent = getRoleLabel(state.currentUser.role);
  }

  $$(".nav-item").forEach((button) => {
    const shouldHide = !canAccessView(button.dataset.view,button.dataset.reportsTarget || 'reports');
    button.hidden = shouldHide;
    button.classList.remove("locked");
    button.setAttribute("aria-label", button.dataset.label);
  });

  updateNavGroupVisibility();
  syncDevicePreferencesAccess();
  if (typeof syncEmployeeScreenUi === 'function') syncEmployeeScreenUi();
  window.dispatchEvent?.(new Event('elmuelle:session'));
}

// Preserve the employee's existing device actions without granting access to Settings.
function syncDevicePreferencesAccess() {
  const employee = state.sessionAuthenticated && !isAdminUser();
  const entry = $("accountDevicePreferencesBtn");
  if (entry) entry.hidden = !employee;
  const destination = $(employee ? "employeeMotionSlot" : "settingsMotionSlot");
  const motion = $("posMotionToggle");
  if (destination && motion && motion.parentElement !== destination) destination.appendChild(motion);
  if (!employee) closeDevicePreferences(false);
}

function openDevicePreferences() {
  if (!state.sessionAuthenticated || isAdminUser()) return;
  $("accountMenu").classList.add("hidden");
  $("sessionSwitchBtn").setAttribute("aria-expanded", "false");
  const modal = $("devicePreferencesModal");
  modal.classList.remove("hidden");
  modal.inert = false;
  modal.setAttribute("aria-hidden", "false");
  updateScaleUi();
  $("devicePreferencesCloseBtn").focus();
}

function closeDevicePreferences(restoreFocus = true) {
  const modal = $("devicePreferencesModal");
  if (!modal) return;
  const wasOpen = !modal.classList.contains("hidden");
  modal.classList.add("hidden");
  modal.inert = true;
  modal.setAttribute("aria-hidden", "true");
  if (wasOpen && restoreFocus) $("sessionSwitchBtn")?.focus();
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
  const admin = (state.settings?.users || []).find((user) => {
    return user.role === "admin" && user.active !== false;
  });
  return [...getActiveEmployees(), ...(admin ? [normalizeSessionUser(admin)] : [])];
}

function getLastAccessUserId() {
  return readLocalPreference(LAST_USER_KEY) || USERS.employee.id;
}

function setAccessLocked(isLocked) {
  document.body.classList.toggle("auth-locked", isLocked);
  $("accessScreen")?.classList.toggle("hidden", !isLocked || state.setupRequired);
}

function setSetupRequired(requiresSetup) {
  state.setupRequired = requiresSetup === true;
  document.body.classList.toggle("setup-required", state.setupRequired);
  $("setupScreen")?.classList.toggle("hidden", !state.setupRequired);
  if (state.setupRequired) {
    document.body.classList.add("auth-locked");
    $("accessScreen")?.classList.add("hidden");
    window.setTimeout(() => $("setupOwnerNameInput")?.focus(), 0);
  }
}

function selectAccessUser(userId) {
  const users = getAccessUsers();
  const selected = users.find((user) => user.id === userId) || users[0] || getEmployeeSessionUser();
  state.accessSelectedUserId = selected.id;
  saveLocalPreference(LAST_USER_KEY, selected.id);

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
  if (!list || state.setupRequired) return;

  const users = getAccessUsers();
  if (users.length === 0) return;
  list.innerHTML = users
    .map((user) => {
      const isAdmin = user.role === "admin";
      return [
        '<button class="login-user-option ' + (isAdmin ? 'admin' : '') + '" type="button" data-access-user="' + escapeHtml(user.id) + '">',
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
      ? await loginAdmin(pin)
      : await fetchJson("/api/auth/employee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, pin })
        });

    applyPublicSettings(result.settings);
    state.sessionToken = "cookie-session";
    state.sessionAuthenticated = true;
    saveSessionToken(true);
    setCurrentUser(result.user);
    state.employeeLoginRequired = false;
    await Promise.all([loadProducts(), loadSales()]);
    clearAccessPin();
    setAccessLocked(false);
    if (selectedUser.role === "admin" && (result.settings?.adminPinChangeRequired || result.settings?.employeePinChangeRequired)) {
      setSettingsMode("users");
      setView("settings");
      showToast("Por seguridad, actualiza las credenciales antes de continuar.");
    } else {
      setView(selectedUser.role === "admin" ? "dashboard" : "pos");
    }
    if (!(selectedUser.role === "admin" && (result.settings?.adminPinChangeRequired || result.settings?.employeePinChangeRequired))) {
      showToast("Sesión iniciada: " + result.user.name + ".");
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "Usuario o PIN incorrecto.");
    $("accessPinInput")?.focus();
    $("accessPinInput")?.select();
  } finally {
    if (button) button.disabled = false;
  }
}

async function completeInitialOwnerSetup() {
  const name = String($("setupOwnerNameInput")?.value || "").trim();
  const pin = String($("setupOwnerPinInput")?.value || "").trim();
  const confirmation = String($("setupOwnerPinConfirmInput")?.value || "").trim();

  if (name.length < 2) {
    showToast("Escribe el nombre del dueño o administrador.");
    $("setupOwnerNameInput")?.focus();
    return;
  }
  if (!/^\d{6,12}$/.test(pin)) {
    showToast("El PIN debe tener de 6 a 12 dígitos.");
    $("setupOwnerPinInput")?.focus();
    return;
  }
  if (pin !== confirmation) {
    showToast("La confirmación no coincide con el PIN.");
    $("setupOwnerPinConfirmInput")?.focus();
    return;
  }

  const button = $("setupOwnerSubmitBtn");
  if (button) button.disabled = true;

  try {
    const result = await fetchJson("/api/setup/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pin })
    });

    applyPublicSettings(result.settings);
    state.sessionToken = "cookie-session";
    state.sessionAuthenticated = true;
    saveSessionToken(true);
    setCurrentUser(result.user);
    state.employeeLoginRequired = false;
    $("setupOwnerPinInput").value = "";
    $("setupOwnerPinConfirmInput").value = "";
    setSetupRequired(false);
    setAccessLocked(false);
    await Promise.all([loadCashSessions(), loadProducts(), loadSales()]);
    setView("dashboard");
    window.setTimeout(maximizeApplicationWindow, 180);
    showToast(`Cuenta de ${result.user.name} creada correctamente.`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo crear el acceso del dueño.");
  } finally {
    if (button) button.disabled = false;
  }
}

function maximizeApplicationWindow() {
  if (state.setupRequired) return;

  document.body.classList.add("application-maximized");
  try {
    window.moveTo(0, 0);
    window.resizeTo(window.screen.availWidth, window.screen.availHeight);
  } catch (_) {
    // Algunos entornos de escritorio bloquean estas llamadas; la vista sigue siendo adaptable.
  }
}

function logoutToAccess({ preservePendingCheckout = false } = {}) {
  state.pendingProductPhoto=null;state.productPhotoVersion=(state.productPhotoVersion||0)+1;if($('catalogPendingOperations'))$('catalogPendingOperations').textContent='';if($('productEditorDialog')?.open)$('productEditorDialog').close();
  const preservedCheckout = preservePendingCheckout ? state.checkoutPending : null;
  state.checkoutGeneration = (state.checkoutGeneration || 0) + 1;
  state.checkoutIntentId = null;
  state.checkoutPending = null;
  state.checkoutProcessing = false;
  try {
    if (!preservePendingCheckout) sessionStorage.removeItem('elmuelle.pending-checkout');
    else if (preservedCheckout) sessionStorage.setItem('elmuelle.pending-checkout', JSON.stringify(preservedCheckout));
  } catch { /* El servidor conserva cualquier intención ya confirmada. */ }
  if (typeof closeAccessStream === 'function') closeAccessStream();
  if (state?.sessionAuthenticated) {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  }
  state.sessionToken = "";
  state.sessionAuthenticated = false;
  state.employeeLoginRequired = true;
  state.cashSessions = [];
  state.currentCashSession = null;
  // A different operator must start with a clean, non-persisted workspace.
  Object.assign(state, {
    products: [], sales: [], inventoryEntries: [], ticket: [],
    discount: 0, paymentReference: "", generatedReport: null,
    selectedSaleId: null, editingProductId: null, inventoryEditingId: null, pieceQuantityProductId: null,
    settingsDraft: null, employeePinDrafts: {}, pendingAdminView: null,
    currentCutTotals: { total: 0, profit: 0, count: 0, cash: 0, card: 0, transfer: 0, canceled: 0 }
  });
  ["salesList", "salesDetail", "recentSalesList", "reportTableBody", "printArea", "auditEventsList",
    "cashMovementsList", "cashHistoryList", "cashActivityList", "productAdminList", "inventoryList", "inventoryRecentActivity", "pieceQuantityProductName",
    "pieceQuantityUnitPrice", "pieceQuantityStock", "pieceQuantitySubtotal", "pieceQuantityError", "invoiceSaleSummary"]
    .forEach((id) => { if ($(id)) $(id).textContent = ""; });
  ["salesKpi0", "salesKpi1", "salesKpi2", "salesKpi3", "reportKpiPrimary", "reportKpiSecondary", "reportKpiThird", "reportKpiFourth", "catalogProductCount", "catalogActiveCount", "catalogCategoryCount", "catalogInventoryValue", "inventoryProductCount", "inventoryAttentionCount", "inventoryDayMovements", "inventoryPendingAdjustments"]
    .forEach((id) => { if ($(id)) $(id).textContent = "—"; });
  ["openingCashInput", "countedCashInput", "cashMovementAmount", "pieceQuantityInput"]
    .forEach((id) => { if ($(id)) $(id).value = ""; });
  $$('[data-cash-count-denomination]').forEach((input) => { input.value = ""; });
  $$('.app-view form').forEach((form) => form.reset());
  $$('input[type="password"]').forEach((input) => { input.value = ""; });
  closeProductConfirm(false);
  $$(".modal").forEach((modal) => modal.classList.add("hidden"));
  clearSelectedProduct();
  setPaymentMethod("efectivo");
  renderTicket();
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
    state.sessionToken = "cookie-session";
    state.sessionAuthenticated = true;
    saveSessionToken(true);
    setCurrentUser(result.user);
    state.employeeLoginRequired = false;
    await Promise.all([loadProducts(), loadSales()]);
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
    const result = await loginAdmin(pin);
    const nextView = state.pendingAdminView;

    state.sessionToken = "cookie-session";
    state.sessionAuthenticated = true;
    saveSessionToken(true);
    applyPublicSettings(result.settings);
    setCurrentUser(result.user || USERS.admin);
    await Promise.all([loadProducts(), loadSales()]);
    $("employeeAuthModal")?.classList.add("hidden");
    closeAuthModal();
    showToast("Modo administrador activo.");

    if (result.settings?.adminPinChangeRequired || result.settings?.employeePinChangeRequired) {
      setSettingsMode("users");
      setView("settings");
      showToast("Por seguridad, actualiza las credenciales antes de continuar.");
    } else if (nextView) {
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
  setupRequired: false,
  settings: {
    setupRequired: false,
    users: [normalizeSessionUser(USERS.employee), normalizeSessionUser(USERS.admin)],
    adminPinChangeRequired: false,
    updatedAt: null
  },
  settingsDraft: null,
  employeePinDrafts: {},
  pendingAdminView: null,
  activeView: "pos",
  activeCategory: "all",
  favoriteOwnerId: null,
  favoriteProductIds: new Set(),
  activeUnitFilter: "all",
  catalogView: "images",
  selectedProduct: null,
  pieceQuantityProductId: null,
  quantityCaptureVersion: 0,
  manualCapturePending: false,
  manualAuthorization: null,
  checkoutIntentId: null,
  checkoutPending: null,
  checkoutProcessing: false,
  checkoutGeneration: 0,
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
  cashSessions: [],
  currentCashSession: null,
  currentCutTotals: {
    total: 0,
    profit: 0,
    count: 0,
    cash: 0,
    card: 0,
    transfer: 0,
    canceled: 0
  },
  reportsMode: "reports",
  generatedReport: null,
  sidebarCollapsed:
    storedSidebarCollapsed === null
      ? window.innerWidth < 760
      : storedSidebarCollapsed === "true",
  ticketCollapsed: storedTicketCollapsed === null ? window.innerWidth < 1100 : storedTicketCollapsed === "true"
};

const scaleState = {
  supported: "serial" in navigator,
  error: false,
  connected: false,
  port: null,
  reader: null,
  requestTimer: null,
  raw: "",
  buffer: "",
  weightKg: 0,
  stable: false,
  baudRate: Number(readLocalPreference("scaleBaudRate") || 9600),
  unit: readLocalPreference("scaleUnit") || "kg",
  command: readLocalPreference("scaleCommand") || "P",
  pollMs: Number(readLocalPreference("scalePollMs") || 800),
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

function bindModalAccessibility() {
  ["manualModal", "pieceQuantityModal", "invoiceDecisionModal", "productConfirmModal", "authModal", "employeeAuthModal", "devicePreferencesModal"]
    .map((id) => $(id))
    .filter(Boolean)
    .forEach((modal) => {
      on(modal, "keydown", (event) => {
        if (event.key === "Escape") {
          modal.querySelector('[aria-label="Cerrar"]')?.click();
          return;
        }

        if (event.key !== "Tab") return;
        const focusable = Array.from(
          modal.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((element) => !element.hidden);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
    });
}

function money(value) {
  return Number(value || 0).toLocaleString(typeof uiNumberLocale === 'function' ? uiNumberLocale() : 'es-MX', {
    style: "currency",
    currency: "MXN", currencyDisplay: "narrowSymbol"
  });
}


function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function closeTicketDrawer() {
  if (state.activeView === "pos" && !state.ticketCollapsed) {
    state.ticketCollapsed = true;
    setPosStep("product");
  }
}

function handleTicketOutsideClick(event) {
  if (state.activeView !== "pos" || state.ticketCollapsed || window.innerWidth >= 1100) return;
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

function handleWeighOutsideClick(event) {
  if (state.activeView !== "pos" || !state.selectedProduct) return;
  const target = event.target;
  if (
    !(target instanceof Element) ||
    target.closest(".weigh-panel, .product-card, .pos-list-add, .modal") ||
    document.querySelector(".modal:not(.hidden)")
  ) {
    return;
  }
  clearSelectedProduct();
  setPosStep("product");
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

function restoreContextTabs(tabs) {
  const home = tabs?.__homePlaceholder;
  if (home?.parentNode && tabs.parentElement !== home.parentNode) {
    home.parentNode.insertBefore(tabs, home);
  }
}

function syncTopbarContext() {
  const slot = $("topbarContextSlot");
  if (!slot) return;

  const nextTabs =
    state.activeView === "inventory"
      ? document.querySelector(".inventory-subview-tabs")
      : state.activeView === "products"
        ? document.querySelector(".product-subview-tabs")
        : null;

  if (syncTopbarContext.currentTabs && syncTopbarContext.currentTabs !== nextTabs) {
    restoreContextTabs(syncTopbarContext.currentTabs);
  }

  if (nextTabs) {
    if (!nextTabs.__homePlaceholder) {
      nextTabs.__homePlaceholder = document.createComment("topbar-tabs-home");
      nextTabs.parentNode.insertBefore(nextTabs.__homePlaceholder, nextTabs);
    }

    if (nextTabs.parentElement !== slot) {
      slot.appendChild(nextTabs);
    }
  }

  syncTopbarContext.currentTabs = nextTabs || null;
  document.body.classList.toggle("has-topbar-context", Boolean(nextTabs));
}

function setProductMode(mode = "list") {
  if (mode === 'form' && !isAdminUser()) return;
  const validMode = ["list", "form"].includes(mode) ? mode : "list";
  const root = document.querySelector(".products-layout");
  const changed = root && root.dataset.productsMode !== validMode;
  if (root) root.dataset.productsMode = validMode;

  $$('[data-products-mode-btn]').forEach((button) => {
    const isActive = button.dataset.productsModeBtn === validMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  const dialog=$('productEditorDialog');if(dialog){if(validMode==='form'&&!dialog.open)dialog.showModal();else if(validMode==='list'&&dialog.open)dialog.close();}
  syncTopbarContext();
  if (changed) animatePosFeedback(root.querySelector(validMode === "list" ? ".product-catalog-panel" : ".product-form-panel"), "navigation");
}
function setInventoryMode(mode = "stock") {
  if (mode === 'entry' && !isAdminUser()) return;
  const validMode = ["entry", "stock", "history"].includes(mode) ? mode : "stock";
  const root = document.querySelector(".inventory-management-layout");
  const changed = root && root.dataset.inventoryMode !== validMode;
  if (root) root.dataset.inventoryMode = validMode;

  $$('[data-inventory-mode-btn]').forEach((button) => {
    const isActive = button.dataset.inventoryModeBtn === validMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  syncTopbarContext();
  if (changed) animatePosFeedback(root.querySelector({ entry: ".inventory-entry-panel", stock: ".inventory-analysis-panel", history: ".inventory-history-panel" }[validMode]), "navigation");
}

function setSettingsMode(mode = "general") {
  if (!isAdminUser() && !['general','scale','appearance','peripherals'].includes(mode)) return;
  const validMode = ["general", "business", "scale", "users", "peripherals", "fiscal", "appearance", "audit", "maintenance"].includes(mode) ? mode : "general";
  const root = document.querySelector(".settings-layout");
  const changed = root && root.dataset.settingsMode !== validMode;
  if (root) root.dataset.settingsMode = validMode;
  $$('[data-settings-mode-btn]').forEach((button) => {
    const isActive = button.dataset.settingsModeBtn === validMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });
  $$("[data-settings-pane]").forEach(panel => {
    const entering = panel.hidden && panel.dataset.settingsPane === validMode;
    panel.hidden = panel.dataset.settingsPane !== validMode;
    if (entering) animatePosFeedback(panel, "navigation");
  });
  const headings = {
    general: ["Preferencias del navegador", "General y apariencia"],
    scale: ["Configuración del dispositivo", "Báscula · RHINO BAR-9"],
    users: ["Gestión de accesos", "Usuarios y PIN"],
    audit: ["Trazabilidad del sistema", "Auditoría"]
  };
  if ($("settingsSectionTitle")) $("settingsSectionTitle").textContent = (headings[validMode]||['Configuración','Configuración'])[1];
  if ($("settingsSectionEyebrow")) $("settingsSectionEyebrow").textContent = (headings[validMode]||['Configuración'])[0];
  if (typeof syncConfigurationSection === 'function' && document.getElementById('configurationHeroIcon')) syncConfigurationSection(validMode);
  if ($("settingsScaleConnectionBadge")) $("settingsScaleConnectionBadge").hidden = validMode !== "scale";
  if (validMode === "audit") loadAuditEvents();
  syncTopbarContext();
  if (changed) resetNavigationScroll();
}

function resetNavigationScroll() {
  const workspace=document.querySelector('.workspace');
  if(workspace)workspace.scrollTo({top:0,left:0,behavior:'instant'});
}

function initSettingsNavigation() {
  initSettingsNavigation.cleanup?.();
  const tabs = $$("[data-settings-mode-btn]");
  const mobile = window.matchMedia("(max-width:760px)");
  const setOrientation = () => document.querySelector(".settings-subview-tabs")?.setAttribute("aria-orientation", mobile.matches ? "horizontal" : "vertical");
  setOrientation();
  mobile.addEventListener("change", setOrientation);
  initSettingsNavigation.cleanup = () => mobile.removeEventListener('change',setOrientation);
  tabs.forEach((tab) => {
    on(tab, "click", () => setSettingsMode(tab.dataset.settingsModeBtn));
    on(tab, "keydown", event => {
      const visibleTabs=tabs.filter(button=>!button.hidden),index=visibleTabs.indexOf(tab);
      const next = { ArrowRight: (index + 1) % visibleTabs.length, ArrowDown: (index + 1) % visibleTabs.length, ArrowLeft: (index + visibleTabs.length - 1) % visibleTabs.length, ArrowUp: (index + visibleTabs.length - 1) % visibleTabs.length, Home: 0, End: visibleTabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      setSettingsMode(visibleTabs[next].dataset.settingsModeBtn);
      visibleTabs[next].focus({preventScroll:true});
    });
  });
}

const auditEventLabels = {
  owner_configured: "Configuración inicial del propietario",
  product_created: "Producto creado",
  product_updated: "Producto actualizado",
  inventory_adjusted: "Inventario ajustado",
  inventory_received: "Entrada de mercancía",
  inventory_initial_receipt: "Alta con entrada inicial",
  inventory_initial_count: "Conteo inicial",
  inventory_waste: "Merma registrada",
  inventory_restitution: "Restitución de existencias",
  inventory_restitution_reconciled: "Restitución conciliada",
  sale_completed: "Venta registrada",
  sale_canceled: "Venta cancelada",
  invoice_request_saved: "Solicitud de factura guardada",
  users_updated: "Usuarios actualizados",
  cash_session_opened: "Caja abierta",
  cash_movement_added: "Movimiento de caja",
  cash_session_closed: "Caja cerrada",
  sensitive_data_migrated: "Datos protegidos",
  screen_permission_changed: "Permiso de pantalla actualizado"
};

function getAuditDetailText(event) {
  const details = event?.details || {};
  if(event.event_type==='screen_permission_changed')return `Empleado ${event.entity_id} · ${details.module} · ${details.previous?'Permitido':'Bloqueado'} → ${details.next?'Permitido':'Bloqueado'}`;
  if (["inventory_adjusted", "inventory_initial_count", "inventory_waste", "inventory_restitution", "inventory_initial_receipt"].includes(event.event_type)) {
    return `${details.reason || "Ajuste"} · ${details.previousStock ?? "-"} → ${details.newStock ?? "-"}`;
  }
  if (event.event_type === "sale_completed") {
    return `${details.itemCount || 0} productos · ${money(details.total || 0)}`;
  }
  if (event.event_type === "sale_canceled") return details.reason || "Cancelación registrada";
  if (event.event_type === "inventory_received") {
    return `${quantityText(details.quantity, details.unit || "kg")} · ${money(details.unitCost || 0)}`;
  }
  if (event.event_type === "cash_movement_added") return `${details.type === "out" ? "Retiro" : "Entrada"} · ${money(details.amount || 0)}`;
  if (event.event_type === "cash_session_opened") return `Fondo inicial ${money(details.openingAmount || 0)}`;
  if (event.event_type === "cash_session_closed") return `Diferencia ${money(details.difference || 0)}`;
  return "Acción registrada en el servidor.";
}

async function loadAuditEvents() {
  const list = $("auditEventsList");
  if (!list || !isAdminUser()) return;

  try {
    const events = await fetchJson("/api/audit-events?limit=200");
    if (events.length === 0) {
      list.innerHTML = '<p class="empty-state">Aún no hay acciones registradas.</p>';
      return;
    }

    list.innerHTML = events.map((event) => `
      <article class="audit-event-row">
        <div>
          <strong>${escapeHtml(auditEventLabels[event.event_type] || event.event_type)}</strong>
          <span>${escapeHtml(getAuditDetailText(event))}</span>
        </div>
        <div>
          <small>${escapeHtml(event.actor_name || "Sistema")}</small>
          <time datetime="${escapeHtml(event.created_at)}">${new Date(event.created_at).toLocaleString("es-MX", typeof preferenceDateOptions === "function" ? preferenceDateOptions() : undefined)}</time>
        </div>
      </article>
    `).join("");
  } catch (error) {
    console.error(error);
    list.innerHTML = '<p class="empty-state">No se pudo cargar la bitácora.</p>';
  }
}
function quantityText(quantity, unit, decimals = unit === "kg" ? 3 : 0) {
  return `${Number(quantity || 0).toFixed(decimals)} ${unit === "kg" ? "kg" : "pza"}`;
}

function pieceStockText(quantity) {
  return `${quantity} ${quantity === 1 ? "pza" : "pzas"}`;
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

function showToast(message, kind = 'notice') {
  if(kind==='notice')kind=/no se|error|rechaz|inválid|incorrect|requiere|debe|revisa|falta/i.test(message)?'error':/pendiente|autorización|sin verificar/i.test(message)?'warning':/confirmad|guardad|registrad|actualizad|conciliad/i.test(message)?'success':'notice';
  if (state.backupWarningShown && !/respaldo/i.test(message)) message += ' · Respaldo automático pendiente; solicita revisión técnica.';
  if (typeof noticePreference === 'function' && !noticePreference(kind)) return;
  const toast = $("toast");
  if (!toast) return;

  toast.dataset.kind=kind;toast.setAttribute('role',kind==='error'?'alert':'status');
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
    "favorites",
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
  if (product.photoFile) return `/api/product-photos/${encodeURIComponent(product.photoFile)}`;
  return `${PRODUCT_IMAGE_BASE}/${encodeURIComponent(product.id)}.${extension}`;
}

function getPosProductImagePath(product) {
  return getProductImagePath(product, OPTIMIZED_POS_IMAGES.has(String(product.id)) ? "webp" : "jpg");
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
    hour12: true,
    ...(typeof presentationClockOptions === 'function' ? presentationClockOptions() : {})
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
  if ($("posClockText")) $("posClockText").textContent = `${hour}:${minute} ${period}`;
}

function estimateNextTicketId() {
  const maxNumber = state.sales.reduce((max, sale) => {
    const match = String(sale.id || "").match(/^T-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `T-${String(maxNumber + 1).padStart(6, "0")}`;
}

let ticketLabelInterval = 0;
let ticketLabelTimeout = 0;
let ticketLabelShowsSale = false;

function updateTicketLabelText() {
  const text = $("ticketToggleText");
  if (text) text.textContent = ticketLabelShowsSale ? "Venta actual" : ($("ticketToggleFolio")?.textContent || "");
}

function syncTicketLabelRotation() {
  const button = $("ticketToggleBtn");
  const isPos = state.activeView === "pos" && state.sessionAuthenticated && !state.employeeLoginRequired && !document.hidden;
  if (!button || !isPos) {
    window.clearInterval(ticketLabelInterval);
    window.clearTimeout(ticketLabelTimeout);
    ticketLabelInterval = 0;
    ticketLabelTimeout = 0;
    ticketLabelShowsSale = false;
    button?.classList.remove("ticket-label-out");
    updateTicketLabelText();
    return;
  }
  if (ticketLabelInterval) return;
  ticketLabelShowsSale = false;
  updateTicketLabelText();
  ticketLabelInterval = window.setInterval(() => {
    if (document.hidden) return;
    if (posReducedMotion) {
      ticketLabelShowsSale = !ticketLabelShowsSale;
      updateTicketLabelText();
      return;
    }
    button.classList.add("ticket-label-out");
    ticketLabelTimeout = window.setTimeout(() => {
      ticketLabelShowsSale = !ticketLabelShowsSale;
      updateTicketLabelText();
      button.classList.remove("ticket-label-out");
      ticketLabelTimeout = 0;
    }, 160);
  }, 3500);
}

function updateTicketId() {
  const nextTicketId = estimateNextTicketId();
  const ticketId = $("ticketId");
  const drawerTicketId = $("drawerTicketId");

  if (ticketId) ticketId.textContent = nextTicketId;
  if (drawerTicketId) drawerTicketId.textContent = nextTicketId;
  if ($("ticketToggleFolio")) $("ticketToggleFolio").textContent = nextTicketId;
  if (!ticketLabelShowsSale && !$("ticketToggleBtn")?.classList.contains("ticket-label-out")) updateTicketLabelText();
}

function getTicketTotal() {
  const subtotal = state.ticket.reduce((sum, item) => sum + Number(item.total || 0), 0);
  return Math.max(subtotal - state.discount, 0);
}

function setPosStep(step) {
  // Seleccionar o agregar productos conserva la preferencia de visibilidad.
  state.posStep = "product";
  if (step === "checkout") state.ticketCollapsed = false;
  saveLocalPreference("ticketCollapsed", String(state.ticketCollapsed));
  updateShellState();
}

function updateShellState() {
  const sessionBox = document.querySelector(".session-box");
  const sessionSlot = $(state.sessionAuthenticated && !state.employeeLoginRequired ? "topbarSessionSlot" : "sidebarSessionSlot");
  if (sessionBox && sessionSlot && sessionBox.parentElement !== sessionSlot) sessionSlot.appendChild(sessionBox);
  document.body.classList.toggle("pos-approved", state.activeView === "pos" && state.sessionAuthenticated && !state.employeeLoginRequired);
  document.body.classList.toggle("atelier-shell", state.activeView !== "pos" && state.sessionAuthenticated && !state.employeeLoginRequired);
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
    mobileSidebarButton.textContent = state.activeView === "pos"
      ? (state.sidebarCollapsed ? ">" : "<")
      : (state.sidebarCollapsed ? "›" : "‹");
    mobileSidebarButton.setAttribute(
      "aria-label",
      state.sidebarCollapsed ? "Mostrar menú" : "Ocultar menú"
    );
    mobileSidebarButton.setAttribute("title", state.sidebarCollapsed ? "Mostrar menú" : "Ocultar menú");
  }

  if (sidebarToggleIcon) {
    sidebarToggleIcon.textContent = state.activeView === "pos"
      ? (state.sidebarCollapsed ? ">" : "<")
      : (state.sidebarCollapsed ? "›" : "‹");
  }

  const isTicketOpen = state.activeView === "pos" && state.sessionAuthenticated &&
    !state.employeeLoginRequired && !state.ticketCollapsed;
  const ticketPanel = $("currentSalePanel");
  if (ticketButton) {
    const ticketLabel = isTicketOpen ? "Cerrar venta actual" : "Abrir venta actual";
    const folio = $("ticketToggleFolio")?.textContent || $("ticketId")?.textContent || "";
    ticketButton.setAttribute("aria-label", ticketLabel + ", " + folio + ", " + state.ticket.length + " productos, " + money(getTicketTotal()));
    ticketButton.setAttribute("title", ticketLabel);
    ticketButton.setAttribute("aria-expanded", String(isTicketOpen));
    ticketButton.classList.toggle("active", isTicketOpen);
    if (!isTicketOpen && ticketPanel?.contains(document.activeElement)) {
      ticketButton.focus({ preventScroll: true });
    }
  }
  if (ticketPanel) {
    ticketPanel.inert = !isTicketOpen;
    ticketPanel.setAttribute("aria-hidden", String(!isTicketOpen));
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
  syncSidebarToggleUi();
  syncTopbarContext();
  syncTicketLabelRotation();
}

function syncSidebarToggleUi() {
  const sidebarButton = $("sidebarToggleBtn");
  const mobileSidebarButton = $("mobileSidebarToggleBtn");
  const sidebarToggleIcon = $("sidebarToggleIcon");
  const actionLabel = state.sidebarCollapsed ? "Mostrar menú" : "Ocultar menú";
  const asset = $("sidebarToggleAsset");
  if (asset) {
    const source = "./assets/pos/" + (state.sidebarCollapsed ? "abrir.svg" : "cerrar.svg");
    if (asset.getAttribute("src") !== source) asset.setAttribute("src", source);
  }
  sidebarButton?.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  mobileSidebarButton?.setAttribute("aria-expanded", String(!state.sidebarCollapsed));


  if (sidebarButton) {
    sidebarButton.setAttribute("aria-label", actionLabel);
    sidebarButton.setAttribute("title", actionLabel);
  }

  if (mobileSidebarButton) {
    mobileSidebarButton.textContent = state.activeView === "pos"
      ? (state.sidebarCollapsed ? ">" : "<")
      : (state.sidebarCollapsed ? "›" : "‹");
    mobileSidebarButton.setAttribute("aria-label", actionLabel);
    mobileSidebarButton.setAttribute("title", actionLabel);
  }

  if (sidebarToggleIcon) {
    sidebarToggleIcon.textContent = state.activeView === "pos"
      ? (state.sidebarCollapsed ? ">" : "<")
      : (state.sidebarCollapsed ? "›" : "‹");
  }
}

function toggleSidebar() {
  const nextCollapsed = !state.sidebarCollapsed;

  state.sidebarCollapsed = nextCollapsed;
  saveLocalPreference("sidebarCollapsed", String(nextCollapsed));

  document.body.classList.remove("sidebar-transitioning", "sidebar-expanding", "sidebar-collapsing");
  document.body.classList.toggle("sidebar-collapsed", nextCollapsed);
  syncSidebarToggleUi();
}

function toggleTicketPanel(forceOpen = false) {
  if (forceOpen || state.ticketCollapsed) {
    setPosStep("checkout");
  } else {
    closeTicketDrawer();
  }
}

function syncReportNavigation() {
  if (state.activeView !== "reports") return;
  $("pageTitle").textContent = state.reportsMode === "cash" ? "Caja y cortes" : "Reportes";
  $$('.nav-item[data-view="reports"]').forEach(button => button.classList.toggle("active", (button.dataset.reportsTarget || "reports") === state.reportsMode));
}

function setReportsMode(mode = "reports") {
  const nextMode = mode === "cash" ? "cash" : "reports";
  if (state.sessionAuthenticated && !canAccessView('reports',nextMode)) return;
  const changed = state.reportsMode !== nextMode;
  state.reportsMode = nextMode;
  const reportsView = $("reportsView");
  if (reportsView) reportsView.dataset.reportsMode = nextMode;

  $$('[data-reports-mode-btn]').forEach((button) => {
    const active = button.dataset.reportsModeBtn === nextMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  syncReportNavigation();
  if (state.activeView === "reports") {
    if (nextMode === "cash") loadCashCut();
    else loadReports();
    if (changed) {resetNavigationScroll();animatePosFeedback(reportsView, "navigation");}
  }
}

function setView(viewName) {
  if (!canAccessView(viewName)) {
    if (typeof ensureAllowedScreen === 'function') ensureAllowedScreen();
    showToast('No tienes autorización para esa pantalla.');
    return;
  }

  if (viewName !== "pos" && state.activeView === "pos") {
    closePieceQuantityModal(false, true);
    clearSelectedProduct({ immediate: true });
  }
  const changed = state.activeView !== viewName;
  state.activeView = viewName;

  $$(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  const nextView = $(`${viewName}View`);
  $$(".app-view").forEach((view) => {
    if (view !== nextView) posFeedbackByElement.get(view)?.cancel();
    view.classList.toggle("active", view === nextView);
    view.classList.remove("view-entering");
  });

  const [title, subtitle] = viewLabels[viewName] || viewLabels.pos;
  $("pageTitle").textContent = title;
  $("pageSubtitle").textContent = subtitle;
  syncReportNavigation();
  const breadcrumb = document.querySelector(".pos-breadcrumb");
  if (breadcrumb) breadcrumb.textContent = "EL MUELLE / " + ({pos:"OPERACIÓN",sales:"OPERACIÓN",billing:"OPERACIÓN",products:"GESTIÓN",inventory:"GESTIÓN",dashboard:"ANÁLISIS",reports:state.reportsMode === "cash" ? "OPERACIÓN" : "ANÁLISIS",settings:"SISTEMA"}[viewName] || "OPERACIÓN");
  updateShellState();
  syncTopbarContext();
  if (changed) {resetNavigationScroll();animatePosFeedback(nextView, "navigation");}

  if (viewName === "sales") loadSalesAdmin();
  if (viewName === "dashboard") loadDashboard();
  if (viewName === "billing") loadRecentSales();
  if (viewName === "reports") {
    if (state.reportsMode === "cash") loadCashCut();
    else loadReports();
  }
  if (viewName === "inventory") loadInventoryEntries();
  if (viewName === "products") renderAdminProducts();
  if (viewName === "settings") {
    updateScaleUi();
    renderUserSettings();
  }
}

async function fetchJson(url, options = {}) {
  const headers = new Headers(options.headers || {});

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "same-origin"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.message || "No se pudo completar la operación.");
    error.status = response.status;
    error.payload = payload;
    if(payload.code==='SCREEN_FORBIDDEN')window.dispatchEvent(new Event('elmuelle:access-denied'));
    throw error;
  }

  if (state.sessionAuthenticated && state.sessionToken) {
    refreshStoredSessionExpiry();
    scheduleSessionExpiryLogout();
  }

  if (response.headers.get('X-ElMuelle-Backup') === 'pending' && !state.backupWarningShown) {
    state.backupWarningShown = true;
    showToast('Las operaciones se conservan, pero el respaldo automático está pendiente. Solicita revisión técnica.');
  } else if (response.headers.get('X-ElMuelle-Backup') !== 'pending') state.backupWarningShown = false;
  return response.json();
}

function normalizePublicSettings(settings = {}) {
  const setupRequired = settings.setupRequired === true;
  const incomingUsers = Array.isArray(settings.users) ? settings.users : [];
  const users = incomingUsers
    .map((user) => normalizeSessionUser(user));

  return {
    setupRequired,
    users,
    adminPinChangeRequired: settings.adminPinChangeRequired === true,
    employeePinChangeRequired: settings.employeePinChangeRequired === true,
    updatedAt: settings.updatedAt || null
  };
}

function cloneSettingsUsers(users = []) {
  return users.map((user) => ({ ...normalizeSessionUser(user) }));
}

function applyPublicSettings(settings = {}) {
  state.settings = normalizePublicSettings(settings);
  setSetupRequired(state.settings.setupRequired);
  document.body.classList.toggle("admin-pin-change-required", state.settings.adminPinChangeRequired);
  document.body.classList.toggle("employee-pin-change-required", state.settings.employeePinChangeRequired);
  state.settingsDraft = cloneSettingsUsers(state.settings.users);

  if (state.settings.setupRequired) return;

  if (!isAdminUser()) {
    const matchingEmployee = state.settings.users.find((user) => {
      return user.role === "employee" && user.id === state.currentUser?.id;
    });

    state.currentUser = normalizeSessionUser({...(matchingEmployee || getEmployeeSessionUser()),...(state.currentUser?.permissions?{permissions:state.currentUser.permissions}:{})});
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
    return settings;
  } catch (error) {
    console.error(error);
    applyPublicSettings(state.settings);
    showToast("No se pudo cargar la configuración de usuarios.");
    return state.settings;
  }
}

async function verifyAdminPin(pin, manualContext = null) {
  const normalizedPin = String(pin || "").trim();

  if (!normalizedPin) {
    throw new Error("Ingresa el PIN de administrador.");
  }

  return fetchJson(manualContext ? '/api/authorizations/manual-weight' : '/api/auth/admin/verify', {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ pin: normalizedPin, ...(manualContext || {}) })
  });
}

async function loginAdmin(pin) {
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
  try {
    const result = await fetchJson("/api/auth/session");

    if (result.authenticated === false || !result.user) {
      state.sessionToken = "";
      state.sessionAuthenticated = false;
      clearStoredAuthSession();
      return false;
    }

    applyPublicSettings(result.settings);
    state.sessionAuthenticated = true;
    state.sessionToken = "cookie-session";
    saveSessionToken(true);
    setCurrentUser(result.user);
    return true;
  } catch (error) {
    if (error?.status !== 401) {
      console.warn(error.message || error);
    }

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
    employeesList.innerHTML = '<p class="empty-list">Aún no hay empleados. Podrás agregarlos cuando se incorporen al negocio.</p>';
    return;
  }

  const rotationNotice = state.settings.employeePinChangeRequired
    ? '<p class="users-helper-text">Por seguridad, asigna un PIN nuevo de 6 a 12 dígitos a cada empleado.</p>'
    : '';

  employeesList.innerHTML = rotationNotice + employees
    .map((employee) => {
      return `
        <article class="user-row">
          <div class="user-row-identity">
            <label>Nombre<input type="text" maxlength="60" data-employee-name="${escapeHtml(employee.id)}" value="${escapeHtml(employee.name)}" /></label>
            <span>${employee.active === false ? 'Inactivo' : 'Activo'} · PIN ${employee.hasPin ? "configurado" : "pendiente"}</span>
          </div>
          <label class="user-pin-reset">
            <span>Nuevo PIN</span>
            <input
              type="password"
              inputmode="numeric"
              maxlength="12"
              placeholder="${state.settings.employeePinChangeRequired ? "Obligatorio" : "Conservar"}"
              data-employee-pin="${escapeHtml(employee.id)}"
              value="${escapeHtml(employee.pendingPin || state.employeePinDrafts[employee.id] || "")}"
            />
          </label>
          <div class="management-row-actions"><button class="quiet-btn" type="button" data-toggle-employee="${escapeHtml(employee.id)}">${employee.active === false ? 'Activar' : 'Desactivar'}</button>
          <button class="user-remove-btn" type="button" data-remove-employee="${escapeHtml(employee.id)}">
            Quitar
          </button></div>
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
  employeesList.querySelectorAll('[data-employee-name]').forEach(input => input.addEventListener('input',()=>{const employee=getSettingsDraftUsers().find(user=>user.id===input.dataset.employeeName);if(employee)employee.name=input.value;}));

  employeesList.querySelectorAll("[data-remove-employee]").forEach((button) => {
    button.addEventListener("click", () => removeEmployeeDraft(button.dataset.removeEmployee));
  });
  employeesList.querySelectorAll('[data-toggle-employee]').forEach(button => button.addEventListener('click', () => {
    const employee = getSettingsDraftUsers().find(user => user.id === button.dataset.toggleEmployee);
    if (employee) employee.active = employee.active === false;
    renderUserSettings();
  }));
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

  if (!/^\d{6,12}$/.test(pin)) {
    showToast("El PIN inicial debe tener de 6 a 12 dígitos.");
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
  const configurationVersion = typeof settingsCenter === 'undefined' ? null : settingsCenter.loadVersion;
  const currentConfiguration = () => configurationVersion === null || configurationVersion === settingsCenter.loadVersion;
  const currentPin = String($("currentAdminPinInput")?.value || "").trim();
  const newPin = String($("newAdminPinInput")?.value || "").trim();
  const confirmPin = String($("confirmAdminPinInput")?.value || "").trim();
  const adminName = String($("adminUserNameInput")?.value || "").trim();

  if (!adminName) {
    showToast("Escribe el nombre del administrador.");
    $("adminUserNameInput")?.focus();
    return;
  }

  if (newPin && !currentPin) {
    showToast("Ingresa el PIN actual para cambiarlo.");
    $("currentAdminPinInput")?.focus();
    return;
  }

  if (state.settings.adminPinChangeRequired && !newPin) {
    showToast("Por seguridad, captura un PIN nuevo para el administrador.");
    $("newAdminPinInput")?.focus();
    return;
  }

  if (newPin && !/^\d{6,12}$/.test(newPin)) {
    showToast("El PIN nuevo debe tener de 6 a 12 dígitos.");
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
      active: employee.active !== false
    }))
  ];

  const employeePins = Object.fromEntries(
    employees
      .map((employee) => [employee.id, String(employee.pendingPin || state.employeePinDrafts[employee.id] || "").trim()])
      .filter(([, pin]) => Boolean(pin))
  );

  if (state.settings.employeePinChangeRequired && Object.keys(employeePins).length !== employees.length) {
    showToast("Asigna un PIN nuevo de 6 a 12 dígitos a cada empleado.");
    $("employeesList")?.querySelector("[data-employee-pin]")?.focus();
    return;
  }

  const saveButton = $("saveUserSettingsBtn");
  if (saveButton) saveButton.disabled = true;
  if (saveButton) saveButton.textContent = "Guardando usuarios…";
  if ($('configurationUserStatus')) $('configurationUserStatus').textContent='Guardando cambios…';
  const adminContact = $('adminContactEmail') ? {email:$('adminContactEmail').value.trim(),phone:$('adminContactPhone').value.trim()} : null;

  try {
    const settings = await fetchJson("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        currentAdminPin: currentPin,
        newAdminPin: newPin,
        users,
        employeePins,
        ...(adminContact ? {adminContact} : {})
      })
    });

    if (!currentConfiguration()) return;
    applyPublicSettings(settings);

    state.employeePinDrafts = {};

    ["currentAdminPinInput", "newAdminPinInput", "confirmAdminPinInput", "newEmployeeNameInput", "newEmployeePinInput"].forEach((id) => {
      const input = $(id);
      if (input) input.value = "";
    });

    renderUserSettings();
    updateShellState();
    showToast("Usuarios y PIN actualizados.", 'success');
    if ($('configurationUserStatus')) $('configurationUserStatus').textContent='Usuarios y datos de contacto guardados.';
    if (typeof settingsCenter !== 'undefined' && settingsCenter.configuration && adminContact) settingsCenter.configuration.profile=adminContact;
    if ($('configurationUserCount')) $('configurationUserCount').textContent=state.settings.users.length;
  } catch (error) {
    if (!currentConfiguration()) return;
    console.error(error);
    showToast(error.message || "No se pudo guardar la configuración.");
    if ($('configurationUserStatus')) $('configurationUserStatus').textContent=error.message||'No se pudo guardar. Puedes reintentar.';
    $("currentAdminPinInput")?.focus();
  } finally {
    if (saveButton && currentConfiguration()) saveButton.disabled = false;
    if (saveButton && currentConfiguration()) saveButton.textContent = "Guardar cambios";
  }
}

async function loadCashSessions() {
  if (!state.sessionAuthenticated) {
    state.cashSessions = [];
    state.currentCashSession = null;
    updateCashGateUi();
    return;
  }

  try {
    if(!canAccessView('reports','cash')) {
      const current=await fetchJson('/api/cash-sessions/current');
      state.cashSessions=[];state.currentCashSession=current.session;updateCashGateUi();return;
    }
    state.cashSessions = await fetchJson("/api/cash-sessions");
    if ($('cashLoadError')) $('cashLoadError').hidden = true;
    state.currentCashSession = state.cashSessions.find((session) => session.status === "open") || null;
    renderCashRegister();
    renderCashHistory();
    updateCashGateUi();
  } catch (error) {
    console.error(error);
    state.cashSessions = [];
    state.currentCashSession = null;
    updateCashGateUi();
    showToast(error.message || "No se pudo cargar el estado de caja.");
    if ($('cashLoadError')) $('cashLoadError').hidden = false;
  }
}


async function loadProducts() {
  if (typeof canReadProductData === 'function' && !canReadProductData()) {state.products=[];return;}
  try {
    state.products = await fetchJson("/api/products");
    if(typeof refreshCatalogPending==='function')refreshCatalogPending();
    pruneMissingFavorites();

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
  const salesUrl=typeof accessSalesUrl==='function'?accessSalesUrl():'/api/sales';
  if(!salesUrl){state.sales=[];await loadCashSessions();return;}
  try {
    state.sales = await fetchJson(salesUrl);
    await loadCashSessions();
    updateTicketId();
    renderProducts();
    renderInventory();
    if (state.activeView === "dashboard") renderDashboard();
  } catch (error) {
    console.error(error);
  }
}

function syncFavoritesForUser() {
  const userId = state.sessionAuthenticated && state.currentUser?.id ? String(state.currentUser.id) : null;
  if (state.favoriteOwnerId === userId) return;
  state.favoriteOwnerId = userId;
  state.favoriteProductIds = new Set();
  state.activeCategory = "all";
  if (!userId) return;
  if (!favoriteMemory.has(userId)) {
    let ids = [];
    try {
      const stored = JSON.parse(readLocalPreference(FAVORITES_PREFIX + encodeURIComponent(userId), "[]"));
      if (Array.isArray(stored)) ids = stored.filter((id) => typeof id === "string");
    } catch (_) { /* Una preferencia dañada no impide usar el catálogo. */ }
    favoriteMemory.set(userId, new Set(ids));
  }
  state.favoriteProductIds = favoriteMemory.get(userId);
}

function persistFavorites() {
  const userId = state.favoriteOwnerId;
  if (!userId) return;
  if (!saveLocalPreference(FAVORITES_PREFIX + encodeURIComponent(userId), JSON.stringify([...state.favoriteProductIds])) && !favoriteStorageWarnings.has(userId)) {
    favoriteStorageWarnings.add(userId);
    showToast("Favoritos disponibles durante esta sesión; el navegador no permite guardarlos.");
  }
}

function pruneMissingFavorites() {
  syncFavoritesForUser();
  const existingIds = new Set(state.products.map((product) => String(product.id)));
  let changed = false;
  for (const id of state.favoriteProductIds) {
    if (!existingIds.has(id)) { state.favoriteProductIds.delete(id); changed = true; }
  }
  if (changed) persistFavorites();
}

function toggleProductFavorite(productId) {
  syncFavoritesForUser();
  const id = String(productId);
  if (!state.favoriteOwnerId || !state.products.some((product) => String(product.id) === id)) return;
  if (state.favoriteProductIds.has(id)) state.favoriteProductIds.delete(id);
  else state.favoriteProductIds.add(id);
  persistFavorites();
}

function getFilteredProducts() {
  syncFavoritesForUser();
  const query = $("searchInput").value.trim().toLowerCase();

  return state.products.filter((product) => {
    const isActive = product.active !== false;
    const matchesCategory =
      state.activeCategory === "all" ||
      (state.activeCategory === "favorites" ? state.favoriteProductIds.has(String(product.id)) : product.category === state.activeCategory);
    const matchesUnit =
      state.activeUnitFilter === "all" || product.unit === state.activeUnitFilter;
    const matchesSearch = product.name.toLowerCase().includes(query) || String(product.id).toLowerCase().includes(query);

    return isActive && matchesCategory && matchesUnit && matchesSearch;
  });
}

function renderCategories() {
  syncFavoritesForUser();
  const categoryGrid = $("categoryGrid");
  if (!categoryGrid) return;
  const categoryScroll = categoryGrid.scrollLeft;

  const favoritesActive = state.activeCategory === "favorites";
  $("catalogFavoritesBtn")?.setAttribute("aria-pressed", String(favoritesActive));
  $("catalogFavoritesBtn")?.classList.toggle("active", favoritesActive);
  const categoryIcons = { "Pescados y mariscos": "🐟", "Carnes selectas": "🥩", "Para el antojo": "🍟", "Condimentos y salsas": "🧂" };
  categoryGrid.innerHTML = getCategories().filter((category) => category !== "favorites")
    .map((category) => {
      const label = category === "all" ? "Todos" : category;

      return `
        <button class="category-card ${state.activeCategory === category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}" aria-pressed="${state.activeCategory === category}">
          <span class="pos-category-icon" aria-hidden="true">${category === "all" ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/></svg>' : categoryIcons[category] || getProductIcon({category})}</span><strong>${escapeHtml(label)}</strong>
        </button>
      `;
    })
    .join("");

  categoryGrid.scrollLeft = categoryScroll;
  $$(".category-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.category;
      renderCategories();
      renderProducts();
      [...categoryGrid.querySelectorAll("[data-category]")].find((item) => item.dataset.category === state.activeCategory)?.focus();
    });
  });
}

function renderProducts() {
  const productGrid = $("productGrid");
  if (!productGrid) return;
  const previousView = productGrid.dataset.catalogView;
  const viewChanged = previousView && previousView !== state.catalogView;
  const oldScroll = productGrid.scrollTop;
  const gridTop = productGrid.getBoundingClientRect().top;
  const anchor = viewChanged && oldScroll > 0
    ? [...productGrid.querySelectorAll(".product-card,.pos-list-add")].find((button) => (button.closest("tr") || button).getBoundingClientRect().bottom > gridTop + 32)?.dataset.id
    : null;
  productGrid.classList.toggle("pos-list-view", state.catalogView === "list");
  productGrid.dataset.catalogView = state.catalogView;
  for (const [id, view] of [["catalogImagesBtn", "images"], ["catalogListBtn", "list"]]) {
    $(id)?.setAttribute("aria-pressed", String(state.catalogView === view));
    $(id)?.classList.toggle("active", state.catalogView === view);
  }

  const visibleProducts = getFilteredProducts();

  if (visibleProducts.length === 0) {
    const emptyMessage = state.activeCategory === "favorites"
      ? (state.favoriteProductIds.size ? "No hay favoritos con esta búsqueda o filtro." : "Aún no tienes favoritos. Marca la estrella de un producto en Todos para encontrarlo aquí.")
      : "No hay productos con ese filtro.";
    productGrid.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    animatePosFeedback(productGrid);
    return;
  }

  const productSalesMap = state.catalogView === "images" ? getProductSalesMap() : null;
  const catalogHeight = productGrid.clientHeight || Math.max(208, window.innerHeight - (window.innerWidth <= 600 ? 248 : 154));
  const columns = window.innerWidth > 1099 ? 4 : 2;
  const rowHeight = window.innerWidth > 1099 ? Math.max(144, (catalogHeight - 12) / 3) : window.innerWidth <= 600 ? 208 : 210;
  const rowStride = rowHeight + (window.innerWidth <= 600 ? 8 : 4);
  const projectedScroll = anchor ? Math.floor(visibleProducts.findIndex((product) => product.id === anchor) / columns) * rowStride : oldScroll;
  const imageScroll = Math.max(0, Math.min(projectedScroll, Math.ceil(visibleProducts.length / columns) * rowStride - catalogHeight));

  productGrid.innerHTML = state.catalogView === "list" ? `
    <table class="pos-catalog-list">
      <caption class="sr-only">Productos del catálogo</caption>
      <thead><tr><th scope="col">Producto</th><th scope="col">Categoría</th><th scope="col">Precio / unidad</th><th scope="col">Disponible</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>${visibleProducts.map((product) => {
        const favorite = state.favoriteProductIds.has(String(product.id));
        const stock = typeof product.stockQuantity === "number"
          ? (product.unit === "pieza" ? pieceStockText(product.stockQuantity) : quantityText(product.stockQuantity, product.unit, 2)) : "Sin verificar";
        return `<tr><th scope="row">${escapeHtml(product.name)}</th><td data-label="Categoría">${escapeHtml(product.category)}</td><td data-label="Precio"><b>${money(product.price)}</b> / ${escapeHtml(getUnitLabel(product.unit))}</td><td data-label="Disponible">${escapeHtml(stock)}</td><td class="pos-list-actions"><button class="pos-list-favorite" type="button" data-favorite-id="${escapeHtml(product.id)}" aria-pressed="${favorite}" aria-label="${favorite ? "Quitar de favoritos: " : "Añadir a favoritos: "}${escapeHtml(product.name)}">${FAVORITE_STAR}</button><button class="pos-list-add" type="button" data-id="${escapeHtml(product.id)}" aria-label="Agregar: ${escapeHtml(product.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></td></tr>`;
      }).join("")}</tbody>
    </table>` : visibleProducts
    .map((product, index) => {
      const badge = categoryBadges[product.category] || "PRO";
      const stock =
        typeof product.stockQuantity === "number"
          ? (product.unit === "pieza" ? pieceStockText(product.stockQuantity) : quantityText(product.stockQuantity, product.unit, 2))
          : "Sin verificar";
      const stockLabel = stock === "Sin verificar" ? stock : `Disp. ${stock}`;
      const iconKey = getProductIconKey(product);
      const heatClass = getProductHeatClass(product, productSalesMap);
      const imagePath = getPosProductImagePath(product);
      const imageFallbackPath = getProductImagePath(product, "jpg");
      const rowTop = Math.floor(index / columns) * rowStride;
      const initiallyVisible = rowTop < imageScroll + catalogHeight && rowTop + rowHeight > imageScroll;

      return `
        <article class="product-tile">
        <button class="product-card ${escapeHtml(heatClass)} ${state.selectedProduct?.id === product.id ? "selected" : ""}" type="button" data-id="${escapeHtml(product.id)}" style="--product-index: ${index}">
          <span class="product-media">
            <img data-product-image src="${escapeHtml(imagePath)}" data-fallback="${escapeHtml(imageFallbackPath)}" width="1152" height="768" alt="" loading="${initiallyVisible ? "eager" : "lazy"}" fetchpriority="${initiallyVisible && index < columns ? "high" : "auto"}" decoding="async" />
            <span class="product-icon icon-${escapeHtml(iconKey)}">${getProductIcon(product)}</span>
            <span class="product-badge badge-${escapeHtml(badge.toLowerCase())}">${escapeHtml(badge)}</span>
          </span>
          <span class="product-info">
            <strong>${escapeHtml(product.name)}</strong>
            <span class="product-price"><b>${money(product.price)}</b><span> / ${escapeHtml(getUnitLabel(product.unit))}</span></span>
            <small class="product-stock">${escapeHtml(stockLabel)}</small>
            <span class="product-add" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span>
          </span>
        </button>
        <button class="product-favorite" type="button" data-favorite-id="${escapeHtml(product.id)}" aria-pressed="${state.favoriteProductIds.has(String(product.id))}" aria-label="${state.favoriteProductIds.has(String(product.id)) ? "Quitar de favoritos: " : "Añadir a favoritos: "}${escapeHtml(product.name)}">${FAVORITE_STAR}</button>
        </article>
      `;
    })
    .join("");

  if (anchor) {
    const button = [...productGrid.querySelectorAll(".product-card,.pos-list-add")].find((item) => item.dataset.id === anchor);
    if (button) {
      const row = button.closest("tr") || button;
      const headHeight = state.catalogView === "list" && window.innerWidth > 600 ? productGrid.querySelector("thead").getBoundingClientRect().height : 0;
      productGrid.scrollTop += row.getBoundingClientRect().top - productGrid.getBoundingClientRect().top - headHeight;
    }
  }
  animatePosFeedback(productGrid);
}

function handleCatalogClick(event) {
  const grid = $("productGrid");
  const favorite = event.target.closest("[data-favorite-id]");
  if (favorite && grid.contains(favorite)) {
    const id = favorite.dataset.favoriteId;
    const index = [...grid.querySelectorAll("[data-favorite-id]")].indexOf(favorite);
    toggleProductFavorite(id);
    if (state.activeCategory === "favorites") {
      renderProducts();
      const buttons = [...grid.querySelectorAll("[data-favorite-id]")];
      (buttons[index] || buttons[index - 1] || $("catalogFavoritesBtn"))?.focus({ preventScroll: true });
    } else {
      const product = state.products.find((item) => String(item.id) === id);
      const active = state.favoriteProductIds.has(id);
      favorite.setAttribute("aria-pressed", String(active));
      favorite.setAttribute("aria-label", `${active ? "Quitar de favoritos: " : "Añadir a favoritos: "}${product?.name || ""}`);
      animatePosFeedback(favorite, "control");
    }
    return;
  }
  const button = event.target.closest(".product-card,.pos-list-add");
  if (button && grid.contains(button)) selectProduct(state.products.find((item) => item.id === button.dataset.id));
}

function handlePosImageError(event) {
  const image = event.target;
  if (!image.matches?.("[data-product-image],#weighProductPhoto")) return;
  if (!image.dataset.fallbackTried && image.dataset.fallback && image.getAttribute("src") !== image.dataset.fallback) {
    image.dataset.fallbackTried = "1";
    image.src = image.dataset.fallback;
    return;
  }
  image.parentElement?.classList.add("missing");
  image.removeAttribute("src");
}

function setFilter(filter) {
  state.activeUnitFilter = filter;

  $("filterAll").classList.toggle("active", filter === "all");
  $("filterKg").classList.toggle("active", filter === "kg");
  $("filterPiece").classList.toggle("active", filter === "pieza");

  renderProducts();
}

function selectProduct(product) {
  if (state.checkoutPending || state.checkoutProcessing) { showToast('Resuelve el cobro pendiente antes de cambiar la venta.'); return; }
  if (!product) return;
  if(typeof product.stockQuantity!=='number'){showToast('Existencias sin verificar. Registra primero el conteo inicial.');return;}
  const deselect = product.unit === "kg" && state.selectedProduct?.id === product.id;
  // Un único punto de entrada descarta el borrador anterior antes de abrir el siguiente.
  closePieceQuantityModal(false, true);
  clearSelectedProduct({ immediate: true });

  if (deselect) {
    focusCatalogProduct(product.id);
    return;
  }

  if (product.unit === "pieza") {
    openPieceQuantityModal(product);
    return;
  }

  state.selectedProduct = product;
  state.quantitySource = product.unit === "kg" && scaleState.connected ? "scale" : "manual";
  state.detectedQuantity = product.unit === "kg" ? (scaleState.connected ? scaleState.weightKg : 0) : 1;

  renderWeighPanel();
  syncProductSelection();
  setPosStep("product");
  ($("confirmWeightBtn").disabled ? $("manualWeightBtn") : $("confirmWeightBtn"))?.focus({ preventScroll: true });

  if (scaleState.connected) {
    requestScaleWeight();
  }
}

function focusCatalogProduct(productId) {
  ($$(".product-card,.pos-list-add").find((button) => button.dataset.id === productId) || $("searchInput"))?.focus({ preventScroll: true });
}

function syncProductSelection() {
  $("productGrid")?.querySelectorAll(".product-card").forEach((button) => {
    button.classList.toggle("selected", button.dataset.id === state.selectedProduct?.id);
  });
  const active = state.activeView === "pos" && Boolean(state.selectedProduct);
  document.body.classList.toggle("product-selected", active);
  const panel = document.querySelector(".weigh-panel");
  if (panel) {
    panel.inert = !active;
    panel.setAttribute("aria-hidden", String(!active));
    if (active) panel.removeAttribute("data-close-immediate");
  }
}

function clearSelectedProduct({ restoreFocus = false, immediate = false } = {}) {
  const productId = state.selectedProduct?.id;
  closeManualModal(false, immediate);
  document.querySelector(".weigh-panel")?.toggleAttribute("data-close-immediate", immediate);
  state.selectedProduct = null;
  state.detectedQuantity = 0;
  state.quantitySource = "manual";
  state.manualAuthorization = null;
  renderWeighPanel();
  syncProductSelection();
  if (restoreFocus && productId) focusCatalogProduct(productId);
}

function validatePieceQuantity(product, rawQuantity) {
  const quantity = Number(rawQuantity);
  const reserved = state.ticket
    .filter((item) => item.productId === product?.id && item.unit === "pieza")
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const existing = state.ticket.find((item) => item.productId === product?.id && item.unit === "pieza" && Number(item.price) === Number(product?.price));
  const lineRemaining = Math.max(0, 100 - Number(existing?.quantity || 0));
  const available = typeof product?.stockQuantity === "number" && Number.isFinite(product.stockQuantity)
    ? Math.max(0, product.stockQuantity - reserved) : null;
  let error = "";
  if (!product || product.unit !== "pieza" || product.active === false) error = "Este producto ya no está disponible.";
  else if (!/^\d+$/.test(String(rawQuantity).trim()) || !Number.isSafeInteger(quantity) || quantity <= 0) error = "Ingresa una cantidad entera mayor que cero.";
  else if (available !== null && quantity > available) error = "La cantidad supera la existencia disponible para esta venta.";
  else if (quantity > lineRemaining) error = "El límite vigente es de 100 piezas por renglón de venta.";
  return { quantity, available, maximum: Math.min(lineRemaining, available ?? lineRemaining), error };
}

function updatePieceQuantityModal() {
  const product = state.products.find((item) => item.id === state.pieceQuantityProductId);
  const result = validatePieceQuantity(product, $("pieceQuantityInput").value);
  $("pieceQuantityStock").textContent = result.available === null ? "Disponible: sin conteo" : `Disponible para agregar: ${pieceStockText(result.available)}`;
  $("pieceQuantitySubtotal").textContent = money(!result.error ? result.quantity * Number(product.price) : 0);
  $("pieceQuantityError").textContent = result.error;
  $("pieceQuantityInput").setAttribute("aria-invalid", String(Boolean(result.error)));
  $("confirmPieceQuantityBtn").disabled = Boolean(result.error);
  $("decreasePieceQuantityBtn").disabled = !Number.isSafeInteger(result.quantity) || result.quantity <= 1;
  $("increasePieceQuantityBtn").disabled = Number.isSafeInteger(result.quantity) && result.quantity >= Math.floor(result.maximum);
}

function openPieceQuantityModal(product) {
  state.pieceQuantityProductId = product.id;
  $("pieceQuantityProductName").textContent = product.name;
  $("pieceQuantityUnitPrice").textContent = `${money(product.price)} / pieza`;
  $("pieceQuantityInput").value = "1";
  updatePieceQuantityModal();
  $("pieceQuantityModal").removeAttribute("data-close-immediate");
  $("pieceQuantityModal").inert = false;
  $("pieceQuantityModal").setAttribute("aria-hidden", "false");
  $("pieceQuantityModal").classList.remove("hidden");
  $("pieceQuantityInput").focus();
  $("pieceQuantityInput").select();
}

function closePieceQuantityModal(restoreFocus = true, immediate = false) {
  const productId = state.pieceQuantityProductId;
  state.pieceQuantityProductId = null;
  $("pieceQuantityModal").toggleAttribute("data-close-immediate", immediate);
  $("pieceQuantityModal").inert = true;
  $("pieceQuantityModal").setAttribute("aria-hidden", "true");
  $("pieceQuantityModal").classList.add("hidden");
  $("pieceQuantityInput").value = "";
  $("pieceQuantityError").textContent = "";
  if (restoreFocus) {
    focusCatalogProduct(productId);
  }
}

function stepPieceQuantity(direction) {
  const input = $("pieceQuantityInput");
  const current = Number(input.value);
  input.value = String(Math.max(1, (Number.isSafeInteger(current) ? current : 0) + direction));
  updatePieceQuantityModal();
}

function confirmPieceQuantity() {
  if (!state.pieceQuantityProductId || !state.sessionAuthenticated || state.employeeLoginRequired || state.activeView !== "pos") return;
  const product = state.products.find((item) => item.id === state.pieceQuantityProductId);
  const result = validatePieceQuantity(product, $("pieceQuantityInput").value);
  if (result.error) {
    updatePieceQuantityModal();
    $("pieceQuantityInput").focus();
    return;
  }
  // Consume the draft before adding so a second submit cannot add it twice.
  closePieceQuantityModal(false);
  state.selectedProduct = product;
  state.detectedQuantity = result.quantity;
  state.quantitySource = "manual";
  addCurrentProductToTicket({ nextStep: "product" });
  ($$(".product-card,.pos-list-add").find((button) => button.dataset.id === product.id) || $("searchInput"))?.focus({ preventScroll: true });
}

function renderWeighPanel() {
  const product = state.selectedProduct;

  if (!product) {
    $("weighProductPhoto").removeAttribute("src");
    $("weighAvailableStock").textContent = "";
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
  const photo = $("weighProductPhoto");
  const imagePath = getPosProductImagePath(product);
  if (photo.getAttribute("src") !== imagePath) {
    photo.dataset.fallback = getProductImagePath(product, "jpg");
    delete photo.dataset.fallbackTried;
    photo.src = imagePath;
  }
  $("weighAvailableStock").textContent = typeof product.stockQuantity==='number'?`Disponible: ${quantityText(product.stockQuantity, product.unit)}`:'Existencias sin verificar';
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
  if (state.checkoutPending || state.checkoutProcessing) return;
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
      source: state.quantitySource,
      ...(state.manualAuthorization ? { manualAuthorization:state.manualAuthorization } : {})
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
            <div class="pos-ticket-copy">
              <div class="pos-ticket-product"><strong>${escapeHtml(item.name)}</strong><span class="pos-ticket-quantity">${escapeHtml(quantityText(item.quantity, item.unit))}</span></div>
              <div class="pos-ticket-details"><span class="pos-ticket-unit">${money(item.price)} / ${escapeHtml(getUnitLabel(item.unit))}</span><small>${item.source === "scale" ? "Báscula" : "Manual"}</small></div>
            </div>
            <b>${money(item.total)}</b>
            <button class="icon-btn" type="button" data-remove-item="${index}" aria-label="Quitar producto"><svg class="pos-remove-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button>
          </article>
        `;
      })
      .join("");
  }

  updateTotals();
  animatePosFeedback(ticketItems, "ticket");
}

function updateTotals() {
  const subtotal = state.ticket.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const total = getTicketTotal();
  const count = state.ticket.length;
  const cashOpen = hasOpenCashForSales();

  const saleLabel = count === 0 ? "Sin productos" : `${count} producto${count === 1 ? "" : "s"}`;

  if ($("subtotalText")) $("subtotalText").textContent = money(subtotal);
  if ($("discountText")) $("discountText").textContent = money(state.discount);
  if ($("totalText")) {
    const text = money(total);
    const changed = $("totalText").textContent !== text;
    $("totalText").textContent = text;
    if (changed) animatePosFeedback($("totalText"), "total");
  }
  if ($("saleBarCount")) $("saleBarCount").textContent = saleLabel;
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
  if (typeof syncCheckoutControls === 'function') syncCheckoutControls();
}

function clearTicket() {
  if (state.checkoutPending || state.checkoutProcessing) { showToast('Reintenta y confirma el cobro pendiente antes de vaciar la venta.'); return; }
  if (state.ticket.length === 0) return;

  if ((typeof settingsCenter === 'undefined' || settingsCenter.preferences?.confirmDrafts !== false) && !window.confirm("¿Vaciar la venta actual?")) return;

  state.ticket = [];
  state.discount = 0;
  state.checkoutIntentId = null;
  clearSelectedProduct();
  renderTicket();
  setPosStep("product");
}

function openManualModal() {
  if (!state.selectedProduct) {
    showToast("Selecciona un producto.");
    return;
  }

  if(typeof updateManualProductContext==='function')updateManualProductContext();
  const quantityInput = $("manualQuantityInput");
  state.quantityCaptureVersion += 1;
  state.manualCapturePending = false;
  $("saveManualWeightBtn").disabled = false;
  $("adminPinInput").value = "";
  quantityInput.value = state.selectedProduct.unit === "pieza" ? "1" : "0.000";
  quantityInput.dataset.rawDigits = state.selectedProduct.unit === "kg" ? "" : "1";
  updateManualQuantityUi();
  $("manualModal").removeAttribute("data-close-immediate");
  $("manualModal").inert = false;
  $("manualModal").setAttribute("aria-hidden", "false");
  $("manualModal").classList.remove("hidden");
  const focusTarget = $("adminPinInput");
  focusTarget?.focus();
  focusTarget?.select?.();
}

function closeManualModal(restoreFocus = true, immediate = false) {
  const wasOpen = !$("manualModal").classList.contains("hidden");
  state.quantityCaptureVersion += 1;
  state.manualCapturePending = false;
  $("manualModal").toggleAttribute("data-close-immediate", immediate);
  $("manualModal").inert = true;
  $("manualModal").setAttribute("aria-hidden", "true");
  $("manualModal").classList.add("hidden");
  $("adminPinInput").value = "";
  $("saveManualWeightBtn").disabled = false;
  if (restoreFocus && wasOpen && state.selectedProduct && state.activeView === "pos") $("manualWeightBtn")?.focus({ preventScroll: true });
}

async function saveManualQuantity() {
  if (!state.selectedProduct || state.manualCapturePending || $("manualModal").classList.contains("hidden")) return;
  const product = state.selectedProduct;
  const version = ++state.quantityCaptureVersion;
  const isCurrent = () => version === state.quantityCaptureVersion && state.selectedProduct === product && !$("manualModal").classList.contains("hidden");
  const pin = $("adminPinInput").value.trim();
  const quantity = getManualQuantityValue();
  if (!Number.isFinite(quantity) || quantity <= 0 || (product.unit === 'kg' && (quantity < MIN_SCALE_WEIGHT_KG || quantity > MAX_SCALE_WEIGHT_KG))) {
    showToast(`Peso permitido: ${MIN_SCALE_WEIGHT_KG.toFixed(3)} a ${MAX_SCALE_WEIGHT_KG.toFixed(0)} kg.`); return;
  }
  if($('manualReasonInput')?.value==='otro'&&String($('manualExplanationInput')?.value||'').trim().length<4){showToast('Explica el motivo del peso manual.','error');return;}
  state.manualCapturePending = true;
  $("saveManualWeightBtn").disabled = true;

  try {
    const authorization = await verifyAdminPin(pin, { productId:product.id, quantity, checkoutIntentId:getCheckoutIntentId(), cashSessionId:getSalesCashShift()?.id || null, reason:$('manualReasonInput')?.value, explanation:$('manualExplanationInput')?.value.trim() });
    if (isCurrent()) state.manualAuthorization = authorization?.token || null;
  } catch (error) {
    if (!isCurrent()) return;
    if (error.status !== 401 && error.status !== 403) console.error(error);
    showToast(error.message || "PIN incorrecto.");
    $("adminPinInput")?.focus();
    return;
  } finally {
    if (isCurrent()) {
      state.manualCapturePending = false;
      $("saveManualWeightBtn").disabled = false;
    }
  }
  if (!isCurrent()) return;

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
  if (state.checkoutProcessing) return;
  if (state.checkoutPending) return chargeSale();
  if (state.ticket.length === 0) return;

  if (!hasOpenCashForSales()) {
    showToast("Abre caja antes de cobrar.");
    goToCashRegister();
    return;
  }

  $("invoiceDecisionModal").classList.remove("hidden");
  window.setTimeout(() => $("invoiceYesBtn")?.focus(), 0);
}

function closeInvoiceDecisionModal() {
  $("invoiceDecisionModal").classList.add("hidden");
}

function getCheckoutIntentId() {
  if (!state.checkoutIntentId) state.checkoutIntentId = crypto.randomUUID();
  return state.checkoutIntentId;
}

function persistPendingCheckout() {
  try {
    if (state.checkoutPending) sessionStorage.setItem('elmuelle.pending-checkout', JSON.stringify(state.checkoutPending));
    else sessionStorage.removeItem('elmuelle.pending-checkout');
  } catch { /* La idempotencia del servidor conserva cualquier cobro confirmado. */ }
}

function restorePendingCheckout() {
  if (!state.sessionAuthenticated || state.checkoutPending) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem('elmuelle.pending-checkout') || 'null');
    if (!saved) return;
    if (saved.ownerId !== state.currentUser?.id) { sessionStorage.removeItem('elmuelle.pending-checkout'); return; }
    if (!Array.isArray(saved.payload?.items) || !/^[a-zA-Z0-9_-]{16,100}$/.test(saved.payload.checkoutIntentId)) return;
    state.checkoutPending = saved;
    state.checkoutIntentId = saved.payload.checkoutIntentId;
    state.ticket = JSON.parse(JSON.stringify(saved.payload.items));
    state.discount = saved.payload.discount || 0;
    state.paymentMethod = saved.payload.paymentMethod;
    state.paymentReference = saved.payload.paymentDetails?.reference || '';
  } catch { /* Un borrador ilegible no confirma ninguna operación. */ }
}

function syncCheckoutControls() {
  const processing = state.checkoutProcessing === true, locked = processing || Boolean(state.checkoutPending);
  ['invoiceYesBtn', 'invoiceNoBtn'].forEach(id => { if ($(id)) $(id).disabled = processing; });
  ['clearTicketBtn', 'paymentReferenceInput', 'confirmWeightBtn', 'manualWeightBtn'].forEach(id => { if ($(id) && locked) $(id).disabled = true; });
  $$('.pay-method').forEach(button => { button.disabled = locked; });
  if ($('ticketItems')) $('ticketItems').inert = locked;
  if (!locked && $('manualWeightBtn')) $('manualWeightBtn').disabled = false;
  if ($('chargeBtn')) {
    $('chargeBtn').setAttribute('aria-busy', String(processing));
    if (processing) { $('chargeBtn').disabled = true; $('chargeBtn').textContent = 'Procesando cobro…'; }
    else if (state.checkoutPending) { $('chargeBtn').disabled = false; $('chargeBtn').textContent = 'Reintentar cobro pendiente'; }
  }
}

async function chargeSale(invoiceRequested = false) {
  if (state.checkoutProcessing) return;
  const ownerId = state.currentUser?.id, generation = state.checkoutGeneration || 0;
  const isCurrent = () => state.sessionAuthenticated && state.currentUser?.id === ownerId && (state.checkoutGeneration || 0) === generation;
  if (!state.checkoutPending) {
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

  state.checkoutPending = { ownerId, payload:JSON.parse(JSON.stringify({
    checkoutIntentId:getCheckoutIntentId(), items:state.ticket, paymentMethod:state.paymentMethod,
    paymentDetails:{reference:state.paymentReference}, discount:state.discount, invoiceRequested,
    cashSessionId:cashShift.id, businessDate:cashShift.businessDate
  })) };
  persistPendingCheckout();
  }
  const submitted = state.checkoutPending.payload;
  state.checkoutProcessing = true;
  syncCheckoutControls();

  try {
    const sale = await fetchJson("/api/sales", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(submitted)
    });
    if (!isCurrent()) return;
    buildReceipt(sale, submitted.invoiceRequested);
    state.checkoutPending = null;
    state.checkoutIntentId = null;
    persistPendingCheckout();

    state.ticket = [];
    state.discount = 0;
    state.paymentReference = "";
    if ($('paymentReferenceInput')) $('paymentReferenceInput').value = "";
    setPaymentMethod("efectivo");
    if (!state.sales.some(item => item.id === sale.id)) state.sales.push(sale);
    closeInvoiceDecisionModal();
    renderTicket();
    clearSelectedProduct();
    setPosStep("product");
    updateTicketId();
    showToast(`Venta ${sale.id} guardada.`, 'success');
    const refreshed = await Promise.allSettled([loadProducts(), loadCashSessions()]);
    if (!isCurrent()) return;
    renderCashRegister();
    if (refreshed.some(result => result.status === 'rejected')) showToast(`Venta ${sale.id} confirmada. Actualiza la pantalla para recuperar existencias y caja.`);

    window.setTimeout(() => {
      if (isCurrent()) window.print();
    }, 200);

    if (submitted.invoiceRequested && canAccessView('billing')) {
      setView("billing");
      $("invoiceSaleId").value = sale.id;
      window.setTimeout(() => $("invoiceRfc").focus(), 100);
    }
  } catch (error) {
    if (!isCurrent()) return;
    if (error.status === 401) {
      persistPendingCheckout();
      logoutToAccess({preservePendingCheckout:true});
      showToast('La sesión venció. Accede de nuevo con tu usuario para resolver el cobro pendiente sin duplicarlo.');
      return;
    }
    if (error.status >= 400 && error.status < 500 && error.payload?.code !== 'CHECKOUT_INTENT_CONFLICT') {
      state.checkoutPending = null;
      persistPendingCheckout();
    }
    console.error(error);
    showToast(state.checkoutPending ? 'No se pudo confirmar la respuesta. Reintenta el cobro pendiente; se conservará la misma intención sin duplicarlo.' : error.message || 'No se pudo guardar la venta.');
  } finally {
    if (isCurrent()) {
      state.checkoutProcessing = false;
      if ($('paymentReferenceInput')) $('paymentReferenceInput').disabled = false;
      renderWeighPanel();
      updateTotals();
      syncCheckoutControls();
    }
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
      <p>${escapeHtml(sale.id)} - ${new Date(sale.createdAt).toLocaleString("es-MX", typeof preferenceDateOptions === "function" ? preferenceDateOptions() : undefined)}</p>
      <div class="line"></div>
      ${itemsHtml}
      <div class="line"></div>
      <div class="receipt-row"><span>Subtotal</span><strong>${money(sale.subtotal)}</strong></div>
      <div class="receipt-row"><span>Total</span><strong>${money(sale.total)}</strong></div>
      <div class="receipt-row"><span>Pago</span><strong>${escapeHtml(getPaymentLabel(sale.paymentMethod))}</strong></div>
      ${referenceHtml}
      <div class="receipt-row"><span>Atendio</span><strong>${escapeHtml(sale.operator?.name || state.currentUser?.name || "Encargado")}</strong></div>
      <div class="line"></div>
      <p>${invoiceRequested ? "Solicitud de factura pendiente de datos fiscales." : "Gracias por su compra."}</p>
    </div>
  `;
}

function openProductConfirm({ title, message, summary, confirmLabel = "Confirmar" }) {
  state.productConfirmReturnFocus = document.activeElement;
  $("productConfirmTitle").textContent = title;
  $("productConfirmMessage").textContent = message;
  $("productConfirmSummary").textContent = summary;
  $("productConfirmYesBtn").textContent = confirmLabel;
  $("productConfirmModal").classList.remove("hidden");
  $("productConfirmModal").inert = false;
  $("productConfirmModal").setAttribute("aria-hidden", "false");
  if($("productConfirmModal").showModal&&!$("productConfirmModal").open)$("productConfirmModal").showModal();
  $("productConfirmYesBtn")?.focus();

  return new Promise((resolve) => {
    state.productConfirmResolver = resolve;
  });
}

function closeProductConfirm(value = false) {
  if($("productConfirmModal").open&&$("productConfirmModal").close)$("productConfirmModal").close();
  $("productConfirmModal").inert = true;
  $("productConfirmModal").setAttribute("aria-hidden", "true");
  $("productConfirmModal").classList.add("hidden");

  if (typeof state.productConfirmResolver === "function") {
    state.productConfirmResolver(value);
    state.productConfirmResolver = null;
  }
  const returnFocus = state.productConfirmReturnFocus;
  state.productConfirmReturnFocus = null;
  if (state.sessionAuthenticated && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
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
    state.products.find(p=>p.id===state.editingProductId)?.stockQuantity,
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
  state.pendingProductPhoto=null;state.productPhotoVersion=(state.productPhotoVersion||0)+1;
  if(typeof syncProductPhotoPreview==='function')syncProductPhotoPreview();
  $("productCategoryInput").value = "Pescados y mariscos";
  $("productUnitInput").value = "kg";
  $("productFormStatusTitle").textContent = "Nuevo producto";
  $("productFormStatusText").textContent = "";
  $("saveProductBtn").textContent = "Guardar";
  updateProductProjection();
}

function fillProductForm(product) {
  state.editingProductId = product.id;
  $("productNameInput").value = product.name;
  $("productDescriptionInput").value=product.description||'';$("productActiveInput").checked=product.active!==false;state.pendingProductPhoto=null;state.productPhotoVersion=(state.productPhotoVersion||0)+1;syncProductPhotoPreview();
  $("productCategoryInput").value = product.category;
  $("productUnitInput").value = product.unit;
  $("productPriceInput").value = product.price;
  $("productCostInput").value = product.costPrice || "";
  $("productMinStockInput").value =
    typeof product.minStock === "number" ? product.minStock : "";
  $("productFormStatusTitle").textContent = "Editar producto";
  $("productFormStatusText").textContent = "";
  $("saveProductBtn").textContent = "Actualizar";
  updateProductProjection();
  setProductMode("form");
  $("productNameInput").focus();
}

async function saveProductFromAdmin(event) { return saveCommercialProduct(event); }

function catalogPhoto(product) {
  return `<span class="management-photo"><img data-catalog-image src="${escapeHtml(getProductImagePath(product, "jpg"))}" data-fallback="${escapeHtml(getProductImagePath(product))}" alt="" loading="lazy" decoding="async" /></span>`;
}

function bindCatalogPhotos(root) {
  root?.querySelectorAll('[data-catalog-image]').forEach((image) => {
    image.addEventListener('error', () => {
      if (!image.dataset.fallbackTried) {
        image.dataset.fallbackTried = '1';
        image.src = image.dataset.fallback;
      } else {
        image.hidden = true;
        image.parentElement.classList.add('missing');
      }
    });
  });
}

function renderAdminProducts() {
  const list = $("productAdminList");
  if (!list) return;
  const query = $("productAdminSearch").value.trim().toLowerCase();
  const category = $("productAdminCategoryFilter").value;
  const filteredProducts = state.products.filter((product) => {
    const matchesSearch = `${product.name} ${product.category} ${product.id}`.toLowerCase().includes(query);
    return matchesSearch && (category === "all" || product.category === category);
  });
  $("catalogProductCount").textContent = String(state.products.length);
  $("catalogActiveCount").textContent = String(state.products.filter((product) => product.active !== false).length);
  $("catalogCategoryCount").textContent = String(new Set(state.products.map((product) => String(product.category || "").trim()).filter(Boolean)).size);
  if (!filteredProducts.length) {
    list.innerHTML = '<p class="empty-state">No hay productos con esos filtros.</p>';
    return;
  }
  list.innerHTML = `<div class="management-table-scroll"><table class="management-table"><caption class="sr-only">Catálogo de productos</caption><thead><tr><th>Producto</th><th>Categoría</th><th>Existencias</th><th>Precio</th><th>Estado</th><th>Acción</th></tr></thead><tbody>` + filteredProducts.map((product) => {
    const stock = typeof product.stockQuantity === "number" ? product.stockQuantity : 0;
    const projection = calculateFinancialProjection(stock, product.costPrice, product.price);
    const isActive = product.active !== false;
    const [stockState,stockKind]=getStockStatus(product);
    return `<tr>
      <td data-label="Producto"><div class="management-product-cell">${catalogPhoto(product)}<div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.id)}</small></div></div></td>
      <td data-label="Categoría">${escapeHtml(product.category)}</td><td data-label="Existencias">${typeof product.stockQuantity==='number'?escapeHtml(quantityText(product.stockQuantity,product.unit)):'—'}</td>
      <td data-label="Precio"><strong>${money(product.price)}</strong></td><td data-label="Estado"><span class="status-badge ${stockKind}">${escapeHtml(stockState)}</span>${isActive?'':'<small>Inactivo</small>'}</td>
      <td data-label="Acción"><div class="management-row-actions"><button class="quiet-btn" type="button" data-edit-product="${escapeHtml(product.id)}">Editar ›</button>
      <details class="management-product-options"><summary>Más</summary><div><p>Existencia: ${typeof product.stockQuantity === "number" ? escapeHtml(quantityText(stock, product.unit)) : "Sin verificar"}</p>${Number(product.costPrice || 0) > 0 && typeof product.stockQuantity === "number" ? `<p>Costo: ${money(product.costPrice)}</p><p>Margen: ${projection.margin.toFixed(2)}% · Ganancia inventario: ${money(projection.profit)}</p>` : "<p>Costo o existencia pendiente de capturar</p>"}<button class="quiet-btn" type="button" data-toggle-product="${escapeHtml(product.id)}">${isActive ? "Pausar" : "Activar"}</button></div></details></div></td>
    </tr>`;
  }).join("") + '</tbody></table></div>';
  bindCatalogPhotos(list);
  list.querySelectorAll("[data-edit-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = state.products.find((item) => item.id === button.dataset.editProduct);
      if (product) fillProductForm(product);
    });
  });

  list.querySelectorAll("[data-toggle-product]").forEach((button) => {
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
    await runCatalogOperation('product-status:'+product.id, '/api/products/'+product.id, 'PUT', {active:!isActive});

    await loadProducts();
    showToast(isActive ? "Producto pausado." : "Producto activo.");
  } catch (error) {
    console.error(error);
    showToast("No se pudo cambiar el producto.");
  }
}

function getStockStatus(product) {
  if (typeof product.stockQuantity !== "number") return ["Sin verificar", "neutral"];
  if(product.stockQuantity===0)return ["Agotado","danger"];
  if (typeof product.minStock === "number" && product.stockQuantity <= product.minStock) {
    return ["Bajo mínimo", "warn"];
  }
  return ["Disponible", "ok"];
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

function getInventoryEntryMode() {
  const form = $("inventoryEntryForm");
  return form?.dataset.entryMode === "new" ? "new" : "existing";
}

function setInventoryEntryMode(mode = "existing") {
  const entryMode = mode === "new" ? "new" : "existing";
  const form = $("inventoryEntryForm");
  if (form) form.dataset.entryMode = entryMode;

  $$(`[data-entry-product-mode]`).forEach((button) => {
    const isActive = button.dataset.entryProductMode === entryMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (entryMode === "new" && $("inventoryEntryProductInput")) {
    $("inventoryEntryProductInput").value = "";
  }

  updateInventoryEntryProjection();
}

function getInventoryNewProductDraft() {
  const unitValue = $("inventoryNewProductUnitInput")?.value === "pieza" ? "pieza" : "kg";
  const minStockValue = $("inventoryNewProductMinStockInput")?.value ?? "";

  return {
    id: "",
    name: $("inventoryNewProductNameInput")?.value.trim() || "",
    category: $("inventoryNewProductCategoryInput")?.value || "Pescados y mariscos",
    unit: unitValue,
    price: Number($("inventoryEntrySalePriceInput")?.value || 0),
    costPrice: Number($("inventoryEntryUnitCostInput")?.value || 0),
    minStock: minStockValue === "" ? null : Number(minStockValue)
  };
}

function getSelectedInventoryEntryProduct() {
  const productId = $("inventoryEntryProductInput")?.value || "";
  return state.products.find((product) => product.id === productId) || null;
}

function getInventoryEntryProductContext() {
  return getInventoryEntryMode() === "new"
    ? getInventoryNewProductDraft()
    : getSelectedInventoryEntryProduct();
}

function populateInventoryEntryDefaults() {
  if (getInventoryEntryMode() === "new") {
    updateInventoryEntryProjection();
    return;
  }

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

  const isNewProduct = getInventoryEntryMode() === "new";
  const product = getInventoryEntryProductContext();
  const quantity = Number($("inventoryEntryQuantityInput")?.value || 0);
  const unitCost = Number($("inventoryEntryUnitCostInput")?.value || 0);
  const salePrice = Number($("inventoryEntrySalePriceInput")?.value || 0);
  const unit = product?.unit || "kg";
  const currentStock = !isNewProduct && product && typeof product.stockQuantity === "number"
    ? Number(product.stockQuantity)
    : null;
  const currentCost = !isNewProduct && product ? Number(product.costPrice || 0) : 0;
  const newStock = currentStock + Math.max(quantity, 0);
  const currentValue = currentStock * currentCost;
  const purchaseValue = Math.max(quantity, 0) * Math.max(unitCost, 0);
  const weightedCost = newStock > 0 ? (currentValue + purchaseValue) / newStock : 0;
  const projection = calculateFinancialProjection(quantity, unitCost, salePrice);
  const hasProductContext = Boolean(product && (product.id || isNewProduct));
  const displayName = product?.name || (isNewProduct ? "Producto nuevo" : "Selecciona un producto");
  const metaText = hasProductContext
    ? `${product.category || "Pescados y mariscos"} · Compra y venta por ${getUnitLabel(unit)}`
    : "";

  $("inventoryEntryProductName").textContent = displayName;
  const inventoryEntryProductMeta = $("inventoryEntryProductMeta");
  if (inventoryEntryProductMeta) {
    inventoryEntryProductMeta.textContent = metaText;
    inventoryEntryProductMeta.hidden = !metaText;
  }
  $("entryCurrentStock").textContent = currentStock===null?'Sin verificar':quantityText(currentStock, unit);
  $("entryCurrentCost").textContent = `${money(currentCost)} / ${getUnitLabel(unit)}`;
  $("entryPurchaseTotal").textContent = money(projection.investment);
  $("entryProjectedRevenue").textContent = money(projection.revenue);
  $("entryProjectedProfit").textContent = money(projection.profit);
  $("entryMargin").textContent = `${projection.margin.toFixed(2)}%`;
  $("entryNewStock").textContent = !isNewProduct&&currentStock===null?'Requiere conteo inicial':quantityText(newStock, unit);
  $("entryWeightedCost").textContent = `${money(weightedCost)} / ${getUnitLabel(unit)}`;
  $("entryProjectedProfit").classList.toggle("negative-value", projection.profit < 0);
}

function resetInventoryEntryForm() {
  $("inventoryEntryForm")?.reset();
  if ($("inventoryEntryDateInput")) {
    $("inventoryEntryDateInput").value = getLocalDateString();
  }
  if ($("inventoryNewProductCategoryInput")) {
    $("inventoryNewProductCategoryInput").value = "Pescados y mariscos";
  }
  if ($("inventoryNewProductUnitInput")) {
    $("inventoryNewProductUnitInput").value = "kg";
  }
  setInventoryEntryMode("existing");
}

async function loadInventoryEntries() {
  try {
    state.inventoryEntries = await fetchJson("/api/inventory/entries");
    renderInventoryEntryProductOptions();
    renderInventory();
    renderInventorySummary();
    renderInventoryEntries();
    updateInventoryEntryProjection();
    if(typeof renderPendingRestitutions==='function')await renderPendingRestitutions();
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudieron cargar las entradas de inventario.");
  }
}

async function saveInventoryEntry(event) { return saveInventoryReceipt(event); }

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
  $("catalogInventoryValue").textContent = money(totals.investment);
  $("inventoryProjectedValue").textContent = money(totals.revenue);
  $("inventoryProjectedProfit").textContent = money(totals.revenue - totals.investment);
  $("inventoryEntriesCount").textContent = String(state.inventoryEntries.length);
}

function renderInventoryEntries() {
  const list = $("inventoryEntriesList");
  if (!list) return;

  const query = $("inventoryEntrySearchInput")?.value.trim().toLowerCase() || "";
  const entries = state.inventoryEntries.filter((entry) => {
    const haystack = `${entry.id || ""} ${entry.productName || ""} ${entry.reason || entry.notes || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  if (entries.length === 0) {
    list.innerHTML = `<p class="empty-state">No hay movimientos con esos criterios.</p>`;
    return;
  }

  list.innerHTML = entries.map((entry) => {
    const labels = { initial_count: "Conteo inicial", adjustment: "Ajuste", waste: "Merma", restitution: "Restitución", initial_receipt: "Alta con entrada inicial", received: "Entrada de mercancía" };
    const label = labels[entry.type] || "Entrada de mercancía";
    const receipt = !entry.type || ["received", "initial_receipt"].includes(entry.type);
    const stock = value => typeof value === "number" ? quantityText(value, entry.unit) : "Sin verificar";
    const margin = Number(entry.projectedRevenue) > 0 ? Number(entry.projectedProfit) / Number(entry.projectedRevenue) * 100 : 0;
    const date = entry.receivedAt
      ? new Date(`${entry.receivedAt}T12:00:00`).toLocaleDateString("es-MX")
      : new Date(entry.createdAt).toLocaleDateString("es-MX");

    return `
      <article class="inventory-entry-row">
        <div class="inventory-entry-main">
          <strong>${escapeHtml(entry.productName)}</strong>
          <span>${escapeHtml(label)} · ${escapeHtml(entry.id)} · ${escapeHtml(date)}${entry.reason || entry.notes ? ` · ${escapeHtml(entry.reason || entry.notes)}` : ""}</span>
          <small>${receipt ? `${quantityText(entry.quantity, entry.unit)} a ${money(entry.unitCost)} · Costo promedio ${money(entry.weightedAverageCost)}` : `${stock(entry.previousStock)} → ${stock(entry.newStock)}`}</small>
        </div>
        ${receipt ? `<div class="inventory-entry-value"><span>Inversión</span><strong>${money(entry.totalCost)}</strong></div>
        <div class="inventory-entry-value"><span>Venta proyectada</span><strong>${money(entry.projectedRevenue)}</strong></div>
        <div class="inventory-entry-value profit"><span>Ganancia</span><strong>${money(entry.projectedProfit)}</strong></div>
        <span class="status-badge ${Number(entry.projectedProfit) >= 0 ? "ok" : "warn"}">${margin.toFixed(2)}%</span>` : `<div class="inventory-entry-value"><span>Existencias finales</span><strong>${stock(entry.newStock)}</strong></div>`}
      </article>
    `;
  }).join("");
}

function getInventoryMovementMap(days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const movementMap = new Map();

  state.sales
    .filter((sale) => {
      const createdAt = new Date(sale.createdAt || 0).getTime();
      return getSaleStatus(sale) !== "cancelada" && Number.isFinite(createdAt) && createdAt >= cutoff;
    })
    .forEach((sale) => {
      const productsInTicket = new Set();

      (sale.items || []).forEach((item) => {
        const productId = String(item.productId || "").trim();
        if (!productId) return;

        const current = movementMap.get(productId) || {
          ticketCount: 0,
          quantity: 0,
          revenue: 0,
          level: 0,
          ratio: 0,
          label: "Sin movimiento"
        };

        current.quantity += Number(item.quantity || 0);
        current.revenue += Number(item.total || 0);
        movementMap.set(productId, current);
        productsInTicket.add(productId);
      });

      productsInTicket.forEach((productId) => {
        const current = movementMap.get(productId);
        if (current) current.ticketCount += 1;
      });
    });

  const maxTickets = Math.max(
    0,
    ...state.products.map((product) => movementMap.get(product.id)?.ticketCount || 0)
  );

  const labels = ["Sin movimiento", "Movimiento bajo", "Movimiento medio", "Movimiento alto", "Más vendido"];

  state.products.forEach((product) => {
    const current = movementMap.get(product.id) || {
      ticketCount: 0,
      quantity: 0,
      revenue: 0
    };
    const ratio = maxTickets > 0 ? current.ticketCount / maxTickets : 0;
    let level = 0;

    if (current.ticketCount > 0) {
      if (ratio <= 0.25) level = 1;
      else if (ratio <= 0.5) level = 2;
      else if (ratio < 1) level = 3;
      else level = 4;
    }

    movementMap.set(product.id, {
      ...current,
      ratio,
      level,
      label: labels[level]
    });
  });

  return movementMap;
}

function getInventorySalesRanking(days = 30) {
  const movementMap = getInventoryMovementMap(days);

  return state.products
    .filter((product) => product.active !== false)
    .map((product) => {
      const movement = movementMap.get(product.id) || {
        ticketCount: 0,
        quantity: 0,
        revenue: 0,
        level: 0,
        label: "Sin movimiento"
      };

      return {
        id: product.id,
        name: product.name,
        unit: product.unit,
        ticketCount: Number(movement.ticketCount || 0),
        quantity: Number(movement.quantity || 0),
        revenue: Number(movement.revenue || 0),
        level: Number(movement.level || 0),
        label: movement.label || "Sin movimiento"
      };
    });
}

function renderInventorySalesList(elementId, items, emptyText) {
  const list = $(elementId);
  if (!list) return;

  if (items.length === 0) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
    return;
  }

  list.innerHTML = items
    .map((item, index) => {
      const salesText = item.ticketCount === 1 ? "1 venta" : `${item.ticketCount} ventas`;
      return `
        <article class="inventory-sales-item movement-level-${item.level}">
          <span class="inventory-sales-rank">${index + 1}</span>
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(salesText)} · ${escapeHtml(quantityText(item.quantity, item.unit))}</small>
          </div>
          <b>${money(item.revenue)}</b>
        </article>
      `;
    })
    .join("");
}

function renderInventoryChampion(elementId, item, kind, emptyText) {
  const container = $(elementId);
  if (!container) return;

  if (!item) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
    return;
  }

  const salesText = item.ticketCount === 1 ? "1 venta" : `${item.ticketCount} ventas`;
  const descriptor = kind === "top" ? "Líder de tus ventas" : "Menos movimiento registrado";
  container.innerHTML = `
    <article class="inventory-champion inventory-champion--${escapeHtml(kind)}">
      <span class="inventory-champion-badge">${kind === "top" ? "★" : "↘"}</span>
      <div>
        <span>${escapeHtml(descriptor)}</span>
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(salesText)} · ${escapeHtml(quantityText(item.quantity, item.unit))}</small>
      </div>
      <b>${money(item.revenue)}</b>
    </article>
  `;
}

function renderInventorySalesInsights() {
  const ranked = getInventorySalesRanking(30);
  const topProduct = ranked
    .filter((item) => item.ticketCount > 0)
    .sort((a, b) => b.ticketCount - a.ticketCount || b.revenue - a.revenue || a.name.localeCompare(b.name))
    .at(0);
  const slowProduct = ranked
    .sort((a, b) => a.ticketCount - b.ticketCount || a.revenue - b.revenue || a.name.localeCompare(b.name))
    .at(0);

  renderInventoryChampion("inventoryTopProducts", topProduct, "top", "Sin ventas en los últimos 30 días.");
  renderInventoryChampion("inventorySlowProducts", slowProduct, "slow", "Sin productos activos.");
}
function renderInventoryOverview() {
  const lowCount = state.products.filter((product) => getStockStatus(product)[1] === "warn").length;
  const uncounted = state.products.filter((product) => getStockStatus(product)[1] === "neutral").length;
  $("inventoryProductCount").textContent = `${state.products.length} productos`;
  $("inventoryAttentionCount").textContent = String(lowCount);
  $("inventoryAttentionCount").nextElementSibling.textContent = `Productos por revisar${uncounted ? ` · ${uncounted} sin conteo` : ""}`;
  const today = getLocalDateString();
  $("inventoryDayMovements").textContent = String(state.inventoryEntries.filter((entry) => entry.createdAt && getLocalDateString(new Date(entry.createdAt)) === today).length);
  $("inventoryPendingAdjustments").textContent = "No disponible";
  const recent = [...state.inventoryEntries].sort((a, b) => new Date(b.createdAt || b.receivedAt || 0) - new Date(a.createdAt || a.receivedAt || 0)).slice(0, 3);
  $("inventoryRecentActivity").innerHTML = recent.length ? recent.map((entry) => `<article><strong>${escapeHtml(entry.productName || "Entrada de mercancía")}</strong><span>${escapeHtml(quantityText(entry.quantity, entry.unit))} · ${escapeHtml(entry.receivedAt || new Date(entry.createdAt).toLocaleDateString("es-MX"))}</span><small>${escapeHtml(entry.id || "")}</small></article>`).join("") : '<p class="empty-state">Sin entradas registradas.</p>';
}

function renderInventory() {
  const list = $("inventoryList");
  if (!list) return;

  const query = $("inventorySearchInput").value.trim().toLowerCase();
  const category = $("inventoryCategoryFilter").value;
  const statusFilter = $("inventoryStatusFilter")?.value || "all";
  const movementMap = getInventoryMovementMap(30);
  renderInventoryOverview();
  renderInventorySalesInsights();
  const filteredProducts = state.products.filter((product) => {
    const matchesSearch = `${product.name} ${product.category} ${product.id}`.toLowerCase().includes(query);
    const matchesCategory = category === "all" || product.category === category;
    return matchesSearch && matchesCategory && (statusFilter === "all" || getStockStatus(product)[1] === statusFilter);
  });

  if (filteredProducts.length === 0) {
    list.innerHTML = `<p class="empty-state">No hay productos para mostrar.</p>`;
    return;
  }

  list.innerHTML = `<div class="management-table-scroll"><table class="management-table"><caption class="sr-only">Existencias por producto</caption><thead><tr><th>Producto</th><th>Unidad</th><th>Existencias</th><th>Estado</th><th>Última entrada</th><th>Acción</th></tr></thead><tbody>` + filteredProducts
    .map((product, index) => {
      const [statusLabel, statusKind] = getStockStatus(product);
      const isEditing = state.inventoryEditingId === product.id;
      const stock = typeof product.stockQuantity === "number" ? Number(product.stockQuantity) : 0;
      const stockText = typeof product.stockQuantity === "number"
        ? quantityText(product.stockQuantity, product.unit)
        : "Sin verificar";
      const minText = typeof product.minStock === "number"
        ? quantityText(product.minStock, product.unit)
        : "Sin mínimo";
      const projection = calculateFinancialProjection(stock, product.costPrice, product.price);
      const movement = movementMap.get(product.id) || {
        ticketCount: 0,
        quantity: 0,
        revenue: 0,
        level: 0,
        ratio: 0,
        label: "Sin movimiento"
      };
      const movementSalesText = movement.ticketCount === 1
        ? "1 venta en 30 días"
        : `${movement.ticketCount} ventas en 30 días`;

const productEntries = state.inventoryEntries
  .filter((entry) => {
    return String(entry.productId || "") === String(product.id || "");
  })
  .sort((entryA, entryB) => {
    const dateA = new Date(
      entryA.receivedAt
        ? `${entryA.receivedAt}T12:00:00`
        : entryA.createdAt || 0
    ).getTime();

    const dateB = new Date(
      entryB.receivedAt
        ? `${entryB.receivedAt}T12:00:00`
        : entryB.createdAt || 0
    ).getTime();

    return dateB - dateA;
  });

const lastPurchase = productEntries[0] || null;

const lastPurchaseText = lastPurchase
  ? `${new Date(
      lastPurchase.receivedAt
        ? `${lastPurchase.receivedAt}T12:00:00`
        : lastPurchase.createdAt
    ).toLocaleDateString("es-MX")} · ${quantityText(
      lastPurchase.quantity,
      lastPurchase.unit || product.unit
    )} a ${money(lastPurchase.unitCost)}`
  : "Sin entradas registradas";

      if (isEditing) {
        return `
          <tr class="management-edit-row"><td colspan="6"><div class="management-inventory-editor">
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
            <label class="wide">
              Motivo del ajuste
              <input type="text" maxlength="180" placeholder="Ej. Conteo físico o merma" data-inventory-reason="${escapeHtml(product.id)}" />
            </label>
            ${typeof product.stockQuantity==='number'?`<label>Movimiento<select data-inventory-kind="${escapeHtml(product.id)}"><option value="adjustment">Ajuste</option><option value="waste">Merma</option></select></label>`:'<p>Conteo inicial: establece la existencia física verificada.</p>'}
            <span class="status-badge ${statusKind}">${statusLabel}</span>
            <div class="inventory-actions">
              <button class="solid-btn" type="button" data-save-inventory="${escapeHtml(product.id)}">Guardar</button>
              <button class="quiet-btn" type="button" data-cancel-inventory="${escapeHtml(product.id)}">Cancelar</button>
            </div>
          </div></td></tr>
        `;
      }

      return `<tr>
        <td data-label="Producto"><div class="management-product-cell">${catalogPhoto(product)}<div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)}${product.active === false ? " · Inactivo" : ""}</small></div></div></td>
        <td data-label="Unidad">${escapeHtml(getUnitLabel(product.unit))}</td><td data-label="Existencias"><strong>${escapeHtml(stockText)}</strong></td>
        <td data-label="Estado"><span class="status-badge ${statusKind}">${statusKind === "ok" ? "Disponible" : statusKind === "warn" ? "Bajo mínimo" : escapeHtml(statusLabel)}</span></td>
        <td data-label="Última entrada">${lastPurchase ? escapeHtml(lastPurchaseText) : "—"}</td>
        <td data-label="Acción"><button class="quiet-btn" type="button" data-inventory-details="${index}" aria-expanded="false" aria-controls="inventory-detail-${index}">Ver detalle ›</button></td>
      </tr><tr id="inventory-detail-${index}" class="management-detail-row" hidden><td colspan="6">
        <div class="management-stock-detail"><div><strong>${escapeHtml(product.name)}</strong><p>Mínimo: ${escapeHtml(minText)} · Costo promedio: ${money(product.costPrice || 0)} · Precio: ${money(product.price || 0)}</p><p>Inversión: ${money(projection.investment)} · Ganancia: ${money(projection.profit)}</p><p>Última compra: ${escapeHtml(lastPurchaseText)}</p><p>${escapeHtml(movement.label)} · ${escapeHtml(movementSalesText)} · ${money(movement.revenue)}</p></div><button class="quiet-btn" type="button" data-edit-inventory="${escapeHtml(product.id)}">Ajustar</button></div>
      </td></tr>`;
    })
    .join("") + '</tbody></table></div>';
  bindCatalogPhotos(list);
  list.querySelectorAll('[data-inventory-details]').forEach((button) => {
    button.addEventListener('click', () => {
      const detail = $("inventory-detail-" + button.dataset.inventoryDetails);
      detail.hidden = !detail.hidden;
      button.setAttribute('aria-expanded', String(!detail.hidden));
      button.textContent = detail.hidden ? 'Ver detalle ›' : 'Cerrar detalle';
    });
  });

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

async function saveInventory(productId) { return saveInventoryMovement(productId); }

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

  renderSalesIndicators(sales, period);

  if (sales.length === 0) {
    list.innerHTML = `<p class="empty-state">No hay ventas con esos filtros.</p>`;
    renderSaleDetail(null);
    return;
  }

  if (!state.selectedSaleId || !sales.some((sale) => sale.id === state.selectedSaleId)) {
    state.selectedSaleId = sales[0].id;
  }

  list.innerHTML = `<div class="table-scroll sales-table-scroll"><table class="sales-table"><caption class="sr-only">Ventas del periodo y filtros seleccionados</caption><thead><tr><th>Folio</th><th>Fecha y hora</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${sales.map((sale) => {
    const status = getSaleStatus(sale);
    const label = status === "cancelada" ? "Cancelada" : status === "completada" ? "Completada" : status;
    return `<tr class="${sale.id === state.selectedSaleId ? "active" : ""}"><td><button class="sale-row" type="button" data-sale-id="${escapeHtml(sale.id)}" aria-pressed="${sale.id === state.selectedSaleId}">${escapeHtml(sale.id)}</button></td><td>${escapeHtml(new Date(sale.createdAt).toLocaleString("es-MX", typeof preferenceDateOptions === "function" ? preferenceDateOptions() : undefined))}</td><td>${escapeHtml(sale.invoice?.customer?.businessName || "—")}</td><td>${(sale.items || []).length}</td><td><strong>${money(sale.total)}</strong></td><td><span class="status-badge ${status === "cancelada" ? "off" : "ok"}">${escapeHtml(label)}</span></td><td><button class="quiet-btn sales-view-detail" type="button" data-sale-id="${escapeHtml(sale.id)}" aria-label="Ver venta ${escapeHtml(sale.id)}">Ver</button></td></tr>`;
  }).join("")}</tbody></table></div><p class="sales-results-count">${sales.length} ${sales.length === 1 ? "venta" : "ventas"} · Orden de registro más reciente primero</p>`;
  list.querySelectorAll("[data-sale-id]").forEach((button) => {
    on(button, "click", () => {
      state.selectedSaleId = button.dataset.saleId;
      renderSalesAdmin();
      [...list.querySelectorAll(".sale-row")].find((item) => item.dataset.saleId === state.selectedSaleId)?.focus({ preventScroll: true });
    });
  });

  renderSaleDetail(state.selectedSaleId);
}

function renderSalesIndicators(sales, period) {
  const completed = sales.filter((sale) => getSaleStatus(sale) === "completada");
  const total = completed.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const products = new Set(completed.flatMap((sale) => (sale.items || []).map((item) => item.productId || item.name).filter(Boolean)));
  const values = [money(total), String(completed.length), money(completed.length ? total / completed.length : 0), String(products.size)];
  values.forEach((value, index) => { if ($(`salesKpi${index}`)) $(`salesKpi${index}`).textContent = value; });
  if ($("salesKpiLabel0")) $("salesKpiLabel0").textContent = period === "day" ? "Ventas del día" : "Ventas del periodo";
}

function renderInvoiceSelection(options = {}) {
  if (typeof renderInvoiceDetails === 'function' && $('invoiceSelectedItems')) return renderInvoiceDetails(options);
  const summary = $("invoiceSaleSummary");
  if (!summary) return;
  const id = options.reset === true ? "" : $("invoiceSaleId").value.trim();
  const sale = state.sales.find((item) => item.id === id);
  summary.innerHTML = sale
    ? `<span>Venta seleccionada</span><div><strong>${escapeHtml(sale.id)}</strong><b>${money(sale.total)}</b></div><p>${escapeHtml(new Date(sale.createdAt).toLocaleString("es-MX", typeof preferenceDateOptions === "function" ? preferenceDateOptions() : undefined))} · ${escapeHtml(getSaleStatus(sale))} · Verifica antes de solicitar factura.</p>`
    : `<span>Venta seleccionada</span><p>${id ? "No se encontró ese folio entre las ventas disponibles." : "Selecciona un folio existente o utiliza una venta de la lista."}</p>`;
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

  const status = getSaleStatus(sale);
  const statusLabel = status === "completada" ? "Completada" : status === "cancelada" ? "Cancelada" : status;
  const itemsHtml = (sale.items || []).map((item) => {
    const product = state.products.find((candidate) => candidate.id === item.productId);
    const photo = product ? `<img data-sale-photo src="${escapeHtml(getPosProductImagePath(product))}" alt="" width="34" height="32" loading="lazy" decoding="async" />` : "";
    return `<article class="detail-item"><div>${photo}<strong>${escapeHtml(item.name)}</strong></div><span>${escapeHtml(quantityText(item.quantity, item.unit))}</span><b>${money(item.total)}</b></article>`;
  }).join("");
  panel.innerHTML = `
    <div class="sales-detail-heading"><h3>Detalle de venta</h3><span class="status-badge ${status === "cancelada" ? "off" : "ok"}">${escapeHtml(statusLabel)}</span></div>
    <dl class="sales-detail-meta"><div><dt>Folio</dt><dd><span class="sales-folio">${escapeHtml(sale.id)}</span></dd></div><div><dt>Fecha y hora</dt><dd>${escapeHtml(new Date(sale.createdAt).toLocaleString("es-MX", typeof preferenceDateOptions === "function" ? preferenceDateOptions() : undefined))}</dd></div><div><dt>Cliente</dt><dd>${escapeHtml(sale.invoice?.customer?.businessName || "—")}</dd></div><div><dt>Usuario</dt><dd>${escapeHtml(sale.operator?.name || sale.userName || "—")}</dd></div></dl>
    <h4 class="sales-detail-products-title">Productos (${(sale.items || []).length})</h4>
    <div class="detail-items">${itemsHtml}</div>
    <div class="sales-detail-totals">
      ${sale.subtotal !== undefined && sale.subtotal !== null ? `<div><span>Subtotal</span><strong>${money(sale.subtotal)}</strong></div>` : ""}
      ${sale.discount !== undefined && sale.discount !== null ? `<div><span>Descuento</span><strong>${money(sale.discount)}</strong></div>` : ""}
      <div><span>Pago</span><strong>${escapeHtml(getPaymentLabel(sale.paymentMethod))}</strong></div>
      <div><span>Solicitud</span><strong>${escapeHtml(getInvoiceLabel(sale))}</strong></div>
      <div class="sales-detail-total"><span>Total</span><strong>${money(sale.total)}</strong></div>
    </div>
    <div class="detail-actions"><button class="quiet-btn" type="button" data-reprint-sale="${escapeHtml(sale.id)}">Reimprimir</button><button class="solid-btn" type="button" data-invoice-sale="${escapeHtml(sale.id)}">Registrar solicitud</button><button class="danger-soft-btn" type="button" data-cancel-sale="${escapeHtml(sale.id)}" ${status === "cancelada" || !isAdminUser() ? "disabled" : ""}>Cancelar</button></div>`;
  panel.querySelectorAll("[data-sale-photo]").forEach((photo) => on(photo, "error", () => photo.remove()));

  on(panel.querySelector("[data-reprint-sale]"), "click", () => {
    buildReceipt(sale, getInvoiceLabel(sale) !== "Sin factura");
    window.print();
  });

  on(panel.querySelector("[data-invoice-sale]"), "click", () => {
    setView("billing");
    $("invoiceSaleId").value = sale.id;
    renderInvoiceSelection();
    $("invoiceRfc").focus();
  });

  on(panel.querySelector("[data-cancel-sale]"), "click", () => cancelSale(sale.id));
}

async function cancelSale(saleId) {
  if (!isAdminUser()) {
    showToast("Esta acción requiere permisos de administrador.");
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
        reason
      })
    });

    state.sales = state.sales.map((sale) => {
      return sale.id === updatedSale.id ? updatedSale : sale;
    });

    renderSalesAdmin();
    await loadCashSessions();
    renderCashCut();
    showToast("Venta cancelada.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "No se pudo cancelar.");
  }
}

async function loadRecentSales() {
  const configurationVersion = typeof settingsCenter === 'undefined' ? null : settingsCenter.loadVersion;
  const currentConfiguration = () => configurationVersion === null || configurationVersion === settingsCenter.loadVersion;
  const list = $("recentSalesList");
  if (!list) return;

  try {
    const sales = await fetchJson("/api/sales");
    if (!currentConfiguration()) return;
    state.sales = sales;
    updateTicketId();
    renderInvoiceSelection();

    syncPeriodInput("recentSalesPeriodFilter", "recentSalesDateInput");
    const period = $("recentSalesPeriodFilter")?.value || "day";
    const dateString = $("recentSalesDateInput")?.value || getLocalDateString();
    const recentSales = [...state.sales]
      .filter((sale) => saleMatchesPeriod(sale, period, dateString))
      .reverse()
      ;

    if (typeof renderInvoiceSales === 'function' && list.classList.contains('invoice-sales-table')) { renderInvoiceSales(recentSales); renderInvoiceSelection(); return; }

    if (recentSales.length === 0) {
      list.innerHTML = `<p class="empty-state">No hay ventas en el periodo seleccionado.</p>`;
      return;
    }

    list.innerHTML = recentSales
      .map((sale) => {
        const invoiceStatus = sale.invoice?.status;
        const requestLabel = !invoiceStatus || invoiceStatus === "no_solicitada"
          ? "Sin solicitud"
          : invoiceStatus === "solicitada" ? "Solicitud guardada"
          : invoiceStatus === "pendiente_datos" ? "Datos fiscales pendientes" : getInvoiceLabel(sale);
        return `
          <article class="recent-sale-card">
            <div>
              <strong>${escapeHtml(sale.id)}</strong>
              <span>${new Date(sale.createdAt).toLocaleString("es-MX", typeof preferenceDateOptions === "function" ? preferenceDateOptions() : undefined)}</span>
            </div>
            <span class="status-badge ${invoiceStatus === "solicitada" ? "ok" : ""}">${escapeHtml(requestLabel)}</span><b>${money(sale.total)}</b>
            <button class="quiet-btn" type="button" data-sale-id="${escapeHtml(sale.id)}">Usar</button>
          </article>
        `;
      })
      .join("");

    list.querySelectorAll("[data-sale-id]").forEach((button) => {
      button.addEventListener("click", () => {
        $("invoiceSaleId").value = button.dataset.saleId;
        renderInvoiceSelection();
        $("invoiceRfc").focus();
      });
    });
  } catch (error) {
    console.error(error);
    if (!currentConfiguration()) return;
    list.innerHTML = '<p class="empty-state billing-load-error" role="alert">No se pudieron cargar las ventas. Usa Actualizar para volver a intentarlo.</p>';
    showToast("No se pudieron cargar los tickets.");
  }
}

async function saveInvoiceRequest(event) {
  event.preventDefault();
  const configurationVersion = typeof settingsCenter === 'undefined' ? null : settingsCenter.loadVersion;
  const currentConfiguration = () => configurationVersion === null || configurationVersion === settingsCenter.loadVersion;

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
  if (typeof reviewInvoiceRequest === 'function' && $('invoiceSelectedItems') && !reviewInvoiceRequest()) return;

  try {
    await fetchJson(`/api/sales/${saleId}/invoice`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!currentConfiguration()) return;
    $("invoiceForm").reset();
    await loadRecentSales();
    if (!currentConfiguration()) return;
    showToast("Solicitud registrada.", 'success');
    if (typeof completeInvoiceReview === 'function' && $('invoiceSelectedItems')) completeInvoiceReview();
  } catch (error) {
    console.error(error);
    if (!currentConfiguration()) return;
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
    await loadCashSessions();
    updateTicketId();
    renderProducts();
    renderDashboard();
  } catch (error) {
    console.error(error);
    showToast("No se pudo cargar el panel.");
  }
}

function getDashboardDateRange(startDateString, endDateString) {
  const start = parseLocalDate(startDateString);
  const endDate = parseLocalDate(endDateString || startDateString);

  if (endDate < start) endDate.setTime(start.getTime());

  const end = new Date(endDate);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);

  return { start, end };
}

function dashboardSaleMatchesPeriod(sale, period, dateString, endDateString) {
  if (period !== "range") return saleMatchesPeriod(sale, period, dateString);

  const range = getDashboardDateRange(dateString, endDateString);
  const createdAt = new Date(sale.createdAt);
  return createdAt >= range.start && createdAt < range.end;
}

function getDashboardFilter() {
  const periodInput = $("dashboardPeriodFilter");
  const dateInput = $("dashboardDateInput");
  const dateLabel = $("dashboardDateLabel");
  const endDateField = $("dashboardEndDateField");
  const endDateInput = $("dashboardEndDateInput");
  const period = periodInput?.value || "day";
  const isRange = period === "range";
  const isAll = period === "all";

  if (dateInput && !dateInput.value) dateInput.value = getLocalDateString();
  if (endDateInput && !endDateInput.value) endDateInput.value = dateInput?.value || getLocalDateString();

  if (dateInput) dateInput.disabled = isAll;
  if (dateLabel) dateLabel.textContent = isRange ? "Desde" : "Fecha";
  if (endDateField) endDateField.hidden = !isRange;
  if (endDateInput) endDateInput.disabled = !isRange;

  if (isRange && dateInput && endDateInput && endDateInput.value < dateInput.value) {
    endDateInput.value = dateInput.value;
  }

  return {
    period,
    dateString: dateInput?.value || getLocalDateString(),
    endDateString: endDateInput?.value || dateInput?.value || getLocalDateString()
  };
}

function getDashboardVisualFilter(periodId, dateId) {
  const periodInput = $(periodId);
  const dateInput = $(dateId);
  const general = getDashboardFilter();
  const period = periodInput?.value || "day";
  if (period === "inherit") return general;

  if (dateInput && !dateInput.value) dateInput.value = getLocalDateString();
  if (dateInput) dateInput.disabled = period === "all";

  return {
    period,
    dateString: dateInput?.value || general.dateString,
    endDateString: dateInput?.value || general.dateString
  };
}

function getCompletedSalesForPeriod(period, dateString, endDateString) {
  return state.sales.filter((sale) => {
    return getSaleStatus(sale) !== "cancelada" && dashboardSaleMatchesPeriod(sale, period, dateString, endDateString);
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

function toLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDashboardSalesDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  const label = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short"
  }).format(date).replace(/\.$/, "");

  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function getDashboardBestSalesDays(sales) {
  const totalsByDay = new Map();

  sales.forEach((sale) => {
    const date = new Date(sale.createdAt);
    const key = toLocalDateKey(date);
    if (!key) return;

    const entry = totalsByDay.get(key) || {
      name: formatDashboardSalesDay(date),
      total: 0,
      tickets: 0,
      timestamp: date.getTime()
    };

    entry.total += Number(sale.total || 0);
    entry.tickets += 1;
    totalsByDay.set(key, entry);
  });

  return [...totalsByDay.values()]
    .sort((a, b) => b.total - a.total || b.timestamp - a.timestamp)
    .slice(0, 5)
    .map((entry) => ({
      ...entry,
      detail: `${entry.tickets} ${entry.tickets === 1 ? "venta" : "ventas"}`
    }));
}

function getDashboardSalesSeries(sales, period, dateString, endDateString) {
  const referenceDate = new Date(`${dateString}T12:00:00`);
  const safeReference = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const monthLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const weekdayLabels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  let series;

  if (period === "range") {
    const range = getDashboardDateRange(dateString, endDateString);
    const durationMs = range.end.getTime() - range.start.getTime();
    const dayCount = Math.max(1, Math.round(durationMs / 86400000));
    const bucketDays = dayCount <= 14 ? 1 : Math.ceil(dayCount / 8);

    series = [];
    for (let bucketStart = new Date(range.start); bucketStart < range.end; ) {
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketEnd.getDate() + bucketDays);
      if (bucketEnd > range.end) bucketEnd.setTime(range.end.getTime());

      const bucketLastDay = new Date(bucketEnd);
      bucketLastDay.setDate(bucketLastDay.getDate() - 1);
      const label = bucketDays === 1
        ? `${String(bucketStart.getDate()).padStart(2, "0")} ${monthLabels[bucketStart.getMonth()]}`
        : `${bucketStart.getDate()}-${bucketLastDay.getDate()} ${monthLabels[bucketLastDay.getMonth()]}`;

      series.push({
        key: `range-${toLocalDateKey(bucketStart)}`,
        label,
        total: 0,
        start: new Date(bucketStart),
        end: new Date(bucketEnd)
      });
      bucketStart = bucketEnd;
    }
  } else if (period === "day") {
    series = Array.from({ length: 8 }, (_, index) => {
      const hour = index * 3;
      return { key: `hour-${hour}`, label: `${String(hour).padStart(2, "0")} h`, total: 0 };
    });
  } else if (period === "week") {
    const range = getPeriodRange("week", dateString);
    series = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(range.start);
      date.setDate(date.getDate() + index);
      return { key: toLocalDateKey(date), label: weekdayLabels[date.getDay()], total: 0 };
    });
  } else if (period === "month") {
    const daysInMonth = new Date(safeReference.getFullYear(), safeReference.getMonth() + 1, 0).getDate();
    series = Array.from({ length: Math.ceil(daysInMonth / 7) }, (_, index) => {
      const start = index * 7 + 1;
      const end = Math.min(start + 6, daysInMonth);
      return { key: `week-${index}`, label: `${start}-${end}`, total: 0 };
    });
  } else if (period === "year") {
    series = monthLabels.map((label, index) => ({ key: `month-${index}`, label, total: 0 }));
  } else {
    series = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(safeReference.getFullYear(), safeReference.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: monthLabels[date.getMonth()],
        total: 0
      };
    });
  }

  if (period === "range") {
    sales.forEach((sale) => {
      const date = new Date(sale.createdAt);
      const item = series.find((bucket) => date >= bucket.start && date < bucket.end);
      if (item) item.total += Number(sale.total || 0);
    });

    return series;
  }

  const seriesByKey = new Map(series.map((item) => [item.key, item]));

  sales.forEach((sale) => {
    const date = new Date(sale.createdAt);
    if (Number.isNaN(date.getTime())) return;

    let key;
    if (period === "day") key = `hour-${Math.floor(date.getHours() / 3) * 3}`;
    else if (period === "week") key = toLocalDateKey(date);
    else if (period === "month") key = `week-${Math.floor((date.getDate() - 1) / 7)}`;
    else if (period === "year") key = `month-${date.getMonth()}`;
    else key = `${date.getFullYear()}-${date.getMonth()}`;

    const item = seriesByKey.get(key);
    if (item) item.total += Number(sale.total || 0);
  });

  return series;
}

function getDashboardMetricSeries(sales, metric, filter) {
  // Reuse the existing temporal buckets and the current sale-profit definition.
  let { period, dateString, endDateString } = filter;
  if (period === "all" && sales.length) {
    const dates = sales.map(sale => toLocalDateKey(sale.createdAt)).filter(Boolean).sort();
    if (dates.length) { period = "range"; dateString = dates[0]; endDateString = dates[dates.length - 1]; }
  }
  const seriesFor = records => getDashboardSalesSeries(records, period, dateString, endDateString);
  const totals = seriesFor(sales);
  if (metric === "sales") return totals;
  const counts = seriesFor(sales.map(sale => ({ ...sale, total: 1 })));
  if (metric === "count") return counts;
  const profits = seriesFor(sales.map(sale => ({ ...sale, total: getSaleProfit(sale).grossProfit })));
  if (metric === "profit") return profits;
  return totals.map((item, index) => ({
    ...item,
    total: metric === "average"
      ? (counts[index].total ? item.total / counts[index].total : 0)
      : (item.total ? profits[index].total / item.total * 100 : 0)
  }));
}

function getDashboardMetricLabel(metric) {
  return { sales: "Ventas", profit: "Ganancia", average: "Ticket promedio", count: "Número de ventas", margin: "Margen" }[metric] || "Ventas";
}

function formatDashboardMetric(value, metric, compact = false) {
  if (metric === "margin") return value.toFixed(compact ? 1 : 2) + "%";
  if (metric === "count") return String(Math.round(value));
  return compact
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1 }).format(value)
    : money(value);
}

function renderBusinessChart(targetId, sales, filter, definitions, typeId) {
  const chart = $(targetId);
  const selector = $(typeId);
  if (!chart || !selector) return;
  const counts = getDashboardMetricSeries(sales, "count", filter);
  const canConnect = counts.filter(item => item.total > 0).length >= 2;
  if (!canConnect && sales.length) selector.value = "bar";
  selector.disabled = !sales.length;
  [...selector.options].forEach(option => { option.disabled = option.value !== "bar" && !canConnect; });
  selector.title = selector.getAttribute("aria-label") + ": " + selector.selectedOptions[0].textContent;
  if (!sales.length) {
    chart.innerHTML = '<div class="business-empty">Sin ventas en este periodo. Cambia la fecha o el periodo para consultar registros.</div>';
    return;
  }
  const series = definitions.map(def => ({ ...def, data: getDashboardMetricSeries(sales, def.metric, filter) }));
  const labels = series[0].data.map(item => item.label);
  const values = series.flatMap(group => group.data.map(item => item.total));
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const left = 66, top = 15, width = 478, height = 162;
  const y = value => top + (max - value) / (max - min) * height;
  const x = index => left + (index + .5) * width / labels.length;
  const baseline = y(0);
  let drawing = "";
  for (let i = 0; i <= 4; i++) {
    const value = min + (max - min) * i / 4;
    const lineY = y(value);
    drawing += '<line class="business-chart-grid" x1="' + left + '" x2="' + (left + width) + '" y1="' + lineY + '" y2="' + lineY + '"/><text x="' + (left - 8) + '" y="' + (lineY + 4) + '" text-anchor="end">' + escapeHtml(formatDashboardMetric(value, definitions[0].metric, true)) + '</text>';
  }
  const labelStride = Math.max(1, Math.ceil(labels.length / 7));
  labels.forEach((label, index) => {
    if (index % labelStride === 0 || index === labels.length - 1) drawing += '<text x="' + x(index) + '" y="200" text-anchor="middle">' + escapeHtml(label) + '</text>';
  });
  series.forEach((group, groupIndex) => {
    const points = group.data.map((item, index) => x(index) + "," + y(item.total)).join(" ");
    if (selector.value === "bar") {
      const groupWidth = width / labels.length * .7, barWidth = Math.min(44, groupWidth / series.length);
      group.data.forEach((item, index) => {
        const barX = x(index) - barWidth * series.length / 2 + groupIndex * barWidth;
        drawing += '<rect x="' + barX + '" y="' + Math.min(y(item.total), baseline) + '" width="' + Math.max(1, barWidth - 2) + '" height="' + Math.abs(y(item.total) - baseline) + '" rx="2" fill="' + group.color + '"><title>' + escapeHtml(group.label + " · " + item.label + ": " + formatDashboardMetric(item.total, group.metric)) + '</title></rect>';
      });
    } else {
      if (selector.value === "area") drawing += '<polygon points="' + x(0) + ',' + baseline + ' ' + points + ' ' + x(labels.length - 1) + ',' + baseline + '" fill="' + group.color + '" fill-opacity=".12"/>';
      drawing += '<polyline points="' + points + '" fill="none" stroke="' + group.color + '" stroke-width="2.5" stroke-linejoin="round"/>';
      group.data.forEach((item, index) => {
        drawing += '<circle cx="' + x(index) + '" cy="' + y(item.total) + '" r="3.5" fill="' + group.color + '"><title>' + escapeHtml(group.label + " · " + item.label + ": " + formatDashboardMetric(item.total, group.metric)) + '</title></circle>';
      });
    }
  });
  const description = series.map(group => group.label).join(" y ");
  const rows = labels.map((label, index) => '<tr><th scope="row">' + escapeHtml(label) + '</th>' + series.map(group => '<td>' + escapeHtml(formatDashboardMetric(group.data[index].total, group.metric)) + '</td>').join("") + '</tr>').join("");
  chart.innerHTML = '<svg viewBox="0 0 560 220" role="img" aria-label="' + escapeHtml(description + " por intervalo del periodo seleccionado") + '">' + drawing + '</svg>' +
    (!canConnect ? '<p class="business-note">Un solo intervalo con ventas: se muestra en barras.</p>' : "") +
    '<details><summary>Ver datos de la gráfica</summary><table><caption class="sr-only">' + escapeHtml(description) + '</caption><thead><tr><th scope="col">Intervalo</th>' + series.map(group => '<th scope="col">' + escapeHtml(group.label) + '</th>').join("") + '</tr></thead><tbody>' + rows + '</tbody></table></details>';
}

function getDashboardFeaturedProducts(sales, mode, limit) {
  if (!sales.length) return [];
  const productSales = getProductSalesFromSales(sales);
  const products = mode === "slow"
    ? state.products.filter(product => product.active !== false).map(product => ({
      productId: product.id, name: product.name, unit: product.unit,
      quantity: productSales.get(product.id)?.quantity || 0,
      total: productSales.get(product.id)?.total || 0
    }))
    : [...productSales.values()];
  products.sort((a, b) => (mode === "slow" ? a.total - b.total : b.total - a.total) || a.name.localeCompare(b.name));
  return limit === "all" ? products : products.slice(0, Number(limit) || 5);
}

function renderBusinessFeatured(sales) {
  const root = $("dashboardView"), list = $("dashboardFeaturedProducts");
  const mode = root.dataset.productMode || "top";
  const products = getDashboardFeaturedProducts(sales, mode, $("dashboardProductLimit").value);
  $("dashboardFeaturedHeading").textContent = mode === "slow" ? "Productos menos vendidos" : "Productos más vendidos";
  const maxAmount = Math.max(0, ...products.map(product => product.total));
  list.innerHTML = products.length ? products.map((item, index) => {
    const product = state.products.find(candidate => candidate.id === item.productId);
    const photo = product ? '<img src="' + escapeHtml(getPosProductImagePath(product)) + '" alt="" loading="lazy" decoding="async">' : "";
    return '<article class="business-product"><div class="business-product-photo">' + photo + '<span>' + (index + 1) + '</span></div><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(quantityText(item.quantity, item.unit)) + '</small>' +
      (maxAmount > 0 ? '<progress value="' + Math.max(0, item.total) + '" max="' + maxAmount + '" aria-label="' + escapeHtml("Importe vendido de " + item.name + ": " + money(item.total)) + '"></progress>' : "") +
      '<b>' + escapeHtml(money(item.total)) + '</b></article>';
  }).join("") : '<div class="business-empty">Sin ventas en este periodo para clasificar los productos.</div>';
  list.scrollLeft = 0;
  syncDashboardCarousel(list.id);
}

function renderBusinessPayments(sales) {
  const panel = $("dashboardPayments"), totals = getSalesTotals(sales);
  $("dashboardPaymentType").disabled = !sales.length || totals.total <= 0;
  if (!sales.length || totals.total <= 0) {
    panel.innerHTML = '<div class="business-empty">Sin importes de pago para el periodo seleccionado.</div>';
    return;
  }
  const items = [
    { label: "Efectivo", amount: totals.cash, color: "#28b985" },
    { label: "Tarjeta", amount: totals.card, color: "#2d8dff" },
    { label: "Transferencia", amount: totals.transfer, color: "#8970eb" }
  ].filter(item => item.amount !== 0);
  let end = 0;
  const stops = items.map(item => {
    const start = end; end += item.amount / totals.total * 100;
    return item.color + " " + start + "% " + end + "%";
  });
  const canDraw = items.every(item => item.amount >= 0);
  $("dashboardPaymentType").disabled = !canDraw;
  const segments = canDraw ? '<div class="business-donut" role="img" aria-label="' + escapeHtml("Distribución de pagos. Total " + money(totals.total)) + '" style="background:conic-gradient(' + stops.join(",") + ')"><strong>' + escapeHtml(money(totals.total)) + '</strong><small>Ventas totales</small></div>' : '<p class="business-note">Importes negativos: consulta los valores de la leyenda.</p>';
  panel.innerHTML = segments + '<div class="business-payment-legend">' + items.map(item =>
    '<div class="business-payment-row" style="--series-color:' + item.color + '"><span>' + item.label + '</span><strong>' + (item.amount / totals.total * 100).toFixed(1) + '%</strong><small>' + escapeHtml(money(item.amount)) + '</small></div>'
  ).join("") + '</div>';
}

function renderBusinessActivity(sales) {
  const panel = $("dashboardRecentActivity");
  const recent = [...sales].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
  if (!recent.length) {
    panel.innerHTML = '<div class="business-empty">Sin actividad en este periodo.</div>';
    return;
  }
  panel.innerHTML = '<table><caption class="sr-only">Actividad reciente del periodo</caption><thead><tr>' +
    ["Folio", "Fecha y hora", "Cliente", "Total", "Pago", "Atendió"].map(label => '<th scope="col">' + label + '</th>').join("") +
    '</tr></thead><tbody>' + recent.map(sale => '<tr><td>' + escapeHtml(sale.id || "—") + '</td><td>' +
      escapeHtml(new Date(sale.createdAt).toLocaleString("es-MX", typeof preferenceDateOptions === "function" ? preferenceDateOptions() : undefined)) + '</td><td>' + escapeHtml(sale.invoice?.customer?.businessName || "—") +
      '</td><td>' + escapeHtml(money(sale.total)) + '</td><td>' + escapeHtml(getPaymentLabel(sale.paymentMethod)) +
      '</td><td>' + escapeHtml(sale.operator?.name || sale.userName || "—") + '</td></tr>').join("") + '</tbody></table>';
}

function renderBusinessAlerts() {
  const list = $("dashboardAlerts"), alerts = getInventoryAlerts();
  list.innerHTML = alerts.length ? alerts.map(item => '<article class="business-alert"><span>' + (item.kind === "warn" ? "Stock bajo" : "Cerca del mínimo") + '</span><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(item.detail) + '</small></article>').join("")
    : '<div class="business-empty">Sin avisos de existencias. Los productos con umbral definido están fuera del nivel de alerta.</div>';
  list.scrollLeft = 0;
  syncDashboardCarousel(list.id);
}

function syncDashboardCarousel(id) {
  const list = $(id);
  if (!list) return;
  const limit = Math.max(0, list.scrollWidth - list.clientWidth);
  $$('[data-dashboard-scroll="' + id + '"]').forEach(button => {
    button.disabled = Number(button.dataset.direction) < 0 ? list.scrollLeft <= 1 : list.scrollLeft >= limit - 1;
  });
}

function moveDashboardCarousel(id, direction) {
  const list = $(id);
  if (!list) return;
  list.scrollBy({ left: direction * Math.max(120, list.clientWidth * .8), behavior: posReducedMotion ? "instant" : "smooth" });
}

function selectDashboardMetric(metric, focus = false) {
  if (!["sales", "profit", "average", "count", "margin"].includes(metric)) return;
  $("dashboardView").dataset.metric = metric;
  renderDashboard();
  if (focus) $("dashboardSalesChartCaption").focus();
}

function cycleDashboardView(kind, direction) {
  const root = $("dashboardView");
  if (kind === "products") {
    root.dataset.productMode = root.dataset.productMode === "slow" ? "top" : "slow";
    renderDashboard();
  } else if (kind === "metrics") {
    const keys = ["sales", "profit", "average", "count", "margin"];
    const index = keys.indexOf(root.dataset.metric || "sales");
    selectDashboardMetric(keys[(index + direction + keys.length) % keys.length]);
  } else if (kind === "trends") {
    const keys = ["profit", "average", "count"];
    const index = keys.indexOf(root.dataset.trendMetric || "profit");
    root.dataset.trendMetric = keys[(index + direction + keys.length) % keys.length];
    renderDashboard();
  }
}

function fitDashboardKpis() {
  $$("#dashboardView .business-kpi strong").forEach(value => {
    value.style.removeProperty("font-size");
    value.style.removeProperty("white-space");
    if (!value.clientWidth) return;
    const size = parseFloat(getComputedStyle(value).fontSize);
    if (value.scrollWidth > value.clientWidth) {
      const fittedSize = size * value.clientWidth / value.scrollWidth;
      value.style.fontSize = Math.max(12, fittedSize - .2) + "px";
      if (fittedSize < 12) { value.style.whiteSpace = "normal"; value.style.overflowWrap = "anywhere"; }
    }
  });
}

function initDashboardUi() {
  const root = $("dashboardView");
  if (!root) return;
  initGlassChartSelectors();
  on(root, "change", event => {
    if (event.target.matches("select,input[type=date]")) renderDashboard();
  });
  on(root, "click", event => {
    const scroll = event.target.closest("[data-dashboard-scroll]");
    const cycle = event.target.closest("[data-dashboard-cycle]");
    const products = event.target.closest("[data-dashboard-products-cycle]");
    const trends = event.target.closest("[data-dashboard-trend-cycle]");
    if (products) cycleDashboardView("products", Number(products.dataset.dashboardProductsCycle));
    if (trends) cycleDashboardView("trends", Number(trends.dataset.dashboardTrendCycle));
    if (scroll) moveDashboardCarousel(scroll.dataset.dashboardScroll, Number(scroll.dataset.direction));
    if (cycle) cycleDashboardView("metrics", Number(cycle.dataset.dashboardCycle));
  });
  on(root, "keydown", event => {
    const heading = event.target.closest("[data-dashboard-heading]");
    if (heading && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault(); cycleDashboardView(heading.dataset.dashboardHeading, event.key === "ArrowLeft" ? -1 : 1);
    }
    const strip = event.target.closest(".business-product-strip,.business-alert-strip");
    if (strip && event.target === strip && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault(); moveDashboardCarousel(strip.id, event.key === "ArrowLeft" ? -1 : 1);
    }
  });
  ["dashboardFeaturedProducts", "dashboardAlerts"].forEach(id => {
    on($(id), "scroll", () => syncDashboardCarousel(id), { passive: true });
    if (typeof ResizeObserver === "function") new ResizeObserver(() => syncDashboardCarousel(id)).observe($(id));
  });
  if (typeof ResizeObserver === "function") new ResizeObserver(fitDashboardKpis).observe(root.querySelector(".business-kpis"));
  on($("dashboardAllSalesBtn"), "click", () => {
    $("salesPeriodFilter").value = "all";
    setView("sales");
  });
  on($("refreshDashboardBtn"), "click", loadDashboard);
}

function initGlassChartSelectors() {
  // Enhance the existing native select only when its native picker is styleable.
  // Other browsers keep the same working select, options and change events.
  if (!CSS.supports("appearance", "base-select")) return;
  const paths = {
    line: '<path d="M3 3v18h18M6 15l4-5 4 3 6-8"/>',
    bar: '<path d="M3 3v18h18M7 17v-5M12 17V7M17 17v-9"/>',
    area: '<path d="M3 3v18h18M6 17l4-9 4 5 6-8v12H6Z"/>',
    donut: '<path d="M12 3a9 9 0 1 0 9 9h-6a3 3 0 1 1-3-3V3ZM15 3.5V9h5.5A9 9 0 0 0 15 3.5Z"/>'
  };
  $$(".glass-chart-select").forEach(select => {
    if (select.querySelector("selectedcontent")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.append(document.createElement("selectedcontent"));
    [...select.options].forEach(option => {
      const label = option.textContent;
      option.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[option.value] + '</svg><span>' + escapeHtml(label) + '</span>';
    });
    select.prepend(button);
  });
}

function makeGlassCalendarDate(year, month, day = 1) {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

function getGlassCalendarDateKey(date) {
  return [String(date.getFullYear()).padStart(4, "0"), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function parseGlassCalendarDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || "")) return null;
  const [year, month, day] = key.split("-").map(Number);
  const date = makeGlassCalendarDate(year, month - 1, day);
  return year >= 1 && year <= 9999 && getGlassCalendarDateKey(date) === key ? date : null;
}

function getGlassCalendarDays(year, month) {
  const first = makeGlassCalendarDate(year, month);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => makeGlassCalendarDate(year, month, index - offset + 1));
}

function initGlassDatePickers() {
  if (!HTMLElement.prototype.showPopover || $("glassDatePicker")) return;
  const inputs = $$(".app-view input[type=date],.modal-card input[type=date]");
  if (!inputs.length) return;
  const popup = document.createElement("div");
  popup.id = "glassDatePicker";
  popup.className = "glass-date-picker";
  popup.setAttribute("popover", "auto");
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Elegir fecha");
  const months = Array.from({ length: 12 }, (_, index) => makeGlassCalendarDate(2026, index).toLocaleDateString("es-MX", { month: "long" }));
  popup.innerHTML = '<div class="glass-calendar-head"><button type="button" class="glass-calendar-nav glass-calendar-prev" data-calendar-month="-1" aria-label="Mes anterior"></button><select id="glassCalendarMonth" aria-label="Mes del calendario">' + months.map((name, index) => '<option value="' + index + '">' + name + '</option>').join("") + '</select><input id="glassCalendarYear" type="number" min="1" max="9999" aria-label="Año del calendario"><button type="button" class="glass-calendar-nav glass-calendar-next" data-calendar-month="1" aria-label="Mes siguiente"></button></div>' +
    '<h3 id="glassCalendarHeading" class="sr-only" aria-live="polite"></h3><p class="glass-calendar-help" id="glassCalendarHelp">Flechas: días · Re Pág / Av Pág: mes</p>' +
    '<table role="grid" aria-labelledby="glassCalendarHeading" aria-describedby="glassCalendarHelp"><thead><tr>' + ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"].map(day => '<th scope="col" abbr="' + day + '">' + day.slice(0, 2) + '</th>').join("") + '</tr></thead><tbody id="glassCalendarDays"></tbody></table>' +
    '<div class="glass-calendar-footer"><button type="button" data-calendar-clear>Borrar</button><button type="button" data-calendar-today>Hoy</button></div>';
  document.body.append(popup);
  let activeInput = null, probe = null, view = null, focusKey = "", frame = 0;
  const isOpen = () => popup.matches(":popover-open");
  const isAllowed = key => {
    if (!parseGlassCalendarDate(key)) return false;
    probe.value = key;
    return probe.validity.valid;
  };
  const canVisit = date => {
    const year = date.getFullYear(), month = date.getMonth();
    if (year < 1 || year > 9999) return false;
    return (!activeInput.min || getGlassCalendarDateKey(makeGlassCalendarDate(year, month + 1, 0)) >= activeInput.min) &&
      (!activeInput.max || getGlassCalendarDateKey(makeGlassCalendarDate(year, month)) <= activeInput.max);
  };
  function position() {
    if (!isOpen() || !activeInput) return;
    const field = activeInput.getBoundingClientRect();
    if (!activeInput.isConnected || !field.width || field.bottom < 0 || field.top > window.innerHeight) { close(false); return; }
    const bounds = popup.getBoundingClientRect(), gap = 8, edge = 12;
    const centeredLeft = field.left + (field.width - bounds.width) / 2;
    popup.style.left = Math.max(edge, Math.min(centeredLeft, window.innerWidth - bounds.width - edge)) + "px";
    const below = field.bottom + gap;
    popup.style.top = (below + bounds.height <= window.innerHeight - edge ? below : Math.max(edge, field.top - gap - bounds.height)) + "px";
  }
  function close(restoreFocus) {
    if (isOpen()) popup.hidePopover();
    activeInput?.setAttribute("aria-expanded", "false");
    if (restoreFocus && activeInput?.isConnected && !activeInput.disabled) activeInput.focus({ preventScroll: true });
  }
  function render(focusDay = false) {
    const year = view.getFullYear(), month = view.getMonth();
    $("glassCalendarMonth").value = String(month);
    $("glassCalendarYear").value = String(year);
    $("glassCalendarHeading").textContent = view.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
    const days = getGlassCalendarDays(year, month);
    if (!days.some(date => getGlassCalendarDateKey(date) === focusKey && isAllowed(focusKey))) {
      const first = days.find(date => date.getMonth() === month && isAllowed(getGlassCalendarDateKey(date)));
      focusKey = first ? getGlassCalendarDateKey(first) : "";
    }
    const today = getLocalDateString();
    $("glassCalendarDays").innerHTML = Array.from({ length: 6 }, (_, week) => '<tr>' + days.slice(week * 7, week * 7 + 7).map(date => {
      const key = getGlassCalendarDateKey(date), allowed = isAllowed(key), selected = key === activeInput.value;
      return '<td role="gridcell" aria-selected="' + selected + '"><button type="button" data-calendar-date="' + key + '" class="glass-calendar-day' + (date.getMonth() !== month ? ' is-outside' : '') + '" tabindex="' + (key === focusKey ? '0' : '-1') + '" aria-label="' + escapeHtml(date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })) + '"' + (selected ? ' aria-pressed="true"' : '') + (key === today ? ' aria-current="date"' : '') + (!allowed ? ' disabled' : '') + '>' + date.getDate() + '</button></td>';
    }).join("") + '</tr>').join("");
    popup.querySelector('[data-calendar-month="-1"]').disabled = !canVisit(makeGlassCalendarDate(year, month - 1));
    popup.querySelector('[data-calendar-month="1"]').disabled = !canVisit(makeGlassCalendarDate(year, month + 1));
    popup.querySelector('[data-calendar-today]').disabled = !isAllowed(today);
    position();
    if (focusDay) (popup.querySelector('[data-calendar-date="' + focusKey + '"]') || $("glassCalendarMonth")).focus({ preventScroll: true });
  }
  function commit(value) {
    if (activeInput.disabled || activeInput.readOnly || (value && !isAllowed(value))) return;
    if (activeInput.value !== value) {
      activeInput.value = value;
      activeInput.dispatchEvent(new Event("input", { bubbles: true }));
      activeInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close(true);
  }
  function open(input) {
    if (input.disabled || input.readOnly || !document.body.classList.contains("atelier-shell")) return;
    if (isOpen() && activeInput === input) { close(true); return; }
    close(false);
    activeInput = input;
    probe = input.cloneNode(false);
    let selected = parseGlassCalendarDate(input.value) || parseGlassCalendarDate(getLocalDateString());
    if (input.min && getGlassCalendarDateKey(selected) < input.min) selected = parseGlassCalendarDate(input.min) || selected;
    if (input.max && getGlassCalendarDateKey(selected) > input.max) selected = parseGlassCalendarDate(input.max) || selected;
    view = makeGlassCalendarDate(selected.getFullYear(), selected.getMonth());
    focusKey = getGlassCalendarDateKey(selected);
    popup.setAttribute("aria-label", "Elegir fecha: " + (input.getAttribute("aria-label") || input.labels?.[0]?.textContent.trim() || "Fecha"));
    render();
    popup.showPopover();
    activeInput.setAttribute("aria-expanded", "true");
    position();
    (popup.querySelector('[data-calendar-date="' + focusKey + '"]') || $("glassCalendarMonth")).focus({ preventScroll: true });
  }
  inputs.forEach(input => {
    input.classList.add("glass-date-input");
    input.setAttribute("aria-haspopup", "dialog");
    input.setAttribute("aria-controls", popup.id);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-keyshortcuts", "Alt+ArrowDown F4");
    input.title = (input.title ? input.title + " · " : "") + "Abrir calendario: Alt + ↓ o F4";
    input.addEventListener("click", event => {
      if (event.button || event.clientX < input.getBoundingClientRect().right - 32) return;
      event.preventDefault();
      open(input);
    }, true);
    input.addEventListener("keydown", event => {
      if (event.key !== "F4" && !(event.altKey && event.key === "ArrowDown")) return;
      event.preventDefault();
      open(input);
    });
  });
  popup.addEventListener("click", event => {
    const day = event.target.closest("[data-calendar-date]");
    if (day) { if (!day.disabled) commit(day.dataset.calendarDate); return; }
    if (event.target.closest("[data-calendar-clear]")) { commit(""); return; }
    if (event.target.closest("[data-calendar-today]")) { commit(getLocalDateString()); return; }
    const navigation = event.target.closest("[data-calendar-month]");
    if (navigation && !navigation.disabled) { view = makeGlassCalendarDate(view.getFullYear(), view.getMonth() + Number(navigation.dataset.calendarMonth)); render(); }
  });
  popup.addEventListener("change", event => {
    if (!["glassCalendarMonth", "glassCalendarYear"].includes(event.target.id)) return;
    const year = Number($("glassCalendarYear").value), month = Number($("glassCalendarMonth").value);
    if (!Number.isInteger(year) || year < 1 || year > 9999) return;
    view = makeGlassCalendarDate(year, month);
    render();
  });
  popup.addEventListener("keydown", event => {
    const button = event.target.closest("[data-calendar-date]");
    if (!button || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return;
    event.preventDefault();
    const date = parseGlassCalendarDate(button.dataset.calendarDate);
    let next;
    if (["PageUp", "PageDown"].includes(event.key)) {
      const month = date.getMonth() + (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1);
      next = makeGlassCalendarDate(date.getFullYear(), month, Math.min(date.getDate(), makeGlassCalendarDate(date.getFullYear(), month + 1, 0).getDate()));
    } else {
      const weekday = (date.getDay() + 6) % 7;
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
      next = makeGlassCalendarDate(date.getFullYear(), date.getMonth(), date.getDate() + offsets[event.key]);
    }
    const direction = next < date ? -1 : 1;
    for (let attempt = 0; attempt < 3660 && !isAllowed(getGlassCalendarDateKey(next)); attempt++) {
      if ((activeInput.min && getGlassCalendarDateKey(next) < activeInput.min && direction < 0) || (activeInput.max && getGlassCalendarDateKey(next) > activeInput.max && direction > 0) || next.getFullYear() < 1 || next.getFullYear() > 9999) return;
      next.setDate(next.getDate() + direction);
    }
    if (!isAllowed(getGlassCalendarDateKey(next)) || !canVisit(next)) return;
    focusKey = getGlassCalendarDateKey(next);
    view = makeGlassCalendarDate(next.getFullYear(), next.getMonth());
    render(true);
  });
  popup.addEventListener("toggle", () => { if (!isOpen()) activeInput?.setAttribute("aria-expanded", "false"); });
  popup.addEventListener("focusout", event => {
    if (isOpen() && event.relatedTarget && !popup.contains(event.relatedTarget)) close(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !isOpen()) return;
    if (popup.querySelector("select:open")) return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  }, true);
  const schedulePosition = () => {
    if (!isOpen() || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; position(); });
  };
  window.addEventListener("resize", schedulePosition, { passive: true });
  document.addEventListener("scroll", schedulePosition, { capture: true, passive: true });
}

function getDashboardPeriodTitle(filter, today = getLocalDateString()) {
  if (filter.period === "all") return "Todo el historial";
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && getLocalDateString(parseLocalDate(value)) === value;
  if (!validDate(filter.dateString) || (filter.period === "range" && (!validDate(filter.endDateString) || filter.endDateString < filter.dateString))) return "Periodo no disponible";
  if (!["day", "week", "month", "year", "range"].includes(filter.period)) return "Periodo no disponible";
  const range = filter.period === "range"
    ? getDashboardDateRange(filter.dateString, filter.endDateString)
    : getPeriodRange(filter.period, filter.dateString);
  const start = range.start, end = new Date(range.end.getTime() - 1);
  const format = (date, options) => date.toLocaleDateString("es-MX", options);
  const full = { day: "numeric", month: "long", year: "numeric" };
  if (filter.period === "day" && filter.dateString === today) return "Hoy";
  if (getLocalDateString(start) === getLocalDateString(end)) return format(start, full);
  if (start.getFullYear() !== end.getFullYear()) return "Del " + format(start, full) + " al " + format(end, full);
  if (start.getMonth() !== end.getMonth()) return "Del " + format(start, { day: "numeric", month: "long" }) + " al " + format(end, full);
  return "Del " + start.getDate() + " al " + format(end, full);
}

function renderDashboard() {
  const root = $("dashboardView");
  if (!root) return;
  const filter = getDashboardFilter();
  const sales = getCompletedSalesForPeriod(filter.period, filter.dateString, filter.endDateString);
  const totals = getSalesTotals(sales);
  $("dashboardProfit").textContent = money(totals.profit);
  $("dashboardReinvest").textContent = money(totals.cost);
  $("dashboardTotalSales").textContent = money(totals.total);
  $("dashboardSalesCount").textContent = String(totals.count);
  $("dashboardAverageTicket").textContent = money(totals.count ? totals.total / totals.count : 0);
  $("dashboardMargin").textContent = (totals.total ? totals.profit / totals.total * 100 : 0).toFixed(2) + "%";
  const periodTitle = getDashboardPeriodTitle(filter);
  $("dashboardPeriodCaption").textContent = periodTitle;
  $("dashboardPeriodDetail").hidden = periodTitle !== "Hoy";
  $("dashboardPeriodDetail").textContent = periodTitle === "Hoy" ? parseLocalDate(filter.dateString).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "";
  renderBusinessFeatured(sales);
  const metric = root.dataset.metric || "sales";
  $("dashboardSalesChartCaption").textContent = getDashboardMetricLabel(metric) + " del periodo";
  const chartFilter = getDashboardVisualFilter("dashboardChartPeriodFilter", "dashboardChartDateInput");
  const chartSales = getCompletedSalesForPeriod(chartFilter.period, chartFilter.dateString, chartFilter.endDateString);
  renderBusinessChart("dashboardSalesChart", chartSales, chartFilter, [{ metric, label: getDashboardMetricLabel(metric), color: "#2c8dff" }], "dashboardChartType");
  const paymentFilter = getDashboardVisualFilter("dashboardPaymentPeriodFilter", "dashboardPaymentDateInput");
  renderBusinessPayments(getCompletedSalesForPeriod(paymentFilter.period, paymentFilter.dateString, paymentFilter.endDateString));
  const trendFilter = getDashboardVisualFilter("dashboardTrendPeriodFilter", "dashboardTrendDateInput");
  const trendSales = getCompletedSalesForPeriod(trendFilter.period, trendFilter.dateString, trendFilter.endDateString);
  const trendMetric = root.dataset.trendMetric || "profit";
  $("dashboardTrendHeading").textContent = { profit: "Ventas frente a ganancias", average: "Ventas frente a ticket promedio", count: "Número de ventas" }[trendMetric];
  const definitions = trendMetric === "count" ? [{ metric: "count", label: "Número de ventas", color: "#2c8dff" }] : [
    { metric: "sales", label: "Ventas", color: "#2c8dff" },
    { metric: trendMetric, label: getDashboardMetricLabel(trendMetric), color: "#26b986" }
  ];
  $("dashboardTrendLegend").innerHTML = definitions.map(def => '<span style="--series-color:' + def.color + '">' + escapeHtml(def.label) + '</span>').join("");
  renderBusinessChart("dashboardTrendChart", trendSales, trendFilter, definitions, "dashboardTrendType");
  renderBusinessActivity(sales);
  renderBusinessAlerts();
  fitDashboardKpis();
}

async function loadCashCut() {
  if (!$('cutDateInput').value) {
    $('cutDateInput').value = getLocalDateString();
  }

  try {
    const [sales] = await Promise.all([
      fetchJson('/api/sales'),
      loadCashSessions()
    ]);
    state.sales = sales;
    updateTicketId();
    renderCashCut();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo cargar el corte.');
  }
}

function renderCashCut() {
  syncPeriodInput('cutPeriodFilter', 'cutDateInput');
  const period = $('cutPeriodFilter')?.value || 'day';
  const dateString = $('cutDateInput')?.value || getLocalDateString();
  const periodSales = state.sales.filter((sale) => saleMatchesPeriod(sale, period, dateString));
  const completedSales = periodSales.filter((sale) => getSaleStatus(sale) !== 'cancelada');
  const canceledSales = periodSales.length - completedSales.length;
  const totals = completedSales.reduce(
    (acc, sale) => {
      const profit = getSaleProfit(sale);
      const total = Number(sale.total || 0);

      acc.total += total;
      acc.profit += profit.grossProfit;
      acc.count += 1;

      if (sale.paymentMethod === 'tarjeta') acc.card += total;
      else if (sale.paymentMethod === 'transferencia') acc.transfer += total;
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

  $('cutTotalSales').textContent = money(totals.total);
  $('cutGrossProfit').textContent = money(totals.profit);
  $('cutMargin').textContent = `${margin.toFixed(2)}%`;
  $('cutSalesCount').textContent = String(totals.count);
  $('cutCash').textContent = money(totals.cash);
  $('cutCard').textContent = money(totals.card);
  $('cutTransfer').textContent = money(totals.transfer);
  $('cutCanceled').textContent = String(canceledSales);

  renderCashRegister();
  renderCashHistory();

}

function renderTopProducts(sales) {
  const list = $("topProductsList");
  if (!list) return;
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
    list.innerHTML = '<p class="empty-state">Sin ventas en esta fecha.</p>';
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
    .join('');
}

function getSalesCashShift() {
  return state.currentCashSession?.status === 'open' ? state.currentCashSession : null;
}

function hasOpenCashForSales() {
  return Boolean(getSalesCashShift());
}

function goToCashRegister() {
  if(!canAccessView('reports','cash')){showToast('No tienes autorización para Caja y cortes.');return;}
  const periodInput = $('cutPeriodFilter');
  const dateInput = $('cutDateInput');

  if (periodInput) periodInput.value = 'day';
  if (dateInput) dateInput.value = getLocalDateString();

  setReportsMode('cash');
  setView('reports');
  setCashTab(state.currentCashSession ? (isAdminUser() ? 'movements' : 'count') : 'current');
  window.setTimeout(() => {
    const target = state.currentCashSession
      ? (isAdminUser() ? $('cashMovementAmount') : $('countedCashInput'))
      : $('openingCashInput');
    target?.focus();
  }, 0);
}

function shiftMatchesPeriod(shift, period, dateString) {
  const range = getPeriodRange(period, dateString);
  if (!range) return true;

  const shiftDate = parseLocalDate(shift.date || shift.businessDate);
  return shiftDate >= range.start && shiftDate < range.end;
}

function getCurrentCashSummary() {
  return state.currentCashSession?.summary || {
    totalSales: 0,
    grossProfit: 0,
    salesCount: 0,
    cashSales: 0,
    cardSales: 0,
    transferSales: 0,
    canceledCount: 0,
    cashIn: 0,
    cashOut: 0,
    expectedCash: 0
  };
}

function updateCashGateUi() {
  const cashSession = getSalesCashShift();
  const isOpen = Boolean(cashSession);
  const statusButton = $('cashStatusBtn');
  const notice = $('cashGateNotice');

  document.body.classList.toggle('cash-open', isOpen);
  document.body.classList.toggle('cash-closed', !isOpen);

  if (statusButton) {
    statusButton.textContent = isOpen ? 'Caja abierta' : 'Caja cerrada';
    statusButton.classList.toggle('open', isOpen);
    statusButton.classList.toggle('closed', !isOpen);
    statusButton.setAttribute(
      'title',
      isOpen
        ? `Caja abierta por ${cashSession.openedBy?.name || 'usuario'} · ${money(getCurrentCashSummary().expectedCash)}`
        : 'Abrir caja para vender'
    );
  }

  if (notice) notice.hidden = isOpen;

  if (state.activeView === 'dashboard') renderDashboard();
}

function setCashTab(name, focus = false) {
  const tabs = $$('[data-cash-tab]');
  if (!tabs.some((tab) => tab.dataset.cashTab === name)) return;
  tabs.forEach((tab) => {
    const selected = tab.dataset.cashTab === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    const panel = $(tab.getAttribute('aria-controls'));
    if (panel) {
      const entering = panel.hidden && selected;
      panel.hidden = !selected;
      if (entering) animatePosFeedback(panel, 'navigation');
    }
    if (selected && focus) tab.focus();
  });
}

function renderCashRegisterSummary() {
  const activeSession = getSalesCashShift();
  const counted = Number($('countedCashInput')?.value || 0);
  const expected = Number(getCurrentCashSummary().expectedCash || 0);
  const difference = activeSession ? counted - expected : 0;
  const hasCount = Boolean(activeSession && $('countedCashInput')?.value.trim() !== '' && Number.isFinite(counted));

  if ($('cashShiftDifference')) {
    $('cashShiftDifference').textContent = hasCount ? money(difference) : 'Pendiente de conteo';
    $('cashShiftDifference').classList.toggle('negative', hasCount && difference < 0);
    $('cashShiftDifference').classList.toggle('positive', hasCount && difference > 0);
    $('cashShiftDifference').classList.toggle('balanced', hasCount && difference === 0);
  }
  if ($('cashDifferenceHint')) $('cashDifferenceHint').textContent = !hasCount
    ? 'Captura el efectivo contado o utiliza la calculadora.'
    : `${difference < 0 ? 'Faltante' : difference > 0 ? 'Sobrante' : 'Sin diferencia'} preliminar. Se guardará al confirmar el cierre.`;

  updateCashCountTool();
}

function renderCashCountTool() {
  const grid = $('cashCountGrid');
  if (!grid) return;

  if (!grid.dataset.rendered) {
    grid.innerHTML = CASH_COUNT_DENOMINATIONS.map((item) => `
      <label class="cashdesk-count-row">
        <span>${escapeHtml(item.label)}</span>
        <input type="number" min="0" step="1" inputmode="numeric" data-cash-count-denomination="${item.value}" placeholder="0" />
        <small data-cash-count-subtotal="${item.value}">$0.00</small>
      </label>
    `).join('');
    grid.dataset.rendered = 'true';
    $$('[data-cash-count-denomination]').forEach((input) => {
      input.addEventListener('input', updateCashCountTool);
    });
  }

  updateCashCountTool();
}

function getCashCountTotal() {
  return $$('[data-cash-count-denomination]').reduce((total, input) => {
    const denomination = Number(input.dataset.cashCountDenomination || 0);
    const quantity = Math.max(0, Number(input.value || 0));
    return total + (denomination * quantity);
  }, 0);
}

function updateCashCountTool() {
  const panel = $('cashCountTool');
  if (!panel) return;

  $$('[data-cash-count-denomination]').forEach((input) => {
    const denomination = Number(input.dataset.cashCountDenomination || 0);
    const quantity = Math.max(0, Number(input.value || 0));
    const subtotal = denomination * quantity;
    const subtotalEl = document.querySelector(`[data-cash-count-subtotal="${input.dataset.cashCountDenomination}"]`);
    if (subtotalEl) subtotalEl.textContent = money(subtotal);
  });

  const total = getCashCountTotal();
  const expected = Number(getCurrentCashSummary().expectedCash || 0);
  const difference = getSalesCashShift() ? total - expected : 0;
  const hasCount = Boolean(getSalesCashShift() && $$('[data-cash-count-denomination]').some((input) => input.value.trim() !== ''));

  if ($('cashCountTotal')) $('cashCountTotal').textContent = money(total);
  if ($('cashCountExpected')) $('cashCountExpected').textContent = money(expected);
  if ($('cashCountDifference')) {
    $('cashCountDifference').textContent = hasCount ? money(difference) : 'Pendiente de conteo';
    $('cashCountDifference').classList.toggle('negative', hasCount && difference < 0);
    $('cashCountDifference').classList.toggle('positive', hasCount && difference > 0);
    $('cashCountDifference').classList.toggle('balanced', hasCount && difference === 0);
  }
}

function toggleCashCountTool() {
  const panel = $('cashCountTool');
  if (!panel) return;

  const willOpen = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !willOpen);
  renderCashCountTool();
  $('cashCountToggleBtn')?.classList.toggle('active', willOpen);
  $('cashCountToggleBtn')?.setAttribute('aria-expanded', String(willOpen));
}

function clearCashCountTool() {
  $$('[data-cash-count-denomination]').forEach((input) => {
    input.value = '';
  });
  updateCashCountTool();
}

function useCashCountTotal() {
  const countedInput = $('countedCashInput');
  if (!countedInput) return;
  countedInput.value = getCashCountTotal().toFixed(2);
  renderCashRegisterSummary();
}

function renderCashMovements() {
  const list = $('cashMovementsList');
  if (!list) return;

  const movements = Array.isArray(state.currentCashSession?.movements)
    ? [...state.currentCashSession.movements].reverse()
    : [];

  if (movements.length === 0) {
    list.innerHTML = '<p class="empty-state">Sin movimientos manuales.</p>';
    return;
  }

  list.innerHTML = movements.map((movement) => {
    const isOut = movement.type === 'out';
    return `
      <article class="cashdesk-movement-row ${isOut ? 'out' : 'in'}">
        <div>
          <span class="cashdesk-movement-type">${isOut ? 'Retiro' : 'Entrada'}</span>
          <strong>${escapeHtml(movement.reason || (isOut ? 'Retiro de efectivo' : 'Entrada de efectivo'))}</strong>
          <span>${new Date(movement.createdAt).toLocaleString('es-MX')}${movement.createdBy?.name ? ` · ${escapeHtml(movement.createdBy.name)}` : ''}</span>
        </div>
        <b>${isOut ? '-' : '+'}${money(movement.amount)}</b>
      </article>
    `;
  }).join('');
}

function renderCashActivity() {
  const list = $('cashActivityList');
  if (!list) return;
  const session = getSalesCashShift();
  if (!session) {
    list.innerHTML = '<p class="empty-state">Abre una caja para consultar su actividad.</p>';
    return;
  }

  // Present only records explicitly associated with this cash session.
  const rows = [
    { folio: session.id, reference: null, kind: 'opening', type: 'Apertura', date: session.openedAt, concept: session.openingNote || 'Fondo inicial', amount: session.openingAmount, user: session.openedBy?.name },
    ...(isAdminUser() ? session.movements || [] : []).map((movement) => ({
      folio: movement.id, reference: movement.reference, kind: movement.type === 'out' ? 'out' : 'in', type: movement.type === 'out' ? 'Retiro' : 'Entrada',
      date: movement.createdAt, concept: movement.reason || '—', amount: movement.amount, user: movement.createdBy?.name
    })),
    ...state.sales.filter((sale) => sale.cashSessionId === session.id || sale.cashShiftId === session.id).map((sale) => ({
      folio: sale.id, reference: sale.cashSessionId || sale.cashShiftId, kind: getSaleStatus(sale) === 'cancelada' ? 'canceled' : 'sale',
      type: getSaleStatus(sale) === 'cancelada' ? 'Venta cancelada' : 'Venta',
      date: sale.createdAt, concept: sale.id ? `Venta ${sale.id}` : '—', amount: sale.total, user: sale.operator?.name || sale.userName
    }))
  ].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const typeIcons = {
    opening: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    in: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
    out: '<circle cx="12" cy="12" r="9"/><path d="M7 12h10"/>',
    sale: '<path d="m3 12 4-6h10l4 6-4 6H7zM3 12h18"/>',
    canceled: '<circle cx="12" cy="12" r="9"/><path d="m8 8 8 8M8 16l8-8"/>'
  };

  list.innerHTML = `<table class="cashdesk-activity-table"><caption class="cashdesk-visually-hidden">Actividad registrada de ${escapeHtml(session.id)}</caption><thead><tr><th scope="col">Folio</th><th scope="col">Fecha y hora</th><th scope="col">Tipo</th><th scope="col">Descripción</th><th scope="col">Referencia</th><th scope="col">Usuario</th><th scope="col">Monto</th></tr></thead><tbody>${rows.map((row) => {
    const date = Number.isFinite(Date.parse(row.date)) ? new Date(row.date).toLocaleString('es-MX') : '—';
    const amount = row.amount !== null && row.amount !== undefined && Number.isFinite(Number(row.amount)) ? money(row.amount) : '—';
    return `<tr><td data-label="Folio"><strong>${escapeHtml(row.folio || "—")}</strong></td><td data-label="Fecha y hora">${escapeHtml(date)}</td><td data-label="Tipo"><span class="cashdesk-activity-type ${row.kind}"><svg class="cashdesk-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${typeIcons[row.kind]}</svg>${row.type}</span></td><td data-label="Descripción">${escapeHtml(row.concept)}</td><td data-label="Referencia">${escapeHtml(row.reference || "—")}</td><td data-label="Usuario">${escapeHtml(row.user || '—')}</td><td data-label="Monto"><strong>${amount}</strong></td></tr>`;
  }).join('')}</tbody></table>`;
}

function renderCashRegister() {
  const session = getSalesCashShift();
  const summary = getCurrentCashSummary();
  const isOpen = Boolean(session);
  const countedInput = $('countedCashInput');
  const sessionId = session?.id || '';
  if (countedInput && countedInput.dataset.cashSessionId !== sessionId) {
    countedInput.value = '';
    countedInput.dataset.cashSessionId = sessionId;
    clearCashCountTool();
    $('cashCountTool')?.classList.add('hidden');
    $('cashCountToggleBtn')?.classList.remove('active');
    $('cashCountToggleBtn')?.setAttribute('aria-expanded', 'false');
  }

  if ($('cashSessionStatusBadge')) {
    $('cashSessionStatusBadge').textContent = isOpen ? 'Abierta' : 'Cerrada';
    $('cashSessionStatusBadge').classList.toggle('open', isOpen);
    $('cashSessionStatusBadge').classList.toggle('closed', !isOpen);
  }

  if ($('cashShiftStatus')) {
    $('cashShiftStatus').textContent = isOpen
      ? `Caja ${session.id}`
      : 'Caja —';
  }

  $('cashCurrentOpenedAt').textContent = isOpen
    ? new Date(session.openedAt).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : '--:--';
  $('cashCurrentOpeningAmount').textContent = money(isOpen ? session.openingAmount : 0);
  $('cashCurrentExpected').textContent = money(isOpen ? summary.expectedCash : 0);
  if ($('cashCurrentOperator')) $('cashCurrentOperator').textContent = session?.openedBy?.name || '—';
  if ($('cashCloseExpected')) $('cashCloseExpected').textContent = money(isOpen ? summary.expectedCash : 0);

  $('cashOpenControls')?.classList.toggle('hidden', isOpen);
  $('cashLiveControls')?.classList.toggle('hidden', !isOpen);
  $('cashQuickActions')?.classList.toggle('hidden', !isOpen);
  if ($('cashCountNotice')) $('cashCountNotice').hidden = isOpen;
  if ($('cashHistoryNotice')) $('cashHistoryNotice').hidden = isAdminUser();

  const movementsSection = $('cashMovementsSection');
  const canManageMovements = isOpen && isAdminUser();
  if (movementsSection) movementsSection.classList.toggle('hidden', !canManageMovements);
  if ($('cashMovementsNotice')) {
    $('cashMovementsNotice').hidden = canManageMovements;
    $('cashMovementsNotice').textContent = isAdminUser()
      ? 'Abre una caja para registrar movimientos.'
      : 'Los movimientos de efectivo están disponibles para el administrador.';
  }

  $('sessionTotalSales').textContent = money(summary.totalSales);
  $('sessionCashIn').textContent = money(summary.cashIn);
  $('sessionCashOut').textContent = money(summary.cashOut);

  renderCashCountTool();
  renderCashMovements();
  renderCashActivity();
  renderCashRegisterSummary();
  updateCashGateUi();
}

function renderCashHistory() {
  const list = $('cashHistoryList');
  if (!list) return;

  const period = $('cutPeriodFilter')?.value || 'day';
  const dateString = $('cutDateInput')?.value || getLocalDateString();
  const sessions = state.cashSessions
    .filter((session) => shiftMatchesPeriod({ date: session.businessDate }, period, dateString))
    .sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));

  if (sessions.length === 0) {
    list.innerHTML = '<p class="empty-state">Sin cortes guardados en este periodo.</p>';
    return;
  }

  list.innerHTML = `<table class="cashdesk-history-table"><caption class="cashdesk-visually-hidden">Cortes del periodo seleccionado</caption><thead><tr><th scope="col">Folio / apertura</th><th scope="col">Estado / responsable</th><th scope="col">Ventas</th><th scope="col">Efectivo esperado</th><th scope="col">Contado</th><th scope="col">Diferencia</th><th scope="col">Comprobante</th></tr></thead><tbody>` + sessions.map((session) => {
    const isClosed = session.status === 'closed';
    const summary = session.summary || {};
    const difference = Number(session.difference || 0);

    return `
      <tr>
        <td data-label="Folio / apertura"><strong>${escapeHtml(session.id)}</strong><small>${new Date(session.openedAt).toLocaleString('es-MX')}</small>${session.closedAt ? `<small>Cierre: ${new Date(session.closedAt).toLocaleString('es-MX')}</small>` : ''}</td>
        <td data-label="Estado / responsable"><span class="cashdesk-history-status ${isClosed ? 'closed' : 'open'}">${isClosed ? 'Cerrada' : 'Abierta'}</span><small>${escapeHtml((isClosed ? session.closedBy?.name : session.openedBy?.name) || '—')}</small></td>
        <td data-label="Ventas">${money(summary.totalSales || 0)}</td>
        <td data-label="Efectivo esperado">${money(summary.expectedCash ?? session.expectedCash ?? 0)}</td>
        <td data-label="Contado">${isClosed ? money(session.countedCash) : '—'}</td>
        <td data-label="Diferencia"><strong class="${isClosed ? difference < 0 ? 'negative' : difference > 0 ? 'positive' : 'balanced' : ''}">${isClosed ? money(difference) : 'Pendiente'}</strong></td>
        <td data-label="Comprobante"><button class="quiet-btn" type="button" aria-label="Imprimir corte ${escapeHtml(session.id)}" data-print-cash-session="${escapeHtml(session.id)}">Imprimir</button></td>
      </tr>
    `;
  }).join('') + '</tbody></table>';

  $$('[data-print-cash-session]').forEach((button) => {
    button.addEventListener('click', () => printCashSession(button.dataset.printCashSession));
  });
}

async function openCashShift() {
  const amount = Number($('openingCashInput')?.value || 0);

  if (amount < 0 || !Number.isFinite(amount)) {
    showToast('Revisa el fondo inicial.');
    return;
  }

  const confirmed = await openProductConfirm({
    title: 'Abrir caja',
    message: 'Confirma el fondo con el que inicia la operación.',
    summary: `Fondo inicial: ${money(amount)}`,
    confirmLabel: 'Abrir caja'
  });
  if (!confirmed) return;

  const button = $('openCashShiftBtn');
  if (button) button.disabled = true;

  try {
    const session = await fetchJson('/api/cash-sessions/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openingAmount: amount,
        businessDate: getLocalDateString()
      })
    });

    state.cashSessions = [session, ...state.cashSessions.filter((item) => item.id !== session.id)];
    state.currentCashSession = session;
    $('openingCashInput').value = '';
    renderCashRegister();
    renderCashHistory();
    renderTicket();
    showToast(`Caja ${session.id} abierta.`);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo abrir la caja.');
  } finally {
    if (button) button.disabled = false;
  }
}

async function addCashMovement() {
  if (!isAdminUser()) {
    showToast('Solo el administrador puede registrar movimientos de efectivo.');
    return;
  }

  const session = getSalesCashShift();
  if (!session) {
    showToast('Primero abre la caja.');
    return;
  }

  const type = $('cashMovementType')?.value === 'in' ? 'in' : 'out';
  const amount = Number($('cashMovementAmount')?.value || 0);

  if (amount <= 0) {
    showToast('Captura un importe mayor a cero.');
    return;
  }

  const confirmed = await openProductConfirm({
    title: type === 'out' ? 'Registrar retiro' : 'Registrar entrada',
    message: 'Este movimiento afectará el efectivo esperado de la caja.',
    summary: `${type === 'out' ? 'Retiro' : 'Entrada'}: ${money(amount)}`,
    confirmLabel: 'Guardar movimiento'
  });
  if (!confirmed) return;

  try {
    const result = await fetchJson(`/api/cash-sessions/${session.id}/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount })
    });

    state.currentCashSession = result.session;
    state.cashSessions = state.cashSessions.map((item) => item.id === result.session.id ? result.session : item);
    $('cashMovementAmount').value = '';
    renderCashRegister();
    renderCashHistory();
    showToast('Movimiento guardado.');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo guardar el movimiento.');
  }
}

async function closeCashShift() {
  const session = getSalesCashShift();
  if (!session) {
    showToast('Primero abre la caja.');
    return;
  }

  const countedValue = $('countedCashInput')?.value;
  if (countedValue === undefined || countedValue.trim() === '') { showToast('Captura el efectivo contado antes de cerrar la caja.'); return; }
  const countedCash = Number(countedValue);

  if (!Number.isFinite(countedCash) || countedCash < 0) {
    showToast('Captura el efectivo contado correctamente.');
    return;
  }

  const summary = getCurrentCashSummary();
  const difference = countedCash - Number(summary.expectedCash || 0);
  const confirmed = await openProductConfirm({
    title: 'Cerrar caja',
    message: 'El corte quedará guardado y no podrá recibir más ventas.',
    summary: `Esperado ${money(summary.expectedCash)} · contado ${money(countedCash)} · diferencia ${money(difference)}`,
    confirmLabel: 'Cerrar caja'
  });
  if (!confirmed) return;

  const button = $('closeCashShiftBtn');
  if (button) button.disabled = true;

  try {
    const closedSession = await fetchJson(`/api/cash-sessions/${session.id}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countedCash })
    });

    state.cashSessions = state.cashSessions.map((item) => item.id === closedSession.id ? closedSession : item);
    state.currentCashSession = null;
    renderCashRegister();
    renderCashHistory();
    renderTicket();
    showToast(`Caja ${closedSession.id} cerrada.`);
    printCashSession(closedSession.id);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo cerrar la caja.');
  } finally {
    if (button) button.disabled = false;
  }
}

function printCashSession(sessionId) {
  const session = state.cashSessions.find((item) => item.id === sessionId);
  if (!session) {
    showToast('Corte no encontrado.');
    return;
  }

  const summary = session.summary || {};
  const movements = Array.isArray(session.movements) ? session.movements : [];
  const movementHtml = movements.length === 0
    ? '<p>Sin movimientos manuales</p>'
    : movements.map((movement) => `
        <div class="receipt-row">
          <span>${movement.type === 'out' ? 'Retiro' : 'Entrada'} · ${escapeHtml(movement.reason)}</span>
          <strong>${movement.type === 'out' ? '-' : '+'}${money(movement.amount)}</strong>
        </div>
      `).join('');

  $('printArea').innerHTML = `
    <div class="receipt">
      <h1>EL MUELLE</h1>
      <h2>Caja</h2>
      <p>${escapeHtml(session.id)} · ${escapeHtml(session.businessDate)}</p>
      <p>Apertura: ${new Date(session.openedAt).toLocaleString('es-MX')}</p>
      ${session.closedAt ? `<p>Cierre: ${new Date(session.closedAt).toLocaleString('es-MX')}</p>` : ''}
      <div class="line"></div>
      <div class="receipt-row"><span>Fondo inicial</span><strong>${money(session.openingAmount)}</strong></div>
      <div class="receipt-row"><span>Ventas efectivo</span><strong>${money(summary.cashSales || 0)}</strong></div>
      <div class="receipt-row"><span>Tarjeta</span><strong>${money(summary.cardSales || 0)}</strong></div>
      <div class="receipt-row"><span>Transferencia</span><strong>${money(summary.transferSales || 0)}</strong></div>
      <div class="receipt-row"><span>Total vendido</span><strong>${money(summary.totalSales || 0)}</strong></div>
      <div class="receipt-row"><span>Ventas</span><strong>${summary.salesCount || 0}</strong></div>
      <div class="receipt-row"><span>Canceladas</span><strong>${summary.canceledCount || 0}</strong></div>
      <div class="line"></div>
      ${movementHtml}
      <div class="line"></div>
      <div class="receipt-row"><span>Efectivo esperado</span><strong>${money(summary.expectedCash || session.expectedCash || 0)}</strong></div>
      <div class="receipt-row"><span>Efectivo contado</span><strong>${session.status === 'closed' ? money(session.countedCash) : '-'}</strong></div>
      <div class="receipt-row"><span>Diferencia</span><strong>${session.status === 'closed' ? money(session.difference) : '-'}</strong></div>
    </div>
  `;

  window.print();
}

function printCashCut() {
  const dateString = $('cutDateInput').value || getLocalDateString();

  $('printArea').innerHTML = `
    <div class="receipt">
      <h1>EL MUELLE</h1>
      <h2>Resumen de Caja</h2>
      <p>${escapeHtml(dateString)}</p>
      <div class="line"></div>
      <div class="receipt-row"><span>Total</span><strong>${$('cutTotalSales').textContent}</strong></div>
      <div class="receipt-row"><span>Ganancia</span><strong>${$('cutGrossProfit').textContent}</strong></div>
      <div class="receipt-row"><span>Margen</span><strong>${$('cutMargin').textContent}</strong></div>
      <div class="receipt-row"><span>Ventas</span><strong>${$('cutSalesCount').textContent}</strong></div>
      <div class="line"></div>
      <div class="receipt-row"><span>Efectivo</span><strong>${$('cutCash').textContent}</strong></div>
      <div class="receipt-row"><span>Tarjeta</span><strong>${$('cutCard').textContent}</strong></div>
      <div class="receipt-row"><span>Transferencia</span><strong>${$('cutTransfer').textContent}</strong></div>
      <div class="receipt-row"><span>Canceladas</span><strong>${$('cutCanceled').textContent}</strong></div>
    </div>
  `;

  window.print();
}

const reportUi = { loading: false, error: "" };

function syncReportUi() {
  const panel = document.querySelector(".report-generator-panel");
  panel?.setAttribute("aria-busy", String(reportUi.loading));
  if ($("generateReportBtn")) $("generateReportBtn").disabled = reportUi.loading;
  for (const id of ["exportReportBtn", "printReportBtn"]) {
    if ($(id)) $(id).disabled = reportUi.loading || Boolean(reportUi.error) || !state.generatedReport;
  }
  const status = $("reportStatus");
  if (status) {
    status.hidden = !reportUi.loading && !reportUi.error;
    status.classList.toggle("is-error", Boolean(reportUi.error));
    status.textContent = reportUi.loading ? "Actualizando el reporte…" : reportUi.error;
  }
}

function getReportFilter() {
  const periodInput = $("reportPeriodFilter");
  const dateInput = $("reportDateInput");
  const endDateInput = $("reportEndDateInput");
  const period = periodInput?.value || "day";
  const isRange = period === "range";
  const isAll = period === "all";

  $("reportEndDateField")?.classList.toggle("hidden", !isRange);
  if ($("reportDateLabel")) $("reportDateLabel").textContent = isRange ? "Desde" : "Fecha";

  if (dateInput && !dateInput.value) dateInput.value = getLocalDateString();
  if (endDateInput && !endDateInput.value) endDateInput.value = dateInput?.value || getLocalDateString();
  if (dateInput) dateInput.disabled = isAll;
  if (endDateInput) {
    endDateInput.classList.toggle("hidden", !isRange);
    endDateInput.disabled = !isRange;
    if (isRange && endDateInput.value < dateInput.value) endDateInput.value = dateInput.value;
  }

  return {
    period,
    dateString: dateInput?.value || getLocalDateString(),
    endDateString: endDateInput?.value || dateInput?.value || getLocalDateString()
  };
}

function getReportPeriodCaption(period, dateString, endDateString) {
  if (period === "all") return "Histórico completo";
  if (period === "range") return `${dateString} al ${endDateString}`;
  const labels = { day: "Día", week: "Semana", month: "Mes", year: "Año" };
  return `${labels[period] || "Periodo"} de ${dateString}`;
}

function getGeneratedReport() {
  const type = $("reportTypeFilter")?.value || "sales";
  const { period, dateString, endDateString } = getReportFilter();
  const sales = getCompletedSalesForPeriod(period, dateString, endDateString);
  const totals = getSalesTotals(sales);
  const margin = totals.total > 0 ? (totals.profit / totals.total) * 100 : 0;
  const base = {
    type,
    period,
    dateString,
    endDateString,
    caption: getReportPeriodCaption(period, dateString, endDateString),
    totals,
    headers: [],
    rows: [],
    kpis: []
  };

  if (type === "products") {
    const products = [...getProductSalesFromSales(sales).values()]
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return {
      ...base,
      eyebrow: "Reporte de productos",
      title: "Productos vendidos",
      headers: ["Producto", "Unidad", "Cantidad", "Ingreso"],
      rows: products.map((item) => [
        item.name,
        getUnitLabel(item.unit),
        quantityText(item.quantity, item.unit),
        money(item.total)
      ]),
      kpis: [
        ["Ingreso acumulado", money(totals.total)],
        ["Productos con venta", String(products.length)],
        ["Ventas", String(totals.count)],
        ["Margen", `${margin.toFixed(2)}%`]
      ]
    };
  }

  if (type === "inventory") {
    const activeProducts = state.products.filter((product) => product.active !== false);
    const inventoryValue = activeProducts.reduce(
      (sum, product) => sum + Math.max(0, Number(product.stockQuantity || 0)) * Number(product.costPrice || 0),
      0
    );
    const projectedValue = activeProducts.reduce(
      (sum, product) => sum + Math.max(0, Number(product.stockQuantity || 0)) * Number(product.price || 0),
      0
    );
    const lowStock = activeProducts.filter((product) => {
      return typeof product.stockQuantity==='number' && product.stockQuantity <= Number(product.minStock || 0);
    });
    return {
      ...base,
      eyebrow: "Reporte de inventario",
      title: "Existencias actuales",
      headers: ["Producto", "Categoría", "Existencia", "Mínimo", "Estado", "Valor"],
      rows: activeProducts
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((product) => {
          const [statusLabel] = getStockStatus(product);
          const stock = Number(product.stockQuantity || 0);
          return [
            product.name,
            product.category,
            quantityText(stock, product.unit),
            quantityText(Number(product.minStock || 0), product.unit),
            statusLabel,
            money(stock * Number(product.costPrice || 0))
          ];
        }),
      kpis: [
        ["Valor invertido", money(inventoryValue)],
        ["Productos activos", String(activeProducts.length)],
        ["Inventario bajo", String(lowStock.length)],
        ["Venta proyectada", money(projectedValue)]
      ]
    };
  }

  return {
    ...base,
    eyebrow: "Reporte de ventas",
    title: "Ventas registradas",
    headers: ["Folio", "Fecha", "Atendió", "Pago", "Total"],
    rows: sales
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((sale) => [
        sale.id || sale.folio || "—",
        new Date(sale.createdAt).toLocaleString("es-MX", typeof preferenceDateOptions === "function" ? preferenceDateOptions() : { dateStyle: "short", timeStyle: "short" }),
        sale.operator?.name || sale.userName || "—",
        String(sale.paymentMethod || "efectivo").replace(/^./, (letter) => letter.toUpperCase()),
        money(sale.total)
      ]),
    kpis: [
      ["Total vendido", money(totals.total)],
      ["Ventas", String(totals.count)],
      ["Ticket promedio", money(totals.count > 0 ? totals.total / totals.count : 0)],
      ["Margen", `${margin.toFixed(2)}%`]
    ]
  };
}

// Report-only presentation. The report generator, exports and business totals stay unchanged.
function getReportChartSeries(sales, grouping) {
  const buckets = new Map();
  for (const sale of sales) {
    const date = new Date(sale.createdAt);
    if (!Number.isFinite(date.getTime()) || !Number.isFinite(Number(sale.total))) return null;
    date.setHours(12, 0, 0, 0);
    if (grouping === "week") date.setDate(date.getDate() - (date.getDay() + 6) % 7);
    if (grouping === "month") date.setDate(1);
    const key = getGlassCalendarDateKey(date);
    const bucket = buckets.get(key) || { key, total: 0, count: 0 };
    bucket.total += Number(sale.total);
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function getReportPaymentSeries(sales) {
  const methods = new Map();
  for (const sale of sales) {
    const amount = Number(sale.total);
    if (!Number.isFinite(amount)) return null;
    const key = String(sale.paymentMethod || "efectivo");
    methods.set(key, (methods.get(key) || 0) + amount);
  }
  const labels = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" };
  const colors = { efectivo: "#28b985", tarjeta: "#2d8dff", transferencia: "#9470de" };
  const otherColors = ["#e9a52d", "#168eaa", "#dc678e", "#687d9e"];
  let other = 0;
  return [...methods].sort(([a], [b]) => a.localeCompare(b)).map(([key, amount]) => ({
    label: labels[key] || key.replace(/^./, letter => letter.toUpperCase()), amount, color: colors[key] || otherColors[other++ % otherColors.length]
  }));
}

function renderReportCharts(report) {
  const chart = $("reportSalesChart"), payments = $("reportPaymentsChart");
  if (!chart || !payments) return;
  const inventory = report.type === "inventory";
  chart.closest(".report-charts").hidden = inventory;
  if (inventory) {
    chart.replaceChildren(); payments.replaceChildren();
    $("reportChartScope").textContent = "";
    return;
  }
  const grouping = $("reportChartGrouping").value;
  const type = $("reportChartType").value;
  const sales = getCompletedSalesForPeriod(report.period, report.dateString, report.endDateString);
  $("reportSalesChartTitle").textContent = "Ventas por " + ({ day: "día", week: "semana", month: "mes" }[grouping]);
  ["reportChartGrouping", "reportChartType"].forEach(id => { $(id).disabled = !sales.length; });
  const empty = "Sin ventas completadas en el periodo seleccionado.";
  $("reportChartScope").textContent = (report.type === "products" ? "Ventas completas que originan los productos vendidos. " : "") +
    sales.length + " ventas del periodo disponibles para tu usuario. Intervalos con registros; semanas desde el lunes.";
  if (!sales.length) {
    chart.innerHTML = payments.innerHTML = '<p class="report-chart-empty">' + empty + '</p>';
    return;
  }
  const series = getReportChartSeries(sales, grouping);
  const methods = getReportPaymentSeries(sales);
  if (!series || !methods) {
    chart.innerHTML = payments.innerHTML = '<p class="report-chart-empty">Hay registros con fecha o importe no válido. Consulta la tabla; no se representa una muestra parcial.</p>';
    return;
  }
  // All observed intervals are retained. Wide series scroll locally, never truncate the period.
  const width = Math.max(600, series.length * 56 + 90), height = 240;
  const left = 76, top = 25, plotWidth = width - left - 20, plotHeight = 165;
  const min = Math.min(0, ...series.map(item => item.total));
  const max = Math.max(1, ...series.map(item => item.total));
  const y = value => top + (max - value) / (max - min) * plotHeight;
  const step = plotWidth / series.length;
  const x = index => left + step * (index + .5);
  const label = item => {
    const date = parseGlassCalendarDate(item.key);
    return date.toLocaleDateString("es-MX", grouping === "month" ? { month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "2-digit" });
  };
  let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml($("reportSalesChartTitle").textContent + ". " + money(report.totals.total) + ". Datos disponibles en la tabla inferior.") + '">';
  svg += '<defs><linearGradient id="reportBarFill" x2="0" y2="1"><stop stop-color="#4ab7ee"/><stop offset="1" stop-color="#2386cf"/></linearGradient></defs>';
  for (let i = 0; i <= 4; i++) {
    const value = min + (max - min) * i / 4, at = y(value);
    svg += '<path class="report-chart-grid" d="M' + left + ' ' + at + 'H' + (width - 20) + '"/><text x="' + (left - 10) + '" y="' + (at + 4) + '" text-anchor="end">' + escapeHtml(new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1 }).format(value)) + '</text>';
  }
  if (type === "line") svg += '<polyline class="report-chart-line" points="' + series.map((item, index) => x(index) + ',' + y(item.total)).join(' ') + '"/>';
  series.forEach((item, index) => {
    const at = x(index), valueY = y(item.total), title = escapeHtml(label(item) + ": " + money(item.total) + ", " + item.count + " ventas");
    svg += type === "line"
      ? '<circle cx="' + at + '" cy="' + valueY + '" r="4" fill="#2d8dff"><title>' + title + '</title></circle>'
      : '<rect x="' + (at - Math.min(40, step * .64) / 2) + '" y="' + Math.min(valueY, y(0)) + '" width="' + Math.min(40, step * .64) + '" height="' + Math.abs(y(0) - valueY) + '" rx="4" fill="url(#reportBarFill)"><title>' + title + '</title></rect>';
    if (series.length <= 10) svg += '<text class="report-chart-value" x="' + at + '" y="' + (valueY - 9) + '" text-anchor="middle">' + escapeHtml(money(item.total)) + '</text>';
    svg += '<text x="' + at + '" y="218" text-anchor="middle">' + escapeHtml(label(item)) + '</text>';
  });
  svg += '</svg>';
  chart.innerHTML = '<div class="table-scroll report-chart-scroll" tabindex="0" role="region" aria-label="Gráfica de ventas, desplazamiento horizontal"><div style="min-width:' + width + 'px">' + svg + '</div></div>' +
    '<details class="report-chart-data"><summary>Ver datos de la gráfica</summary><div class="table-scroll report-chart-scroll" tabindex="0"><table><caption class="sr-only">Importes agrupados; inicio de cada intervalo</caption><thead><tr><th scope="col">Inicio</th><th scope="col">Ventas</th><th scope="col">Total</th></tr></thead><tbody>' +
    series.map(item => '<tr><th scope="row">' + item.key + '</th><td>' + item.count + '</td><td>' + escapeHtml(money(item.total)) + '</td></tr>').join('') + '</tbody></table></div></details>';
  const total = methods.reduce((sum, item) => sum + item.amount, 0);
  let end = 0;
  const stops = methods.filter(item => item.amount > 0).map(item => {
    const start = end; end += item.amount / total * 100;
    return item.color + ' ' + start + '% ' + end + '%';
  });
  const canDraw = total > 0 && methods.every(item => item.amount >= 0);
  const donut = canDraw ? '<div class="report-donut" role="img" aria-label="' + escapeHtml('Pagos del periodo. Total ' + money(total)) + '" style="background:conic-gradient(' + stops.join(',') + ')"><div><strong>' + escapeHtml(money(total)) + '</strong><small>Total del periodo</small></div></div>'
    : '<p class="report-chart-empty">La distribución contiene importes no positivos; consulta los valores de la leyenda.</p>';
  payments.innerHTML = donut + '<ul class="report-payment-legend">' + methods.map(item => '<li style="--payment-color:' + item.color + '"><span>' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(money(item.amount)) + '</strong><small>' + (total !== 0 ? (item.amount / total * 100).toFixed(1) + '%' : 'Sin porcentaje') + '</small></li>').join('') + '</ul>';
}

function syncReportPresentation(report) {
  $$("[data-report-type]").forEach(tab => {
    const selected = tab.dataset.reportType === report.type;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  $("reportContent").setAttribute("aria-labelledby", "reportTab-" + report.type);
  const paths = {
    money: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v5c0 4 16 4 16 0V5M4 10v5c0 4 16 4 16 0v-5M4 15v4c0 4 16 4 16 0v-4"/>',
    receipt: '<path d="M5 3h14v19l-3-2-4 2-4-2-3 2V3ZM8 7h8M8 11h8M8 15h5"/>',
    average: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 14h4M15 14h2"/>',
    percent: '<circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="M4 20 20 4"/>',
    box: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5ZM3 7l9 5 9-5M12 12v10"/>',
    alert: '<path d="m12 3 10 18H2L12 3ZM12 9v5M12 17v1"/>'
  };
  const icons = report.type === "inventory" ? ["money", "box", "alert", "average"] : report.type === "products" ? ["money", "box", "receipt", "percent"] : ["money", "receipt", "average", "percent"];
  const notes = report.type === "inventory" ? ["Costo total actual", "Existencias actuales", "En el mínimo o por debajo", "Valor a precio de venta"] : report.type === "products" ? ["Ventas del periodo", "Productos distintos vendidos", "Operaciones completadas", "Utilidad bruta / ventas"] : ["Ventas del periodo", "Operaciones completadas", "Por venta completada", "Utilidad bruta / ventas"];
  ["Primary", "Secondary", "Third", "Fourth"].forEach((id, index) => {
    $("reportKpi" + id + "Icon").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths[icons[index]] + '</svg>';
    $("reportKpi" + id + "Note").textContent = notes[index];
  });
}

function initReportPresentation() {
  const tabs = $$("[data-report-type]");
  const select = tab => {
    const changed = $("reportTypeFilter").value !== tab.dataset.reportType;
    $("reportTypeFilter").value = tab.dataset.reportType;
    renderReports();
    if (changed) animatePosFeedback($("reportTableBody")?.closest(".report-preview-panel"), "navigation");
  };
  tabs.forEach((tab, index) => {
    on(tab, "click", () => select(tab));
    on(tab, "keydown", event => {
      const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault(); select(tabs[next]); tabs[next].focus();
    });
  });
  ["reportChartGrouping", "reportChartType"].forEach(id => on($(id), "change", () => {
    if (state.generatedReport) renderReportCharts(state.generatedReport);
  }));
}

function renderReports() {
  if (!$("reportTableBody")) return;
  const report = getGeneratedReport();
  state.generatedReport = report;

  $("reportPreviewEyebrow").textContent = report.eyebrow;
  $("reportPreviewTitle").textContent = report.title;
  $("reportPeriodCaption").textContent = report.rows.length + " registros · " + report.caption;
  const note = $("reportDataNote");
  if (note) {
    note.hidden = report.type !== "inventory";
    note.textContent = "Existencias actuales. Los filtros de fecha no representan inventario histórico.";
  }
  const kpiIds = ["Primary", "Secondary", "Third", "Fourth"];
  report.kpis.forEach(([label, value], index) => {
    const id = kpiIds[index];
    $("reportKpi" + id + "Label").textContent = label;
    $("reportKpi" + id).textContent = value;
  });

  const numericColumns = report.type === "inventory" ? [2, 3, 5] : report.type === "products" ? [2, 3] : [4];
  const cellClass = (index) => numericColumns.includes(index) ? ' class="report-number"' : "";
  const hasCompletedSales = state.sales.some((sale) => getSaleStatus(sale) !== "cancelada");
  const emptyMessage = report.type === "inventory"
    ? "No hay productos activos para mostrar sus existencias."
    : !hasCompletedSales
      ? `Aún no hay ventas completadas para generar el reporte de ${report.type === "products" ? "productos vendidos" : "ventas"}.`
      : report.type === "products"
        ? "No hay productos vendidos en el periodo seleccionado. Prueba con otro periodo."
        : "No hay ventas completadas en el periodo seleccionado. Prueba con otro periodo.";
  $("reportTableHead").innerHTML = `<tr>${report.headers.map((header, index) => `<th scope="col"${cellClass(index)}>${escapeHtml(header)}</th>`).join("")}</tr>`;
  $("reportTableBody").innerHTML = report.rows.length
    ? report.rows.map((row) => `<tr>${row.map((cell, index) => {
      const payment = report.type === "sales" && index === 3;
      const content = payment ? '<span class="report-payment-badge" data-method="' + escapeHtml(String(cell).toLowerCase()) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 14h4"/></svg>' + escapeHtml(cell) + '</span>' : escapeHtml(cell);
      return `<td${cellClass(index)}>${content}</td>`;
    }).join("")}</tr>`).join("")
    : `<tr><td class="report-empty" colspan="${report.headers.length}">${emptyMessage}</td></tr>`;
  syncReportPresentation(report);
  renderReportCharts(report);
  syncReportUi();
}

async function loadReports() {
  if (!$("reportTableBody")) return;
  reportUi.loading = true;
  reportUi.error = "";
  syncReportUi();
  try {
    if (state.products.length === 0) state.products = await fetchJson("/api/products");
    state.sales = await fetchJson("/api/sales");
    renderReports();
  } catch (error) {
    reportUi.error = state.generatedReport
      ? "No se pudo actualizar el reporte. Se conservan los resultados anteriores; vuelve a intentarlo."
      : "No se pudo cargar el reporte. Vuelve a intentarlo con Actualizar.";
    console.error(error);
    showToast(error.message || "No se pudo generar el reporte.");
  } finally {
    reportUi.loading = false;
    syncReportUi();
  }
}

function exportGeneratedReport() {
  const report = state.generatedReport || getGeneratedReport();
  const quote = (value) => `"${safeCsvCell(value).replace(/"/g, '""')}"`;
  const csv = [report.headers, ...report.rows].map((row) => row.map(quote).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `el-muelle-${report.type}-${report.dateString}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showToast("Reporte exportado en CSV.");
}

function safeCsvCell(value) {
  const text = String(value ?? '');
  const numeric = typeof value === 'number' || (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim()) && Number.isFinite(Number(text)));
  return !numeric && /^[\s\u0000-\u001f\u200b\ufeff]*[=+@-]/.test(text) ? "'" + text : text;
}

function printGeneratedReport() {
  const report = state.generatedReport || getGeneratedReport();
  const rows = report.rows.map((row) => {
    return `<div class="receipt-row"><span>${escapeHtml(row.slice(0, -1).join(" · "))}</span><strong>${escapeHtml(row.at(-1) || "")}</strong></div>`;
  }).join("");
  $("printArea").innerHTML = `
    <div class="receipt report-printout">
      <h1>EL MUELLE</h1>
      <h2>${escapeHtml(report.title)}</h2>
      <p>${escapeHtml(report.caption)}</p>
      <p>Registros: ${report.rows.length} de ${report.rows.length} · reporte completo</p>
      <div class="line"></div>
      ${report.kpis.map(([label, value]) => `<div class="receipt-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
      <div class="line"></div>
      ${rows || '<p>Sin información para este periodo.</p>'}
    </div>
  `;
  window.print();
}


function applyScaleSettings() {
  scaleState.baudRate = Number($("scaleBaudRateInput").value || 9600);
  scaleState.unit = $("scaleUnitInput").value || "kg";
  scaleState.command = ($("scaleCommandInput").value || "P").trim() || "P";
  scaleState.pollMs = Number($("scalePollMsInput").value || 800);
  saveLocalPreference("scaleBaudRate", String(scaleState.baudRate));
  saveLocalPreference("scaleUnit", scaleState.unit);
  saveLocalPreference("scaleCommand", scaleState.command);
  saveLocalPreference("scalePollMs", String(scaleState.pollMs));

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
    scaleState.error = false;
    scaleState.weightKg = parsed;

    if (state.selectedProduct && state.selectedProduct.unit === "kg") {
      state.detectedQuantity = parsed;
      state.quantitySource = "scale";
      state.manualAuthorization = null;
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
        scaleState.error = true;
        updateScaleUi();
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
    scaleState.error = true;
    updateScaleUi();
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
    scaleState.error = false;
    scaleState.raw = "";
    scaleState.buffer = "";
    updateScaleUi();
    showToast("Báscula RHINO BAR-9 conectada.");
    readScaleLoop();
    startScalePolling();
  } catch (error) {
    console.error(error);
    showToast("No se pudo conectar la báscula.");
    scaleState.error = error.name !== "NotFoundError";
    updateScaleUi();
  }
}

async function disconnectScale() {
  scaleState.error = false;
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
    scaleState.error = true;
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
  const statusText = scaleState.error
    ? "Error de báscula. Revisa la conexión."
    : !scaleState.supported
    ? "Navegador sin Web Serial."
    : scaleState.connected
      ? scaleState.stable
        ? "RHINO BAR-9 conectada · peso estable"
        : `RHINO BAR-9 conectada · solicitando con ${scaleState.command}`
      : "RHINO BAR-9 · 9600 8N1 · comando P.";

  $("scaleStatusPill").textContent = scaleState.error
    ? "Error de báscula"
    : scaleState.connected
    ? "Conectada"
    : scaleState.supported
      ? "Sin conexión"
      : "No compatible";
  $("scaleWeightText").textContent = weightText;
  $("scaleStatusText").textContent = statusText;
  $("scaleRawText").textContent = scaleState.raw.trim() || "Sin lectura";
  $("settingsScaleWeight").textContent = weightText;
  const readableStatus = scaleState.error ? "Error de conexión" : !scaleState.supported ? "Navegador no compatible" : !scaleState.connected ? "Sin conexión" : scaleState.stable ? "Conectada · peso estable" : "Conectada · leyendo peso";
  $("settingsScaleStatus").textContent = readableStatus;
  ["settingsScaleConnectionBadge", "personalScaleStatus"].forEach(id => {
    const element = $(id);
    if (element) {
      element.textContent = readableStatus;
      element.dataset.connection = scaleState.error ? "error" : scaleState.connected ? "connected" : "disconnected";
    }
  });
  if ($("personalScaleWeight")) $("personalScaleWeight").textContent = weightText;
  $("settingsScaleRaw").textContent = scaleState.raw.trim() || "Sin datos";

  [$("disconnectScaleBtn"), $("disconnectScaleBtnSettings"), $("requestScaleBtn"), $("requestScaleBtnSettings")].forEach((button) => {
    if (button) button.disabled = !scaleState.connected;
  });

  [$("connectScaleBtn"), $("connectScaleBtnSettings")].forEach((button) => {
    if (button) button.disabled = scaleState.connected || !scaleState.supported;
  });

  document.body.classList.toggle("scale-connected", scaleState.connected);
  document.body.classList.toggle("scale-error", scaleState.error);
  document.body.classList.toggle("scale-unsupported", !scaleState.supported);

  const sidebarScaleCard = document.querySelector(".scale-card");
  if (sidebarScaleCard) {
    const compactScaleStatus = scaleState.error
      ? "Error de báscula"
      : !scaleState.supported
      ? "Báscula no compatible"
      : scaleState.connected
        ? "Báscula conectada"
        : "Báscula desconectada";

    sidebarScaleCard.setAttribute("title", compactScaleStatus);
    sidebarScaleCard.setAttribute("aria-label", compactScaleStatus);
  }

  updateAccessStatus();
}

function bindEvents() {
  bindModalAccessibility();
  on($("productGrid"), "click", handleCatalogClick);
  $("productGrid")?.addEventListener("error", handlePosImageError, true);
  on($("weighProductPhoto"), "error", handlePosImageError);
  on($("ticketItems"), "click", (event) => {
    if (state.checkoutPending || state.checkoutProcessing) return;
    const button = event.target.closest("[data-remove-item]");
    if (!button || !$("ticketItems").contains(button)) return;
    const index = Number(button.dataset.removeItem);
    state.ticket.splice(index, 1);
    renderTicket();
    const buttons = [...$("ticketItems").querySelectorAll("[data-remove-item]")];
    (buttons[index] || buttons[index - 1] || $("ticketToggleBtn"))?.focus({ preventScroll: true });
  });
  on($("posMotionToggle"), "click", cancelPosFeedback);
  posMicroMotion.addEventListener("change", cancelPosFeedback);
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelPosFeedback(); });
  on(document.querySelector(".weigh-panel"), "keydown", (event) => {
    if (event.key === "Escape" && $("manualModal").classList.contains("hidden")) clearSelectedProduct({ restoreFocus: true });
  });
  on($("sidebarToggleBtn"), "click", toggleSidebar);
  on($("mobileSidebarToggleBtn"), "click", toggleSidebar);
  on($("ticketToggleBtn"), "click", () => toggleTicketPanel());
  on($("cashStatusBtn"), "click", goToCashRegister);
  on($("openCashFromSaleBtn"), "click", goToCashRegister);
  on($("ticketSideToggleBtn"), "click", () => toggleTicketPanel());
  on($("closeTicketPanelBtn"), "click", closeTicketDrawer);
  document.addEventListener("pointerdown", handleTicketOutsideClick);
  document.addEventListener("click", handleWeighOutsideClick, true);
  const closeAccountMenu = () => { $("accountMenu").classList.add("hidden"); $("sessionSwitchBtn").setAttribute("aria-expanded", "false"); };
  on($("accountDevicePreferencesBtn"), "click", openDevicePreferences);
  on($("devicePreferencesCloseBtn"), "click", () => closeDevicePreferences());
  on($("devicePreferencesModal"), "click", event => { if (event.target === $("devicePreferencesModal")) closeDevicePreferences(); });
  on($("sessionSwitchBtn"), "click", () => {
    const open = $("accountMenu").classList.contains("hidden");
    $("accountMenu").classList.toggle("hidden", !open);
    $("sessionSwitchBtn").setAttribute("aria-expanded", String(open));
    if (open) ($("accountDevicePreferencesBtn").hidden ? $("accountSwitchBtn") : $("accountDevicePreferencesBtn")).focus();
  });
  ["accountSwitchBtn", "accountLogoutBtn"].forEach(id => on($(id), "click", () => { closeAccountMenu(); logoutToAccess(); }));
  document.addEventListener("click", event => { if (!event.target.closest(".session-box")) closeAccountMenu(); });
  on($("accountMenu"), "keydown", event => { if (event.key === "Escape") { closeAccountMenu(); $("sessionSwitchBtn").focus(); } });
  on($("accessLoginBtn"), "click", confirmAccessLogin);
  on($("accessPinInput"), "keydown", (event) => {
    if (event.key === "Enter") confirmAccessLogin();
  });
  on($("setupOwnerSubmitBtn"), "click", completeInitialOwnerSetup);
  ["setupOwnerNameInput", "setupOwnerPinInput", "setupOwnerPinConfirmInput"].forEach((id) => {
    on($(id), "keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        completeInitialOwnerSetup();
      }
    });
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
    button.addEventListener("click", () => {
      if (!canAccessView(button.dataset.view,button.dataset.reportsTarget || 'reports')) {showToast('No tienes autorización para esa pantalla.');return;}
      if (button.dataset.view === "reports") setReportsMode(button.dataset.reportsTarget || "reports");
      setView(button.dataset.view);
    });
  });

  on($("searchInput"), "input", () => {
    renderProducts();
  });
  on($("searchInput"), "keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing || event.repeat) return;
    event.preventDefault();
    const products = getFilteredProducts();
    if (products.length === 1) selectProduct(products[0]);
  });
  on($("scanProductBtn"), "click", () => {
    $("searchInput").focus();
    $("searchInput").select();
  });
  on($("catalogFavoritesBtn"), "click", () => {
    state.activeCategory = state.activeCategory === "favorites" ? "all" : "favorites";
    renderCategories();
    renderProducts();
  });
  for (const [id, view] of [["catalogImagesBtn", "images"], ["catalogListBtn", "list"]]) {
    on($(id), "click", () => {
      state.catalogView = view;
      renderProducts();
    });
  }
  $("categoryGrid")?.addEventListener("wheel", (event) => {
    const grid = $("categoryGrid");
    if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const next = Math.max(0, Math.min(grid.scrollWidth - grid.clientWidth, grid.scrollLeft + event.deltaY));
    if (next === grid.scrollLeft) return;
    event.preventDefault();
    grid.scrollLeft = next;
  }, { passive: false });
  on($("filterAll"), "click", () => setFilter("all"));
  on($("filterKg"), "click", () => setFilter("kg"));
  on($("filterPiece"), "click", () => setFilter("pieza"));

  on($("confirmWeightBtn"), "click", addCurrentProductToTicket);
  on($("pieceQuantityForm"), "submit", (event) => { event.preventDefault(); confirmPieceQuantity(); });
  on($("pieceQuantityInput"), "input", updatePieceQuantityModal);
  on($("decreasePieceQuantityBtn"), "click", () => stepPieceQuantity(-1));
  on($("increasePieceQuantityBtn"), "click", () => stepPieceQuantity(1));
  ["closePieceQuantityBtn", "cancelPieceQuantityBtn"].forEach((id) => on($(id), "click", () => closePieceQuantityModal()));
  on($("pieceQuantityModal"), "click", (event) => {
    if (event.target === $("pieceQuantityModal")) closePieceQuantityModal();
  });
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
  ["productPriceInput", "productCostInput", "productUnitInput"].forEach((id) => {
    on($(id), "input", updateProductProjection);
    on($(id), "change", updateProductProjection);
  });
  on($("productAdminSearch"), "input", renderAdminProducts);
  on($("productAdminCategoryFilter"), "change", renderAdminProducts);

  on($("inventoryEntryForm"), "submit", saveInventoryEntry);
  on($("resetInventoryEntryBtn"), "click", resetInventoryEntryForm);
  on($("inventoryEntryProductInput"), "change", populateInventoryEntryDefaults);
  $$(`[data-entry-product-mode]`).forEach((button) => {
    button.addEventListener("click", () => {
      setInventoryEntryMode(button.dataset.entryProductMode);
      if (button.dataset.entryProductMode === "new") {
        $("inventoryNewProductNameInput")?.focus();
      }
    });
  });
  ["inventoryNewProductNameInput", "inventoryNewProductCategoryInput", "inventoryNewProductUnitInput", "inventoryNewProductMinStockInput"].forEach((id) => {
    on($(id), "input", updateInventoryEntryProjection);
    on($(id), "change", updateInventoryEntryProjection);
  });
  ["inventoryEntryQuantityInput", "inventoryEntryUnitCostInput", "inventoryEntrySalePriceInput"].forEach((id) => {
    on($(id), "input", updateInventoryEntryProjection);
  });
  on($("inventoryEntrySearchInput"), "input", renderInventoryEntries);
  on($("inventorySearchInput"), "input", renderInventory);
  on($("inventoryCategoryFilter"), "change", renderInventory);
  on($("inventoryStatusFilter"), "change", renderInventory);
  on($("newAdminProductBtn"), "click", () => { resetProductForm(); setProductMode("form"); $("productNameInput")?.focus(); });
  on($("inventoryEntryShortcutBtn"), "click", () => setInventoryMode("entry"));
  on($("inventoryHistoryShortcutBtn"), "click", () => setInventoryMode("history"));
  $$(`[data-inventory-mode-btn]`).forEach((button) => {
    button.addEventListener("click", () => setInventoryMode(button.dataset.inventoryModeBtn));
  });
  $$(`[data-products-mode-btn]`).forEach((button) => {
    button.addEventListener("click", () => setProductMode(button.dataset.productsModeBtn));
  });
  initSettingsNavigation();
  $$(`[data-reports-mode-btn]`).forEach((button) => {
    button.addEventListener("click", () => setReportsMode(button.dataset.reportsModeBtn));
  });

  on($("salesFiltersForm"), "submit", (event) => { event.preventDefault(); renderSalesAdmin(); });
  on($("clearSalesFiltersBtn"), "click", () => {
    $("salesSearchInput").value = "";
    $("salesPeriodFilter").value = "day";
    $("salesDateInput").value = getLocalDateString();
    $("salesStatusFilter").value = "all";
    renderSalesAdmin();
  });
  on($("invoiceSaleId"), "input", renderInvoiceSelection);
  on($("invoiceForm"), "reset", () => renderInvoiceSelection({ reset: true }));
  on($("selectInvoiceSaleBtn"), "click", () => {
    renderInvoiceSelection();
    if (state.sales.some((sale) => sale.id === $("invoiceSaleId").value.trim())) $("invoiceRfc").focus();
    else showToast("Selecciona un folio existente de la lista.");
  });
  on($("salesSearchInput"), "input", renderSalesAdmin);
  on($("salesStatusFilter"), "change", renderSalesAdmin);
  on($("salesPeriodFilter"), "change", renderSalesAdmin);
  on($("salesDateInput"), "change", renderSalesAdmin);
  initDashboardUi();
  initGlassDatePickers();
  on($("recentSalesPeriodFilter"), "change", loadRecentSales);
  on($("recentSalesDateInput"), "change", loadRecentSales);
  on($("refreshSalesBtn"), "click", loadRecentSales);
  on($("invoiceForm"), "submit", saveInvoiceRequest);

  on($("cutPeriodFilter"), "change", renderCashCut);
  on($("cutDateInput"), "change", renderCashCut);
  on($("refreshCutBtn"), "click", loadCashCut);
  on($("printCutBtn"), "click", printCashCut);
  $$('[data-cash-tab]').forEach((tab) => {
    tab.addEventListener('click', () => setCashTab(tab.dataset.cashTab));
    tab.addEventListener('keydown', (event) => {
      const tabs = $$('[data-cash-tab]');
      const index = tabs.indexOf(tab);
      const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      setCashTab(tabs[next].dataset.cashTab, true);
    });
  });
  $$('[data-cash-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.cashAction;
    const movement = action === 'in' || action === 'out';
    setCashTab(movement ? 'movements' : 'count');
    if (movement) $('cashMovementType').value = action;
    (movement ? $('cashMovementAmount') : $('countedCashInput'))?.focus();
  }));
  on($("reportTypeFilter"), "change", renderReports);
  initReportPresentation();
  on($("reportPeriodFilter"), "change", renderReports);
  on($("reportDateInput"), "change", renderReports);
  on($("reportEndDateInput"), "change", renderReports);
  on($("generateReportBtn"), "click", loadReports);
  on($("exportReportBtn"), "click", exportGeneratedReport);
  on($("printReportBtn"), "click", printGeneratedReport);
  on($("openCashShiftBtn"), "click", openCashShift);
  on($("addCashMovementBtn"), "click", addCashMovement);
  on($("closeCashShiftBtn"), "click", closeCashShift);
  on($("countedCashInput"), "input", renderCashRegisterSummary);
  on($("cashCountToggleBtn"), "click", toggleCashCountTool);
  on($("cashCountClearBtn"), "click", clearCashCountTool);
  on($("cashCountUseBtn"), "click", useCashCountTotal);

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
  on($("refreshAuditBtn"), "click", loadAuditEvents);

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
  applyPosMotionPreference();
  document.addEventListener("visibilitychange", applyPosMotionPreference);
  $("posMotionToggle")?.addEventListener("click", () => {
    posReducedMotion = !posReducedMotion;
    saveLocalPreference(POS_MOTION_KEY, String(posReducedMotion));
    applyPosMotionPreference();
  });
  bindEvents();
  initSettings();
  await loadSettings();
  const sessionRestored = await restoreAuthSession();
  if (!sessionRestored) {
    logoutToAccess({preservePendingCheckout:true});
  }
  ["salesDateInput", "dashboardDateInput", "dashboardEndDateInput", "dashboardChartDateInput", "dashboardPaymentDateInput", "recentSalesDateInput", "cutDateInput", "reportDateInput", "reportEndDateInput", "inventoryEntryDateInput"].forEach((id) => {
    const input = $(id);
    if (input && !input.value) input.value = getLocalDateString();
  });
  updateClock();
  window.setInterval(updateClock, 30000);
  resetProductForm();
  resetInventoryEntryForm();
  if (state.sessionAuthenticated) {
    await Promise.all([loadCashSessions(), loadProducts(), loadSales()]);
  }
  renderTicket();
  setPaymentMethod(state.paymentMethod);
  setInventoryMode();
  setProductMode();
  setSettingsMode();
  setReportsMode();
  updateShellState();
  updateScaleUi();
  updateCashGateUi();
  if (sessionRestored) setAccessLocked(false);
  init.ready = true;
  if(typeof initCatalogWorkflows==='function')initCatalogWorkflows();
  if (typeof initSettingsCenter === 'function') initSettingsCenter();
  if (typeof initAccessControl === 'function') initAccessControl();
  if (!state.setupRequired) window.setTimeout(maximizeApplicationWindow, 0);
}

init();
