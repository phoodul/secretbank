-- T-24-E-D5: audit_log.actor CHECK 제약 완화 — extension:{ext_id} 형식 허용.
--
-- SQLite 는 CHECK 제약을 ALTER TABLE 로 변경할 수 없으므로 테이블 재생성.
-- 기존 rows 는 actor 값이 'local-user' | 'system' | 'connector' 이므로
-- 새 제약(LIKE 'extension:%' OR IN 절)을 모두 통과한다.
--
-- 보안: actor 컬럼은 tamper-evident chain 의 canonical_bytes 에 포함되므로
--       아무 문자열이나 허용하지 않는다. 허용 값:
--         'local-user' | 'system' | 'connector' | 'extension:*' (nm-host 경유).
--       — TM-EXT-ACTOR

PRAGMA foreign_keys = OFF;

CREATE TABLE audit_log_new (
    id           TEXT PRIMARY KEY,
    seq          INTEGER NOT NULL,
    device_id    TEXT,
    actor        TEXT NOT NULL
                     CHECK (
                         actor IN ('local-user', 'system', 'connector')
                         OR actor LIKE 'extension:%'
                     ),
    action       TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id   TEXT NOT NULL,
    payload_json TEXT,
    prev_hash    BLOB,
    entry_hash   BLOB,
    signature    BLOB,
    created_at   INTEGER NOT NULL,
    FOREIGN KEY (device_id) REFERENCES device (id) ON DELETE SET NULL
);

INSERT INTO audit_log_new
SELECT id, seq, device_id, actor, action, subject_kind, subject_id,
       payload_json, prev_hash, entry_hash, signature, created_at
FROM audit_log;

DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;

PRAGMA foreign_keys = ON;
