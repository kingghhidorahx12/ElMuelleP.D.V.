const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PIN = process.env.ADMIN_PIN || "1234";

const dataDir = path.join(__dirname, "..", "data");
const productsPath = path.join(dataDir, "products.json");
const salesPath = path.join(dataDir, "sales.json");
const cashShiftsPath = path.join(dataDir, "cash-shifts.json");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

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

app.get("/api/cash-shifts", (req, res) => {
  res.json(readJson(cashShiftsPath, []));
});

app.put("/api/cash-shifts", (req, res) => {
  const shifts = Array.isArray(req.body?.shifts)
    ? req.body.shifts
    : Array.isArray(req.body)
      ? req.body
      : [];

  const normalizedShifts = shifts
    .filter((shift) => shift && shift.id && shift.date)
    .map((shift) => ({
      id: String(shift.id),
      date: String(shift.date),
      status: shift.status === "closed" ? "closed" : "open",
      openingAmount: roundMoney(shift.openingAmount || 0),
      openedAt: shift.openedAt || new Date().toISOString(),
      closedAt: shift.closedAt || null,
      expectedCash:
        shift.expectedCash === null || shift.expectedCash === undefined
          ? null
          : roundMoney(shift.expectedCash),
      countedAmount:
        shift.countedAmount === null || shift.countedAmount === undefined
          ? null
          : roundMoney(shift.countedAmount),
      difference:
        shift.difference === null || shift.difference === undefined
          ? null
          : roundMoney(shift.difference),
      denominations: shift.denominations || null
    }));

  writeJson(cashShiftsPath, normalizedShifts);
  res.json(normalizedShifts);
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
  const cashShiftId = String(req.body.cashShiftId || "").trim() || null;
  const cashShiftDate = String(req.body.cashShiftDate || "").trim() || null;

  const sale = {
    id: getNextSaleId(sales),
    createdAt: new Date().toISOString(),
    status: "completada",
    cashShiftId,
    cashShiftDate,
    items,
    paymentMethod,
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

  if (String(req.body.adminPin || "").trim() !== ADMIN_PIN) {
    return res.status(401).json({
      message: "PIN de administrador incorrecto."
    });
  }

  if (sales[saleIndex].status === "cancelada") {
    return res.status(400).json({
      message: "La venta ya está cancelada."
    });
  }

  sales[saleIndex] = {
    ...sales[saleIndex],
    status: "cancelada",
    canceledAt: new Date().toISOString(),
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
