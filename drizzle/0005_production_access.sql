CREATE TABLE installation (
 id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
 installation_id TEXT NOT NULL UNIQUE,
 mode TEXT NOT NULL CHECK (mode IN ('evaluation','production')),
 phase TEXT NOT NULL CHECK ((mode='evaluation' AND phase='evaluation') OR (mode='production' AND phase IN ('prepared','live'))),
 created_at TEXT NOT NULL,
 activated_at TEXT
);
INSERT INTO installation(id,installation_id,mode,phase,created_at)
 VALUES(1,lower(hex(randomblob(16))),'evaluation','evaluation',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE trusted_devices (
 id TEXT PRIMARY KEY NOT NULL,
 label TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('register','management')),
 event_id TEXT REFERENCES events(id),
 till_number INTEGER,
 registration_hash TEXT UNIQUE NOT NULL,
 registration_expires_at INTEGER NOT NULL,
 claim_nonce_hash TEXT,
 token_hash TEXT UNIQUE,
 activated_at INTEGER,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 CHECK ((kind='register' AND event_id IS NOT NULL AND till_number IS NOT NULL AND till_number>0) OR (kind='management' AND till_number IS NULL))
);
ALTER TABLE sessions ADD COLUMN device_id TEXT REFERENCES trusted_devices(id);
CREATE INDEX sessions_device ON sessions(device_id);
