# Workflow Progress

## Last Checkpoint

- **Time:** 2026-04-28 Night mode 3 (T084 + I3 + Playwright + M9 Phase A + B-1 5건 연속 완료, 다음 세션은 M9 Phase B-2 부터)
- **Phase:** Phase 3 — Implementation, **M4~M8 ✅ + M5 10/10 ✅ + M8 8/8 ✅ + M9 🔄 Phase A+B-1 / 7 phases (Phase B 4 sub-phase 분할) + M15 🔄**, 110/132 태스크 (83.3%) + 결함 후속 처리 누적 (4-26 H1~H5 5건 + 4-27 I4/I5 2건 + I1/I2 2건 ✅, **4-28 I3 ✅ listener 표준화 + Playwright E2E 인프라 ✅ + M9 Phase Plan ✅ + 5건 결정 ✅ + Phase B-1 ✅** + J2 ✅ + J1 docs ✅)
- **Commits (T083 Phase A~D + 검증 hotfix 신규 6개):**
  - `1ec7a15` feat(auth) — T083 Phase A · RelayClient + AuthSession 서비스 골격 + AppContext 확장 (회귀 12)
  - `2f17917` feat(auth) — T083 Phase B · Passkey 4 커맨드 (register/assert × start/verify) + AuthCommandError + complete_session 헬퍼 (회귀 6)
  - `e159415` feat(auth) — T083 Phase C · OAuth(GitHub/Google) + apivault:// deep link scheme + on_open_url emit + tauri-plugin-opener 전환 (회귀 5)
  - `7df5888` feat(auth) — T083 Phase D · auth_refresh / auth_signout / auth_status + hydrate_session_from_vault 자동 통합 (T086 클라이언트 측 완성, 회귀 5)
  - `a63133c` docs — T083 5-Phase 종료 · task.md / progress.md / work-log.md 갱신
  - `5a556d4` fix(auth) — J2 · register/assert start 에 vault unlocked 가드 (OS↔DB 분리 회복불가 패턴 차단, 회귀 2)
  - `f7b6c9e` docs — J1 + T083 수동 검증 라운드 종합 기록 (README/relay-deployment runbook 경고 + work-log 인사이트)
  - `17da027` feat(auth) — T085 · Zero-Knowledge KDF (salt_auth/salt_enc → auth_hash/enc_key) 결정론 통합 + 회귀 4. **M8 백엔드 8/8 완료**
- **Tests (4-28 T085 종료 시점):**
  - Rust api-vault-app lib: **136 passed** (102 → 136, T083 Phase A 12 + B 6 + C 5 + D 5 + J2 2 + T085 4 = +34)
  - relay vitest 35 / Rust crypto 5 / storage 39 / 전체 워크스페이스 모두 그린
  - clippy --workspace --all-targets -D warnings: **0 에러**
  - typecheck / Vitest(frontend): 영향 없음 (FE 변경 없음)
  - 수동 검증: 18 통과 / 2 deferred (D2/D3 — T084 SignIn UI 시점에 자연 검증)
- **Blocker:** pre-existing clippy warnings (Rust 1.95 새 lint) — 이번 hotfix 와 무관, 후속 정리 큐
- **Mode:** Interactive manual verification — 라운드 A → B → C 단계별 사용자 실행, 결함 발견 시 즉시 진단 → hotfix → 재검증.
- **Verification 통과 (10/10 + C2 deferred):**
  1. **A1** 마이그레이션 0004 자동 적용 (DB 검사: `_sqlx_migrations(4)` + `idx_incident_match_unique` 존재)
  2. **A2** H1 멱등성 — 같은 (incident, credential) 27회 → 1회
  3. **A3** H2 — Audit Subject `vault:default` 정상 표기
  4. **A4** H4 — Drawer 상단 Revoke outline-destructive (빨간 border + 빨간 텍스트)
  5. **B1** H3 — RAILGUARD Apply (`Overwrite { backup: true }`) 4 파일 디스크 생성
  6. **C1** Pro 모의 활성화 (Developer Tools)
  7. **C2** GitHub Connect 풀 플로우 — **deferred (I3 의존, M8 후)**
  8. **C3** Pro + Connected 시뮬 (devtools dynamic import) → Scan 버튼 자물쇠 없이 활성
  9. **C4** H5 Single Revoke — IPC 통과 + DB status='revoked' + audit chain 정상 (I4 화이트 스크린은 같은 라운드 안에서 hotfix 후 재검증)
  10. **C5** H5 Bulk Revoke — progress 1/2 → 2/2 + 화면 정상 (I5 ExpectedCountMismatch 도 같은 라운드 안에서 hotfix 후 재검증)
- **새로 발견된 결함 5건:**
  - **I4** P0 ✅ — Single/Bulk Revoke 후 화이트 스크린 (Radix compose-refs 무한 setRef)
  - **I5** P0 ✅ — Bulk Revoke `ExpectedCountMismatch` (Rust filter 에 status 누락)
  - **I1** P3 backlog — Subscription 헤더 "Current plan" 라벨 ↔ Pro 뱃지 인접 배치
  - **I2** P2 backlog — Pro 활성 시에도 disabled "Upgrade to Pro" 버튼 노출
  - **I3** Architectural backlog — GitHub Connect 풀 플로우 4 사전 조건 (App 등록 / deep-link scheme / listener 표준화 / M8 Auth user JWT)
- **이번 Night mode 처리 완료:**
  1. ✅ **I1/I2 hotfix** — `fea5562` (Subscription 헤더 "Current plan" 그룹 + Pro 시 Upgrade 버튼 숨김 + 회귀 3)
  2. ✅ **Rust 1.95 clippy lint 14건** — `a6b0a94` (cloned_ref_to_slice_refs 9 + io_other_error 1 + unused 2; -D warnings 통과)
  3. ✅ **T080 D1 auth schema** — `6929c91` (0002_auth.sql + Drizzle schema 동기화 + readD1Migrations + db.test.ts 4)
  4. ✅ **T081 Passkey 4 엔드포인트 + JWT** — `c60e023` (HS256 access 1h / refresh 30d, KV challenge 5분 consume-once, salt base64url 응답)
  5. ✅ **T082 OAuth 2.0 (GitHub + Google)** — `11eeeea` (start/callback + provider_id UNIQUE 매핑 + email-private 폴백 + 9 회귀)
  6. ✅ **KDF salt 시그니처 일반화** — `d3a345f` (`&[u8; 16]` → `&[u8]`, M8 32바이트 salt 호환, 기존 호출자 자동 coerce)
  7. ✅ **T086 /auth/refresh** — `03a0480` (refresh token rotation, leak window 30일 제한, 4 회귀)

  - 릴레이 vitest 35/35 / Rust crypto 5/5 / storage 39/39 / clippy -D warnings 0 / typecheck 0 / Vitest (frontend) 315/315.

- **이번 세션 처리 완료 (M8 백엔드 8/8):**
  1. ✅ T083 Phase A — services 골격 (`1ec7a15`)
  2. ✅ T083 Phase B — Passkey 4 커맨드 (`2f17917`)
  3. ✅ T083 Phase C — OAuth + deep link (`e159415`)
  4. ✅ T083 Phase D — refresh/signout/status + hydrate (`7df5888`)
  5. ✅ docs — Phase E 갱신 (`a63133c`)
  6. ✅ J2 hotfix — register/assert start vault 가드 (`5a556d4`)
  7. ✅ docs — J1 + 검증 종합 기록 (`f7b6c9e`)
  8. ✅ T085 — Zero-Knowledge KDF (`17da027`)

- **이번 Night mode 3 처리 완료:**
  1. ✅ **T084** — `/auth/sign-in` 풀 페이지 + PasskeyButton (assert→register fallback 단일 버튼 UX) + OAuthButton (github/google) + deep-link `apivault://auth/callback` listener + Settings CloudSyncSection 진입점 + `@simplewebauthn/browser` dep + i18n 4 로케일 + Vitest +19. M8 마지막 1건 클로즈, **M8 8/8 ✅ 풀 완료**.
  2. ✅ **I3** — `useGithubIntegration` 의 deep-link listener 표준화. `deep-link://github-callback` (lib.rs 가 emit 안 함, dead path) → `deep-link` 이벤트 + `apivault://github/callback` URL prefix 매칭. `parseGithubCallbackUrl` 헬퍼 + Vitest +8 + Setup URL 운영 가이드 강화. 4 사전 조건 모두 ✅, 풀 플로우 unblocked (실 GitHub App 등록 + 릴레이 배포는 사용자 액션 필요).
  3. ✅ **Playwright browser-mode E2E** — `e2e/` 디렉토리, `tauri-mock.ts` invoke polyfill, smoke 3 case (LockScreen / 라우팅 / SignInPage). CI `e2e` 잡 + frontend 잡에 Vitest 통합 (이전 누락). Desktop binary E2E (tauri-driver) 는 deferred — 진입 트리거 3가지 명시 (Sync 회귀 누적 / M11 / M13).
  4. ✅ **M9 Phase Plan + T087 Phase A** — 10 태스크를 7-phase 로 분할 (`docs/m9-phase-plan.md`), Phase A 만 안전 실행 (yjs + y-indexeddb dep, 더미 SyncProvider, Vitest +4). App.tsx 마운트 보류, Phase B 의 enc_key 라이프사이클 작업이 준비된 후 마운트.
  5. ✅ **5건 사용자 결정 + Phased Expansion** — Free 종류 무관 2대 / Auto-derive on unlock / SQLite 화이트리스트 / SecSync 잠정 (Phase C 검증) / MVP API 특화 + v1.1 General Secrets + v1.2 자동입력. project-decisions.md 5건 기록 + m9-phase-plan.md Open Issues Resolved 갱신.
  6. ✅ **M9 Phase B-1** — AuthSession 에 `salt_auth`/`salt_enc`/`enc_key` 필드 + Debug 마스킹 + save/load_session 확장 (enc_key 영속 금지) + AppContext.master_passphrase 라이프사이클 (vault_unlock 시 채움 / vault_lock 시 zeroize) + 7 테스트 컨텍스트 갱신 + Rust lib 회귀 136 → 141 (+5).
  7. ✅ **M9 Phase B-2** — complete_session 시그니처에 new_salts 추가 + verify 4 커맨드 시그니처에 salt_auth/salt_enc 추가 + hydrate_session_from_vault 가 vault_unlock 직후 자동 derive + PasskeyButton 이 verify 호출 시 salts 송신. Rust lib 141 → **147 (+6)**, Vitest 346 유지 (+1 expect).

- **다음 Night mode 큐:**
  1. **B-3** — sync_get_root_key 커맨드 (commands/sync.rs 신설, derive_subkey enc_key "crdt-root" → base64url 32바이트, NoSyncSession 에러)
  2. **B-4 (옵션)** — OAuth callback 응답에 salts 포함 (relay 측 변경)
  3. **Phase C** — SecSync stable 검증 + Yjs E2EE 통합
  4. **Phase D~G** — `docs/m9-phase-plan.md` 순차 실행

- **T084 의 deferred 항목 (M9 진입 시점에 처리):**
  - 성공 후 redirect 경로를 `/settings/sync` 로 변경 (현재 `/settings`)
  - `derive_session_keys` 호출 통합 — verify 응답의 salt 로 enc_key 파생 → vault 저장 (M9 sync 가 활성화될 때)

---

## 2026-04-26 수동 검증 라운드 + 5건 hotfix

세션 흐름: 사용자가 manual verification 을 요청 → step-by-step 9 단계 진행 (Relay /health → 앱 부팅 → 언락 → Incidents → Audit → RAILGUARD → GitHub Integration → Pro 토글 → Kill Switch). 단계마다 발견되는 결함을 큐(H1~H5)에 적어두고 검증 끝난 뒤 일괄 fix.

### Hotfix 상세

- **H1** `fix(matcher): b74d71d` — `IncidentRepo::insert_match` 가 plain INSERT 였던 탓에 매 `incident_feed_refresh` 마다 동일한 (incident, credential, reason) 행이 새 ULID 로 누적. 마이그레이션 0004 가 (1) 기존 dupe 를 dedup 하면서 dismissed_at 플래그를 surviving 행으로 propagate, (2) UNIQUE INDEX `idx_incident_match_unique` 생성. repo 함수는 INSERT OR IGNORE + 캐노니컬 id 반환으로 멱등화. 회귀 2 (same triple 3회 insert → 1행, 다른 reason → 2행 공존).
- **H2** `fix(audit): c2d45f9` — `resolveSubjectLabel` 의 `subjectId.slice(-6)` 이 ULID(26자) 만 가정. `state.user_id="default"` (7자) 에 적용되며 `"efault"` 가 잘려나옴. ULID 패턴 정규식 (`/^[0-9A-HJKMNP-TV-Z]{26}$/i`) 체크 후만 truncate. 회귀 7 (literal verbatim, ULID 마지막 6, 25/27 경계, name lookup hit).
- **H3** `fix(ipc): 19afd3d` (H5 와 묶음) — `railguard_apply` 의 `mode` 인자를 FE 가 `Vec<{tag, kind, ...}>` 로 보내는데 Rust 는 단일 `ApplyMode` 기대. `tag` 필드는 의미 없음 (apply_rules 는 룰 전체에 단일 mode 사용). FE `ApplyMode` 타입 재정의 + `apply()` 단일 객체 송신. RailguardPage 테스트의 array-shape 기대값도 정정. 회귀 4 (3 variant + array 거부).
- **H4** `fix(inventory): f350cad` — Drawer 상단 Revoke (`variant="outline"` neutral) 와 INCIDENTS 의 Revoke (`variant="destructive"` filled) 가 같은 `handleRevokeRequested` 를 부르지만 시각적으로 다른 액션처럼 보임. 상단을 outline-destructive (border-red + text-red) 로 정렬하여 파괴성을 표현하되 INCIDENTS 의 filled CTA 와 위계 분리.
- **H5** `fix(ipc): 19afd3d` — `KillSwitchRevokeInput` 필드가 `cred_id` (snake_case) 인데 FE 가 `credId` (camelCase) 송신. Tauri 의 자동 case 변환은 top-level 인자에만 적용, nested struct 필드에는 안 됨. Rust struct 에 `#[serde(rename_all = "camelCase")]` 부착 (Issuer 변형 동일). 회귀 2 (camelCase JSON deserialize 검증).

### 핵심 인사이트

- **자동 테스트의 빈 영역 = IPC 계약**. Rust unit 305+ / Vitest 305 모두 그린이었지만 H3/H5 같은 FE↔Rust 와이어 미스매치는 단위 테스트가 잡지 못했다. 이번 라운드에서 **wire-format regression 패턴** 도입 (kill_switch + railguard + use-subject-labels): 임의 JSON shape 을 직접 deserialize 해 와이어 호환을 고정.
- **마이그레이션은 누적 결함의 cleanup 도 책임진다.** 0004 는 단순히 UNIQUE INDEX 만 추가하지 않고 dismissed_at 의 의미를 보존하면서 dupe 를 제거. 사용자 앱 재기동 시 이전 누적 27행이 자동 정리됨.
- **두 진입점이 같은 핸들러를 부르더라도 시각적 위계가 다르면 사용자가 다른 액션으로 인지한다.** outline-destructive vs filled-destructive 분리로 위계 정리.

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
