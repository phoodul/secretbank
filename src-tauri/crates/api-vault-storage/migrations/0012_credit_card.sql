-- Migration 0012: Credit Card credential 지원
-- B.5-3: last_4 만 평문 메타. 카드번호/CVC/PIN 은 vault.age 에 별도 경로로 저장.
-- B.5-4: vault encryption (age) 동일 적용 — 별도 평문 DB ❌.
-- R3: credential 테이블 ALTER ❌ — 신규 테이블만 추가.

CREATE TABLE IF NOT EXISTS credit_card_meta (
    credential_id   TEXT PRIMARY KEY NOT NULL,
    brand           TEXT NOT NULL DEFAULT 'unknown',
    expiry_month    INTEGER NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
    expiry_year     INTEGER NOT NULL CHECK (expiry_year >= 2024 AND expiry_year < 2100),
    cardholder_name TEXT,
    billing_address TEXT,
    last_4          TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (credential_id) REFERENCES credential(id) ON DELETE CASCADE
);

-- credential.kind 인덱스는 0006 에 이미 존재 (idx_credential_kind).
-- 추가 인덱스: brand 필터 (Watchtower 통계 / BIN 분석 등).
CREATE INDEX IF NOT EXISTS idx_credit_card_meta_brand
    ON credit_card_meta(brand);
