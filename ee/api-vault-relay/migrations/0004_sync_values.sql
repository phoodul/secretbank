-- 0004_sync_values.sql — M9 Phase F (value sync 채널)
--
-- CRDT (encrypted_doc, 0003) 는 metadata 동기화에 적합하지만 credential 의
-- 실제 secret value 는 LWW (last-write-wins) 가 맞다 — credential 1개의
-- value 가 다른 credential 의 value 와 합쳐질 일이 없으므로 CRDT 의 merge
-- 의미가 불필요. per-credential row 로 단순 UPSERT 하고 since=timestamp
-- 로 변경 이후 값을 가져온다.
--
-- - ciphertext  : 클라이언트가 `value-root` 서브키 (HKDF of enc_key) 로 AEAD
--                 적용한 envelope `[nonce(24) || ciphertext+tag]`. 릴레이는
--                 envelope 만 보고 평문은 절대 알 수 없다 (Zero-Knowledge).
-- - version     : 같은 (user_id, credential_id) 의 단조 증가 카운터. 디바이스
--                 간 동시 push 시 server side 가 이긴다.
-- - updated_at  : ms timestamp — GET ?since=<ms> 의 필터.

CREATE TABLE IF NOT EXISTS encrypted_secret_value (
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  ciphertext BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, credential_id),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_encrypted_secret_value_user_updated
  ON encrypted_secret_value (user_id, updated_at);
