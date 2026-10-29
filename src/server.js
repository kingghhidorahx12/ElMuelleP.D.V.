const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const validate = require('./validation');
const { PosDatabase } = require("./database");
const persistence = require("./persistence");
const initialStorage = persistence.resolveStorage();

const envPath = initialStorage.envPath;
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || "127.0.0.1").trim();
const REQUIRE_HTTPS = String(process.env.REQUIRE_HTTPS || "").toLowerCase() === "true";
const PIN_PATTERN = /^\d{6,12}$/;
const AUTH_SESSION_MS = 30 * 60 * 1000;
const MAX_AUTH_SESSIONS = 1000;
const storage = persistence.resolveStorage();
if (initialStorage.installed && (!storage.installed || storage.dataDir !== initialStorage.dataDir || storage.root !== initialStorage.root)) throw new Error("La configuración no puede cambiar silenciosamente DATA_DIR; selecciónalo explícitamente al iniciar.");
if(storage.installed){
  const compatibility=require('./release-compatibility');
  compatibility.verifyPackage(path.resolve(__dirname,'../..'));
  compatibility.checkData(storage.dataDir);
}
persistence.prepareInstalledStorage(storage);
const dataDir = storage.dataDir;
const ADMIN_PIN = String(process.env.ADMIN_PIN || "").trim();
const DEFAULT_EMPLOYEE_PIN = String(process.env.EMPLOYEE_PIN || "").trim();
const DATA_ENCRYPTION_KEY = persistence.resolveEncryptionKey(dataDir, process.env.DATA_ENCRYPTION_KEY);
const encryptionKey = crypto.createHash("sha256").update(DATA_ENCRYPTION_KEY).digest();
const authSessions = new Map();
const manualWeightAuthorizations = new Map();
const productsPath = path.join(dataDir, "products.json");
const salesPath = path.join(dataDir, "sales.json");
const cashShiftsPath = path.join(dataDir, "cash-shifts.json");
const cashSessionsPath = path.join(dataDir, "cash-sessions.json");
const settingsPath = path.join(dataDir, "settings.json");
const inventoryEntriesPath = path.join(dataDir, "inventory-entries.json");
const database = new PosDatabase(dataDir);
persistence.ensureKeyCheck(database, DATA_ENCRYPTION_KEY);

const corsOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (corsOrigins.length > 0) {
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || corsOrigins.includes(origin));
      }
    })
  );
}

if (REQUIRE_HTTPS) app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
  );

  if (REQUIRE_HTTPS && !req.secure) {
    return res.status(426).json({ message: "Esta instalación requiere HTTPS." });
  }

  return next();
});

app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const origin = String(req.get("origin") || "").trim();
  if (!origin) return next();

  const protocol = REQUIRE_HTTPS ? "https" : req.protocol;
  const sameOrigin = origin === `${protocol}://${req.get("host")}`;
  if (sameOrigin || corsOrigins.includes(origin)) return next();

  return res.status(403).json({ message: "Origen no autorizado." });
});

app.use(["/api/products", "/api/products/:id", "/api/inventory/entries"], express.json({limit:"7mb"}));
app.use(express.json({ limit: "1mb" }));
app.use('/api', (req, _res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (req.body !== undefined) validate.object(req.body);
    else req.body = {};
  }
  next();
});
app.use(express.static(path.join(__dirname, "..", "public")));
app.use('/api', (req, res, next) => {
  const send = res.json.bind(res);
  res.json = value => { if (database.backupStatus.failed) res.set('X-ElMuelle-Backup', 'pending'); return send(serializeFinancialForUser(value, req.validatedSessionUser)); };
  next();
});

const authAttemptBuckets = new Map();
const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_AUTH_ATTEMPTS = 5;

function getAuthenticationBucketKey(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function limitAuthenticationAttempts(req, res, next) {
  const now = Date.now();
  const key = getAuthenticationBucketKey(req);

  authAttemptBuckets.forEach((bucket, bucketKey) => {
    if (bucket.resetAt <= now) authAttemptBuckets.delete(bucketKey);
  });

  const bucket = authAttemptBuckets.get(key);

  if (bucket && bucket.attempts >= MAX_AUTH_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      message: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo."
    });
  }

  return next();
}

function recordAuthenticationFailure(req) {
  const now = Date.now();
  const key = getAuthenticationBucketKey(req);
  const current = authAttemptBuckets.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { attempts: 0, resetAt: now + AUTH_ATTEMPT_WINDOW_MS };
  bucket.attempts += 1;
  authAttemptBuckets.set(key, bucket);
}

function clearAuthenticationFailures(req) {
  authAttemptBuckets.delete(getAuthenticationBucketKey(req));
}


function createPinSecret(pin) {
  const normalizedPin = String(pin || "").trim();
  const pinSalt = crypto.randomBytes(16).toString("hex");
  const pinHash = crypto.scryptSync(normalizedPin, pinSalt, 64).toString("hex");

  return { pinSalt, pinHash };
}

function verifyPinSecret(pin, secret) {
  const normalizedPin = String(pin || "").trim();

  if (!normalizedPin || !secret?.pinSalt || !secret?.pinHash) {
    return false;
  }

  const candidate = crypto.scryptSync(normalizedPin, secret.pinSalt, 64);
  const expected = Buffer.from(secret.pinHash, "hex");

  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function verifyUserPin(pin, user) {
  return verifyPinSecret(pin, user);
}

function createUnconfiguredSettings(updatedAt = new Date().toISOString()) {
  return {
    securityVersion: 3,
    setupCompleted: false,
    users: [],
    updatedAt
  };
}

function getDefaultSettings() {
  if (!PIN_PATTERN.test(ADMIN_PIN)) return createUnconfiguredSettings();

  const adminSecret = createPinSecret(ADMIN_PIN);
  const users = [{ id: "admin", name: "Administrador", role: "admin", active: true }];

  if (PIN_PATTERN.test(DEFAULT_EMPLOYEE_PIN)) {
    users.unshift({
      id: "mostrador",
      name: "Encargado",
      role: "employee",
      active: true,
      ...createPinSecret(DEFAULT_EMPLOYEE_PIN)
    });
  }

  return {
    securityVersion: 3,
    setupCompleted: true,
    adminPinSalt: adminSecret.pinSalt,
    adminPinHash: adminSecret.pinHash,
    adminPinChangeRequired: false,
    employeePinChangeRequired: false,
    users,
    updatedAt: new Date().toISOString()
  };
}

function normalizeUser(user, fallback = {}) {
  const role = user?.role === "admin" ? "admin" : "employee";
  const idBase = role === "admin" ? "admin" : "empleado";
  const id = sanitizeText(user?.id || fallback.id || `${idBase}-${Date.now()}`, 80);
  const name = sanitizeText(
    user?.name || fallback.name || (role === "admin" ? "Administrador" : "Empleado"),
    60
  );
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
    } else if (PIN_PATTERN.test(DEFAULT_EMPLOYEE_PIN)) {
      Object.assign(normalized, createPinSecret(DEFAULT_EMPLOYEE_PIN));
    } else {
      normalized.active = false;
    }
  }

  return normalized;
}

function normalizeSettings(settings = {}) {
  if (settings?.setupCompleted === false) {
    return createUnconfiguredSettings(settings.updatedAt || new Date().toISOString());
  }

  const isLegacySettings = Number(settings.securityVersion || 0) < 2;
  const hasConfiguredUsers = Array.isArray(settings.users) && settings.users.length > 0;
  const defaults = hasConfiguredUsers ? null : getDefaultSettings();
  if (!hasConfiguredUsers && defaults.setupCompleted !== true) {
    return createUnconfiguredSettings(settings.updatedAt || new Date().toISOString());
  }

  const rawUsers = hasConfiguredUsers ? settings.users : defaults.users;
  let users = rawUsers.map((user) => normalizeUser(user));

  if (!users.some((user) => user.role === "admin")) {
    const fallback = defaults || getDefaultSettings();
    const fallbackAdmin = fallback.users.find((user) => user.role === "admin");
    if (fallbackAdmin) users.push(fallbackAdmin);
  }

  users = users.map((user, index) => ({
    ...user,
    id: user.id || `usuario-${index + 1}`
  }));

  const legacyAdminPin = String(settings.adminPin || "").trim();
  const hasAdminSecret = Boolean(settings.adminPinSalt && settings.adminPinHash);
  const adminSecret = hasAdminSecret
    ? {
        pinSalt: String(settings.adminPinSalt),
        pinHash: String(settings.adminPinHash)
      }
    : PIN_PATTERN.test(legacyAdminPin || ADMIN_PIN)
      ? createPinSecret(legacyAdminPin || ADMIN_PIN)
      : null;

  if (!adminSecret) return createUnconfiguredSettings(settings.updatedAt || new Date().toISOString());

  const adminUsesWeakPin = isLegacySettings && (
    verifyPinSecret("0000", adminSecret) || verifyPinSecret("1234", adminSecret)
  );
  const employeeUsesWeakPin = isLegacySettings && users.some((user) => {
    return user.role === "employee" && (
      verifyPinSecret("0000", user) || verifyPinSecret("1234", user)
    );
  });

  return {
    securityVersion: 3,
    setupCompleted: true,
    adminPinSalt: adminSecret.pinSalt,
    adminPinHash: adminSecret.pinHash,
    adminPinChangeRequired:
      settings.adminPinChangeRequired === true ||
      isLegacySettings ||
      adminUsesWeakPin,
    employeePinChangeRequired:
      settings.employeePinChangeRequired === true ||
      isLegacySettings ||
      employeeUsesWeakPin,
    users,
    updatedAt: settings.updatedAt || new Date().toISOString()
  };
}

function readSettings() {
  const rawSettings = readJson(settingsPath, null);
  const settings = normalizeSettings(rawSettings || getDefaultSettings());
  const needsMigration =
    !rawSettings ||
    (settings.setupCompleted === true && (
      Boolean(rawSettings.adminPin) ||
      !rawSettings.adminPinSalt ||
      !rawSettings.adminPinHash ||
      Number(rawSettings.securityVersion || 0) < 3
    ));

  if (needsMigration) {
    writeJson(settingsPath, settings);
    try {
      if (fs.existsSync(settingsPath)) {
        fs.writeFileSync(
          settingsPath,
          JSON.stringify({
            migratedTo: "el-muelle-pos.sqlite",
            migratedAt: new Date().toISOString(),
            note: "Las credenciales se migraron al almacenamiento seguro. No guardes PINs en este archivo."
          }, null, 2),
          "utf8"
        );
      }
    } catch (error) {
      console.error("No se pudo limpiar el archivo de configuración heredado:", error);
    }
  }

  return settings;
}

function writeSettings(settings) {
  const { adminPin, ...settingsWithoutLegacyPin } = settings;
  const normalized = normalizeSettings({
    ...settingsWithoutLegacyPin,
    updatedAt: new Date().toISOString()
  });
  writeJson(settingsPath, normalized);
  return normalized;
}

function getPublicSettings(settings = readSettings()) {
  return {
    setupRequired: settings.setupCompleted !== true,
    users: settings.users.map(toPublicUser),
    adminPinChangeRequired: settings.adminPinChangeRequired === true,
    employeePinChangeRequired: settings.employeePinChangeRequired === true,
    updatedAt: settings.updatedAt
  };
}

function isAdminPin(pin) {
  const settings = readSettings();
  if (settings.setupCompleted !== true) return false;
  return verifyPinSecret(pin, {
    pinSalt: settings.adminPinSalt,
    pinHash: settings.adminPinHash
  });
}

function cleanupAuthSessions() {
  const now = Date.now();
  authSessions.forEach((session, token) => {
    if (session.expiresAt <= now) authSessions.delete(token);
  });

  if (authSessions.size < MAX_AUTH_SESSIONS) return;

  const oldestToken = [...authSessions.entries()]
    .sort(([, left], [, right]) => left[1].expiresAt - right[1].expiresAt)[0]?.[0];
  if (oldestToken) authSessions.delete(oldestToken);
}

function createAuthSession(user) {
  cleanupAuthSessions();
  configuration.recordAccess(user.id);
  const token = crypto.randomBytes(32).toString("hex");
  authSessions.set(token, {
    userId: user.id,
    role: user.role,
    expiresAt: Date.now() + AUTH_SESSION_MS
  });
  return token;
}

function getCookies(req) {
  return String(req.get("cookie") || "")
    .split(";")
    .reduce((cookies, item) => {
      const separator = item.indexOf("=");
      if (separator === -1) return cookies;
      const name = item.slice(0, separator).trim();
      const value = item.slice(separator + 1).trim();
      if (name) {
        try {
          cookies[name] = decodeURIComponent(value);
        } catch {
          cookies[name] = "";
        }
      }
      return cookies;
    }, {});
}

function writeSessionCookie(res, token) {
  const attributes = [
    `el_muelle_session=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${Math.floor(AUTH_SESSION_MS / 1000)}`
  ];
  if (REQUIRE_HTTPS) attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

function clearSessionCookie(res) {
  const attributes = [
    "el_muelle_session=",
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    "Max-Age=0"
  ];
  if (REQUIRE_HTTPS) attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

function getSessionUser(req, touch = true) {
  req.validatedSessionUser = null;
  const token = String(getCookies(req).el_muelle_session || "").trim();
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

  if (touch) session.expiresAt = Date.now() + AUTH_SESSION_MS;
  authSessions.set(token, session);
  req.validatedSessionUser = user;
  return user;
}

function endSession(req, res) {
  const token = String(getCookies(req).el_muelle_session || "").trim();
  if (token) authSessions.delete(token);
  clearSessionCookie(res);
}

function isLoopbackRequest(req) {
  const address = String(req.socket?.remoteAddress || req.ip || "").replace(/^::ffff:/, "");
  return address === "127.0.0.1" || address === "::1";
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
  return database.read(filePath, fallback);
}

function writeJson(filePath, data) {
  database.write(filePath, data);
}

function withDataTransaction(work) {
  return database.transaction(work);
}

function recordAuditEvent(eventType, entityType, entityId, actor, details = {}) {
  database.addAuditEvent({
    eventType,
    entityType,
    entityId,
    actor,
    details
  });
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

function sanitizeText(value, maxLength = 120) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function encryptSensitivePayload(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptSensitivePayload(payload) {
  if (!payload || typeof payload !== "string" || !payload.startsWith("enc:v1:")) {
    return null;
  }

  try {
    const [, , ivValue, tagValue, encryptedValue] = payload.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey,
      Buffer.from(ivValue, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final()
    ]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch (error) {
    console.error("No se pudieron descifrar datos fiscales:", error.message);
    return null;
  }
}

function serializeFinancialForUser(value, user) {
  if (user?.role === 'admin' || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => serializeFinancialForUser(item, user));
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/(?:cost|costo|profit|margin|margen|ganancia|utilidad|investment|invertido|weightedAverage|projected|projection|rentabilidad|purchasePrice)/i.test(key)).map(([key,item]) => [key, serializeFinancialForUser(item,user)]));
}

function serializeSaleForUser(sale, user) {
  const response = JSON.parse(JSON.stringify(sale));
  const invoice = response.invoice || {};

  if (user?.role === "admin") {
    if (invoice.customerEncrypted) {
      invoice.customer = decryptSensitivePayload(invoice.customerEncrypted);
    }
  } else {
    invoice.customer = null;
  }

  delete invoice.customerEncrypted;
  response.invoice = invoice;
  return serializeFinancialForUser(response, user);
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
  validate.object(body, 'Producto');
  const unit = body.unit === undefined ? existingProduct.unit || 'kg' : body.unit;
  if (!['kg', 'pieza'].includes(unit)) validate.invalid('La unidad del producto no es válida.');
  const stockValue = existingProduct.stockQuantity ?? null;
  const minStockValue=validate.number(body.minStock===undefined?existingProduct.minStock??null:body.minStock,'Mínimo',{nullable:true,decimals:3,integer:unit==='pieza'});

  return {
    name: validate.text(body.name === undefined ? existingProduct.name : body.name, 'Nombre', 120),
    code: validate.text(body.code === undefined ? existingProduct.code || '' : body.code, 'Código', 80, {optional:true}),
    description: validate.text(body.description === undefined ? existingProduct.description || '' : body.description, 'Descripción', 1000, {optional:true}),
    category: validate.text(body.category === undefined ? existingProduct.category : body.category, 'Categoría', 80),
    unit,
    price: validate.number(body.price === undefined ? existingProduct.price ?? 0 : body.price, 'Precio'),
    costPrice: validate.number(body.costPrice === undefined ? existingProduct.costPrice ?? 0 : body.costPrice, 'Costo'),
    stockQuantity: stockValue,
    minStock: minStockValue,
    active:
      body.active === undefined ? existingProduct.active !== false : validate.boolean(body.active, 'Producto activo'),
    updatedAt: new Date().toISOString()
  };
}

function buildSaleItems(items, products) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    const error = new Error("La venta debe incluir entre 1 y 100 productos.");
    error.statusCode = 400;
    throw error;
  }

  const quantitiesByProduct = new Map();

  return items.map((item) => {
    validate.object(item, 'Partida');
    const productId = sanitizeText(item?.productId, 80);
    const product = products.find((candidate) => candidate.id === productId);
    const rawQuantity = Number(item?.quantity);
    const quantity = validate.number(item.quantity, 'Cantidad', { decimals: 3 });

    if (!product || product.active === false) {
      const error = new Error("Uno de los productos ya no existe o está inactivo.");
      error.statusCode = 409;
      throw error;
    }
    if (!Number.isFinite(rawQuantity) || quantity <= 0) {
      const error = new Error("La venta contiene una cantidad inválida.");
      error.statusCode = 400;
      throw error;
    }
    if (product.unit === "kg" && (quantity < 0.1 || quantity > 40)) {
      const error = new Error(`La cantidad máxima por producto es 40 kg (${product.name}).`);
      error.statusCode = 400;
      throw error;
    }
    if (product.unit === "pieza" && (!Number.isInteger(rawQuantity) || quantity > 100)) {
      const error = new Error(`La cantidad de ${product.name} debe ser un número entero de hasta 100 piezas.`);
      error.statusCode = 400;
      throw error;
    }

    if (typeof product.stockQuantity !== 'number') { const error = new Error('Existencias sin verificar. Registra el conteo inicial desde Inventario.'); error.statusCode=409; throw error; }
    const requestedQuantity = roundQuantity((quantitiesByProduct.get(product.id) || 0) + quantity);
    quantitiesByProduct.set(product.id, requestedQuantity);

    if (
      typeof product.stockQuantity === "number" &&
      requestedQuantity > roundQuantity(product.stockQuantity)
    ) {
      const error = new Error(`No hay existencia suficiente de ${product.name}.`);
      error.statusCode = 409;
      throw error;
    }

    const price = roundMoney(product.price);
    const costPrice = Math.max(0, roundMoney(product.costPrice || 0));
    if (price <= 0) {
      const error = new Error(`El producto ${product.name} no tiene un precio de venta válido.`);
      error.statusCode = 409;
      throw error;
    }

    const total = validate.number(quantity * price, 'Importe de partida');
    const lineCost = validate.number(quantity * costPrice, 'Costo de partida');
    if (item.source !== undefined && !['manual', 'scale'].includes(item.source)) validate.invalid('Origen de cantidad inválido.');
    return {
      productId: product.id,
      name: sanitizeText(product.name, 120),
      category: sanitizeText(product.category, 80),
      unit: product.unit === "pieza" ? "pieza" : "kg",
      price,
      costPrice,
      quantity,
      total,
      lineCost,
      grossProfit: roundMoney(total - lineCost),
      source: item?.source === "scale" ? "scale" : "manual"
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
      acc.totalSales = validate.number(acc.totalSales + total, 'Ventas acumuladas');
      acc.grossProfit = validate.number(acc.grossProfit + roundMoney(sale.grossProfit || 0), 'Ganancia acumulada', {min:-Number.MAX_VALUE});
      acc.salesCount += 1;

      if (sale.paymentMethod === "tarjeta") acc.cardSales = validate.number(acc.cardSales + total, 'Cobros con tarjeta');
      else if (sale.paymentMethod === "transferencia") acc.transferSales = validate.number(acc.transferSales + total, 'Transferencias');
      else acc.cashSales = validate.number(acc.cashSales + total, 'Cobros en efectivo');

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
  const cashIn = validate.number(
    movements
      .filter((movement) => movement.type === "in")
      .reduce((sum, movement) => sum + roundMoney(movement.amount || 0), 0), 'Entradas acumuladas'
  );
  const cashOut = validate.number(
    movements
      .filter((movement) => movement.type === "out")
      .reduce((sum, movement) => sum + roundMoney(movement.amount || 0), 0), 'Retiros acumulados'
  );
  const expectedCash = validate.number(
    roundMoney(session.openingAmount || 0) + totals.cashSales + cashIn - cashOut, 'Efectivo esperado', {min:-Number.MAX_VALUE}
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
  const totalCost = validate.number(quantity * unitCost, 'Costo de compra');
  const projectedRevenue = validate.number(quantity * salePrice, 'Venta proyectada');
  const projectedProfit = validate.number(projectedRevenue - totalCost, 'Ganancia proyectada', {min:-Number.MAX_VALUE});
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

function updateInventoryAfterSale(items, products = readJson(productsPath, [])) {
  let changed = false;

  items.forEach((item) => {
    const product = products.find((entry) => entry.id === item.productId);

    if (!product || typeof product.stockQuantity !== "number") return;

    product.stockQuantity = roundQuantity(product.stockQuantity - item.quantity);
    product.updatedAt = new Date().toISOString();
    changed = true;
  });

  return changed;
}

function migrateSensitiveSalesData() {
  const sales = readJson(salesPath, []);
  let changed = false;

  sales.forEach((sale) => {
    if (!sale?.invoice?.customer || sale.invoice.customerEncrypted) return;
    sale.invoice = {
      ...sale.invoice,
      customerEncrypted: encryptSensitivePayload(sale.invoice.customer)
    };
    delete sale.invoice.customer;
    changed = true;
  });

  if (!changed) return;

  withDataTransaction(() => {
    writeJson(salesPath, sales);
    recordAuditEvent("sensitive_data_migrated", "sales", null, null, {
      records: sales.length
    });
  });

  try {
    if (fs.existsSync(salesPath)) {
      fs.writeFileSync(
        salesPath,
        JSON.stringify({
          migratedTo: "el-muelle-pos.sqlite",
          migratedAt: new Date().toISOString(),
          note: "Los datos fiscales históricos se migraron cifrados a SQLite."
        }, null, 2),
        "utf8"
      );
    }
  } catch (error) {
    console.error("No se pudo limpiar el archivo de ventas heredado:", error);
  }
}

migrateSensitiveSalesData();

const access = require('./access').registerAccess({app,database,getSessionUser,requireAdminUser,recordAuditEvent,readUsers:()=>readSettings().users});

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

app.post("/api/setup/owner", limitAuthenticationAttempts, (req, res) => {
  if (!isLoopbackRequest(req)) {
    return res.status(403).json({ message: "La configuración inicial sólo se permite desde la computadora local." });
  }

  const current = readSettings();
  if (current.setupCompleted === true) {
    return res.status(409).json({ message: "La configuración inicial ya fue completada." });
  }

  const name = sanitizeText(req.body?.name, 60);
  const pin = String(req.body?.pin || "").trim();
  if (name.length < 2) {
    return res.status(400).json({ message: "Escribe el nombre del dueño o administrador." });
  }
  if (!PIN_PATTERN.test(pin)) {
    return res.status(400).json({ message: "El PIN debe tener de 6 a 12 dígitos." });
  }

  const owner = { id: "admin", name, role: "admin", active: true };
  const ownerSecret = createPinSecret(pin);
  const settings = withDataTransaction(() => {
    const savedSettings = writeSettings({
      securityVersion: 3,
      setupCompleted: true,
      users: [owner],
      adminPinSalt: ownerSecret.pinSalt,
      adminPinHash: ownerSecret.pinHash,
      adminPinChangeRequired: false,
      employeePinChangeRequired: false
    });
    recordAuditEvent("owner_configured", "settings", "current", owner, { ownerName: name });
    return savedSettings;
  });

  clearAuthenticationFailures(req);
  writeSessionCookie(res, createAuthSession(owner));
  return res.status(201).json({
    ok: true,
    user: access.sessionUser(owner),
    settings: getPublicSettings(settings)
  });
});

app.post("/api/auth/admin", limitAuthenticationAttempts, (req, res) => {
  if (readSettings().setupCompleted !== true) {
    return res.status(409).json({ message: "Completa la configuración inicial para crear el acceso del dueño." });
  }

  const pin = String(req.body?.pin || "").trim();
  if (!PIN_PATTERN.test(pin) || !isAdminPin(pin)) {
    recordAuthenticationFailure(req);
    return res.status(401).json({
      message: "PIN de administrador incorrecto."
    });
  }

  clearAuthenticationFailures(req);
  const settings = readSettings();
  const adminUser = settings.users.find((user) => user.role === "admin") || {
    id: "admin",
    name: "Administrador",
    role: "admin",
    active: true
  };

  writeSessionCookie(res, createAuthSession(adminUser));
  res.json({
    ok: true,
    user: access.sessionUser(adminUser),
    settings: getPublicSettings(settings)
  });
});

app.post("/api/auth/admin/verify", limitAuthenticationAttempts, (req, res) => {
  if (readSettings().setupCompleted !== true) {
    return res.status(409).json({ message: "Completa primero la configuración inicial." });
  }

  const pin = String(req.body?.pin || "").trim();
  if (!PIN_PATTERN.test(pin) || !isAdminPin(pin)) {
    recordAuthenticationFailure(req);
    return res.status(401).json({ message: "PIN de administrador incorrecto." });
  }
  clearAuthenticationFailures(req);
  return res.json({ ok: true });
});

app.post("/api/auth/employee", limitAuthenticationAttempts, (req, res) => {
  if (readSettings().setupCompleted !== true) {
    return res.status(409).json({ message: "Completa primero la configuración inicial." });
  }

  const userId = String(req.body?.userId || "").trim();
  const pin = String(req.body?.pin || "").trim();
  const settings = readSettings();
  const employee = settings.users.find((user) => {
    return user.id === userId && user.role === "employee" && user.active !== false;
  });

  if (!PIN_PATTERN.test(pin) || !employee || !verifyUserPin(pin, employee)) {
    recordAuthenticationFailure(req);
    return res.status(401).json({
      message: "Usuario o PIN incorrecto."
    });
  }

  clearAuthenticationFailures(req);
  writeSessionCookie(res, createAuthSession(employee));
  res.json({
    ok: true,
    user: access.sessionUser(employee),
    settings: getPublicSettings(settings)
  });
});

app.post("/api/auth/logout", (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
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
    user: access.sessionUser(user),
    settings: getPublicSettings()
  });
});

app.put("/api/settings", (req, res) => {
  const authenticatedAdmin = requireAdminUser(req, res);
  if (!authenticatedAdmin) return;

  const current = readSettings();
  let adminContact;
  try { if (req.body?.adminContact !== undefined) adminContact = configuration.normalizeContact(req.body.adminContact); }
  catch(error) { return res.status(400).json({message:error.message}); }
  const newPin = String(req.body?.newAdminPin || "").trim();
  const currentAdminPin = String(req.body?.currentAdminPin || "").trim();
  const requestedUsers = Array.isArray(req.body?.users) ? req.body.users : current.users;
  if (req.body.users !== undefined && !Array.isArray(req.body.users)) validate.invalid('Lista de usuarios inválida.');
  if (requestedUsers.some(user => user?.active !== undefined && typeof user.active !== 'boolean')) validate.invalid('Estado de usuario inválido.');
  if (requestedUsers.find(user => user?.role === 'admin')?.active === false) validate.invalid('No se puede desactivar la cuenta administrativa.');
  const requestedIds = requestedUsers.map(user => String(user?.id || ''));
  const requestedNames = requestedUsers.map(user => String(user?.name || '').trim().toLocaleLowerCase('es-MX'));
  if(requestedUsers.find(user=>user?.role==='admin')?.id!==current.users.find(user=>user.role==='admin')?.id) return res.status(400).json({message:'No se puede sustituir la identidad del administrador.'});
  if (requestedUsers.length > 100 || requestedUsers.some(user => !user || !['admin','employee'].includes(user.role) || typeof user.name !== 'string' || !user.name.trim() || user.name.length > 60 || !/^[a-zA-Z0-9_-]{1,80}$/.test(String(user.id || ''))) || new Set(requestedIds).size !== requestedIds.length || new Set(requestedNames).size !== requestedNames.length || requestedUsers.filter(user => user.role === 'admin').length !== 1) return res.status(400).json({message:'Usuarios inválidos: revisa nombres, identificadores y duplicados.'});
  const employeePins = req.body?.employeePins && typeof req.body.employeePins === "object"
    ? req.body.employeePins
    : {};

  if (newPin && !PIN_PATTERN.test(newPin)) {
    return res.status(400).json({
      message: "El PIN nuevo debe tener de 6 a 12 dígitos."
    });
  }

  if (current.adminPinChangeRequired && !newPin) {
    return res.status(400).json({
      message: "Por seguridad debes cambiar el PIN de administrador antes de continuar."
    });
  }

  if (newPin && !isAdminPin(currentAdminPin)) {
    return res.status(401).json({
      message: "El PIN actual de administrador es incorrecto."
    });
  }

  const adminUser = requestedUsers.find((user) => user?.role === "admin");
  const employeeUsers = requestedUsers.filter((user) => user?.role !== "admin");

  if (!String(adminUser?.name || "").trim()) {
    return res.status(400).json({
      message: "El nombre del administrador es obligatorio."
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

      if (employeePin && !PIN_PATTERN.test(employeePin)) {
        const error = new Error(`El PIN de ${requestedUser?.name || "empleado"} debe tener de 6 a 12 dígitos.`);
        error.statusCode = 400;
        throw error;
      }

      if ((!existing || current.employeePinChangeRequired) && !employeePin) {
        const error = new Error(
          current.employeePinChangeRequired
            ? `Actualiza el PIN de ${requestedUser?.name || "cada empleado"} antes de continuar.`
            : `Asigna un PIN inicial a ${requestedUser?.name || "el empleado nuevo"}.`
        );
        error.statusCode = 400;
        throw error;
      }

      const normalizedEmployee = normalizeUser(
        { ...requestedUser, role: "employee", active: requestedUser.active === undefined ? existing?.active !== false : requestedUser.active },
        existing || {}
      );

      if (employeePin) {
        Object.assign(normalizedEmployee, createPinSecret(employeePin));
      }
      normalizedEmployee.active = requestedUser.active === undefined ? existing?.active !== false : requestedUser.active;

      return normalizedEmployee;
    })
    ];
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      message: error.message || "No se pudieron guardar los usuarios."
    });
  }

  const settings = withDataTransaction(() => {
    if (adminContact) configuration.saveProfile(authenticatedAdmin.id, adminContact);
    const newAdminSecret = newPin ? createPinSecret(newPin) : null;
    const savedSettings = writeSettings({
      ...current,
      securityVersion: 3,
      setupCompleted: true,
      users: normalizedUsers,
      ...(newAdminSecret
        ? {
            adminPinSalt: newAdminSecret.pinSalt,
            adminPinHash: newAdminSecret.pinHash
          }
        : {}),
      adminPinChangeRequired: newPin ? false : current.adminPinChangeRequired,
      employeePinChangeRequired: false
    });

    recordAuditEvent("users_updated", "settings", "current", authenticatedAdmin, {
      userCount: normalizedUsers.length,
      adminPinChanged: Boolean(newPin),
      employeePinsChanged: Object.keys(employeePins).length
    });
    for (const next of normalizedUsers) {
      const previous = current.users.find(user => user.id === next.id);
      if (previous && previous.active !== next.active) recordAuditEvent(next.active ? 'user_activated' : 'user_deactivated', 'user', next.id, authenticatedAdmin, {active:next.active});
    }
    return savedSettings;
  });

  const revoked = new Set(current.users.filter(user => !settings.users.some(next => next.id === user.id && next.active !== false)).map(user => user.id));
  for (const [token, session] of authSessions) if (revoked.has(session.userId)) authSessions.delete(token);
  for (const [token, grant] of manualWeightAuthorizations) if (revoked.has(grant.operatorId)) manualWeightAuthorizations.delete(token);
  access.notifyUsers(revoked);
  res.json(getPublicSettings(settings));
});

app.get("/api/products", (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;

  res.json(readJson(productsPath, []));
});

require('./catalog-operations').registerCatalog({app,database,dataDir,requireAdminUser,requireSessionUser,normalizeProductPayload,readJson,writeJson,productsPath,inventoryEntriesPath,withDataTransaction,recordAuditEvent});

app.get("/api/sales", (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;

  const sales = readJson(salesPath, []);
  const visibleSales = user.role === "admin"
    ? sales
    : sales.filter((sale) => sale.operator?.id === user.id);

  if(req.query.context==='pos')return res.json(visibleSales.slice(-1).map(sale=>({id:sale.id,createdAt:sale.createdAt,status:sale.status,items:[]})));

  res.json(visibleSales.map((sale) => serializeSaleForUser(sale, user)));
});

app.get("/api/sales/:id", (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;

  const sales = readJson(salesPath, []);
  const sale = sales.find((item) => item.id === req.params.id);

  if (!sale) {
    return res.status(404).json({
      message: "Venta no encontrada."
    });
  }

  if (user.role !== "admin" && sale.operator?.id !== user.id) {
    return res.status(403).json({
      message: "No tienes permiso para consultar esta venta."
    });
  }

  res.json(serializeSaleForUser(sale, user));
});

function getOperationalDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function visibleCashSessions(user, sessions = readCashSessions()) {
  const businessDate = getOperationalDate();
  return user.role === "admin" ? sessions : sessions.filter(session => session.status === "open" || session.businessDate === businessDate);
}

app.get("/api/cash-sessions", (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;

  const sessions = readCashSessions();
  const sales = readJson(salesPath, []);
  const visibleSessions = visibleCashSessions(user, sessions);

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

  if(user.role!=='admin'&&!access.allows(user,['cash']))return res.json({session:current?{id:current.id,status:current.status,businessDate:current.businessDate}:null});

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

  const openingAmount = validate.number(req.body.openingAmount === undefined ? 0 : req.body.openingAmount, 'Fondo inicial');
  const businessDate = validate.date(req.body.businessDate === undefined ? getOperationalDate() : req.body.businessDate, 'Fecha de apertura');

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

  withDataTransaction(() => {
    sessions.push(session);
    writeCashSessions(sessions);
    recordAuditEvent("cash_session_opened", "cash_session", session.id, user, {
      openingAmount: session.openingAmount,
      businessDate: session.businessDate
    });
  });

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

  const type = req.body.type;
  if (!['in', 'out'].includes(type)) validate.invalid('Tipo de movimiento inválido.');
  const amount = validate.number(req.body.amount, 'Importe del movimiento');
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

  withDataTransaction(() => {
    sessions[sessionIndex].movements.push(movement);
    calculateCashSessionSummary(sessions[sessionIndex]);
    writeCashSessions(sessions);
    recordAuditEvent("cash_movement_added", "cash_session", sessions[sessionIndex].id, user, {
      movementId: movement.id,
      type,
      amount,
      reason
    });
  });

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

  const countedCash = validate.number(req.body.countedCash, 'Efectivo contado');
  if (req.body.denominations !== undefined && req.body.denominations !== null) {
    validate.object(req.body.denominations, 'Desglose de efectivo');
    for (const [denomination, count] of Object.entries(req.body.denominations)) {
      const value = validate.number(denomination, 'Denominación');
      if (value <= 0) validate.invalid('Denominación inválida.');
      const units = validate.number(count, 'Cantidad de billetes o monedas', { decimals: 0, integer: true });
      validate.number(value * units, 'Subtotal de denominación');
    }
  }
  if (!Number.isFinite(Number(req.body?.countedCash)) || countedCash < 0) {
    return res.status(400).json({ message: "Captura el efectivo contado correctamente." });
  }

  const summary = calculateCashSessionSummary(session);
  const difference = validate.number(countedCash - summary.expectedCash, 'Diferencia de caja', {min:-Number.MAX_VALUE});

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

  withDataTransaction(() => {
    writeCashSessions(sessions);
    recordAuditEvent("cash_session_closed", "cash_session", sessions[sessionIndex].id, user, {
      countedCash,
      expectedCash: summary.expectedCash,
      difference
    });
  });
  res.json(serializeCashSession(sessions[sessionIndex]));
});

// Compatibilidad de lectura con versiones anteriores del frontend.
app.get("/api/cash-shifts", (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  if (!access.allows(user,['cash'])) return res.status(403).json({message:'No tienes autorización para consultar caja.'});
  res.json(visibleCashSessions(user).map((session) => serializeCashSession(session)));
});

app.put("/api/cash-shifts", (req, res) => {
  res.status(410).json({
    message: "La caja ahora se administra con sesiones y movimientos protegidos en el servidor."
  });
});

function checkoutIdentity(body) {
  const id = body.checkoutIntentId;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(id)) validate.invalid('Falta un identificador válido de intención de cobro.');
  return id;
}

function checkoutFingerprint(body) {
  return crypto.createHash('sha256').update(JSON.stringify({
    items: Array.isArray(body.items) ? body.items.map(item => [item?.productId, item?.quantity, item?.source || 'manual', item?.manualAuthorization || null]) : body.items,
    cashSessionId: body.cashSessionId, businessDate: body.businessDate || null,
    paymentMethod: body.paymentMethod || 'efectivo', reference: body.paymentDetails?.reference || body.paymentReference || '',
    discount: body.discount ?? 0, discountReason: body.discountReason || '', invoiceRequested: body.invoiceRequested ?? false
  })).digest('hex');
}

app.post('/api/authorizations/manual-weight', limitAuthenticationAttempts, (req, res) => {
  const operator = requireSessionUser(req, res);
  if (!operator) return;
  const pin = typeof req.body.pin === 'string' ? req.body.pin.trim() : '';
  if (!PIN_PATTERN.test(pin) || !isAdminPin(pin)) {
    recordAuthenticationFailure(req);
    return res.status(401).json({ message: 'PIN de administrador incorrecto.' });
  }
  const reason=validate.text(req.body.reason,'Motivo del pesaje manual',80);
  const explanation=validate.text(req.body.explanation??'','Explicación del pesaje',300,{optional:true});
  if(!['sin_conexion','lectura_inestable','falla_bascula','otro'].includes(reason)||reason==='otro'&&explanation.length<4)validate.invalid('Otro requiere explicación de al menos 4 caracteres.');
  const intentId = checkoutIdentity(req.body);
  const product = readJson(productsPath, []).find(item => item.id === req.body.productId && item.active !== false);
  if (!product || product.unit !== 'kg') validate.invalid('Selecciona un producto por kilogramo válido.');
  const quantity = validate.number(req.body.quantity, 'Peso manual', { decimals: 3 });
  if (quantity < 0.1 || quantity > 40) validate.invalid('Peso permitido: 0.100 a 40 kg.');
  const current = getOpenCashSession();
  if (req.body.cashSessionId !== undefined && req.body.cashSessionId !== null && req.body.cashSessionId !== current?.id) return res.status(409).json({message:'La caja cambió. Recupera su estado antes de autorizar.'});
  if(!current)return res.status(409).json({message:'Abre caja antes de autorizar una captura manual.'});
  const now = Date.now();
  for (const [token, grant] of manualWeightAuthorizations) if (grant.expiresAt <= now) manualWeightAuthorizations.delete(token);
  if (manualWeightAuthorizations.size >= 1000) return res.status(429).json({message:'Demasiadas autorizaciones pendientes. Intenta más tarde.'});
  const administrator = readSettings().users.find(user => user.role === 'admin' && user.active !== false);
  const token = crypto.randomBytes(32).toString('base64url');
  const grant = { operatorId:operator.id, sessionToken:getCookies(req).el_muelle_session, administratorId:administrator.id,
    intentId, productId:product.id, quantity, reason, explanation, cashSessionId:current?.id || null, expiresAt:now + 5 * 60 * 1000 };
  withDataTransaction(() => recordAuditEvent('manual_weight_authorized', 'checkout', intentId, administrator, {
    operatorId:operator.id, productId:product.id, quantity, reason, explanation
  }));
  manualWeightAuthorizations.set(token, grant);
  clearAuthenticationFailures(req);
  res.json({ token, expiresAt:new Date(grant.expiresAt).toISOString() });
});

app.post("/api/sales", (req, res) => {
  const operator = getSessionUser(req);

  if (!operator) {
    return res.status(401).json({
      message: "La sesión venció. Inicia sesión nuevamente antes de vender."
    });
  }

  try {
    let replayed = false;
    const consumedAuthorizations = new Set();
    const sale = withDataTransaction(() => {
      const intentId = checkoutIdentity(req.body);
      const intentKey = operator.id + ':' + intentId;
      const fingerprint = checkoutFingerprint(req.body);
      const confirmed = database.readDocument('checkout-intents', intentKey);
      if (confirmed) {
        if (confirmed.fingerprint !== fingerprint) { const error = new Error('Esta intención de cobro ya confirmó otra operación.'); error.statusCode = 409; error.code = 'CHECKOUT_INTENT_CONFLICT'; throw error; }
        const storedSale = readJson(salesPath, []).find(item => item.id === confirmed.saleId && item.operator?.id === operator.id);
        if (!storedSale) { const error = new Error('La intención confirmada requiere revisión técnica; no se creó otra venta.'); error.statusCode = 409; throw error; }
        replayed = true;
        return storedSale;
      }
      const products = readJson(productsPath, []);
      const items = buildSaleItems(req.body?.items, products);
      const cashSessions = readCashSessions();
      const activeCashSession = getOpenCashSession(cashSessions);

      if (!activeCashSession) {
        const error = new Error("La caja está cerrada. Abre caja antes de guardar la venta.");
        error.statusCode = 409;
        throw error;
      }

      if (typeof req.body.cashSessionId !== 'string' || req.body.cashSessionId !== activeCashSession.id || (req.body.businessDate !== undefined && req.body.businessDate !== activeCashSession.businessDate)) {
        const error = new Error('La caja indicada no corresponde a la caja abierta. Actualiza y revisa el turno antes de cobrar.');
        error.statusCode = 409;
        throw error;
      }
      for (let index = 0; index < items.length; index++) {
        const item = items[index], submitted = req.body.items[index];
        if (submitted.manualAuthorization !== undefined && (item.unit !== 'kg' || item.source !== 'manual')) validate.invalid('La autorización manual no corresponde al origen de esta captura.');
        if (item.unit !== 'kg' || item.source !== 'manual') continue;
        const token = submitted.manualAuthorization;
        const grant = typeof token === 'string' ? manualWeightAuthorizations.get(token) : null;
        if (true) {
          if (!grant || grant.operatorId !== operator.id || grant.sessionToken !== getCookies(req).el_muelle_session || grant.intentId !== intentId || grant.productId !== item.productId || grant.quantity !== item.quantity || grant.expiresAt <= Date.now() || grant.cashSessionId !== activeCashSession.id || consumedAuthorizations.has(token)) {
            const error = new Error('El peso manual requiere una autorización administrativa vigente para esta captura.'); error.statusCode = 403; throw error;
          }
          consumedAuthorizations.add(token);
          item.manualAuthorizedBy = grant.administratorId;
          item.manualReason = grant.reason; item.manualExplanation = grant.explanation;
        }
      }

      const subtotal = validate.number(items.reduce((sum, item) => sum + item.total, 0), 'Subtotal');
      const requestedDiscount = Number(req.body.discount ?? 0);
      const discount = validate.number(req.body.discount === undefined ? 0 : req.body.discount, 'Descuento');
      const discountReason = validate.text(req.body.discountReason, 'Motivo del descuento', 180, { optional:true });

      if (!Number.isFinite(requestedDiscount) || discount < 0 || discount > subtotal) {
        const error = new Error("El descuento no es válido.");
        error.statusCode = 400;
        throw error;
      }
      if (discount > 0 && operator.role !== "admin") {
        const error = new Error("Solo el administrador puede aplicar descuentos.");
        error.statusCode = 403;
        throw error;
      }
      if (discount > 0 && discountReason.length < 4) {
        const error = new Error("Indica el motivo del descuento.");
        error.statusCode = 400;
        throw error;
      }

      const paymentMethod = req.body.paymentMethod === undefined ? 'efectivo' : req.body.paymentMethod;
      if (!['efectivo', 'tarjeta', 'transferencia'].includes(paymentMethod)) validate.invalid('Método de pago inválido.');
      if (req.body.paymentDetails !== undefined) validate.object(req.body.paymentDetails, 'Datos de pago');
      if (req.body.invoiceRequested !== undefined) validate.boolean(req.body.invoiceRequested, 'Solicitud de factura');
      const paymentReference = validate.text(req.body.paymentDetails?.reference ?? req.body.paymentReference, 'Referencia', 80, { optional:true });
      if ((paymentMethod === "tarjeta" || paymentMethod === "transferencia") && !paymentReference) {
        const error = new Error("La referencia de pago es obligatoria para tarjeta o transferencia.");
        error.statusCode = 400;
        throw error;
      }

      const total = roundMoney(subtotal - discount);
      const profitSummary = calculateSaleProfit(items, total);
      validate.number(profitSummary.totalCost, 'Costo total');
      validate.number(profitSummary.grossProfit, 'Ganancia de venta', {min:-Number.MAX_VALUE});
      const sales = readJson(salesPath, []);
      const now = new Date().toISOString();
      const sale = {
        id: getNextSaleId(sales),
        createdAt: now,
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
        discountReason: discount > 0 ? discountReason : "",
        total,
        totalCost: profitSummary.totalCost,
        grossProfit: profitSummary.grossProfit,
        profitMarginPercent: profitSummary.profitMarginPercent,
        invoice: {
          status: req.body?.invoiceRequested ? "pendiente_datos" : "no_solicitada",
          requestedAt: req.body?.invoiceRequested ? now : null,
          customer: null,
          notes: req.body?.invoiceRequested
            ? "El cliente pidió factura en caja. Faltan datos fiscales."
            : "El cliente no solicitó factura en caja."
        }
      };

      sales.push(sale);
      calculateCashSessionSummary(activeCashSession, sales);
      const inventoryChanged = updateInventoryAfterSale(items, products);
      writeJson(salesPath, sales);
      if (inventoryChanged) writeJson(productsPath, products);
      database.saveDocument('checkout-intents', intentKey, { saleId:sale.id, fingerprint, operatorId:operator.id });
      recordAuditEvent("sale_completed", "sale", sale.id, operator, {
        itemCount: items.length,
        subtotal,
        discount,
        discountReason: sale.discountReason,
        total,
        paymentMethod,
        cashSessionId: activeCashSession.id,
        manualAuthorizations: items.filter(item => item.manualAuthorizedBy).map(item => ({productId:item.productId,authorizedBy:item.manualAuthorizedBy,quantity:item.quantity}))
      });
      return sale;
    });

    if (!replayed) for (const token of consumedAuthorizations) manualWeightAuthorizations.delete(token);
    res.set('Idempotent-Replayed', String(replayed));
    res.status(replayed ? 200 : 201).json(serializeSaleForUser(sale, operator));
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      message: error.message || "No se pudo guardar la venta.", ...(error.code ? {code:error.code} : {})
    });
  }
});

app.patch("/api/sales/:id/invoice", (req, res) => {
  const user = requireAdminUser(req, res);
  if (!user) return;

  const sales = readJson(salesPath, []);
  const saleIndex = sales.findIndex((item) => item.id === req.params.id);

  if (saleIndex === -1) {
    return res.status(404).json({
      message: "Venta no encontrada."
    });
  }

  if (sales[saleIndex].status === 'cancelada') return res.status(409).json({message:'No se puede solicitar factura de una venta cancelada.'});
  if (sales[saleIndex].invoice?.status === 'solicitada') return res.status(409).json({message:'Esta venta ya tiene una solicitud registrada.'});

  const rfc = validate.text(req.body.rfc, 'RFC', 13).toUpperCase();
  const businessName = validate.text(req.body.businessName, 'Nombre fiscal', 160);
  const fiscalZip = validate.text(req.body.fiscalZip, 'Código postal fiscal', 5);
  const fiscalRegime = validate.text(req.body.fiscalRegime, 'Régimen fiscal', 10);
  const cfdiUse = validate.text(req.body.cfdiUse, 'Uso de CFDI', 10);
  const email = validate.text(req.body.email, 'Correo', 120, { optional:true });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) validate.invalid('El correo electrónico no es válido.');

  if (!rfc || !businessName || !fiscalZip || !fiscalRegime || !cfdiUse) {
    return res.status(400).json({
      message: "Faltan datos fiscales obligatorios."
    });
  }

  if (!/^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/i.test(rfc) || !/^\d{5}$/.test(fiscalZip)) {
    return res.status(400).json({ message: "El RFC o código postal fiscal no son válidos." });
  }

  withDataTransaction(() => {
    sales[saleIndex].invoice = {
      status: "solicitada",
      requestedAt: new Date().toISOString(),
      customerEncrypted: encryptSensitivePayload({
        rfc,
        businessName,
        fiscalZip,
        fiscalRegime,
        cfdiUse,
        email
      }),
      notes: "Solicitud registrada. Pendiente de timbrado CFDI real."
    };

    writeJson(salesPath, sales);
    recordAuditEvent("invoice_request_saved", "sale", sales[saleIndex].id, user, {
      invoiceStatus: "solicitada"
    });
  });

  res.json(serializeSaleForUser(sales[saleIndex], user));
});

app.patch("/api/sales/:id/cancel", (req, res) => {
  const cancelUser = requireAdminUser(req, res);
  if (!cancelUser) return;

  const sales = readJson(salesPath, []);
  const saleIndex = sales.findIndex((item) => item.id === req.params.id);

  if (saleIndex === -1) {
    return res.status(404).json({
      message: "Venta no encontrada."
    });
  }

  if (sales[saleIndex].status === "cancelada") {
    return res.status(400).json({
      message: "La venta ya está cancelada."
    });
  }

  const cancelReason = sanitizeText(req.body?.reason || "", 180);
  if (cancelReason.length < 4) {
    return res.status(400).json({ message: "Indica un motivo de cancelación de al menos 4 caracteres." });
  }

  withDataTransaction(() => {
    const canceledSale = sales[saleIndex];
    const products = readJson(productsPath, []);
    let inventoryChanged = false;

    canceledSale.items.forEach((item, index) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product || typeof product.stockQuantity !== 'number') {
        const id=canceledSale.id+':'+item.productId+':'+index;
        if(!database.readDocument('inventory-restitutions',id)){database.saveDocument('inventory-restitutions',id,{id,saleId:canceledSale.id,productId:item.productId,quantity:item.quantity,unit:item.unit,status:'pending',createdAt:new Date().toISOString(),reason:cancelReason});recordAuditEvent('inventory_restitution_pending','product',item.productId,cancelUser,{saleId:canceledSale.id,quantity:item.quantity,reason:cancelReason});}
        return;
      }
      product.stockQuantity = validate.number(product.stockQuantity + item.quantity, 'Existencia repuesta', {decimals:3});
      product.updatedAt = new Date().toISOString();
      inventoryChanged = true;
    });

    sales[saleIndex] = {
      ...canceledSale,
      status: "cancelada",
      canceledAt: new Date().toISOString(),
      canceledBy: { id: cancelUser.id, name: cancelUser.name, role: cancelUser.role },
      cancelReason,
      updatedAt: new Date().toISOString()
    };

    writeJson(salesPath, sales);
    if (inventoryChanged) writeJson(productsPath, products);
    recordAuditEvent("sale_canceled", "sale", sales[saleIndex].id, cancelUser, {
      reason: cancelReason,
      inventoryRestored: inventoryChanged,
      total: sales[saleIndex].total
    });
  });

  res.json(serializeSaleForUser(sales[saleIndex], cancelUser));
});

app.get("/api/audit-events", (req, res) => {
  const user = requireAdminUser(req, res);
  if (!user) return;

  res.json(
    database.readAuditEvents({
      limit: req.query?.limit,
      entityType: sanitizeText(req.query?.entityType, 60) || null,
      entityId: sanitizeText(req.query?.entityId, 120) || null
    })
  );
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

const configuration = require('./configuration').registerConfiguration({app,database,requireAdminUser,requireSessionUser,encryptSensitivePayload,decryptSensitivePayload,recordAuditEvent});

app.use((error, _req, res, _next) => {
  res.status(error.statusCode || (error.type === 'entity.parse.failed' ? 400 : 500)).json({ message:error.statusCode ? error.message : 'No se pudo completar la operación.' });
});

const httpServer = app.listen(PORT, HOST, () => {
  console.log("");
  console.log("=======================================");
  console.log(" El Muelle POS iniciado correctamente");
  console.log(` Abre: ${REQUIRE_HTTPS ? "https" : "http"}://${HOST}:${PORT}`);
  console.log("=======================================");
  console.log("");
});
require('./lifecycle').registerShutdown({server:httpServer,database,storage});
httpServer.on('error', () => {
  console.error('No se pudo iniciar el servidor local. Revisa el puerto y los permisos.');
  try { database.close(); } finally { process.exit(1); }
});
