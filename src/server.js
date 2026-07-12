const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PIN = process.env.ADMIN_PIN || "1234";
const DEFAULT_EMPLOYEE_PIN = process.env.EMPLOYEE_PIN || "0000";
const AUTH_SESSION_MS = 12 * 60 * 60 * 1000;
const authSessions = new Map();

const dataDir = path.join(__dirname, "..", "data");
const productsPath = path.join(dataDir, "products.json");
const salesPath = path.join(dataDir, "sales.json");
const cashShiftsPath = path.join(dataDir, "cash-shifts.json");
const cashSessionsPath = path.join(dataDir, "cash-sessions.json");
const settingsPath = path.join(dataDir, "settings.json");
const inventoryEntriesPath = path.join(dataDir, "inventory-entries.json");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));


function createPinSecret(pin) {
  const normalizedPin = String(pin || "").trim();
  const pinSalt = crypto.randomBytes(16).toString("hex");
  const pinHash = crypto.scryptSync(normalizedPin, pinSalt, 64).toString("hex");

  return { pinSalt, pinHash };
}

function verifyUserPin(pin, user) {
  const normalizedPin = String(pin || "").trim();

  if (!normalizedPin || !user?.pinSalt || !user?.pinHash) {
    return false;
  }

  const candidate = crypto.scryptSync(normalizedPin, user.pinSalt, 64);
  const expected = Buffer.from(user.pinHash, "hex");

  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function getDefaultSettings() {
  return {
    adminPin: ADMIN_PIN,
    users: [
      {
        id: "mostrador",
        name: "Encargado",
        role: "employee",
        active: true,
        ...createPinSecret(DEFAULT_EMPLOYEE_PIN)
      },
      { id: "admin", name: "Administrador", role: "admin", active: true }
    ],
    updatedAt: new Date().toISOString()
  };
}

function normalizeUser(user, fallback = {}) {
  const role = user?.role === "admin" ? "admin" : "employee";
  const idBase = role === "admin" ? "admin" : "empleado";
  const id = String(user?.id || fallback.id || `${idBase}-${Date.now()}`).trim();
  const name = String(user?.name || fallback.name || (role === "admin" ? "Administrador" : "Empleado")).trim();
  const normalized = {
    id,
    name,
    role,
    active: user?.active !== false
  };

  if (role === "employee") {
    if (user?.pinSalt && user?.pinHash) {
      normalized.pinSalt = String(user.pinSalt);
      normalized.pinHash = String(user.pinHash);
    } else if (fallback?.pinSalt && fallback?.pinHash) {
      normalized.pinSalt = String(fallback.pinSalt);
      normalized.pinHash = String(fallback.pinHash);
    } else {
      Object.assign(normalized, createPinSecret(DEFAULT_EMPLOYEE_PIN));
    }
  }

  return normalized;
}

function normalizeSettings(settings = {}) {
  const defaults = getDefaultSettings();
  const rawUsers = Array.isArray(settings.users) && settings.users.length > 0
    ? settings.users
    : defaults.users;
  let users = rawUsers.map((user) => normalizeUser(user));

  if (!users.some((user) => user.role === "admin")) {
    users.push(defaults.users.find((user) => user.role === "admin"));
  }

  if (!users.some((user) => user.role === "employee")) {
    users.push(defaults.users.find((user) => user.role === "employee"));
  }

  users = users.map((user, index) => ({
    ...user,
    id: user.id || `usuario-${index + 1}`
  }));

  return {
    adminPin: String(settings.adminPin || ADMIN_PIN).trim() || ADMIN_PIN,
    users,
    updatedAt: settings.updatedAt || new Date().toISOString()
  };
}

function readSettings() {
  return normalizeSettings(readJson(settingsPath, getDefaultSettings()));
}

function writeSettings(settings) {
  const normalized = normalizeSettings({
    ...settings,
    updatedAt: new Date().toISOString()
  });
  writeJson(settingsPath, normalized);
  return normalized;
}

function getPublicSettings(settings = readSettings()) {
  return {
    users: settings.users.map(toPublicUser),
    updatedAt: settings.updatedAt
  };
}

function isAdminPin(pin) {
  return String(pin || "").trim() === readSettings().adminPin;
}

function createAuthSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  authSessions.set(token, {
    userId: user.id,
    role: user.role,
    expiresAt: Date.now() + AUTH_SESSION_MS
  });
  return token;
}

function getSessionUser(req) {
  const token = String(req.get("x-session-token") || "").trim();
  if (!token) return null;

  const session = authSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    authSessions.delete(token);
    return null;
  }

  const user = readSettings().users.find((candidate) => {
    return candidate.id === session.userId && candidate.active !== false;
  });

  if (!user) {
    authSessions.delete(token);
    return null;
  }

  session.expiresAt = Date.now() + AUTH_SESSION_MS;
  authSessions.set(token, session);
  return user;
}

function requireAdminUser(req, res) {
  const user = getSessionUser(req);

  if (!user) {
    res.status(401).json({
      message: "La sesión venció. Inicia sesión nuevamente."
    });
    return null;
  }

  if (user.role !== "admin") {
    res.status(403).json({
      message: "Esta acción requiere permisos de administrador."
    });
    return null;
  }

  return user;
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    active: user.active !== false,
    hasPin: user.role === "admin" || Boolean(user.pinSalt && user.pinHash)
  };
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  try {
    ensureDataDir();

    if (!fs.existsSync(filePath)) return fallback;

    const content = fs.readFileSync(filePath, "utf8");

    if (!content.trim()) return fallback;

    return JSON.parse(content);
  } catch (error) {
    console.error("Error leyendo JSON:", filePath, error);
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function roundQuantity(value) {
  return Math.round(toNumber(value) * 1000) / 1000;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function calculateSaleProfit(items, total) {
  const totalCost = items.reduce((sum, item) => {
    return sum + toNumber(item.lineCost || item.quantity * item.costPrice);
  }, 0);

  const grossProfit = roundMoney(toNumber(total) - totalCost);
  const profitMarginPercent =
    toNumber(total) > 0 ? (grossProfit / toNumber(total)) * 100 : 0;

  return {
    totalCost: roundMoney(totalCost),
    grossProfit,
    profitMarginPercent
  };
}

function normalizeProductPayload(body, existingProduct = {}) {
  const stockValue =
    body.stockQuantity === "" || body.stockQuantity === null
      ? null
      : roundQuantity(body.stockQuantity ?? existingProduct.stockQuantity ?? 0);

  const minStockValue =
    body.minStock === "" || body.minStock === null
      ? null
      : roundQuantity(body.minStock ?? existingProduct.minStock ?? 0);

  return {
    name: String(body.name ?? existingProduct.name ?? "").trim(),
    category: String(body.category ?? existingProduct.category ?? "").trim(),
    unit: ["kg", "pieza"].includes(body.unit)
      ? body.unit
      : existingProduct.unit || "kg",
    price: roundMoney(body.price ?? existingProduct.price ?? 0),
    costPrice: roundMoney(body.costPrice ?? existingProduct.costPrice ?? 0),
    stockQuantity: stockValue,
    minStock: minStockValue,
    active:
      typeof body.active === "boolean"
        ? body.active
        : existingProduct.active !== false,
    updatedAt: new Date().toISOString()
  };
}

function normalizeSaleItems(items) {
  return items.map((item) => {
    const quantity = roundQuantity(item.quantity);
    const price = roundMoney(item.price);
    const costPrice = roundMoney(item.costPrice || 0);
    const total = roundMoney(quantity * price);
    const lineCost = roundMoney(quantity * costPrice);

    return {
      productId: String(item.productId || "").trim(),
      name: String(item.name || "").trim(),
      category: String(item.category || "").trim(),
      unit: item.unit === "pieza" ? "pieza" : "kg",
      price,
      costPrice,
      quantity,
      total,
      lineCost,
      grossProfit: roundMoney(total - lineCost),
      source: item.source === "scale" ? "scale" : "manual"
    };
  });
}

function getNextSaleId(sales) {
  const maxNumber = sales.reduce((max, sale) => {
    const match = String(sale.id || "").match(/^T-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `T-${String(maxNumber + 1).padStart(6, "0")}`;
}

function getNextInventoryEntryId(entries) {
  const maxNumber = entries.reduce((max, entry) => {
    const match = String(entry.id || "").match(/^ENT-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `ENT-${String(maxNumber + 1).padStart(6, "0")}`;
}

function getNextCashSessionId(sessions) {
  const maxNumber = sessions.reduce((max, session) => {
    const match = String(session.id || "").match(/^C-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `C-${String(maxNumber + 1).padStart(6, "0")}`;
}

function getNextCashMovementId(session) {
  const movements = Array.isArray(session?.movements) ? session.movements : [];
  const maxNumber = movements.reduce((max, movement) => {
    const match = String(movement.id || "").match(/^MOV-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `MOV-${String(maxNumber + 1).padStart(4, "0")}`;
}

function requireSessionUser(req, res) {
  const user = getSessionUser(req);

  if (!user) {
    res.status(401).json({
      message: "La sesión venció. Inicia sesión nuevamente."
    });
    return null;
  }

  return user;
}

function normalizeCashMovement(movement = {}) {
  return {
    id: String(movement.id || "").trim(),
    type: movement.type === "out" ? "out" : "in",
    amount: Math.max(0, roundMoney(movement.amount || 0)),
    reason: String(movement.reason || "").trim(),
    createdAt: movement.createdAt || new Date().toISOString(),
    createdBy: movement.createdBy || null
  };
}

function normalizeCashSession(session = {}) {
  const businessDate = String(session.businessDate || session.date || "").trim();
  const movements = Array.isArray(session.movements)
    ? session.movements.map(normalizeCashMovement).filter((movement) => movement.amount > 0)
    : [];

  return {
    id: String(session.id || "").trim(),
    businessDate,
    date: businessDate,
    status: session.status === "closed" ? "closed" : "open",
    openingAmount: Math.max(0, roundMoney(session.openingAmount || 0)),
    openingNote: String(session.openingNote || "").trim(),
    openedAt: session.openedAt || new Date().toISOString(),
    openedBy: session.openedBy || null,
    movements,
    closedAt: session.closedAt || null,
    closedBy: session.closedBy || null,
    countedCash:
      session.countedCash === null || session.countedCash === undefined
        ? null
        : Math.max(0, roundMoney(session.countedCash)),
    expectedCash:
      session.expectedCash === null || session.expectedCash === undefined
        ? null
        : roundMoney(session.expectedCash),
    difference:
      session.difference === null || session.difference === undefined
        ? null
        : roundMoney(session.difference),
    closeNote: String(session.closeNote || "").trim(),
    denominations: session.denominations || null,
    summary: session.summary || null
  };
}

function migrateLegacyCashShifts() {
  const legacy = readJson(cashShiftsPath, []);
  if (!Array.isArray(legacy) || legacy.length === 0) return [];

  return legacy
    .filter((shift) => shift && shift.id && (shift.date || shift.businessDate))
    .map((shift) => normalizeCashSession({
      ...shift,
      id: String(shift.id),
      businessDate: shift.businessDate || shift.date,
      countedCash: shift.countedCash ?? shift.countedAmount ?? null,
      openedBy: shift.openedBy || { id: "legacy", name: "Registro anterior", role: "admin" },
      closeNote: shift.closeNote || "Migrado desde el formato anterior."
    }));
}

function readCashSessions() {
  let sessions = readJson(cashSessionsPath, []);

  if (!Array.isArray(sessions) || sessions.length === 0) {
    sessions = migrateLegacyCashShifts();
    if (sessions.length > 0) writeJson(cashSessionsPath, sessions);
  }

  return (Array.isArray(sessions) ? sessions : [])
    .map(normalizeCashSession)
    .filter((session) => session.id && session.businessDate);
}

function writeCashSessions(sessions) {
  const normalized = sessions.map(normalizeCashSession);
  writeJson(cashSessionsPath, normalized);
  return normalized;
}

function getOpenCashSession(sessions = readCashSessions()) {
  return sessions.find((session) => session.status === "open") || null;
}

function saleBelongsToCashSession(sale, session) {
  const sessionId = String(sale.cashSessionId || sale.cashShiftId || "").trim();
  return sessionId === session.id;
}

function calculateCashSessionSummary(session, sales = readJson(salesPath, [])) {
  const relatedSales = sales.filter((sale) => saleBelongsToCashSession(sale, session));
  const completedSales = relatedSales.filter((sale) => sale.status !== "cancelada");
  const canceledSales = relatedSales.filter((sale) => sale.status === "cancelada");
  const totals = completedSales.reduce(
    (acc, sale) => {
      const total = roundMoney(sale.total || 0);
      acc.totalSales = roundMoney(acc.totalSales + total);
      acc.grossProfit = roundMoney(acc.grossProfit + roundMoney(sale.grossProfit || 0));
      acc.salesCount += 1;

      if (sale.paymentMethod === "tarjeta") acc.cardSales = roundMoney(acc.cardSales + total);
      else if (sale.paymentMethod === "transferencia") acc.transferSales = roundMoney(acc.transferSales + total);
      else acc.cashSales = roundMoney(acc.cashSales + total);

      return acc;
    },
    {
      totalSales: 0,
      grossProfit: 0,
      salesCount: 0,
      cashSales: 0,
      cardSales: 0,
      transferSales: 0
    }
  );

  const movements = Array.isArray(session.movements) ? session.movements : [];
  const cashIn = roundMoney(
    movements
      .filter((movement) => movement.type === "in")
      .reduce((sum, movement) => sum + roundMoney(movement.amount || 0), 0)
  );
  const cashOut = roundMoney(
    movements
      .filter((movement) => movement.type === "out")
      .reduce((sum, movement) => sum + roundMoney(movement.amount || 0), 0)
  );
  const expectedCash = roundMoney(
    roundMoney(session.openingAmount || 0) + totals.cashSales + cashIn - cashOut
  );

  return {
    ...totals,
    canceledCount: canceledSales.length,
    cashIn,
    cashOut,
    expectedCash
  };
}

function serializeCashSession(session, sales = readJson(salesPath, [])) {
  const normalized = normalizeCashSession(session);
  const liveSummary = normalized.status === "open"
    ? calculateCashSessionSummary(normalized, sales)
    : normalized.summary || calculateCashSessionSummary(normalized, sales);

  return {
    ...normalized,
    summary: liveSummary,
    expectedCash: normalized.status === "closed"
      ? normalized.expectedCash
      : liveSummary.expectedCash
  };
}

function calculatePurchaseProjection(quantity, unitCost, salePrice) {
  const totalCost = roundMoney(quantity * unitCost);
  const projectedRevenue = roundMoney(quantity * salePrice);
  const projectedProfit = roundMoney(projectedRevenue - totalCost);
  const marginPercent = projectedRevenue > 0
    ? Math.round((projectedProfit / projectedRevenue) * 10000) / 100
    : 0;

  return {
    totalCost,
    projectedRevenue,
    projectedProfit,
    marginPercent
  };
}

function updateInventoryAfterSale(items) {
  const products = readJson(productsPath, []);
  let changed = false;

  items.forEach((item) => {
    const product = products.find((entry) => entry.id === item.productId);

    if (!product || typeof product.stockQuantity !== "number") return;

    product.stockQuantity = Math.max(
      0,
      roundQuantity(product.stockQuantity - item.quantity)
    );
    product.updatedAt = new Date().toISOString();
    changed = true;
  });

  if (changed) {
    writeJson(productsPath, products);
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "El Muelle POS",
    scale: {
      mode: "rhino-bar-9-web-serial",
      message:
        "Báscula RHINO BAR-9 por Web Serial: 9600 BPS, 8N1, sin flujo, comando P."
    }
  });
});


app.get("/api/settings", (req, res) => {
  res.json(getPublicSettings());
});

app.post("/api/auth/admin", (req, res) => {
  if (!isAdminPin(req.body?.pin)) {
    return res.status(401).json({
      message: "PIN de administrador incorrecto."
    });
  }

  const settings = readSettings();
  const adminUser = settings.users.find((user) => user.role === "admin") || {
    id: "admin",
    name: "Administrador",
    role: "admin",
    active: true
  };

  res.json({
    ok: true,
    user: toPublicUser(adminUser),
    sessionToken: createAuthSession(adminUser),
    settings: getPublicSettings(settings)
  });
});

app.post("/api/auth/employee", (req, res) => {
  const userId = String(req.body?.userId || "").trim();
  const pin = String(req.body?.pin || "").trim();
  const settings = readSettings();
  const employee = settings.users.find((user) => {
    return user.id === userId && user.role === "employee" && user.active !== false;
  });

  if (!employee || !verifyUserPin(pin, employee)) {
    return res.status(401).json({
      message: "Usuario o PIN incorrecto."
    });
  }

  res.json({
    ok: true,
    user: toPublicUser(employee),
    sessionToken: createAuthSession(employee),
    settings: getPublicSettings(settings)
  });
});

app.get("/api/auth/session", (req, res) => {
  const user = getSessionUser(req);

  if (!user) {
    return res.json({
      ok: true,
      authenticated: false,
      user: null,
      settings: getPublicSettings()
    });
  }

  res.json({
    ok: true,
    authenticated: true,
    user: toPublicUser(user),
    settings: getPublicSettings()
  });
});

app.put("/api/settings", (req, res) => {
  if (!isAdminPin(req.body?.adminPin)) {
    return res.status(401).json({
      message: "PIN de administrador incorrecto."
    });
  }

  const current = readSettings();
  const newPin = String(req.body?.newAdminPin || "").trim();
  const requestedUsers = Array.isArray(req.body?.users) ? req.body.users : current.users;
  const employeePins = req.body?.employeePins && typeof req.body.employeePins === "object"
    ? req.body.employeePins
    : {};

  if (newPin && !/^\d{4,12}$/.test(newPin)) {
    return res.status(400).json({
      message: "El PIN nuevo debe tener de 4 a 12 dígitos."
    });
  }

  const adminUser = requestedUsers.find((user) => user?.role === "admin");
  const employeeUsers = requestedUsers.filter((user) => user?.role !== "admin");

  if (!String(adminUser?.name || "").trim()) {
    return res.status(400).json({
      message: "El nombre del administrador es obligatorio."
    });
  }

  if (employeeUsers.length === 0) {
    return res.status(400).json({
      message: "Debe existir al menos un empleado de mostrador."
    });
  }

  let normalizedUsers;

  try {
    normalizedUsers = [
    normalizeUser({ ...adminUser, role: "admin", active: true }),
    ...employeeUsers.map((requestedUser) => {
      const existing = current.users.find((user) => {
        return user.id === requestedUser?.id && user.role === "employee";
      });
      const employeePin = String(employeePins[requestedUser?.id] || "").trim();

      if (employeePin && !/^\d{4,12}$/.test(employeePin)) {
        const error = new Error(`El PIN de ${requestedUser?.name || "empleado"} debe tener de 4 a 12 dígitos.`);
        error.statusCode = 400;
        throw error;
      }

      if (!existing && !employeePin) {
        const error = new Error(`Asigna un PIN inicial a ${requestedUser?.name || "el empleado nuevo"}.`);
        error.statusCode = 400;
        throw error;
      }

      const normalizedEmployee = normalizeUser(
        { ...requestedUser, role: "employee", active: true },
        existing || {}
      );

      if (employeePin) {
        Object.assign(normalizedEmployee, createPinSecret(employeePin));
      }

      return normalizedEmployee;
    })
    ];
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      message: error.message || "No se pudieron guardar los usuarios."
    });
  }

  const settings = writeSettings({
    ...current,
    users: normalizedUsers,
    adminPin: newPin || current.adminPin
  });

  res.json(getPublicSettings(settings));
});

app.get("/api/products", (req, res) => {
  res.json(readJson(productsPath, []));
});

app.post("/api/products", (req, res) => {
  const products = readJson(productsPath, []);
  const payload = normalizeProductPayload(req.body);

  if (!payload.name || !payload.category || payload.price <= 0) {
    return res.status(400).json({
      message: "Faltan datos del producto."
    });
  }

  const idBase = slugify(payload.name) || "producto";
  const newProduct = {
    id: `${idBase}-${Date.now()}`,
    ...payload,
    createdAt: new Date().toISOString()
  };

  products.push(newProduct);
  writeJson(productsPath, products);

  res.status(201).json(newProduct);
});

app.put("/api/products/:id", (req, res) => {
  const products = readJson(productsPath, []);
  const productIndex = products.findIndex((product) => {
    return product.id === req.params.id;
  });

  if (productIndex === -1) {
    return res.status(404).json({
      message: "Producto no encontrado."
    });
  }

  const updatedProduct = {
    ...products[productIndex],
    ...normalizeProductPayload(req.body, products[productIndex])
  };

  if (!updatedProduct.name || !updatedProduct.category || updatedProduct.price <= 0) {
    return res.status(400).json({
      message: "Faltan datos del producto."
    });
  }

  products[productIndex] = updatedProduct;
  writeJson(productsPath, products);

  res.json(updatedProduct);
});

app.patch("/api/products/:id/inventory", (req, res) => {
  const products = readJson(productsPath, []);
  const productIndex = products.findIndex((product) => {
    return product.id === req.params.id;
  });

  if (productIndex === -1) {
    return res.status(404).json({
      message: "Producto no encontrado."
    });
  }

  products[productIndex] = {
    ...products[productIndex],
    stockQuantity:
      req.body.stockQuantity === "" || req.body.stockQuantity === null
        ? null
        : roundQuantity(req.body.stockQuantity),
    minStock:
      req.body.minStock === "" || req.body.minStock === null
        ? null
        : roundQuantity(req.body.minStock),
    updatedAt: new Date().toISOString()
  };

  writeJson(productsPath, products);
  res.json(products[productIndex]);
});

app.get("/api/inventory/entries", (req, res) => {
  const adminUser = requireAdminUser(req, res);
  if (!adminUser) return;

  const entries = readJson(inventoryEntriesPath, [])
    .sort((a, b) => {
      return new Date(b.createdAt || b.receivedAt || 0) - new Date(a.createdAt || a.receivedAt || 0);
    });

  res.json(entries);
});

app.post("/api/inventory/entries", (req, res) => {
  const adminUser = requireAdminUser(req, res);
  if (!adminUser) return;

  const productId = String(req.body?.productId || "").trim();
  const quantity = roundQuantity(req.body?.quantity);
  const unitCost = roundMoney(req.body?.unitCost);
  const requestedSalePrice = roundMoney(req.body?.salePrice);
  const supplier = String(req.body?.supplier || "").trim();
  const notes = String(req.body?.notes || "").trim();
  const receivedAt = String(req.body?.receivedAt || "").trim() || new Date().toISOString().slice(0, 10);

  if (!productId || quantity <= 0 || unitCost <= 0) {
    return res.status(400).json({
      message: "Selecciona un producto y captura cantidad y costo mayores a cero."
    });
  }

  const products = readJson(productsPath, []);
  const productIndex = products.findIndex((product) => product.id === productId);

  if (productIndex === -1) {
    return res.status(404).json({
      message: "Producto no encontrado."
    });
  }

  const product = products[productIndex];
  const currentStock = typeof product.stockQuantity === "number"
    ? Math.max(roundQuantity(product.stockQuantity), 0)
    : 0;
  const currentCost = Math.max(roundMoney(product.costPrice || 0), 0);
  const salePrice = requestedSalePrice > 0
    ? requestedSalePrice
    : Math.max(roundMoney(product.price || 0), 0);
  const newStock = roundQuantity(currentStock + quantity);
  const currentInventoryValue = roundMoney(currentStock * currentCost);
  const newPurchaseValue = roundMoney(quantity * unitCost);
  const weightedAverageCost = newStock > 0
    ? roundMoney((currentInventoryValue + newPurchaseValue) / newStock)
    : unitCost;
  const projection = calculatePurchaseProjection(quantity, unitCost, salePrice);
  const entries = readJson(inventoryEntriesPath, []);
  const now = new Date().toISOString();

  const entry = {
    id: getNextInventoryEntryId(entries),
    productId: product.id,
    productName: product.name,
    category: product.category,
    unit: product.unit,
    quantity,
    unitCost,
    totalCost: projection.totalCost,
    salePrice,
    projectedRevenue: projection.projectedRevenue,
    projectedProfit: projection.projectedProfit,
    marginPercent: projection.marginPercent,
    previousStock: currentStock,
    newStock,
    previousAverageCost: currentCost,
    weightedAverageCost,
    supplier,
    receivedAt,
    notes,
    createdBy: toPublicUser(adminUser),
    createdAt: now
  };

  products[productIndex] = {
    ...product,
    stockQuantity: newStock,
    costPrice: weightedAverageCost,
    price: salePrice > 0 ? salePrice : product.price,
    lastPurchaseAt: receivedAt,
    lastSupplier: supplier || product.lastSupplier || "",
    updatedAt: now
  };

  entries.push(entry);
  writeJson(productsPath, products);
  writeJson(inventoryEntriesPath, entries);

  res.status(201).json({
    entry,
    product: products[productIndex]
  });
});

app.get("/api/sales", (req, res) => {
  res.json(readJson(salesPath, []));
});

app.get("/api/sales/:id", (req, res) => {
  const sales = readJson(salesPath, []);
  const sale = sales.find((item) => item.id === req.params.id);

  if (!sale) {
    return res.status(404).json({
      message: "Venta no encontrada."
    });
  }

  res.json(sale);
});

app.get("/api/cash-sessions", (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;

  const sessions = readCashSessions();
  const sales = readJson(salesPath, []);
  const visibleSessions = user.role === "admin"
    ? sessions
    : sessions.filter((session) => {
        return session.status === "open" || session.businessDate === new Date().toISOString().slice(0, 10);
      });

  res.json(
    visibleSessions
      .map((session) => serializeCashSession(session, sales))
      .sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt))
  );
});

app.get("/api/cash-sessions/current", (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;

  const sessions = readCashSessions();
  const current = getOpenCashSession(sessions);

  res.json({
    session: current ? serializeCashSession(current) : null
  });
});

app.post("/api/cash-sessions/open", (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;

  const sessions = readCashSessions();
  const current = getOpenCashSession(sessions);

  if (current) {
    return res.status(409).json({
      message: `Ya existe una caja abierta por ${current.openedBy?.name || "otro usuario"}.`
    });
  }

  const openingAmount = roundMoney(req.body?.openingAmount || 0);
  const businessDate = String(req.body?.businessDate || "").trim() || new Date().toISOString().slice(0, 10);

  if (openingAmount < 0) {
    return res.status(400).json({
      message: "El fondo inicial no puede ser negativo."
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return res.status(400).json({
      message: "La fecha de apertura no es válida."
    });
  }

  const session = normalizeCashSession({
    id: getNextCashSessionId(sessions),
    businessDate,
    status: "open",
    openingAmount,
    openingNote: "",
    openedAt: new Date().toISOString(),
    openedBy: toPublicUser(user),
    movements: []
  });

  sessions.push(session);
  writeCashSessions(sessions);

  res.status(201).json(serializeCashSession(session));
});

app.post("/api/cash-sessions/:id/movements", (req, res) => {
  const user = requireAdminUser(req, res);
  if (!user) return;

  const sessions = readCashSessions();
  const sessionIndex = sessions.findIndex((session) => session.id === req.params.id);

  if (sessionIndex === -1) {
    return res.status(404).json({ message: "Caja no encontrada." });
  }

  if (sessions[sessionIndex].status !== "open") {
    return res.status(409).json({ message: "La caja ya está cerrada." });
  }

  const type = req.body?.type === "out" ? "out" : "in";
  const amount = roundMoney(req.body?.amount || 0);
  const reason = type === "out" ? "Retiro de efectivo" : "Entrada de efectivo";

  if (amount <= 0) {
    return res.status(400).json({
      message: "Captura un importe mayor a cero."
    });
  }

  const movement = normalizeCashMovement({
    id: getNextCashMovementId(sessions[sessionIndex]),
    type,
    amount,
    reason,
    createdAt: new Date().toISOString(),
    createdBy: toPublicUser(user)
  });

  sessions[sessionIndex].movements.push(movement);
  writeCashSessions(sessions);

  res.status(201).json({
    movement,
    session: serializeCashSession(sessions[sessionIndex])
  });
});

app.post("/api/cash-sessions/:id/close", (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;

  const sessions = readCashSessions();
  const sessionIndex = sessions.findIndex((session) => session.id === req.params.id);

  if (sessionIndex === -1) {
    return res.status(404).json({ message: "Caja no encontrada." });
  }

  const session = sessions[sessionIndex];
  if (session.status !== "open") {
    return res.status(409).json({ message: "La caja ya está cerrada." });
  }

  const countedCash = roundMoney(req.body?.countedCash);
  if (!Number.isFinite(Number(req.body?.countedCash)) || countedCash < 0) {
    return res.status(400).json({ message: "Captura el efectivo contado correctamente." });
  }

  const summary = calculateCashSessionSummary(session);
  const difference = roundMoney(countedCash - summary.expectedCash);

  sessions[sessionIndex] = normalizeCashSession({
    ...session,
    status: "closed",
    closedAt: new Date().toISOString(),
    closedBy: toPublicUser(user),
    countedCash,
    expectedCash: summary.expectedCash,
    difference,
    closeNote: "",
    denominations: req.body?.denominations || null,
    summary
  });

  writeCashSessions(sessions);
  res.json(serializeCashSession(sessions[sessionIndex]));
});

// Compatibilidad de lectura con versiones anteriores del frontend.
app.get("/api/cash-shifts", (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  res.json(readCashSessions().map((session) => serializeCashSession(session)));
});

app.put("/api/cash-shifts", (req, res) => {
  res.status(410).json({
    message: "La caja ahora se administra con sesiones y movimientos protegidos en el servidor."
  });
});

app.post("/api/sales", (req, res) => {
  const sales = readJson(salesPath, []);
  const items = Array.isArray(req.body.items)
    ? normalizeSaleItems(req.body.items)
    : [];

  if (
    items.length === 0 ||
    items.some((item) => !item.productId || !item.name || item.quantity <= 0)
  ) {
    return res.status(400).json({
      message: "La venta no tiene productos válidos."
    });
  }

  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + toNumber(item.total), 0)
  );
  const discount = Math.max(0, roundMoney(req.body.discount || 0));
  const total = roundMoney(Math.max(subtotal - discount, 0));
  const profitSummary = calculateSaleProfit(items, total);
  const paymentMethod = ["efectivo", "tarjeta", "transferencia"].includes(
    req.body.paymentMethod
  )
    ? req.body.paymentMethod
    : "efectivo";
  const paymentReference = String(req.body.paymentDetails?.reference || req.body.paymentReference || "").trim().slice(0, 80);
  if ((paymentMethod === "tarjeta" || paymentMethod === "transferencia") && !paymentReference) {
    return res.status(400).json({
      message: "La referencia de pago es obligatoria para tarjeta o transferencia."
    });
  }

  const operator = getSessionUser(req);

  if (!operator) {
    return res.status(401).json({
      message: "La sesión venció. Inicia sesión nuevamente antes de vender."
    });
  }

  const cashSessions = readCashSessions();
  const activeCashSession = getOpenCashSession(cashSessions);

  if (!activeCashSession) {
    return res.status(409).json({
      message: "La caja está cerrada. Abre caja antes de guardar la venta."
    });
  }

  const sale = {
    id: getNextSaleId(sales),
    createdAt: new Date().toISOString(),
    status: "completada",
    cashSessionId: activeCashSession.id,
    cashShiftId: activeCashSession.id,
    cashShiftDate: activeCashSession.businessDate,
    businessDate: activeCashSession.businessDate,
    operator: {
      id: operator.id,
      name: operator.name,
      role: operator.role
    },
    items,
    paymentMethod,
    paymentDetails: {
      reference: paymentMethod === "efectivo" ? "" : paymentReference
    },
    subtotal,
    discount,
    total,
    totalCost: profitSummary.totalCost,
    grossProfit: profitSummary.grossProfit,
    profitMarginPercent: profitSummary.profitMarginPercent,
    invoice: {
      status: req.body.invoiceRequested ? "pendiente_datos" : "no_solicitada",
      requestedAt: req.body.invoiceRequested ? new Date().toISOString() : null,
      customer: null,
      notes: req.body.invoiceRequested
        ? "El cliente pidió factura en caja. Faltan datos fiscales."
        : "El cliente no solicitó factura en caja."
    }
  };

  sales.push(sale);
  writeJson(salesPath, sales);
  updateInventoryAfterSale(items);

  res.status(201).json(sale);
});

app.patch("/api/sales/:id/invoice", (req, res) => {
  const sales = readJson(salesPath, []);
  const saleIndex = sales.findIndex((item) => item.id === req.params.id);

  if (saleIndex === -1) {
    return res.status(404).json({
      message: "Venta no encontrada."
    });
  }

  const { rfc, businessName, fiscalZip, fiscalRegime, cfdiUse, email } =
    req.body;

  if (!rfc || !businessName || !fiscalZip || !fiscalRegime || !cfdiUse) {
    return res.status(400).json({
      message: "Faltan datos fiscales obligatorios."
    });
  }

  sales[saleIndex].invoice = {
    status: "solicitada",
    requestedAt: new Date().toISOString(),
    customer: {
      rfc: String(rfc).trim().toUpperCase(),
      businessName: String(businessName).trim(),
      fiscalZip: String(fiscalZip).trim(),
      fiscalRegime: String(fiscalRegime).trim(),
      cfdiUse: String(cfdiUse).trim(),
      email: String(email || "").trim()
    },
    notes: "Solicitud registrada. Pendiente de timbrado CFDI real."
  };

  writeJson(salesPath, sales);

  res.json(sales[saleIndex]);
});

app.patch("/api/sales/:id/cancel", (req, res) => {
  const sales = readJson(salesPath, []);
  const saleIndex = sales.findIndex((item) => item.id === req.params.id);

  if (saleIndex === -1) {
    return res.status(404).json({
      message: "Venta no encontrada."
    });
  }

  if (!isAdminPin(req.body.adminPin)) {
    return res.status(401).json({
      message: "PIN de administrador incorrecto."
    });
  }

  if (sales[saleIndex].status === "cancelada") {
    return res.status(400).json({
      message: "La venta ya está cancelada."
    });
  }

  const cancelUser = getSessionUser(req);

  sales[saleIndex] = {
    ...sales[saleIndex],
    status: "cancelada",
    canceledAt: new Date().toISOString(),
    canceledBy: cancelUser
      ? { id: cancelUser.id, name: cancelUser.name, role: cancelUser.role }
      : { id: "admin", name: "Administrador", role: "admin" },
    cancelReason: String(
      req.body.reason || "Cancelación desde módulo de ventas"
    ).trim(),
    updatedAt: new Date().toISOString()
  };

  writeJson(salesPath, sales);

  res.json(sales[saleIndex]);
});

app.get("/api/scale/status", (req, res) => {
  res.json({
    connected: false,
    mode: "rhino-bar-9-web-serial",
    weight: 0,
    message:
      "La conexión real se gestiona en el navegador con Web Serial. Configuración RHINO BAR-9: 9600 BPS, 8N1, sin flujo, comando P."
  });
});

app.listen(PORT, () => {
  console.log("");
  console.log("=======================================");
  console.log(" El Muelle POS iniciado correctamente");
  console.log(` Abre: http://localhost:${PORT}`);
  console.log("=======================================");
  console.log("");
});
