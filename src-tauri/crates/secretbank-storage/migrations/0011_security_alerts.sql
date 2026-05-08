-- Migration 0011: Security alerts + 2FA directory cache
-- security_alerts: Watchtower 스타일 보안 검사 결과 저장.
-- twofa_directory_cache: 2fa.directory v4 도메인 목록 캐시 (24h TTL).

CREATE TABLE IF NOT EXISTS security_alerts (
    id            TEXT PRIMARY KEY NOT NULL,       -- ULID
    credential_id TEXT NOT NULL,
    alert_kind    TEXT NOT NULL,                   -- "compromised_password" | "weak_password" | "reused_password" | "missing_two_factor" | "unsecured_website"
    alert_meta    TEXT NOT NULL DEFAULT '{}',      -- JSON metadata (count/score/domain — 평문 비번 미포함)
    dismissed_at  TEXT,                            -- ISO8601, NULL = 활성
    checked_at    TEXT NOT NULL,                   -- ISO8601 — 마지막 검사 시각
    FOREIGN KEY (credential_id) REFERENCES credential(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_credential_id
    ON security_alerts(credential_id);

CREATE INDEX IF NOT EXISTS idx_security_alerts_kind
    ON security_alerts(alert_kind);

-- 2fa.directory v4 캐시 (도메인 목록만, 비번 정보 없음)
CREATE TABLE IF NOT EXISTS twofa_directory_cache (
    domain     TEXT PRIMARY KEY NOT NULL,
    cached_at  TEXT NOT NULL               -- ISO8601 (24h TTL)
);
