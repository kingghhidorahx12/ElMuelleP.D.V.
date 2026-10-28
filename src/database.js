const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const LEGACY_COLLECTIONS = [
  "products",
  "sales",
  "cash-shifts",
  "cash-sessions",
  "settings",
  "inventory-entries"
];

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

class PosDatabase {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.databasePath = path.join(dataDir, "el-muelle-pos.sqlite");
    this.backupDir = path.join(dataDir, "backups");
    this.transactionDepth = 0;
    this.transactionDirty = false;
    this.suppressBackups = true;
    this.backupStatus = { failed:false, lastAttempt:null, lastSuccess:null };

    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(this.databasePath, {
      enableForeignKeyConstraints: true
    });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        document_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, document_id)
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        actor_id TEXT,
        actor_name TEXT,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS audit_events_entity_idx
        ON audit_events(entity_type, entity_id, created_at DESC);
    `);

    this.migrateLegacyJsonOnce();
    this.suppressBackups = false;
  }

  collectionForPath(filePath) {
    return path.basename(filePath, ".json");
  }

  read(filePath, fallback) {
    const collection = this.collectionForPath(filePath);
    const rows = this.db
      .prepare(
        "SELECT document_id, payload FROM documents WHERE collection = ? ORDER BY document_id"
      )
      .all(collection);

    if (rows.length === 0) return fallback;

    try {
      if (collection === "settings") return JSON.parse(rows[0].payload);
      return rows.map((row) => JSON.parse(row.payload));
    } catch (error) {
      console.error("Error leyendo SQLite:", collection, error);
      return fallback;
    }
  }

  write(filePath, data) {
    const collection = this.collectionForPath(filePath);
    this.transaction(() => this.replaceCollection(collection, data));
  }

  readDocument(collection, id, fallback = null) {
    const row = this.db.prepare("SELECT payload FROM documents WHERE collection = ? AND document_id = ?").get(collection, id);
    return row ? JSON.parse(row.payload) : fallback;
  }

  saveDocument(collection, id, value) {
    this.db.prepare("INSERT INTO documents(collection, document_id, payload, updated_at) VALUES(?,?,?,?) ON CONFLICT(collection,document_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at")
      .run(collection, id, JSON.stringify(value), new Date().toISOString());
    this.transactionDirty = true;
  }

  replaceCollection(collection, data) {
    const now = new Date().toISOString();
    const entries = collection === "settings"
      ? [["current", data]]
      : (Array.isArray(data) ? data : []).map((item, index) => [
          String(item?.id || `${collection}-${index + 1}`),
          item
        ]);

    this.db.prepare("DELETE FROM documents WHERE collection = ?").run(collection);
    const insert = this.db.prepare(
      "INSERT INTO documents (collection, document_id, payload, updated_at) VALUES (?, ?, ?, ?)"
    );

    entries.forEach(([id, payload]) => {
      insert.run(collection, id, JSON.stringify(payload), now);
    });

    this.transactionDirty = true;
  }

  transaction(work) {
    const isOuterTransaction = this.transactionDepth === 0;
    if (isOuterTransaction) {
      this.transactionDirty = false;
      this.db.exec("BEGIN IMMEDIATE");
    }

    this.transactionDepth += 1;

    try {
      const result = work();
      if (isOuterTransaction) this.db.exec("COMMIT");
      return result;
    } catch (error) {
      if (isOuterTransaction) {
        // Conservar el error original incluso si SQLite ya abortó la transacción.
        try { this.db.exec("ROLLBACK"); } catch { /* No ocultar el fallo original. */ }
        this.transactionDirty = false;
      }
      throw error;
    } finally {
      this.transactionDepth -= 1;
      // El respaldo ocurre después del commit. Su fallo no convierte una operación
      // ya confirmada en un error que el cliente podría reintentar y duplicar.
      if (isOuterTransaction && this.transactionDirty) {
        this.transactionDirty = false;
        if (!this.suppressBackups) {
          try { this.createDailyBackup(); }
          catch { this.backupStatus = {...this.backupStatus, failed:true, lastAttempt:new Date().toISOString()}; console.error("Respaldo pendiente: la operación quedó confirmada en SQLite."); }
        }
      }
    }
  }

  addAuditEvent({ eventType, entityType, entityId = null, actor = null, details = {} }) {
    this.db
      .prepare(
        `INSERT INTO audit_events
          (event_type, entity_type, entity_id, actor_id, actor_name, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        eventType,
        entityType,
        entityId,
        actor?.id || null,
        actor?.name || null,
        JSON.stringify(details),
        new Date().toISOString()
      );
    this.transactionDirty = true;
  }

  readAuditEvents({ limit = 200, entityType = null, entityId = null } = {}) {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const conditions = [];
    const params = [];

    if (entityType) {
      conditions.push("entity_type = ?");
      params.push(entityType);
    }
    if (entityId) {
      conditions.push("entity_id = ?");
      params.push(entityId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT id, event_type, entity_type, entity_id, actor_id, actor_name, details, created_at
         FROM audit_events ${where}
         ORDER BY id DESC LIMIT ?`
      )
      .all(...params, normalizedLimit);

    return rows.map((row) => ({
      ...row,
      details: JSON.parse(row.details || "{}")
    }));
  }

  migrateLegacyJsonOnce() {
    const migration = this.db
      .prepare("SELECT payload FROM documents WHERE collection = ? AND document_id = ?")
      .get("meta", "legacy-json-import-v1");

    if (migration) return;

    this.transaction(() => {
      LEGACY_COLLECTIONS.forEach((collection) => {
        const legacyPath = path.join(this.dataDir, `${collection}.json`);
        if (!fs.existsSync(legacyPath)) return;

        try {
          const raw = fs.readFileSync(legacyPath, "utf8").trim();
          if (!raw) return;
          this.replaceCollection(collection, JSON.parse(raw));
        } catch (error) {
          console.error("No se pudo importar el respaldo JSON:", legacyPath, error);
        }
      });

      const now = new Date().toISOString();
      this.db
        .prepare(
          "INSERT INTO documents (collection, document_id, payload, updated_at) VALUES (?, ?, ?, ?)"
        )
        .run("meta", "legacy-json-import-v1", JSON.stringify({ importedAt: now }), now);
      this.transactionDirty = true;
    });
  }

  createDailyBackup() {
    this.backupStatus.lastAttempt = new Date().toISOString();
    const date = new Date().toISOString().slice(0, 10);
    const backupPath = path.join(this.backupDir, `el-muelle-pos-${date}.sqlite`);
    const temporaryBackupPath = path.join(
      this.backupDir,
      `el-muelle-pos-${date}-${process.pid}-${Date.now()}.tmp.sqlite`
    );

    try {
      fs.mkdirSync(this.backupDir, { recursive: true });
      this.db.exec(`VACUUM INTO ${sqlString(temporaryBackupPath)}`);
      fs.renameSync(temporaryBackupPath, backupPath);
      this.backupStatus.failed = false;
      this.backupStatus.lastSuccess = new Date().toISOString();
    } catch (error) {
      this.backupStatus.failed = true;
      console.error("Respaldo diario pendiente; la base activa conserva la operación confirmada.");
      try { if (fs.existsSync(temporaryBackupPath)) fs.rmSync(temporaryBackupPath); } catch { /* Conservar el respaldo anterior. */ }
    }
  }

  close() {
    try { this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); }
    finally { this.db.close(); }
  }
}

module.exports = { PosDatabase };
