-- 0003_sync.sql — M9 Sync infrastructure (Phase E)
--
-- 한 사용자 = 한 Y.Doc 모델. Yjs 의 Y.encodeStateAsUpdate 는 전체 doc 의
-- 통합 update 를 만들고, 디바이스끼리 같은 doc 을 공유한다. 따라서
-- 테이블 row 도 1 user = 1 행 (latest snapshot).
--
-- - ciphertext  : 클라이언트가 Phase E-1 의 AEAD adapter (XChaCha20-Poly1305)
--                 로 암호화한 envelope `[nonce(24) || ciphertext+tag]`.
--                 릴레이는 ciphertext 만 보고 평문은 절대 알 수 없다 (Zero-
--                 Knowledge).
-- - version     : 단조 증가 (push 시 +1). 클라이언트의 `since` 와 비교해
--                 304 / 200 을 결정.
-- - updated_at  : ms timestamp.
--
-- doc_id 같은 별도 키를 두지 않는 이유: MVP 의 sync 도메인은 사용자 vault
-- 메타데이터 1개뿐. 향후 multi-doc (예: shared workspace) 가 필요해지면
-- 마이그레이션으로 (user_id, doc_kind) 복합 키로 확장.

CREATE TABLE IF NOT EXISTS encrypted_doc (
  user_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  ciphertext BLOB,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
