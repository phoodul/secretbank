# Workflow Progress

## Last Checkpoint

- **Time:** 2026-04-26 (Night mode 2 + 사용자 인터랙션 종료)
- **Phase:** Phase 3 — Implementation, **M4~M7 ✅ + M5 10/10 ✅ + M15 🔄 진입**, 100/132 태스크 달성 (75.8%)
- **Commits:** 약 129개 누적. 본 세션 신규 ~17개:
  - 인터랙션 (사용자 결정): `58eacd2` 가격 인하 + M14 / `512b2fc` Team $5 + M15~17 placeholder / `840370c` ee 골격 / `766a3d4` 도메인 확정
  - 릴레이: `4ec6248` T061+T079 / `e8f5e45` Cargo.lock / `f109812` wrangler ID
  - M5 마무리: `6ddce61` T062 / `0c517ba` T063 / `8ef4ebb` T064 / `0194829` docs
  - Night mode 자율: `dd63f97` hotfix 5 / `bf06db7` M15 T132+T133
- **Tests:**
  - Rust workspace 전체 통과 (audit 9 + kill_switch 8 + railguard 8 + connectors 57 + github 7 + secret_scanning 6 + entitlement 6 + 기타 다수)
  - Vitest **305개** 전부 통과 (M5 신규 6 added, M4 기존 288 + M5 추가 신규 4 통합)
  - `pnpm typecheck` **0 에러**
  - `cargo clippy --workspace -- -D warnings` clean
  - `pnpm lint` 0 에러 (6 warnings: pre-existing shadcn)
- **Blocker:** 없음
- **Mode:** 세션 종료 (사용자 인터랙션 + Night mode 2 완료)
- **Milestones:** 14 → **18 마일스톤** (M14 Auto Rotation / M15 CI/CD / M16 Telemetry / M17 SDK 신설), 118 → **132 태스크** (100/132 = 75.8%)
- **Price update:** Pro $2→$1/월, $15→$10/년 | Team $10→$5/seat/월
- **Domain:** api-vault.app (Cloudflare)
- **Relay:** Local `/health` 200 OK 검증 완료
- **Next (사용자 결정):**
  1. **M15 Product Feature (T126~T128)** — GitHub Actions Secrets API + sync 커맨드 + Sync UI (외부 인프라 불필요, 자율 가능)
  2. **Manual Verification (선택)** — M4~M7 + M5 + Relay end-to-end (feed poll + RAILGUARD + audit + kill switch + relay /health + GitHub deep link)
  3. **M8 Authentication** — Passkey + OAuth (relay 의존, 이제 가능)

---

## M5 완료 + M15 진입 (2026-04-26 Night mode 2)

### 세션 개요

- T061~T064 완성 (Relay + GitHub Secret Scanning + UI + Entitlement)
- M5 10/10 ✅ 마크
- M14/M15/M16/M17 신설 (총 4 신 마일스톤, 132 태스크)
- Pro 가격 $1/월로 인하
- api-vault.app 도메인 확정
- Relay 로컬 가동 검증 (/health → 200 OK)
- M15 T132+T133 즉시 진입 (CI/CD)
- 백로그 hotfix 5건 (XSS / list locked / i18n / docstring / eslint)

### M5 마무리

**T061 Cloudflare Workers Relay**
- wrangler.toml 스캐폴드 + account_id/database_id 채움
- 로컬 개발 서버 동작 검증 (`curl /health → 200 OK`)
- D1/KV 생성 가이드 제공

**T062 GitHub Secret Scanning**
- `GitHubSecretScanner` trait
- Relay `/github/scan-secrets` endpoint
- Tauri 커맨드 통합

**T063 GitHub Connector UI**
- `GithubIntegrationSection` 컴포넌트
- Connect → installations → Scan (Pro gated)

**T064 Pro Entitlement**
- `Tier` enum (Free / Pro)
- `require_pro()` gate 함수
- Scan + Bulk Revoke Pro gated
- `entitlement_set_dev` (M10 before 테스트)

### M14 신설 — Auto Rotation (Phase R1~R4)

- R1: AWS IAM Full rotation
- R2: Stripe/GCP/Azure Full rotation
- R3: Manual + Provider intelligence
- R4: Schedule + Health monitoring
- M5 이후 M9 Sync 완료 후 진입 예정

### M15 CI/CD Integration (🔄 진입)

- T126: GitHub Actions Secrets API
- T127: sync 커맨드
- T128: Sync UI
- T129: Sync over relay (e2ee)
- T130: Offline queue + retry
- T131: Conflict resolution UI
- T132: **deploy-relay.yml** (완료)
- T133: **ci.yml ee-relay** (완료)

### M16/M17 Placeholder

- M16: Anonymous Telemetry (M9 후)
- M17: SDK Ecosystem (M5+M9 후)

---

## M4~M7 Complete (2026-04-25 Night mode 1 종료)

### M4 Incident Feed — 10/10 ✅

- T049~T055: Feeds (NVD/GHSA/RSS/HIBP) + Matcher + Scheduler
- T056~T058: UI (Incidents page / Credential section / NVD settings)
- Vitest 288 총누계

### M5 GitHub Connector + RAILGUARD — 6/10 + 4/10 (T061~T064 추가 후 10/10)

**Phase 1 (완료 6/10):**
- T059: Connector trait
- T060: GitHub skeleton
- T065: RAILGUARD templates
- T066: preview/apply
- T067: RAILGUARD UI
- T068: auto-suggestion

**Phase 2 (완료 4/10 → M5 10/10):**
- T061: Workers relay
- T062: GitHub Secret Scanning
- T063: GitHub Connector UI
- T064: Pro entitlement

### M6 Audit Log — 6/6 ✅

- T069~T074: AuditLog crate + Device ID + Hooks + Commands + UI + Credential section
- Hash chain (SHA256-HMAC) + Ed25519 signatures

### M7 Kill Switch — 4/4 ✅

- T075~T078: Backend (2-step confirm + Issuer bulk)
- T076: Dialog flow
- T077: REVOKED badge + filter
- T078: Bulk revoke

---

## Historical Checkpoint (2026-04-24 PM — M3 Manual Verification)

### M3 수동 검증 결과

| # | 항목 | 결과 |
|:--|:----|:----|
| ① | `/graph` 렌더 + 4 노드 색 | ✅ Issuer/Credential/Deployment 확인 |
| ② | TB ↔ LR 토글 + 핸들 회전 | ✅ 정상 |
| ③ | Blast Radius (실선/점선 + Esc) | ✅ 전부 통과 |
| ④ | Settings "Allow dragging" | ✅ localStorage 영속 + 동작 반영 |
| ⑤ | 모바일 MobileGraphList | 🕒 M11 defer (OS 기반 viewport) |

### 발견 및 hotfix

**피드 스케줄러 panic** (커밋 `85f347a`)
- 증상: `panic: no reactor running` at `feed_scheduler.rs:172`
- 원인: `tauri::Builder::setup` 콜백은 tokio context 외부
- 수정: `block_on(async { spawn_feed_scheduler(...) })` 래핑
- 교훈: Tauri `setup` 내 모든 tokio spawn 은 `block_on` 필수

---

## Workflow Phases

### Phase 1 — Planning (✅ 2026-03-01~2026-04-01)
- Vision + Architecture + Task decomposition (14 마일스톤, 118 태스크)
- Database schema migration 0001 (vault + settings)

### Phase 2 — Foundation (✅ 2026-04-01~2026-04-15)
- M1 Authentication skeleton
- M2 Vault core (encrypt/decrypt, credential CRUD, project CRUD)
- M3 Graph + Blast radius
- 기본 Tauri IPC 패턴 확립

### Phase 3 — Implementation (🔄 2026-04-15~ | M4~M7 ✅, M5 10/10 ✅, M15 🔄 진입)
- **M4 ✅** Incident Feed (NVD/GHSA/RSS/HIBP + Matcher + UI)
- **M5 ✅** GitHub Connector + RAILGUARD (Relay + Secret Scanning + UI + Entitlement)
- **M6 ✅** Audit Log (Hash chain + Device ID + UI)
- **M7 ✅** Kill Switch (2-step revoke + Bulk)
- M8 Auth (Passkey + OAuth) — Relay 의존, 이제 가능
- M9 Sync (Yjs + SecSync) — M8 후 진입
- M10 Billing (Stripe) — M8 필요
- M11 Mobile (iOS/Android Tauri)
- M12 Web Viewer (read-only)
- M13 Documentation
- **M14** Auto Rotation (R1~R4, M9 후)
- **M15 🔄** CI/CD Integration (deploy-relay.yml + ee-relay)
- **M16** Anonymous Telemetry (M9 후)
- **M17** SDK Ecosystem (M5+M9 후)

### Phase 4 — Testing (awaiting)
- Manual verification (M4~M15)
- E2E tests (Playwright)
- Security audit (3rd party)

### Phase 5 — Launch (awaiting)
- Beta release (GitHub releases)
- Web relay deploy (Cloudflare Workers)
- Apple Developer + Play Console (M11 after)

---

## Key Technical Decisions (Phase 3)

### Storage & Cryptography
- SQLite local (Tauri plugin-sql)
- age (X25519 + ChaCha20-Poly1305)
- Hash chain (SHA256-HMAC) + Ed25519 for audit log

### Feed Polling
- NVD CVE 2.0 API (governor rate limit 5/50)
- GitHub Security Advisories (Link header pagination)
- 10 RSS status pages (Semaphore 4)
- HIBP v3 (404 = no breach)
- Breaker pattern (3 fail → 1h cooldown)

### Entitlement & Price
- Pro: $1/month, $10/year
- Team: $5/seat/month
- Local tier (Free) + Pro (relay features)
- `entitlement_set_dev` for testing

### Relay Architecture
- Cloudflare Workers (wrangler.toml)
- GitHub App: client (install_id + 1h token) / relay (private key)
- D1 + KV
- `/health` + `/github/scan-secrets` endpoints
- Deploy via `deploy-relay.yml`

### RAILGUARD Templates
- 4 AI editors (Cursor/Windsurf/Claude/Copilot)
- `{{VAR}}` substitution (no template engine)
- Atomic write (tmp + rename)
- Snapshot tests (invariants only)

### Audit Log
- Immutable append (hash chain)
- Device ID (UUID v4, first-boot save)
- Best-effort (warn-log on device_id absent, SQL error)
- Chain verify fresh on each call

### Kill Switch
- 2-step confirm (generate token + consume)
- TTL 5min, 256-bit random
- Issuer bulk (1-step, authorization level)
- Revoke status immutable (timestamp recorded)

### Connector Trait
- `async fn fetch_incidents(&Auth)`
- `Auth` enum (GitHubApp / Token / None)
- `Send + Sync` (Arc<dyn Connector>)
- MockConnector (testing feature)

---

## Testing Infrastructure

### Rust Tests
- Unit tests per module (~120 new in M4~M5)
- Wiremock fixtures (NVD/GHSA/RSS/HIBP)
- Snapshot tests (RAILGUARD invariants)
- `#[cfg(test)]` feature gates (MockConnector)

### Frontend Tests
- Vitest 305 total (pre-M4: 288, new: 17)
- Reactive hooks (use-inventory, use-incidents)
- Components (Graph, CredentialDetail, IncidentsList)
- Integration tests (Tauri commands)

### Type Checking
- `pnpm typecheck` 0 errors (pre-M4: 5, all resolved)
- Path aliases (@/*) via tsconfig + vite.config

### Linting
- `cargo clippy` clean
- `pnpm lint` 0 errors (6 pre-existing shadcn warnings)

---

## Known Limitations & Deferrals

1. **Mobile (M11)** — Deferred to after M9 (Sync foundation)
2. **Web Viewer (M12)** — Read-only, after M8 (Auth)
3. **Auto Rotation (M14)** — After M9 (Sync), requires provider APIs
4. **Telemetry (M16)** — Anonymous, after M9 (Sync)
5. **SDK (M17)** — After M5+M9 (features + sync)
6. **MobileGraphList (M3)** — OS-based viewport, deferred to M11 Vitest coverage

## Environment

- **Node**: 20+
- **Rust**: stable (rustup)
- **pnpm**: latest
- **Tauri**: v2
- **Database**: SQLite (tauri-plugin-sql)
- **Encryption**: age crate

## Deployment

- **Desktop**: Tauri build (Windows/macOS/Linux)
- **Mobile**: Tauri Android/iOS (M11)
- **Relay**: Cloudflare Workers (wrangler publish)
- **CI**: GitHub Actions (.github/workflows/)
