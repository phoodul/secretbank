-- 0002_auth.sql — Auth schema (M8)
-- 기존 user 테이블에 인증/구독 컬럼 추가 + passkey/oauth_account/device 신규 테이블.
-- 디자인 근거: docs/architecture.md §3.4 "D1 스키마 (릴레이)".

-- ─────────────────────────────────────────────────────────────
-- user: 인증 + 구독 메타 컬럼 추가
-- ─────────────────────────────────────────────────────────────
-- auth_hash : 서버 측 Argon2id(password) — Passkey 전용 사용자는 NULL.
-- salt_auth : 클라이언트가 password → auth_hash 를 만들 때 쓰는 salt (재로그인 시 다시 내려줌).
-- salt_enc  : 클라이언트가 password → enc_key (Zero-Knowledge) 를 만들 때 쓰는 salt.
--             서버는 enc_key 를 절대 알 수 없으며, salt 만 보관해 다른 디바이스에서도
--             동일한 enc_key 가 파생되도록 한다.
-- plan / plan_source / plan_expires_at : M10 billing 에서 채울 구독 메타.

ALTER TABLE user ADD COLUMN auth_hash BLOB;
ALTER TABLE user ADD COLUMN salt_auth BLOB;
ALTER TABLE user ADD COLUMN salt_enc BLOB;
ALTER TABLE user ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE user ADD COLUMN plan_source TEXT;
ALTER TABLE user ADD COLUMN plan_expires_at INTEGER;

-- ─────────────────────────────────────────────────────────────
-- device: SecSync key exchange + 디바이스 페어링 (M9 에서 활용)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,            -- desktop|ios|android|web
  public_key BLOB NOT NULL,          -- X25519 public key
  registered_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_device_user ON device(user_id);

-- ─────────────────────────────────────────────────────────────
-- passkey: WebAuthn credential 저장
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS passkey (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id BLOB NOT NULL UNIQUE,
  public_key BLOB NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  transports TEXT,                   -- JSON array: ["internal","hybrid",...]
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey(user_id);

-- ─────────────────────────────────────────────────────────────
-- oauth_account: GitHub / Google / 향후 provider
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oauth_account (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,            -- github|google
  provider_id TEXT NOT NULL,         -- provider's user id (string)
  email TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (provider, provider_id),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_oauth_account_user ON oauth_account(user_id);
