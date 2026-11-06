PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS receiver_meta (id TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY,encrypted TEXT NOT NULL,created_at TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS enrollments (digest TEXT PRIMARY KEY,expires INTEGER NOT NULL,client TEXT,secret_digest TEXT);
CREATE INDEX IF NOT EXISTS enrollment_expiry ON enrollments(expires);
CREATE TABLE IF NOT EXISTS nonces (client TEXT NOT NULL,nonce TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(client,nonce));
CREATE INDEX IF NOT EXISTS nonce_expiry ON nonces(expires);
CREATE TABLE IF NOT EXISTS rate_limits (id TEXT PRIMARY KEY,expires INTEGER NOT NULL,n INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rate_expiry ON rate_limits(expires);
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY,client TEXT NOT NULL REFERENCES clients(id),kind TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,digest TEXT NOT NULL,encrypted TEXT NOT NULL,stored_bytes INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS report_client_date ON reports(client,created_at);
CREATE TABLE IF NOT EXISTS attachments (report TEXT NOT NULL REFERENCES reports(id),position INTEGER NOT NULL,mime TEXT NOT NULL,iv TEXT NOT NULL,encrypted BLOB NOT NULL,PRIMARY KEY(report,position));
CREATE TRIGGER IF NOT EXISTS report_capacity BEFORE INSERT ON reports BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM reports)>=1000 OR (SELECT COALESCE(SUM(stored_bytes),0) FROM reports)+NEW.stored_bytes>67108864 THEN RAISE(ABORT,'MAILBOX_CAPACITY') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM reports WHERE client=NEW.client AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'))>=20 THEN RAISE(ABORT,'MAILBOX_DAILY_LIMIT') END;
END;
