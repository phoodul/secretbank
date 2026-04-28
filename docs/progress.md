# Workflow Progress

## Last Checkpoint

- **Time:** 2026-04-28 Night mode 7 (E-4b / E-5 / F-1 3건 연속 완료, 다음 세션은 M9 Phase F-2 부터)
- **Phase:** Phase 3 — Implementation, M4~M8 ✅ + M9 🔄 Phase A+B+C+D 풀+**E 풀**+**F-1** 종료 (16/19 sub-phases) + M15 🔄, 111/132 태스크 (84.1%)
- **이번 Night mode 7 신규 commits (3개):**
  - `113065c` feat(sync) — M9 Phase E-4b: SyncProvider 가 RelayTransport 자동 생성 (auth_get_access_token + sync_get_relay_url)
  - `61a1db3` feat(sync) — M9 Phase E-5: 통합 round-trip (A push → mock relay → B pull)
  - `6d47f94` feat(sync) — M9 Phase F-1: value sync 채널 (D1 0004 + /sync/values endpoints)
- **Tests (4-28 Night mode 7 종료 시점):**
  - Rust api-vault-app lib: **162 passed** (이전 158 + 4: auth_get_access_token 3 + sync_get_relay_url 1)
  - Frontend Vitest: **416 passed** (이전 409 + 7: SyncProvider default-transport +2 + round-trip +5)
  - Relay vitest: **54 passed** (이전 46 + 8: db schema 1 + sync values 7)
  - clippy 0 -D warnings / typecheck 0 / lint 0 errors
- **이번 Night mode 7 처리 완료:**
  1. ✅ **E-4b** — auth_get_access_token + sync_get_relay_url 신규 Tauri 커맨드 + lib.rs 등록 + RelayTransport baseUrl trailing-slash normalize + SyncProvider 가 providedTransport 미공급 시 invoke 3건 fan-out 후 RelayTransport 자동 생성. auth_status null user_id 시 offline_only 폴백.
  2. ✅ **E-5** — 통합 round-trip 회귀. MockRelay (in-memory Map) + 두 RelayTransport + 두 Y.Doc. A.set + push → B.poll → applyUpdate → state 동일. Zero-Knowledge 검증 (raw envelope 평문 누출 0). M9 Phase E 풀 완료.
  3. ✅ **F-1** — encrypted_secret_value 테이블 (per-credential LWW) + Drizzle schema + POST /sync/values + GET /sync/values?since=<ms> + Miniflare 회귀 7. 64KB cap.

- **다음 Night mode 8 큐:**
  1. **F-2** — 클라이언트 services (Rust): `value-root` HKDF subkey of enc_key + `services/value_sync.rs` (push: AEAD encrypt + invoke /sync/values, poll: invoke + decrypt + age vault upsert). 신규 Tauri 커맨드 sync_value_push / sync_value_pull.
  2. **F-3** — 통합: credential_create / _update / _rotate_value 가 value 변경 후 sync_value_push 자동 호출 (sync 활성 시). credential_get 이 latest pulled value 사용. 회귀 — Rust + Miniflare round-trip.
  3. **Phase G** — pairing (X25519 deep-link) + UI (Sync section) + conflict resolver + offline 배지 + Free 2 device entitlement (T092~T096)

- **이전 Night mode 6 체크포인트는 본 파일 아래 섹션 참조.**

---

## Night mode 7 detail entry

상세 처리 이력 + 테스트 카운트는 `docs/work-log.md` 의 "2026-04-28 Night mode 7" 섹션 참조.

---

## Previous checkpoint (2026-04-28 Night mode 6)

- **Time:** 2026-04-28 Night mode 6 (E-2 / E-3 / E-4a 3건 연속 완료, 다음 세션은 M9 Phase E-4b 부터)
- **Phase:** Phase 3 — Implementation, M4~M8 ✅ + M9 🔄 Phase A+B+C+**D 풀**+**E-1~E-4a** 종료 (13/16 sub-phases) + M15 🔄, 111/132 태스크 (84.1%)
- **이번 Night mode 6 신규 commits (3개):**
  - `af307c5` feat(sync) — M9 Phase E-2: D1 0003_sync + /sync/snapshot 골격
  - `97712e6` feat(sync) — M9 Phase E-3: KV rate limit + Miniflare 회귀 +10
  - `155c1a4` feat(sync) — M9 Phase E-4a: RelayTransport (AEAD + HTTP wire) 골격
- **Tests (4-28 Night mode 6 종료 시점):**
  - Rust api-vault-app lib: **158 passed** (변동 없음 — Night mode 6 은 frontend + relay 만)
  - Frontend Vitest: **409 passed** (이전 396 + 13 RelayTransport)
  - relay vitest: **46 passed** (이전 35 + 1 schema D-2 + 10 sync E-3 = 46)
  - clippy 0 -D warnings / typecheck 0 / lint 0 errors
- **이번 Night mode 6 처리 완료:**
  1. ✅ **E-2** — relay D1 0003_sync.sql (encrypted_doc 테이블 + cascade FK) + Drizzle schema + routes/sync.ts 골격 (GET/POST /sync/snapshot, JWT 검증, UPSERT version+1, 1MB cap). +1 schema 회귀
  2. ✅ **E-3** — lib/rate-limit.ts (KV fixed-window per-user 100req/min) + sync.ts hookup + 429 + Retry-After. +10 Miniflare 회귀 (auth/validation/round-trip/rate limit)
  3. ✅ **E-4a** — src/features/sync/relay-transport.ts (RelayTransport class). pushUpdate (encrypt + POST), pollOnce (GET + decrypt + emit), AAD = "user:<userId>" 로 cross-user replay 차단. manualPolling 옵션. +13 회귀 (mock fetch)

- **다음 Night mode 7 큐:**
  1. **E-4b** — SyncProvider 의 transport prop 을 RelayTransport 로 default 교체 + 인증 컨텍스트 연결 (relay url + getAccessToken from auth_session + getSessionKey from sync_get_root_key). App.tsx 마운트 결정.
  2. **E-5** — 통합 round-trip 검증: db:changed → applyDbChangeToYMap → user-edit observer → encodeUpdate → encrypt → POST → 다른 디바이스의 GET → decrypt → applyUpdate. 두 SyncProvider 인스턴스로 시뮬레이션.
  3. **Phase F** — value sync 채널 (encrypted_secret_values 테이블 + value-root key derive + value-only 채널)
  4. **Phase G** — pairing + UI + conflict + offline + entitlement (T092~T096)

- **이전 Night mode 5 체크포인트는 본 파일 아래 섹션 참조.**

---

## Night mode 6 detail entry

상세 처리 이력 + 테스트 카운트는 `docs/work-log.md` 의 "2026-04-28 Night mode 6" 섹션 참조.

---

## Previous checkpoint (2026-04-28 Night mode 5)

- **Time:** 2026-04-28 Night mode 5 (D-2a / D-2b / D-3 / E-1 4건 연속 완료, 다음 세션은 M9 Phase E-2 부터)
- **Phase:** Phase 3 — Implementation, M4~M8 ✅ + M9 🔄 Phase A+B+C+**D 풀**+**E-1** 종료 (10/16 sub-phases) + M15 🔄, 111/132 태스크 (84.1%)
- **이번 Night mode 5 신규 commits (4개):**
  - `7ca9a06` feat(sync) — M9 Phase D-2a: 5 엔티티 매퍼 + ENTITY_MAPPERS registry
  - `cfc1472` feat(sync) — M9 Phase D-2b: db:changed emit 통합 + 14 커맨드 hookup
  - `10bdb92` feat(sync) — M9 Phase D-3: origin loop 회귀 + observer/bridge
  - `6d3b6aa` feat(sync) — M9 Phase E-1: AEAD adapter (XChaCha20-Poly1305)
- **Tests (4-28 Night mode 5 종료 시점):**
  - Rust api-vault-app lib: **158 passed** (이전 153 + 5 sync_emit unit)
  - Frontend Vitest: **396 passed** (이전 363 + 33 — D-2a +13, D-3 +10, E-1 +10)
  - relay vitest 35 / clippy 0 -D warnings / typecheck 0
- **이번 Night mode 5 처리 완료:**
  1. ✅ **D-2a** — 5 추가 엔티티 매퍼 (issuer/project/deployment/usage/settings) + `ENTITY_MAPPERS` registry. project.local_path 는 device-local. settings 는 SYNC_SETTING_KEYS 화이트리스트 (명시 opt-in 정책).
  2. ✅ **D-2b** — `services/sync_emit.rs` (DbChangeEntity 6 + DbChangeOp + DbChangeEmitter trait + Tauri prod / Noop test). AppContext.db_change_emitter 필드 + AppContext::new 시그니처에 emitter 추가. lib.rs setup 에서 prod emitter 주입. 14 mutating 커맨드 hookup (credential 4 / kill_switch revoke / settings / project 3 / deployment 3 / usage 2). issuer 는 사용자 mutation 명령 없어 미부착.
  3. ✅ **D-3** — `src/features/sync/observer.ts`. observeMapWithOriginGuard (sync origin LOCAL_DB/REMOTE 변경은 callback skip — user-edit 채널만) + applyDbChangeToYMap (db:changed → Y.Map.set/delete with ORIGIN_LOCAL_DB). settings 화이트리스트 적용. 무한 루프 방지 검증.
  4. ✅ **E-1** — `src/features/sync/aead.ts`. @noble/ciphers v2.2.0 의 XChaCha20-Poly1305. 32B key + 24B random nonce + AAD 옵션. encrypt/decrypt round-trip + tamper / mismatch 검증.

- **다음 Night mode 6 큐:**
  1. **E-2** — relay D1 migration 0003_sync.sql (`encrypted_docs` 테이블) + 첫 endpoint 골격
  2. **E-3** — relay /sync/snapshot POST + /sync/deltas GET + JWT 보호 + KV rate limit + Miniflare 회귀
  3. **E-4** — RelayTransport (Phase C 의 StubTransport 자리 채우기 — AEAD + HTTP wire) + SyncProvider wire (App.tsx 마운트는 E-5 후)
  4. **E-5** — 통합 round-trip 검증 (db:changed → Y.Map → encrypt → push → relay → onRemoteUpdate → Y.applyUpdate)
  5. **Phase F** — value sync 채널 (encrypted_secret_values)
  6. **Phase G** — pairing + UI + conflict + offline + entitlement (T092~T096)

- **이전 Night mode 4 체크포인트는 본 파일 아래 섹션 참조.**

---

## Night mode 5 detail entry

상세 처리 이력 + 테스트 카운트는 `docs/work-log.md` 의 "2026-04-28 Night mode 5" 섹션 참조.

---

## Previous checkpoint (2026-04-28 Night mode 3)

- **Time:** 2026-04-28 Night mode 3 (T084 + I3 + Playwright + M9 Phase A + B-1 5건 연속 완료, 다음 세션은 M9 Phase B-2 부터)
- **Phase:** Phase 3 — Implementation, **M4~M8 ✅ + M5 10/10 ✅ + M8 8/8 ✅ + M9 🔄 Phase A+B-1 / 7 phases (Phase B 4 sub-phase 분할) + M15 🔄**, 110/132 태스크 (83.3%) + 결함 후속 처리 누적 (4-26 H1~H5 5건 + 4-27 I4/I5 2건 + I1/I2 2건 ✅, **4-28 I3 ✅ listener 표준화 + Playwright E2E 인프라 ✅ + M9 Phase Plan ✅ + 5건 결정 ✅ + Phase B-1 ✅** + J2 ✅ + J1 docs ✅)
- **이번 Night mode 3 신규 commits (10개):**
  - `d619566` feat(auth) — T084 SignIn UI + deep-link callback (M8 8/8 ✅)
  - `22a05ed` docs — T084 커밋 해시 매핑
  - `340e72c` fix(github) — I3 deep-link listener 표준화 (apivault://github/callback)
  - `8672555` test(e2e) — Playwright browser-mode smoke 인프라
  - `40e630b` feat(sync) — M9 Phase A: Yjs 스캐폴드 + 7-phase plan
  - `bcecdab` docs — T087-A 커밋 해시 매핑
  - `0593cc7` docs — M9 Open Issues 5건 사용자 결정 + Phased Expansion
  - `ead6834` feat(sync) — M9 Phase B-1: AuthSession enc_key 라이프사이클 토대
  - `fe3f522` feat(sync) — M9 Phase B-2: verify 흐름에 derive 통합
  - `dcc01e2` feat(sync) — M9 Phase B-3: sync_get_root_key 커맨드 (Phase B 종료)
- **Tests (4-28 Night mode 3 종료 시점):**
  - Rust api-vault-app lib: **152 passed** (이전 136 + 16 — Phase B-1 +5, B-2 +6, B-3 +5)
  - Frontend Vitest: **346 passed** (이전 315 + 31 — T084 +19, I3 +8, Phase A +4)
  - Playwright smoke: **3/3** 통과 (LockScreen / 라우팅 / SignInPage)
  - relay vitest 35 / Rust crypto 5 / storage 39 / 전체 워크스페이스 모두 그린
  - clippy --workspace --all-targets --all-features -D warnings: **0 에러**
  - typecheck: 0 에러
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
  8. ✅ **M9 Phase B-3** — commands/sync.rs 신설, sync_get_root_key 커맨드 (derive_subkey enc_key "crdt-root" → base64url 32바이트), NoSyncSession 에러. lib.rs handler 등록. Rust lib 147 → **152 (+5)**. **Phase B 종료** (B-4 OAuth는 옵션, Phase C 와 병행 가능).

- **다음 Night mode 큐:**
  1. **Phase C** — SecSync stable 5개 체크리스트 검증 → 채택 (또는 fallback D: Yjs + 자체 transport) → SyncProvider 에 SecSync 통합
  2. **B-4 (옵션, Phase C 와 병행)** — OAuth callback 응답에 salts 포함 (relay 측 변경)
  3. **Phase D~G** — `docs/m9-phase-plan.md` 순차 실행

- **T084 의 deferred 항목 (M9 진입 시점에 처리):**
  - 성공 후 redirect 경로를 `/settings/sync` 로 변경 (현재 `/settings`)
  - `derive_session_keys` 호출 통합 — verify 응답의 salt 로 enc_key 파생 → vault 저장 (M9 sync 가 활성화될 때)

---

## 2026-04-28 Night mode 4 — Phase C + B-4 + D-1 (3 commits)

### 세션 정보

- **시작점:** Night mode 3 종료 시점 (M9 Phase B 완료, 다음 큐 = Phase C / B-4 / D~G).
- **종료 시점:** Phase C / B-4 / Phase D-1 완료. 다음 큐 = D-2 / D-3 / E / F / G.
- **신규 commits (3개):**
  - `b550575` feat(sync) — M9 Phase C: fallback D 채택, transport stub + sync boot 통합
  - `4f6ced0` feat(sync) — M9 Phase B-4: OAuth callback salts → AuthSession derive
  - `2ba0069` feat(sync) — M9 Phase D-1: mapping framework + origin marker

### Phase C — secsync stable 검증 → fallback D 자동 채택

- **검증 결과 3 fail / 5**:
  1. ❌ npm publish `0.5.0` (2024-06-04, 22개월 정지)
  2. ⚠️ Yjs 13.6.x 호환 추정 (검증 미실행)
  3. ⚠️ React 19 + TS 5.x 추정 호환
  4. ✅ 보안 advisory 없음 (NLnet 펀딩)
  5. ❌ WS 전용 transport, CF Workers 통합 사례 0건, "WARNING: This is beta software."
- 사용자 결정 4 (≥3 fail 시 fallback D) 사전 승인에 따라 **secsync 미설치, fallback D 자동 채택**.
- `src/features/sync/transport.ts` — `SyncTransport` interface + `StubTransport` (Phase E 의 RelayTransport 도입 전 placeholder).
- `SyncProvider` 확장 — `sync_get_root_key` invoke + rootKey context 노출 + `NoSyncSession` → `status='offline_only'` + unmount 시 `transport.disconnect()` 자동.
- 신규 dep 0개. Vitest +10 (Phase A 4 + Phase C 4 + transport 6).
- project-decisions.md D.1 갱신, m9-phase-plan.md Phase C 정정.

### Phase B-4 — OAuth callback salts → AuthSession derive

- T082 시점에 relay 응답은 이미 salts 포함, 클라이언트가 ignore 하던 dead path 정리.
- `OAuthCallbackResponse` (services/session.rs) — `#[serde(flatten)] tokens` + `salt_auth` + `salt_enc`.
- `exchange_oauth_callback` 가 응답의 salts 를 `complete_session(.., Some(...))` 로 forward → Passkey verify 와 동일 흐름.
- Rust lib 152 → **153 (+1)**. clippy 0 warning.
- 회귀 갱신 1 (`_persists_session_and_records_salts`) + 신규 1 (`_with_passphrase_derives_enc_key`).

### Phase D-1 — mapping framework

Phase D 를 sub-phase 로 분할 (D 전체 = 백엔드 emit hookup + 6 엔티티 매퍼 + origin loop 회귀 → 단일 commit 으로 무리).

- **D-1 (이번 commit)** — framework only.
- **D-2 (다음 큐)** — 백엔드 db:changed emit + 나머지 5 엔티티 매퍼 (issuer / project / deployment / usage / settings).
- **D-3 (다음 큐)** — origin loop 회귀 (Y.Map → SQLite → Y.Map 무한 루프 방지 검증).

D-1 산출물:
- `src/features/sync/origin.ts` — `ORIGIN_LOCAL_DB` / `ORIGIN_REMOTE` Symbol + `runWithOrigin` / `isSyncOrigin` 헬퍼.
- `src/features/sync/mapping.ts` — `SYNC_ENTITIES` 화이트리스트 6 + `EntityMapper<TRow, TYValue>` interface + 첫 reference `credentialMapper` (vault_ref / hash_hint / usages / score 4개 device-local 필드 제외).
- 회귀 +7 (Vitest 363 / 전체 49 파일).

### Tests (4-28 Night mode 4 종료 시점)

- Rust api-vault-app lib: **153 passed** (이전 152 + 1 — B-4 +1)
- Frontend Vitest: **363 passed** (이전 346 + 17 — Phase C +10, D-1 +7)
- relay vitest 35 / Rust crypto 5 / storage 39 / 전체 워크스페이스 모두 그린
- clippy --workspace --all-targets --all-features -D warnings: **0 에러**
- typecheck: 0 에러

### 다음 Night mode 5 큐

1. **D-2** — 백엔드 db:changed emit hookup (15+ mutating 커맨드) + 나머지 5 엔티티 매퍼 (issuer / project / deployment / usage / settings)
2. **D-3** — origin loop 회귀 (Y.Map ↔ SQLite 무한 루프 방지 검증, Vitest +12 target)
3. **Phase E** — relay `/sync` 엔드포인트 + AEAD 라이브러리 결정 (`@noble/ciphers` 의 XChaCha20-Poly1305 후보) + RelayTransport 구현 + D1 migration 0003_sync.sql
4. **Phase F** — value sync 채널 (`encrypted_secret_values` + `value-root` 키 derive)
5. **Phase G** — pairing + UI + conflict resolver + offline + entitlement (T092~T096)

### Architectural seeds (Phase Plan 과 직교, ad-hoc commit 가능)

`m9-phase-plan.md` Open Issues E 에 명시된 4건:
1. `credential.kind` enum 확장 가능 (v1.1 General Secrets 진입 비용 ↓)
2. `issuer` → "Site" 명명 일반화 검토
3. HIBP password breach client prep (T052 패턴 재사용)
4. zxcvbn weak password detector (T024 LockScreen 패턴 재사용)

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
