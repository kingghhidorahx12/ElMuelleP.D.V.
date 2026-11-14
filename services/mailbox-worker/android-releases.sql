-- Separate immutable releases; never changes report, catalogue or operational data.
CREATE TABLE IF NOT EXISTS android_releases(id TEXT PRIMARY KEY,version_code INTEGER NOT NULL UNIQUE,bytes INTEGER NOT NULL,manifest TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','published')));
CREATE TABLE IF NOT EXISTS android_chunks(release_id TEXT NOT NULL REFERENCES android_releases(id),position INTEGER NOT NULL,sha256 TEXT NOT NULL,iv TEXT NOT NULL,encrypted BLOB NOT NULL,bytes INTEGER NOT NULL,PRIMARY KEY(release_id,position));
