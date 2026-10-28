const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const rootDir = path.resolve(__dirname, "..");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl, processHandle) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error("El servidor se cerró antes de iniciar.");
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }

    await delay(100);
  }

  throw new Error("El servidor no respondió a tiempo.");
}

async function request(baseUrl, pathname, options = {}) {
  if (pathname === '/api/sales' && options.method === 'POST' && options.body) options = {...options, body:JSON.stringify(await require('./checkout-test-client').completeCheckout(baseUrl, JSON.parse(options.body), options.headers))};
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = await response.json().catch(() => null);
  const setCookie = response.headers.get("set-cookie") || "";
  return {
    response,
    body,
    cookie: setCookie ? setCookie.split(";")[0] : ""
  };
}

async function verifyInitialOwnerSetup() {
  const setupDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "el-muelle-pos-setup-"));
  let setupServer;

  try {
    fs.copyFileSync(path.join(rootDir, "data", "products.json"), path.join(setupDataDir, "products.json"));
    const port = await getAvailablePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    setupServer = spawn(process.execPath, ["src/server.js"], {
      cwd: rootDir,
      env: {
        ...process.env,
        HOST: "127.0.0.1", NODE_ENV: "test", NODE_OPTIONS: "", REQUIRE_HTTPS: "false", CORS_ORIGIN: "",
        PORT: String(port),
        DATA_DIR: setupDataDir,
        ENV_FILE: path.join(setupDataDir, "missing.env"),
        ADMIN_PIN: "",
        EMPLOYEE_PIN: "",
        DATA_ENCRYPTION_KEY: ""
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    await waitForServer(baseUrl, setupServer);

    const setupPage = await fetch(baseUrl);
    assert.equal(setupPage.status, 200);
    assert.match(await setupPage.text(), /setupOwnerSubmitBtn/);

    const initialSettings = await request(baseUrl, "/api/settings");
    assert.equal(initialSettings.response.status, 200);
    assert.equal(initialSettings.body.setupRequired, true);
    assert.deepEqual(initialSettings.body.users, []);
    assert.ok(fs.existsSync(path.join(setupDataDir, ".secrets.json")));

    const ownerSetup = await request(baseUrl, "/api/setup/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dueño de prueba", pin: "864209" })
    });
    assert.equal(ownerSetup.response.status, 201);
    assert.ok(ownerSetup.cookie.startsWith("el_muelle_session="));
    assert.equal(ownerSetup.body.settings.setupRequired, false);
    assert.deepEqual(ownerSetup.body.settings.users.map((user) => user.role), ["admin"]);

    const ownerHeaders = {
      "Content-Type": "application/json",
      Cookie: ownerSetup.cookie
    };
    const ownerOnlySettings = await request(baseUrl, "/api/settings", {
      method: "PUT",
      headers: ownerHeaders,
      body: JSON.stringify({
        users: [{ id: "admin", name: "Dueño de prueba", role: "admin", active: true }]
      })
    });
    assert.equal(ownerOnlySettings.response.status, 200);
    assert.deepEqual(ownerOnlySettings.body.users.map((user) => user.role), ["admin"]);

    const secondSetup = await request(baseUrl, "/api/setup/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Intruso", pin: "135790" })
    });
    assert.equal(secondSetup.response.status, 409);
  } finally {
    if (setupServer && setupServer.exitCode === null) {
      setupServer.kill();
      await Promise.race([
        new Promise((resolve) => setupServer.once("exit", resolve)),
        delay(1500)
      ]);
    }
    fs.rmSync(setupDataDir, { recursive: true, force: true });
  }
}

async function main() {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "el-muelle-pos-test-"));
  const sourceDataDir = path.join(rootDir, "data");
  const output = [];
  let server;

  try {
    await verifyInitialOwnerSetup();
    // Copy only the public catalog, never operational SQLite, secrets or records.
    fs.copyFileSync(path.join(sourceDataDir, "products.json"), path.join(tempDataDir, "products.json"));
    fs.writeFileSync(
      path.join(tempDataDir, "settings.json"),
      JSON.stringify(
        {
          adminPin: "246810",
          users: [
            { id: "admin", name: "Administrador", role: "admin", active: true },
            { id: "mostrador", name: "Encargado", role: "employee", active: true }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const port = await getAvailablePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ["src/server.js"], {
      cwd: rootDir,
      env: {
        ...process.env,
        HOST: "127.0.0.1", NODE_ENV: "test", NODE_OPTIONS: "", REQUIRE_HTTPS: "false", CORS_ORIGIN: "",
        PORT: String(port),
        DATA_DIR: tempDataDir,
        ENV_FILE: path.join(tempDataDir, "missing.env"),
        ADMIN_PIN: "246810",
        EMPLOYEE_PIN: "135790",
        DATA_ENCRYPTION_KEY: "security-smoke-test-encryption-key-32-characters-minimum"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    server.stdout.on("data", (chunk) => output.push(chunk.toString()));
    server.stderr.on("data", (chunk) => output.push(chunk.toString()));
    await waitForServer(baseUrl, server);

    const unauthorizedProductRead = await request(baseUrl, "/api/products");
    assert.equal(unauthorizedProductRead.response.status, 401);

    const unauthorizedProductCreate = await request(baseUrl, "/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No autorizado" })
    });
    assert.equal(unauthorizedProductCreate.response.status, 401);

    const unauthorizedSalesRead = await request(baseUrl, "/api/sales");
    assert.equal(unauthorizedSalesRead.response.status, 401);

    const unauthorizedInvoiceUpdate = await request(baseUrl, "/api/sales/T-000001/invoice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(unauthorizedInvoiceUpdate.response.status, 401);

    const noCorsResponse = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://untrusted.example" }
    });
    assert.equal(noCorsResponse.headers.get("access-control-allow-origin"), null);

    const adminLogin = await request(baseUrl, "/api/auth/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "246810" })
    });
    assert.equal(adminLogin.response.status, 200);
    assert.ok(adminLogin.cookie.startsWith("el_muelle_session="));
    const adminHeaders = {
      "Content-Type": "application/json",
      Cookie: adminLogin.cookie
    };

    const legacySettings = JSON.parse(
      fs.readFileSync(path.join(tempDataDir, "settings.json"), "utf8")
    );
    assert.equal(Object.hasOwn(legacySettings, "adminPin"), false);
    const settingsDb = new DatabaseSync(path.join(tempDataDir, "el-muelle-pos.sqlite"));
    const storedSettings = settingsDb
      .prepare("SELECT payload FROM documents WHERE collection = ? AND document_id = ?")
      .get("settings", "current");
    const migratedSettings = JSON.parse(storedSettings.payload);
    assert.ok(migratedSettings.adminPinSalt && migratedSettings.adminPinHash);
    settingsDb.close();

    const adminProductRead = await request(baseUrl, "/api/products", {
      headers: adminHeaders
    });
    assert.equal(adminProductRead.response.status, 200);

    const adminProductCreate = await request(baseUrl, "/api/products", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        name: `Producto de prueba ${Date.now()}`,
        category: "Pruebas",
        unit: "pieza",
        price: 12.5,
        costPrice: 5,
        stockQuantity: 10,
        minStock: 2,
        active: true
      })
    });
    assert.equal(adminProductCreate.response.status, 201);

    const employeeLogin = await request(baseUrl, "/api/auth/employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "mostrador", pin: "135790" })
    });
    assert.equal(employeeLogin.response.status, 200);
    const employeeHeaders = {
      "Content-Type": "application/json",
      Cookie: employeeLogin.cookie
    };

    const employeeProductRead = await request(baseUrl, "/api/products", {
      headers: employeeHeaders
    });
    assert.equal(employeeProductRead.response.status, 200);

    const employeeProductCreate = await request(baseUrl, "/api/products", {
      method: "POST",
      headers: employeeHeaders,
      body: JSON.stringify({ name: "No autorizado" })
    });
    assert.equal(employeeProductCreate.response.status, 403);

    const employeeSalesRead = await request(baseUrl, "/api/sales", {
      headers: employeeHeaders
    });
    assert.equal(employeeSalesRead.response.status, 200);
    assert.ok(employeeSalesRead.body.every((sale) => sale.operator?.id === "mostrador"));

    const employeeInvoiceUpdate = await request(baseUrl, "/api/sales/T-000001/invoice", {
      method: "PATCH",
      headers: employeeHeaders,
      body: JSON.stringify({})
    });
    assert.equal(employeeInvoiceUpdate.response.status, 403);

    assert.match(noCorsResponse.headers.get("content-security-policy") || "", /script-src 'self'/);
    assert.equal(noCorsResponse.headers.get("x-content-type-options"), "nosniff");

    const headerOnlyRequest = await request(baseUrl, "/api/products", {
      headers: { "X-Session-Token": adminLogin.cookie }
    });
    assert.equal(headerOnlyRequest.response.status, 401);

    const protectedProduct = adminProductRead.body.find((product) => product.id === "camaron-chiapaneco");
    assert.ok(protectedProduct);

    const openCash = await request(baseUrl, "/api/cash-sessions/open", {
      method: "POST",
      headers: employeeHeaders,
      body: JSON.stringify({ openingAmount: 100, businessDate: "2026-07-17" })
    });
    assert.equal(openCash.response.status, 201);
    const manualIntent = require('node:crypto').randomUUID();
    const manualGrant = await request(baseUrl, '/api/authorizations/manual-weight', {
      method:'POST', headers:employeeHeaders,
      body:JSON.stringify({pin:'246810',productId:protectedProduct.id,quantity:1,checkoutIntentId:manualIntent,cashSessionId:openCash.body.id})
    });
    assert.equal(manualGrant.response.status,200);

    const fakeProductSale = await request(baseUrl, "/api/sales", {
      method: "POST",
      headers: employeeHeaders,
      body: JSON.stringify({
        items: [{ productId: "inventado", quantity: 1, price: 0 }],
        paymentMethod: "efectivo"
      })
    });
    assert.equal(fakeProductSale.response.status, 409);

    const unauthorizedDiscount = await request(baseUrl, "/api/sales", {
      method: "POST",
      headers: employeeHeaders,
      body: JSON.stringify({
        checkoutIntentId:manualIntent,
        items: [{
          productId: protectedProduct.id,
          source:'manual',manualAuthorization:manualGrant.body.token,
          name: "Precio manipulado",
          unit: "pieza",
          quantity: 1,
          price: 0,
          costPrice: 0
        }],
        paymentMethod: "efectivo",
        discount: protectedProduct.price,
        discountReason: "Prueba"
      })
    });
    assert.equal(unauthorizedDiscount.response.status, 403);

    const protectedSale = await request(baseUrl, "/api/sales", {
      method: "POST",
      headers: employeeHeaders,
      body: JSON.stringify({
        checkoutIntentId:manualIntent,
        items: [{
          productId: protectedProduct.id,
          source:'manual',manualAuthorization:manualGrant.body.token,
          name: "Precio manipulado",
          category: "Manipulada",
          unit: "pieza",
          quantity: 1,
          price: 0,
          costPrice: 0,
          total: 0
        }],
        paymentMethod: "efectivo",
        discount: 0
      })
    });
    assert.equal(protectedSale.response.status, 201);
    assert.equal(protectedSale.body.items[0].name, protectedProduct.name);
    assert.equal(protectedSale.body.items[0].price, protectedProduct.price);
    assert.equal(protectedSale.body.total, protectedProduct.price);

    const inventoryWithoutReason = await request(
      baseUrl,
      `/api/products/${protectedProduct.id}/inventory`,
      {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ stockQuantity: protectedProduct.stockQuantity, minStock: protectedProduct.minStock })
      }
    );
    assert.equal(inventoryWithoutReason.response.status, 400);

    const invoiceSaved = await request(baseUrl, `/api/sales/${protectedSale.body.id}/invoice`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({
        rfc: "XAXX010101000",
        businessName: "Público general",
        fiscalZip: "64000",
        fiscalRegime: "616",
        cfdiUse: "S01",
        email: "cliente@example.com"
      })
    });
    assert.equal(invoiceSaved.response.status, 200);
    assert.equal(invoiceSaved.body.invoice.customer.rfc, "XAXX010101000");

    const salesDb = new DatabaseSync(path.join(tempDataDir, "el-muelle-pos.sqlite"));
    const storedSale = salesDb
      .prepare("SELECT payload FROM documents WHERE collection = ? AND document_id = ?")
      .get("sales", protectedSale.body.id);
    assert.ok(storedSale.payload.includes("customerEncrypted"));
    assert.equal(storedSale.payload.includes("XAXX010101000"), false);
    salesDb.close();

    const canceledSale = await request(baseUrl, `/api/sales/${protectedSale.body.id}/cancel`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ reason: "Error de captura" })
    });
    assert.equal(canceledSale.response.status, 200);
    assert.equal(canceledSale.body.status, "cancelada");

    const restoredProducts = await request(baseUrl, "/api/products", { headers: adminHeaders });
    const restoredProduct = restoredProducts.body.find((product) => product.id === protectedProduct.id);
    assert.equal(restoredProduct.stockQuantity, protectedProduct.stockQuantity);

    const backupPath = path.join(
      tempDataDir,
      "backups",
      `el-muelle-pos-${new Date().toISOString().slice(0, 10)}.sqlite`
    );
    assert.ok(fs.existsSync(backupPath), "Debe existir el respaldo diario de SQLite");
    const restoredBackup = new DatabaseSync(backupPath);
    const backedUpSale = restoredBackup
      .prepare("SELECT payload FROM documents WHERE collection = ? AND document_id = ?")
      .get("sales", protectedSale.body.id);
    assert.equal(JSON.parse(backedUpSale.payload).status, "cancelada");
    restoredBackup.close();

    const auditEvents = await request(baseUrl, `/api/audit-events?entityId=${protectedSale.body.id}`, {
      headers: adminHeaders
    });
    assert.equal(auditEvents.response.status, 200);
    assert.ok(auditEvents.body.some((event) => event.event_type === "sale_completed"));
    assert.ok(auditEvents.body.some((event) => event.event_type === "sale_canceled"));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failedLogin = await request(baseUrl, "/api/auth/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "999999" })
      });
      assert.equal(failedLogin.response.status, 401);
    }
    const rateLimitedLogin = await request(baseUrl, "/api/auth/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "999999" })
    });
    assert.equal(rateLimitedLogin.response.status, 429);

    console.log("Security smoke test passed.");
  } finally {
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([
        new Promise((resolve) => server.once("exit", resolve)),
        delay(1500)
      ]);
    }

    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
