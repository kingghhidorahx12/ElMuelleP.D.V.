const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

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
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function main() {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "el-muelle-pos-test-"));
  const sourceDataDir = path.join(rootDir, "data");
  const output = [];
  let server;

  try {
    fs.cpSync(sourceDataDir, tempDataDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempDataDir, "settings.json"),
      JSON.stringify(
        {
          adminPin: "2468",
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
        PORT: String(port),
        DATA_DIR: tempDataDir,
        ADMIN_PIN: "2468"
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
      body: JSON.stringify({ pin: "2468" })
    });
    assert.equal(adminLogin.response.status, 200);
    assert.ok(adminLogin.body.sessionToken);
    const adminHeaders = {
      "Content-Type": "application/json",
      "X-Session-Token": adminLogin.body.sessionToken
    };

    const migratedSettings = JSON.parse(
      fs.readFileSync(path.join(tempDataDir, "settings.json"), "utf8")
    );
    assert.equal(Object.hasOwn(migratedSettings, "adminPin"), false);
    assert.ok(migratedSettings.adminPinSalt && migratedSettings.adminPinHash);

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
      body: JSON.stringify({ userId: "mostrador", pin: "0000" })
    });
    assert.equal(employeeLogin.response.status, 200);
    const employeeHeaders = {
      "Content-Type": "application/json",
      "X-Session-Token": employeeLogin.body.sessionToken
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
