-- Migration 0001: Initial schema
-- All tables for API Vault local metadata storage.
-- Sensitive credential values are NOT stored here; only vault_ref (logical path
-- inside the age vault file) is kept. This file is safe to backup/sync.
PRAGMA foreign_keys = ON;

-- issuer
-- Represents an API provider (Stripe, OpenAI, GitHub, ...).
-- One issuer issues many credentials.
-- Lifecycle: created on first credential registration or via connector sync.
-- No FK dependencies; other tables reference issuer.
CREATE TABLE IF NOT EXISTS issuer (
    id                TEXT PRIMARY KEY,         -- ULID
    slug              TEXT NOT NULL UNIQUE,      -- e.g. stripe, openai, github
    display_name      TEXT NOT NULL,
    docs_url          TEXT,
    issue_url         TEXT,
    status_url        TEXT,
    security_feed_url TEXT,
    connector_id      TEXT,                     -- nullable: linked connector
    icon_key          TEXT,
    created_at        INTEGER NOT NULL,          -- unix ms
    updated_at        INTEGER NOT NULL
);

-- credential
-- API key / token metadata. The actual secret value lives in the age vault file;
-- vault_ref is the logical record path inside that file (e.g. credentials/<id>).
-- Lifecycle: created when user adds a key; status transitions active→revoked/compromised.
-- FK: issuer_id → issuer (CASCADE on delete).
CREATE TABLE IF NOT EXISTS credential (
    id                    TEXT PRIMARY KEY,       -- ULID
    issuer_id             TEXT NOT NULL,
    name                  TEXT NOT NULL,
    env                   TEXT NOT NULL DEFAULT 'prod'
                              CHECK (env IN ('dev', 'staging', 'prod')),
    scope                 TEXT,                   -- free-form scope description
    vault_ref             TEXT NOT NULL,          -- logical path inside age vault
    created_at            INTEGER NOT NULL,       -- unix ms
    last_rotated_at       INTEGER,                -- nullable
    expires_at            INTEGER,                -- nullable
    owner                 TEXT,                   -- user identifier
    rotation_policy_days  INTEGER,                -- null = manual rotation
    rotation_runbook_id   TEXT,                   -- nullable
    status                TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'revoked', 'compromised')),
    hash_hint             TEXT,                   -- last 4 chars, display only
    FOREIGN KEY (issuer_id) REFERENCES issuer (id) ON DELETE CASCADE
);

-- project
-- A user-owned project or repository that consumes credentials.
-- Lifecycle: created when user registers a project or drops a folder.
-- References: has many deployments, many usages.
CREATE TABLE IF NOT EXISTS project (
    id          TEXT PRIMARY KEY,       -- ULID
    name        TEXT NOT NULL,
    repo_url    TEXT,                   -- nullable
    framework   TEXT,                   -- nullable: next, vite, remix, ...
    runtime     TEXT,                   -- nullable: node, python, ...
    local_path  TEXT,                   -- nullable: path from dropped folder
    created_at  INTEGER NOT NULL,       -- unix ms
    updated_at  INTEGER NOT NULL
);

-- deployment
-- A specific deployed environment of a project (Vercel prod, Railway staging, ...).
-- Lifecycle: created alongside or after project registration.
-- FK: project_id → project (CASCADE on delete).
CREATE TABLE IF NOT EXISTS deployment (
    id          TEXT PRIMARY KEY,       -- ULID
    project_id  TEXT NOT NULL,
    url         TEXT NOT NULL,
    platform    TEXT NOT NULL
                    CHECK (platform IN ('vercel', 'railway', 'fly', 'netlify', 'other')),
    env         TEXT NOT NULL
                    CHECK (env IN ('dev', 'staging', 'prod')),
    created_at  INTEGER NOT NULL,       -- unix ms
    FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE CASCADE
);

-- usage
-- Core many-to-many relationship: which credential is used in which project/deployment.
-- where_kind describes how the credential is referenced (env var, file path, code ref).
-- Lifecycle: created via scan, drag-drop, or manual entry; verified_at updated by scanner.
-- FK: credential_id → credential (CASCADE), project_id → project (CASCADE),
--     deployment_id → deployment (SET NULL on delete, nullable).
CREATE TABLE IF NOT EXISTS usage (
    id             TEXT PRIMARY KEY,    -- ULID
    credential_id  TEXT NOT NULL,
    project_id     TEXT NOT NULL,
    deployment_id  TEXT,                -- nullable
    where_kind     TEXT NOT NULL
                       CHECK (where_kind IN ('env_var', 'file_path', 'code_ref')),
    where_value    TEXT NOT NULL,       -- e.g. OPENAI_API_KEY, /apps/web/.env.local
    verified_at    INTEGER,             -- nullable
    verified_by    TEXT
                       CHECK (verified_by IS NULL OR verified_by IN ('scan', 'manual', 'runtime')),
    FOREIGN KEY (credential_id)  REFERENCES credential  (id) ON DELETE CASCADE,
    FOREIGN KEY (project_id)     REFERENCES project     (id) ON DELETE CASCADE,
    FOREIGN KEY (deployment_id)  REFERENCES deployment  (id) ON DELETE SET NULL
);

-- incident
-- A security incident or vulnerability notification collected from external feeds.
-- Lifecycle: ingested by feed poller (NVD, GHSA, RSS, HIBP); matched to credentials.
-- FK: issuer_id → issuer (SET NULL on delete, nullable — incident may not map to an issuer).
CREATE TABLE IF NOT EXISTS incident (
    id           TEXT PRIMARY KEY,      -- ULID
    source       TEXT NOT NULL
                     CHECK (source IN ('nvd', 'ghsa', 'rss', 'hibp')),
    source_id    TEXT NOT NULL,         -- CVE-2025-1234, GHSA-xxx, ...
    issuer_id    TEXT,                  -- nullable
    severity     TEXT NOT NULL
                     CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    title        TEXT NOT NULL,
    body         TEXT,
    url          TEXT,
    detected_at  INTEGER NOT NULL,      -- unix ms
    published_at INTEGER,
    FOREIGN KEY (issuer_id) REFERENCES issuer (id) ON DELETE SET NULL
);

-- incident_match
-- Links an incident to a specific credential that may be affected.
-- reason describes how the match was determined.
-- dismissed_at is set when the user dismisses the match.
-- FK: incident_id → incident (CASCADE), credential_id → credential (CASCADE).
CREATE TABLE IF NOT EXISTS incident_match (
    id             TEXT PRIMARY KEY,    -- ULID
    incident_id    TEXT NOT NULL,
    credential_id  TEXT NOT NULL,
    reason         TEXT NOT NULL
                       CHECK (reason IN ('issuer_match', 'keyword', 'explicit')),
    matched_at     INTEGER NOT NULL,    -- unix ms
    dismissed_at   TEXT,                -- nullable, RFC 3339 timestamp
    FOREIGN KEY (incident_id)   REFERENCES incident   (id) ON DELETE CASCADE,
    FOREIGN KEY (credential_id) REFERENCES credential (id) ON DELETE CASCADE
);

-- audit_log
-- Append-only tamper-evident log of all user and system actions.
-- Each entry contains prev_hash forming a hash chain for integrity verification.
-- Lifecycle: entries only ever inserted, never updated or deleted.
-- FK: device_id → device (SET NULL on delete; history preserved even if device removed).
CREATE TABLE IF NOT EXISTS audit_log (
    id           TEXT PRIMARY KEY,       -- ULID (also acts as unique sequence)
    seq          INTEGER NOT NULL,       -- monotonic per-device counter
    device_id    TEXT,                   -- nullable (SET NULL on device removal)
    actor        TEXT NOT NULL
                     CHECK (actor IN ('local-user', 'system', 'connector')),
    action       TEXT NOT NULL,          -- credential.create | revoke | rotate | ...
    subject_kind TEXT NOT NULL,          -- credential | project | issuer | ...
    subject_id   TEXT NOT NULL,
    payload_json TEXT,                   -- tamper-evident extra context
    prev_hash    BLOB,                   -- 32 bytes SHA-256 of previous entry
    entry_hash   BLOB,                   -- 32 bytes SHA-256 of this entry
    signature    BLOB,                   -- 64 bytes ed25519 signature
    created_at   INTEGER NOT NULL,       -- unix ms
    FOREIGN KEY (device_id) REFERENCES device (id) ON DELETE SET NULL
);

-- device
-- A paired device that can access the vault (desktop, mobile, web).
-- public_key is used for X25519 pairing and Ed25519 audit log signing.
-- Lifecycle: registered on first launch or via pairing flow; revoked on removal.
CREATE TABLE IF NOT EXISTS device (
    id           TEXT PRIMARY KEY,       -- ULID
    name         TEXT NOT NULL,
    platform     TEXT NOT NULL
                     CHECK (platform IN ('desktop-win', 'mac', 'linux', 'ios', 'android', 'web')),
    public_key   BLOB NOT NULL,          -- X25519 or Ed25519 public key
    paired_at    INTEGER NOT NULL,       -- unix ms
    last_seen_at INTEGER,
    status       TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'revoked'))
);

-- sync_state
-- CRDT synchronization cursor per Yjs doc.
-- Tracks local vector clock and last sync timestamp for conflict-free merge.
-- No FK to device: doc_id is the root Yjs doc identifier.
CREATE TABLE IF NOT EXISTS sync_state (
    doc_id              TEXT PRIMARY KEY,  -- root Yjs doc id
    local_clock         INTEGER NOT NULL DEFAULT 0,
    last_snapshot_hash  BLOB,
    last_synced_at      INTEGER            -- nullable: null until first sync
);

-- settings
-- Key/value store for user preferences and app configuration.
-- Sensitive values (e.g. NVD API key) are stored as vault_ref paths pointing
-- into the age vault file, not as plaintext here.
-- Examples: nvd_api_key (vault ref), ui_theme, language.
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at INTEGER NOT NULL
);

-- Indexes (section 2.2 of architecture.md)

-- "All keys for this issuer" query
CREATE INDEX IF NOT EXISTS idx_credential_issuer
    ON credential (issuer_id);

-- "Expiry approaching" view
CREATE INDEX IF NOT EXISTS idx_credential_expires
    ON credential (expires_at);

-- Filter by status (exclude revoked/compromised)
CREATE INDEX IF NOT EXISTS idx_credential_status
    ON credential (status);

-- Blast radius: all usages of a credential
CREATE INDEX IF NOT EXISTS idx_usage_credential
    ON usage (credential_id);

-- Reverse lookup: all credentials used by a project
CREATE INDEX IF NOT EXISTS idx_usage_project
    ON usage (project_id);

-- Incident feed for an issuer (most recent first)
CREATE INDEX IF NOT EXISTS idx_incident_issuer_detected
    ON incident (issuer_id, detected_at DESC);

-- Credential impact view (unfiltered + dismissed)
CREATE INDEX IF NOT EXISTS idx_match_credential
    ON incident_match (credential_id, dismissed_at);

-- Audit chain traversal per device
CREATE INDEX IF NOT EXISTS idx_audit_seq
    ON audit_log (device_id, seq);
