-- 0005_supply.sql — M20 Supply chain risk graph.
--
-- 목적: project 가 사용하는 npm/PyPI/Cargo 패키지 + 그 패키지의 보안
-- advisory 를 추적. dependency graph 의 "Issuer → Credential → Project →
-- Deployment → URL" 위에 새 축 (Project → Package → Advisory) 을 추가해
-- "이 npm 패키지가 secret 을 leak 한 적이 있다 → 이 프로젝트가 그 패키지를
-- 쓴다 → 이 credential 이 위험 가능" 의 cross-domain blast radius 매핑.
--
-- 1Password / Bitwarden / Doppler / Infisical 모두 못 함. 우리만 가능한
-- 차별화 — graph 자산을 supply chain 까지 확장.

-- ───────────────────────────────────────────────────────────
-- package — 우리가 추적하는 외부 패키지 (npm / PyPI / cargo / etc.)
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS package (
  id TEXT PRIMARY KEY,                 -- ULID
  ecosystem TEXT NOT NULL,             -- npm | pypi | cargo | gomod | maven
  name TEXT NOT NULL,                  -- e.g. "axios", "requests"
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  UNIQUE (ecosystem, name)
);
CREATE INDEX IF NOT EXISTS idx_package_ecosystem_name
  ON package (ecosystem, name);

-- ───────────────────────────────────────────────────────────
-- package_advisory — OSV.dev / GHSA / 자체 큐레이션 보안 권고
--   특히 "secret leak / credential exfil" 카테고리 가중치
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS package_advisory (
  id TEXT PRIMARY KEY,                 -- ULID 또는 GHSA-xxx-xxx-xxx
  package_id TEXT NOT NULL,
  source TEXT NOT NULL,                -- osv | ghsa | manual
  source_id TEXT NOT NULL,             -- e.g. GHSA-id, OSV-id
  severity TEXT NOT NULL,              -- low | medium | high | critical
  /*
   * category — application-level taxonomy. secret_leak 가 우리의 1차 관심.
   *   secret_leak  : 패키지가 .env / process.env / vault 자료를 외부 송신
   *   crypto_weak  : 약한 KDF / MAC 사용
   *   supply_chain : typosquat / hijack / dependency confusion
   *   other        : 위 셋 외
   */
  category TEXT NOT NULL,
  summary TEXT NOT NULL,               -- 한 줄 요약 (UI 표시)
  detail TEXT,                         -- markdown 상세 (UI 확장)
  affected_range TEXT,                 -- semver range (e.g., ">=1.2.0 <1.5.0")
  published_at INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  references_json TEXT,                -- JSON array of URLs
  FOREIGN KEY (package_id) REFERENCES package(id) ON DELETE CASCADE,
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_package_advisory_pkg
  ON package_advisory (package_id);
CREATE INDEX IF NOT EXISTS idx_package_advisory_severity_category
  ON package_advisory (severity, category);

-- ───────────────────────────────────────────────────────────
-- package_usage — Project 가 어떤 package 의 어떤 version 을 쓰는가
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS package_usage (
  id TEXT PRIMARY KEY,                 -- ULID
  project_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,               -- resolved version (e.g., "1.4.2")
  manifest_path TEXT,                  -- e.g., "package.json", "pnpm-lock.yaml"
  detected_at INTEGER NOT NULL,
  /*
   * dep_kind — runtime 영향 범위. dev/optional 은 prod 영향 0.
   *   prod      : "dependencies"
   *   dev       : "devDependencies"
   *   optional  : "optionalDependencies"
   *   peer      : "peerDependencies"
   */
  dep_kind TEXT NOT NULL DEFAULT 'prod',
  FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE,
  FOREIGN KEY (package_id) REFERENCES package(id) ON DELETE CASCADE,
  UNIQUE (project_id, package_id, manifest_path)
);
CREATE INDEX IF NOT EXISTS idx_package_usage_project
  ON package_usage (project_id);
CREATE INDEX IF NOT EXISTS idx_package_usage_package
  ON package_usage (package_id);
