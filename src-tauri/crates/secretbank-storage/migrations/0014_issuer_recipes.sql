-- Migration 0014: issuer_recipes 테이블 추가
--
-- 도메인 별 password 생성 레시피를 저장한다.
-- 우선순위: preset(seed) > 사용자 보정(user) > 휴리스틱(heuristic)
-- source 구분: 'preset' | 'heuristic' | 'user'
--   - preset  : seed 에 의해 사전 등록된 레시피
--   - user    : 사용자가 GeneratorPanel 에서 직접 조정한 레시피 (silent 등록 + audit log)
--   - heuristic: input.pattern/minLength/maxLength 분석으로 자동 추출한 레시피
--
-- domain 을 PK 로 사용 → upsert 단순화 (INSERT OR REPLACE)
CREATE TABLE IF NOT EXISTS issuer_recipes (
    domain      TEXT NOT NULL,        -- eTLD+1 기준 도메인 (e.g. "github.com")
    recipe_json TEXT NOT NULL,        -- JSON: { min, max, uppercase, number, special, forbidden }
    source      TEXT NOT NULL
                    CHECK (source IN ('preset', 'heuristic', 'user'))
                    DEFAULT 'user',
    updated_at  INTEGER NOT NULL,     -- unix ms
    PRIMARY KEY (domain, source)
);

CREATE INDEX IF NOT EXISTS idx_issuer_recipes_domain
    ON issuer_recipes (domain);
