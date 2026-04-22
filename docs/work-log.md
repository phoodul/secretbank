# Work Log

## 2026-04-23 (M2 진입, T025)

**세션 재개**: `/resume-project` → `last_session.json` 이 0바이트라 `docs/progress.md` 로 컨텍스트 복원. M1 12/12 완료 + 수동 통합 검증 통과 상태에서 M2 진입.

**진행 순서 결정**: 사용자 방침 — CRUD UI 핵심(T025→T026→T027)을 먼저, 드롭&스캔 블록(T032~T035)은 M2 후반으로 미룸. `docs/progress.md` "M2 진행 상황" 에 진행 순서 3단계 기록.

### T025 — Inventory 페이지 목록 뷰 (implementator 에이전트, 커밋 `ab69319`)

- **생성 파일**: `src/features/inventory/{types,use-inventory,CredentialCard,CredentialList,InventoryPage}.tsx` (+ `__tests__/{fixtures,CredentialCard.test,InventoryPage.test}.tsx`), `src/components/ui/select.tsx` (shadcn/ui CLI)
- **수정 파일**: `src/pages/InventoryPage.tsx` (feature 래퍼 1줄로 축소), `src/locales/{en,ko,ja}/common.json` (inventory 네임스페이스 25키), `src/test-setup.ts` (Radix polyfill)
- **기능**: 카드 그리드 + 검색 input + Issuer/Env/Status select 필터 + 빈 상태 + hover progressive disclosure
- **서버/클라 필터 분리**: 서버 `CredentialFilter` (issuer/env/status/expiring_within_days) 는 `credential_list` 에 전달, 이름 검색은 클라이언트 `useMemo` 로 처리
- **테스트**: Vitest +20 (CredentialCard 10 + InventoryPage 10), 전체 33개 통과. 기존 LockScreen/CreateVaultDialog 회귀 없음.
- **검증**: `pnpm exec tsc --noEmit` / `pnpm lint` / `pnpm format:check` / `pnpm exec vitest run` / `cargo build --workspace` 전부 exit 0

**발견한 설계 교훈**:

- **React 19 eslint-plugin-react-hooks `set-state-in-effect` 규칙**: `useEffect` 내부 동기 `setState` 호출 시 경고. `use-inventory.ts` 는 `FetchState` union (`{phase:"loading"} | {phase:"ok"} | {phase:"error"}`) 로 단일 객체 관리하여 회피. 기존 `use-vault-status.ts` 의 `"loading"` 리터럴 방식과 방향은 같으나 에러 상태까지 포괄하는 형태로 확장.
- **Radix Select jsdom 호환성**: `HTMLElement.prototype.{hasPointerCapture,setPointerCapture,releasePointerCapture,scrollIntoView}` 폴리필을 `src/test-setup.ts` 에 추가해야 테스트에서 Select 가 열림. T026 이후 다른 Radix 컴포넌트 테스트에서도 재사용.
- **Radix Select 접근성**: SelectTrigger 는 내부 표시 텍스트만으로는 accessible name 이 계산되지 않음. `aria-label` 명시 필수.
- **Issuer 표시 임시 축약**: T028 프리셋 라이브러리 전까지 `CredentialCard` 의 `IssuerBadge` 는 `issuer_id.slice(0,8)` 표시. TODO 주석 남김.
- **`CredentialSummary.last_rotated_at` 누락**: task.md DoD 의 "마지막 교체일" 요구는 서버 DTO 확장 후에 채움. 카드에 라벨만 준비 (`"—"` placeholder).

### 부수 처리

- `docs/task.md` 의 prettier 자동 리포맷(마크다운 테이블 컬럼 정렬)은 feature 커밋에서 분리 — T025 완료 기록과 함께 별도 docs 커밋에 포함.

### T028 — Issuer 프리셋 라이브러리 (implementator 에이전트, 커밋 `539347f`)

- **생성 파일**: `src-tauri/crates/api-vault-app/src/setup.rs` (164줄, seed_issuer_presets + `#[cfg(test)]` 테스트 3개), `src-tauri/crates/api-vault-app/src/commands/issuer.rs` (51줄, issuer_list/get + IssuerCommandError), `src/features/inventory/issuer-presets.ts` (152줄, IssuerPreset 타입 + ISSUER_PRESETS 10개 + findPreset)
- **수정 파일**: `src-tauri/crates/api-vault-app/Cargo.toml` (sqlx 정식 dep + tempfile dev-dep), `commands/mod.rs` (pub mod issuer), `lib.rs` (.setup() 에서 시드 호출 + invoke_handler 두 블록에 issuer_list/get 등록), `src-tauri/crates/api-vault-storage/tests/migration_test.rs` (부수: clippy empty_line_after_outer_attr)
- **시드 10개**: openai, stripe, github, aws, vercel, supabase, google, anthropic, paddle, cloudflare. 각 slug + display_name + docs_url + issue_url + status_url + security_feed_url(일부) + icon_key.
- **멱등성**: `INSERT OR IGNORE INTO issuer ... (slug UNIQUE)` 로 구현. 두 번째 실행 시 rows_affected == 0.
- **테스트 3개**: `seed_inserts_10_presets` (count=10), `seed_is_idempotent` (두 번째 실행 0), `seed_slug_set_matches_expected` (slug HashSet 일치). tempfile::TempDir + `init_pool` 으로 격리 pool 생성.
- **검증**: `cargo fmt/clippy/test/build`, `pnpm tsc/lint/format:check/vitest` 8개 전부 exit 0. Rust 테스트 총 47개 (+3), Vitest 33개 회귀 없음.

**설계 결정 (의도적 단순화)**:

- `api_vault_core::Issuer` / `IssuerInput` 에 `key_pattern_regex` 필드 **추가하지 않음**. 프론트 `issuer-presets.ts` 에만 `key_pattern_regex` 상수를 둠 — T033 드롭&스캔 구현 시점까지 소비자 없음. 도메인 확장 + 마이그레이션 비용을 미룸.
- 시드는 Tauri 커맨드로 노출하지 않고 `.setup()` 클로저에서 `tauri::async_runtime::block_on(setup::seed_issuer_presets(&ctx.pool))` 로 자동 실행. 멱등이라 매 기동 안전.
- `IssuerRepo::list()` 가 `ORDER BY display_name ASC` 로 이미 정렬하므로 T026 combobox 에서 별도 정렬 불필요.

**발견한 이슈**:

- `api_vault_storage::sqlite::dt_to_ms` 가 `pub(crate)` 가시성이라 외부 크레이트에서 직접 재사용 불가. setup.rs 에서는 `OffsetDateTime::now_utc().unix_timestamp() * 1000 + (now.nanosecond() as i64 / 1_000_000)` 로 인라인 계산. 향후 time 변환이 여러 곳에서 반복되면 `dt_to_ms` 를 `pub` 으로 올리는 걸 검토.
- `api-vault-app` 에 `sqlx` 직접 의존이 없었음 — raw `sqlx::query` 를 쓰려면 정식 dep 추가 필요. Cargo.toml 에 `sqlx = { workspace = true }` 추가.

**T026 에 영향 줄 사실**:

- `issuer_list` 는 Vec\<Issuer\> (전체 필드) 반환. 프론트는 `issuer.slug` 로 `findPreset(slug)` lookup → `icon` / `brand_color` / `key_pattern_regex` 획득.
- 앱 최초 기동 후에도 `issuer_list` 가 반드시 >= 10개 레코드를 반환한다고 가정할 수 있음 (시드 실패 시 app.manage 전에 panic).

### T026 — Credential 등록 다이얼로그 (implementator 에이전트, 커밋 `a7e1d58`, Night mode)

- **생성 파일**: `src/features/inventory/CreateCredentialDialog.tsx` (메인, react-hook-form + zod), `src/features/inventory/use-issuers.ts` (issuer_list invoke 훅, FetchState union 재사용), `src/features/inventory/__tests__/CreateCredentialDialog.test.tsx` (Vitest 12), `src/components/ui/popover.tsx` (shadcn CLI)
- **수정 파일**: `src/features/inventory/InventoryPage.tsx` ("+ Add credential" 버튼 활성화 + Dialog open 상태), `__tests__/InventoryPage.test.tsx` (mock 을 cmd명 분기 패턴으로 전환), `src/locales/{en,ko,ja}/common.json` (inventory 네임스페이스 28키 추가), `src/test-setup.ts` (ResizeObserver 폴리필 추가)
- **필드**: Issuer(Command + Popover 콤보박스, 프리셋 10종), Name, Value(show/hide 토글, `autoComplete="new-password"` + `aria-autocomplete="none"`), Env(dev/staging/prod Select), Scope(optional), Expires at(Input[type=date] → `Date.parse()` ms 변환)
- **invoke 호출 확정**: `invoke("credential_create", { args: { issuer_id, name, env, scope?, expires_at?, hash_hint, value } })`. `CredentialCreateArgs` 의 `#[serde(flatten)]` 때문에 `input` 래핑 없이 평면 구조. `hash_hint = value.slice(-4)` 프론트 자동 계산.
- **성공/에러 처리**: 성공 시 `toast.success` + `form.reset()` + `onSuccess()` (InventoryPage refresh) + `onOpenChange(false)`. 실패 시 `toast.error` + dialog 유지.
- **테스트**: Vitest +13 (CreateCredentialDialog 12 + InventoryPage 통합 1). 전체 46개 통과. mocking: `@tauri-apps/api/core` invoke 는 cmd명 분기(`issuer_list` vs `credential_list` vs `credential_create`), `sonner` toast 객체.
- **검증**: `pnpm tsc/lint/format:check/vitest` + `cargo build --workspace` 5개 exit 0. Rust 쪽 변경 없음.

**설계 결정**:

- **Custom issuer 옵션 연기** (Pending Decision 에 기록). DoD 의 "+ Custom" 선택지는 구현하지 않고 프리셋 10종만. 이유: Custom issuer 는 docs/issue/status URL 수집이 필요해 별도 전용 플로우가 나음. M2 후반 또는 M5 에서 재검토.
- **`aria-autocomplete="off"` 는 유효하지 않은 값** (ARIA spec: inline/list/both/none). DoD 의 "aria-autocomplete=off" 표기는 오기. 실제로는 `aria-autocomplete="none"` 적용. 보조 기술에는 "이 입력은 자동완성 제안을 제공하지 않음"을 알리고, 브라우저 저장 차단은 HTML `autoComplete="new-password"` 로 처리.
- **invoke 인자 `args` 래퍼**: Tauri v2 는 Rust 커맨드 파라미터명과 invoke 의 JS 객체 키를 매치. `credential_create(args: CredentialCreateArgs, ...)` 이므로 JS 는 `{ args: {...} }`. DoD 의 `{ input }` 단축 표기는 잘못. 이후 Rust 커맨드 호출 시 파라미터명 주의.
- **Scope 빈 문자열 → undefined 변환**: zod 에서 `z.string().max(200).optional().or(z.literal("").transform(() => undefined))` 패턴. 제출 시점에 `scope === "" → undefined` 로 명시 변환해 CredentialInput 에 `scope: null` 로 전달되게 함.

**발견한 이슈**:

- **cmdk ResizeObserver 의존**: Command 컴포넌트가 내부적으로 ResizeObserver 사용. jsdom 미구현 → `test-setup.ts` 에 stub 추가(`globalThis.ResizeObserver`). T029 Cmd+K Command Palette 테스트에서도 재사용됨.
- **Popover Portal 영향**: Radix Popover 가 `document.body` 직하에 Portal 렌더링. Vitest 에서 `screen.findByText("OpenAI")` 는 Portal 내부를 자동 탐색하므로 문제없지만, 쿼리 범위를 `within(container)` 로 잡으면 누락 가능.
- **InventoryPage 기존 테스트 영향**: CreateCredentialDialog 가 마운트되면서 `useIssuers` 가 `issuer_list` 를 호출. 기존 `mockResolvedValue(MOCK_CREDENTIALS)` 패턴은 모든 invoke 에 같은 값을 반환해 충돌. 해결: mock 을 cmd명 분기(`if (cmd === "issuer_list") return mockIssuers`)로 전환.
- **Retry 테스트 invoke 카운트 검증 제거**: `useIssuers` 가 추가로 invoke 를 부르므로 `toHaveBeenCalledTimes(2)` 가 불안정. 대신 실질적 동작(에러 배너 사라지고 데이터 표시)으로 검증.

**T027 에 영향 줄 사실**:

- `useIssuers` 훅 재사용 가능 (Drawer 에서 issuer 이름 표시에 쓰임).
- Vitest mock 은 이미 cmd명 분기 패턴 — `credential_get`/`credential_delete`/`credential_copy_to_clipboard` 추가 시 자연스럽게 확장.
- Dialog 닫힘 시 form.reset + 로컬 상태 초기화 로직이 `handleOpenChange` 내부로 통합된 패턴. Sheet 도 동일 패턴 적용 권장.
- T023 의 `clipboard:countdown` 이벤트는 `@tauri-apps/api/event` 의 `listen()` 으로 구독. 이벤트 payload: `{ remaining: u32 }`. 30 → 0 1초 간격. Drawer 언마운트 시 unlisten 필수.

---

## 2026-04-22 (M1 완료, SAC Off 적용 후 재개)

**커밋 누적**: 21개 (`855c33c` → `71d37bc`)

**M0 Foundation**: 완료 (T001~T012, 12 태스크)

**M1 Local Vault Core**: ✅ **12/12 완료**

- T013 SQLite 스키마 · T014/T015 VaultStorage trait/Mock · T016 AgeVaultStorage(age 0.11 + 옵션 α)
- T017 KDF(Argon2id+HKDF) · T018 OS Keyring · T019 SQLite 레포지터리 · T020 도메인 모델
- T021 Vault 커맨드 · T022 Credential 커맨드
- **T024** Lock Screen + Create Vault Dialog (zxcvbn 강도 미터, 커밋 `7946476`)
- **T023** 클립보드 자동 만료 30초 (취소 토큰 + countdown 이벤트, 커밋 `71d37bc`)

### T024 — Lock Screen UI (implementator 에이전트)

- **생성 파일**: `src/features/vault/use-vault-status.ts` (invoke + loading/refresh 훅), `LockScreen.tsx` (3회 연속 실패 시 10초 쿨다운, `useRef` 카운터), `CreateVaultDialog.tsx` (zxcvbn 5구간 강도 미터, 최소 12자 + 일치 검증), `__tests__/*.test.tsx` (Vitest 13개), `src/components/ui/card.tsx` (shadcn/ui 패턴 직접 구현), `vitest.config.ts`, `src/test-setup.ts`
- **수정 파일**: `src/App.tsx` (vault_status 분기: loading → uninitialized → locked → unlocked), `src/locales/{en,ko,ja}/common.json` (vault 네임스페이스 22개 키)
- **의존성 추가**: `zxcvbn`, `@types/zxcvbn`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`
- **검증**: typecheck/lint/format:check/vitest(13/13)/cargo build 전부 exit 0

### T023 — 클립보드 자동 만료 (implementator 에이전트)

- **생성 파일**: `src-tauri/crates/api-vault-app/src/commands/clipboard.rs` (`credential_copy_to_clipboard` 커맨드 + `run_clipboard_timer` 순수 함수 + 4개 단위 테스트)
- **리팩터**: `credentials.rs` 에서 `reveal_secret` 헬퍼를 추출해 `credential_reveal` / `credential_copy_to_clipboard` 두 커맨드가 공유 (코드 중복 제거)
- **AppContext 확장**: `clipboard_controller: Arc<Mutex<Option<JoinHandle>>>` 필드 추가. 중복 호출 시 이전 `JoinHandle::abort()` 로 이전 타이머 취소 → 새 복사가 clear 주기 단독 소유
- **이벤트**: 매 1초 `clipboard:countdown { remaining: u32 }` emit, 만료 시 `remaining: 0` 최종 이벤트 + `write_text("")` 로 클립보드 비움
- **테스트 전략**: `tokio::time::pause` + `Arc<AtomicU32>` 카운터로 tick/clear 호출 횟수 확정 검증. `tokio::select!` 로 부분 틱 경쟁 해결.
- **플러그인 게이팅**: `#[cfg(feature = "tauri-plugins")]` 아래에서만 mod 선언 + invoke_handler 등록 (테스트 빌드 링크 오류 회피)
- **dev-dependencies**: `tokio features = ["test-util"]` 추가

### 부수 수정

- **빌드 복구** (`42b7769`): `tauri-plugins` feature 리스트에 `dep:tauri-plugin-updater`, `dep:tauri-plugin-biometric` 추가. 재부팅 후 풀 빌드에서 E0433 (cannot find module `tauri_plugin_updater`) 발생 → feature flag 누락이 원인. platform gating 은 target-specific `[dependencies]` + `#[cfg(target_os)]` 이중 보장됨.
- **docs 포맷 정리** (`781d547`): prettier markdown 규칙에 따라 코드 펜스 앞뒤 빈 줄 삽입. 내용 변경 없음.

### SAC 블로커 해소

- 사용자가 SAC Off 적용 후 재부팅 → `pnpm tauri dev` 풀 빌드 정상. `docs/project-decisions.md` "개발 환경 정책" A-2 적용 완료.

### M1 수동 통합 검증 + 플러그인 ACL 구조 버그 발견 (commits `eaece03`, `987b857`)

**수동 검증 전 흐름**: CreateVault (zxcvbn 강도 미터) → Lock/Unlock (3회 실패 10초 쿨다운) → credential_create/list/reveal (age 볼트 라운드트립) → credential_copy_to_clipboard (30초 자동 만료 + countdown 이벤트) 전부 통과.

**플러그인 ACL 구조 버그 (`eaece03`)**:

- **증상**: `Database.load()` 호출 시 `sql.load not allowed. Plugin not found`. 이어 `clipboard-manager`, `event`, 기타 플러그인 IPC 도 전부 같은 패턴으로 차단됨을 확인.
- **원인**: Tauri workspace 에서 `tauri_build::build()` 는 root crate (`src-tauri/build.rs`) 에서 실행되어 `gen/schemas/{capabilities,acl-manifests}.json` 을 root crate 의 OUT_DIR 에 emit 한다. 그러나 `tauri::generate_context!` 를 subcrate (`api-vault-app`) 에서 호출하면 매크로가 호출 crate 의 `CARGO_MANIFEST_DIR` 기준으로 gen/schemas 를 찾아 **플러그인 ACL 매니페스트를 못 읽는다**. 커스텀 `#[tauri::command]` 는 `core:default` 에서만 검증되어 이 불일치가 T023 수동 검증 전까지 드러나지 않았음.
- **수정**: `src-tauri/src/main.rs` 에서 `generate_context!()` 호출 후 결과를 `api_vault_app::run(context: tauri::Context)` 로 전달. `serde`, `serde_json` 을 root Cargo.toml 에 추가 (매크로 expansion 이 참조).
- **교훈**: Tauri workspace 분리 시 `generate_context!` 는 **반드시 root crate 에서만** 호출해야 한다. 이는 T001 구조 재조정 시점에 발견됐어야 하는 issue였는데 플러그인 IPC 를 수동 검증 단계까지 호출하지 않아 잠복해 있었음.

**ULID 검증 레이어 불일치 (교훈만)**:

- `IssuerId` 는 `#[serde(transparent)]` 로 감싼 `ulid::Ulid` newtype. `Ulid::from_string` 이 Crockford Base32 (`I`, `L`, `O`, `U` 제외) 를 엄격 검증하고 위반 시 `DecodeError::InvalidChar` ("invalid character") 반환. SQLite `TEXT PRIMARY KEY` 는 무검증이라 두 레이어의 validation 이 다름.
- 수동 테스트 중 `01HZZZTESTISSUER0000000001` (I, U 포함) 를 프론트에서 넘겨 SQLite INSERT 는 성공했지만 `credential_create` 의 `IssuerId` deserialize 에서 실패. 원인 파악에 여러 사이클 소요.
- M2 에서 `issuer_create` Tauri 커맨드를 구현하면 프론트가 직접 ULID 를 구성할 일이 없어지므로 근본 해결됨. 이미 `IssuerInput` 에 id 필드 없고 서버에서 `IssuerId::new()` 로 생성해 반환하는 구조라 M2 구현 시 그 패턴을 유지.

**Dev 편의 설정 (`987b857`)**:

- `src-tauri/tauri.conf.json` `app.withGlobalTauri: true` (기본 false)
- `src/main.tsx` `import.meta.env.DEV` 가드로 `window.__dev = {invoke, listen, Database}` 노출 (production 빌드에서 Vite dead-code elimination)
- `src-tauri/capabilities/default.json` `sql:allow-execute` 추가 (M2 `issuer_create` 커맨드 도입 후 재검토 예정)

---

## 2026-04-22 (상세)

### T001 구조 재조정 — pnpm tauri dev 복구 (긴급 수정)

**원인:** T001에서 `src-tauri/Cargo.toml`을 virtual manifest(workspace-only)로 교체한 결과 `@tauri-apps/cli`가 `[package]` 섹션을 찾지 못해 `"No package info in the config file"` 오류 발생.

**변경 파일:**

- `src-tauri/Cargo.toml` — `[workspace]` + `[package]`(api-vault) + `[[bin]]`(src/main.rs) + `[build-dependencies]`(tauri-build) + `[dependencies]`(플러그인 9종 mirror) 추가
- `src-tauri/src/main.rs` — 신규 생성. `api_vault_app::run()` 호출 shim
- `src-tauri/build.rs` — 신규 생성. `tauri_build::build()` 표준 호출
- `src-tauri/crates/api-vault-app/Cargo.toml` — `[[bin]]` + `build-dependencies` 제거, `[lib]` name="api_vault_app"
- `src-tauri/crates/api-vault-app/build.rs` — `cargo::rustc-check-cfg` 선언만 (OUT_DIR 확보. `tauri_build::build()` 미호출 — Windows embed-resource `rustc-link-arg-bins` 이슈)
- `src-tauri/crates/api-vault-app/src/main.rs` — 삭제
- `src-tauri/tauri.conf.json` — `plugins.updater` 섹션 추가

**검증 결과:**

1. `cargo build --workspace` — exit 0
2. `cargo test --workspace` — exit 0
3. `cargo clippy --workspace -- -D warnings` — exit 0
4. `cargo fmt --all --check` — exit 0
5. `pnpm tauri dev` — "No package info" 에러 사라짐, Rust 컴파일 후 앱 창 정상 오픈
6. `pnpm exec tsc --noEmit` — exit 0

### T010~T012 완료 — 라우팅 + i18n + 개발 가이드 (M0 완료)

**T010: 라우팅 + 셸 레이아웃**

- `react-router-dom@7.14.2` 설치
- `src/lib/platform.ts` — `getPlatform()` (동기 best-effort) + `usePlatform()` (async Tauri OS 감지)
- `src/components/shell/AppShell.tsx` — 데스크톱 Sidebar + 모바일 BottomNav 조건부 렌더, 상단 헤더
- `src/components/shell/Sidebar.tsx` — 로고 + 5개 NavLink (active 하이라이트)
- `src/components/shell/BottomNav.tsx` — 모바일 하단 탭 바
- `src/pages/` — InventoryPage/GraphPage/IncidentsPage/AuditPage/SettingsPage (placeholder)
- `src/App.tsx` — BrowserRouter + Routes 재작성 (5개 Route)

**T011: i18n 초기 설정**

- `i18next@26.0.6` + `react-i18next@17.0.4` + `i18next-browser-languagedetector@8.2.1` 설치
- `src/lib/i18n.ts` — LanguageDetector + initReactI18next, fallback en, support en/ko/ja
- `src/locales/{en,ko,ja}/common.json` — app/nav/common/settings 키 구조
- `src/main.tsx` — `import "./lib/i18n"` 추가 (side-effect init)
- Sidebar/BottomNav/AppShell/Pages 문자열 전부 `useTranslation()` 키로 전환
- SettingsPage — 테마 탭 + 언어 탭 (i18n.changeLanguage 연동)

**T012: 개발 가이드**

- `docs/dev-setup.md` 신규 (약 280행) — Prerequisites/First-time Setup/Daily Dev/Testing/Folder Layout/Troubleshooting 5건/Docs Index/한국어 요약

**검증 결과:** `pnpm typecheck` exit 0, `pnpm lint` 0 errors (5 warnings 기존 파일), `pnpm format:check` exit 0, `cargo build --workspace` exit 0.

---

### 세션 시작 및 초기 정리

- `/start-project` 실행. Orchestrator(Claude Opus 4.7) 세션 시작.
- `user_research/` 검토: `initial_idea.md` + ChatGPT/Gemini Deep Research 3종 확인.
- 프로젝트 초기 결정 사항을 `docs/project-decisions.md` 에 기록.

### Deep Research 비교 분석 (사용자 요청)

- ChatGPT Deep Research: 플랫폼 명시 없음, 서버/SaaS 관점 암시 (HashiCorp Vault, AWS Secrets Manager 등 벤치마크).
- Gemini Deep Research: **Local-First + CRDT + E2EE 멀티 디바이스 동기화** 명시적 권장 (섹션 2.2). 랩탑 + 스마트폰 가정.
- initial_idea.md는 데스크톱 전용을 권장 → 두 딥리서치 결과와 부분적 불일치 발견.

### 프로젝트 방향 대전환 (Q1~Q5 확정)

사용자가 목표를 재정의:

> "3주라는 기간은 중요하지 않다. 실용적이고 가치 있는 앱을 월 $2에 전 세계 5000만 사용자에게 제공하는 것이 목적."

사용자 답변:

- **Q1 페르소나:** 전문 개발자 + **바이브 코더** 포함 (AI 시대 폭발적 성장 예상, 복잡 설정 대행 수요).
- **Q2 플랫폼:** **풀스택** (Desktop + Mobile + Web 대시보드).
- **Q3 수익 모델:** **Freemium + $2/월 Pro** (Bitwarden 모델).
- **Q4 오픈소스:** **Open Core** (핵심 OSS, 프리미엄 기능 클로즈드).
- **Q5 팀:** **1인 개발 지속**, 성공 시에만 확장.

`docs/project-decisions.md` 전면 갱신:

- "데스크톱 전용" 결정 폐기 → 풀스택으로 변경
- "3주 MVP" 제약 폐기 → "가치 기준" MVP로 변경
- "Phase 2 클라우드 동기화" → Phase 0 필수 (E2EE + CRDT)
- 바이브 코더 페르소나 추가, Freemium·Open Core·1인 운영 전략 명시

### Phase 1 Research 완료

- **researcher** (~11분, 58 tool calls, 120K tokens) → `docs/research_raw.md` (14 주제, 48 출처)
  - 주요 발견: Stronghold v3 deprecated 예정 → 추상화 레이어 필요; NVD RSS 폐기(2025-08) → API 2.0 필수; LiteLLM은 Rust 직접 추상화 권장; Tauri v2 모바일 Stable(2024-10)이지만 일부 FS API 미구현; CRDT는 Yjs + SecSync; 인프라는 Cloudflare Workers + D1 + KV; 라이선스는 AGPL-3.0 + EE 독점(Bitwarden 모델); 결제는 Paddle(MoR) + RevenueCat(IAP 통합).
- **ux-researcher** (~7분, 27 tool calls, 103K tokens) → `docs/ux_research.md` (Option A/B/C)
  - Option A "Security Minimal" (shadcn/ui + Radix + Tailwind v4 + Inter + JetBrains Mono + Lucide) — 잠정 추천 (agmmnn/tauri-ui 보일러플레이트 검증, 접근성 자동, 두 페르소나 균형).
  - Option B "Warm Professional" (Mantine v7 + Phosphor + IBM Plex Mono) — 바이브 코더 친화성 최고이나 번들 큼.
  - Option C "Power Condensed" (Ark UI 헤드리스 + Geist + Motion One) — 파워 유저 경험 최고이나 초기 비용 가장 큼.

### Phase 2 Integration 완료

- **integrator** (~6분, 7 tool calls, 97K tokens) → `docs/integrator_report.md` (약 6,000 단어)
- CRAAP 평가: 🟢 12 / 🟡 4 / 🔴 1
- MoSCoW 분류: Must 10 / Should 7 / Could(Phase 2) 10 / Won't 6

### Gate 1 통과 — 사용자 결정 8건

- Q1 Kill Switch: **C** (revoke 무료, 자동 배포 Pro)
- Q2 모바일 MVP: **A** (데스크톱+모바일 동시 출시) — _integrator 권장(B)과 반대. MVP 범위 대폭 확장._
- Q3 앱스토어: **A** (RevenueCat + Apple IAP 15% + Google Play Billing + Paddle MoR)
- Q4 라이선스: **A** (AGPL-3.0 + EE 이중 라이선스, CLA 필수)
- Q5 GitHub 커넥터: **B** (읽기 무료, 쓰기 Pro)
- Q6 Stronghold v3: **B** (VaultStorage trait 추상화만 지금 설계)
- Q7 웹 읽기 뷰어: **A** (Phase 1 후반부 포함, Vite React 공용)
- Q8 RAILGUARD: **A** (MVP Must 포함)

**MVP 범위 재정의**: Q2=A로 인해 E2EE 동기화, 모바일, 웹 뷰어, Cloudflare Workers 릴레이 서버, Paddle+RevenueCat 결제, 유저 인증까지 Must로 승격.

### Gate 1.5 — 디자인 시스템 선택

- 사용자가 **Option A (Security Minimal)** 선택.
- 구성: shadcn/ui + Radix UI + Tailwind CSS v4 + Inter/JetBrains Mono + Lucide + Motion.
- 하이브리드 보완: Option C의 Cmd+K Command Palette + 조밀한 Graph 파워 뷰 선택 채용.
- 근거: Tauri v2 검증(`agmmnn/tauri-ui`), 접근성 자동, 두 페르소나 균형, 1인 유지보수 최적.

### Phase 2.5 — ui-prototype 스킬 실행 완료

- **패키지 설치** (pnpm): tailwindcss@4.2.4, @tailwindcss/vite, clsx, tailwind-merge, class-variance-authority, tw-animate-css, lucide-react, motion, @radix-ui/react-slot, @fontsource-variable/inter, @fontsource-variable/jetbrains-mono (총 +29 deps, 8.6s)
- **신규 파일**
  - `components.json` — shadcn/ui CLI 설정 (New York, neutral base, `@/*` aliases)
  - `src/styles/globals.css` — Tailwind v4 엔트리 + Radix-inspired oklch 라이트/다크 토큰 + @theme inline + prefers-reduced-motion
  - `src/lib/utils.ts` — cn() (clsx + tailwind-merge)
  - `src/components/ui/button.tsx` — shadcn/ui New York Button (cva + Slot)
  - `src/components/theme/theme-provider.tsx` — light/dark/system + useTheme
- **수정 파일**
  - `vite.config.ts` — @tailwindcss/vite 플러그인 + `@` alias
  - `tsconfig.json` — baseUrl + `@/*` paths
  - `index.html` — title "API Vault"
  - `src/main.tsx` — globals.css import + ThemeProvider 래핑
  - `src/App.tsx` — skeleton (ShieldCheck + theme toggle)
  - `CLAUDE.md` — UI/UX Architecture 섹션 추가
- **삭제**: `src/App.css`
- **검증**: `pnpm exec tsc --noEmit` 통과.

### Phase 2.6 — Planning 완료 (planner 에이전트)

- **산출물 3종** 생성 (`docs/` 에만 기록, 소스 코드 변경 없음):
  - `docs/architecture.md` (~4,800 단어)
    - 시스템 개요 + ASCII 아키텍처 다이어그램 (Trust boundary 3층: 기기/릴레이/외부 SaaS)
    - 데이터 모델: SQLite Mermaid ER 다이어그램 (10 테이블), Stronghold 레코드 스키마, Yjs Y.Doc 구조, 키 값 동기화 채널 분리
    - 모듈 경계: Rust 9-크레이트 워크스페이스(api-vault-{core, storage, crypto, audit, feeds, connectors, railguard, sync, app}) + React features/ 디렉터리 + Cloudflare Workers 릴레이 구조
    - 보안: Argon2id + HKDF 키 파생 체인, salt_auth != salt_enc, OS Keyring 경로별 구성, SecSync CRDT 암호화, ed25519 감사 체인, minisign 업데이트
    - 플랫폼 매트릭스: 데스크톱/모바일/웹 기능 지원표 + `VITE_BUILD_TARGET=web` 분기 패턴
    - 외부 의존성: NVD/GHSA/RSS/HIBP 폴링 주기, GitHub App 최소 권한, D1/KV 바인딩, Paddle+RevenueCat 흐름
    - 배포: GitHub Actions 6-매트릭스 + minisign + Authenticode/notarization + Fastlane
    - 관측성 + 1인 운영 원칙 + 오픈 이슈 7건
  - `docs/task.md` (~8,500 단어)
    - **총 118개 태스크** — Must 82 / Should 21 / Could 15
    - **14개 마일스톤** — M0 Foundation ~ M13 Release (Gate 1 Q2=A 로 모바일·웹·동기화 포함 확정된 범위 반영)
    - 각 태스크: ID/Milestone/Priority/Depends on/Title/Goal/DoD 체크리스트/Files Touched/Tests
    - 의존성 그래프 + 병렬 가능 구간 + 태스크 통계표
  - `docs/implementation_plan.md` (~9,200 단어)
    - 사전 준비(ENV 13종, 계정 등록 11종, 개발 환경)
    - 각 M{0..13} 마다: 개요, 태스크 그룹, 핵심 기술 결정(라이브러리+버전+근거), TDD 전략(먼저 쓸 테스트 코드 스니펫), 리스크 & 완화(5~7개), 검증 체크리스트
    - 전체 롤백 계획 + 1인 운영 원칙 재확인

### Gate 2 통과 — 사용자 결정 7건 (Open Issues 전부)

- Q1 리포 구조: **A (분리 레포)** — `api-vault` (public, AGPL-3.0) + `api-vault-relay` (private, EE)
- Q2 GitHub Organization: **`api-vault`**
- Q3 Free tier 디바이스 수: **2대** (planner 제안)
- Q4 도메인: M12/M13 직전 확보 (후보 우선순위: apivault.app → api-vault.dev)
- Q5 외부 계정/결제: 마일스톤별 JIT (Cloudflare=M9, Paddle=M10-2주 전, RevenueCat=M10, Apple/Google=M11, GitHub App=M5)
- Q6 Windows 코드 서명: **SignPath OSS** (무료, AGPL 자격)
- Q7 법률 문서: iubenda/Termly로 시작, 사용자 수천 명 돌파 시 변호사 리뷰로 전환
- 추가 Issue #8: Stronghold 모바일 실패 시 iOS Keychain/Android Keystore + age crate로 대체 경로 명시

### Phase 3 실행 모드 확정 + T001+T002 완료 (implementator 에이전트)

**실행 모드:** Auto edits 선택. implementator 에이전트가 T001+T002를 한 단위로 처리.

**T001 — Cargo 워크스페이스 분리 스캐폴드:**

- `src-tauri/Cargo.toml` → workspace root로 교체
- `src-tauri/crates/api-vault-app/` — 기존 main.rs + lib.rs + build.rs 이동 (Tauri 진입점)
- `src-tauri/crates/api-vault-{core,storage,crypto,audit,feeds,connectors,railguard,sync}/` — lib stub 8개 생성
- `src-tauri/src/` + `src-tauri/build.rs` 제거 (api-vault-app으로 이전 완료 후)
- 기술 해결: `tauri::generate_context!("../../tauri.conf.json")` 경로 명시 + `build.rs`에서 `set_current_dir(workspace_root)` 처리 (`tauri-build`가 `tauri.conf.json` 탐색 위치 보정)

**T002 — workspace.dependencies 추가:**

- tokio 1, serde 1, serde_json 1, sqlx 0.8, thiserror 2.0.18, anyhow 1, tracing 0.1, tracing-subscriber 0.3, ulid 1, time 0.3, reqwest 0.12, secrecy 0.10.3, zeroize 1, tauri 2, tauri-build 2, tauri-plugin-opener 2
- `api-vault-app/Cargo.toml`에서 tauri/tauri-build/tauri-plugin-opener/serde/serde_json를 `{ workspace = true }`로 전환

**검증 결과:**

- `cargo build --workspace` — exit 0
- `cargo test --workspace` — exit 0 (smoke tests 8개 통과)
- `cargo clippy --workspace -- -D warnings` — exit 0 (경고 없음)
- `pnpm exec tsc --noEmit` — exit 0 (프론트엔드 불변 확인)

### T004~T007 — LICENSE·CLA·lint/CI·README (implementator 에이전트)

**T004 — AGPL-3.0 라이선스:**

- `curl -L -o LICENSE https://www.gnu.org/licenses/agpl-3.0.txt` (34,523 bytes)
- `LICENSE_FAQ.md` 신규 작성 (5 Q&A: 라이선스 종류, AGPL vs EE 경계, 셀프호스팅, 상업용 문의, 기여 방법)

**T005 — CLA 자동화:**

- `.github/CLA.md` — 저작권 소유 확인, 저작권·특허 라이선스 부여, 라이선스 변경 허용, 한국어 TLDR 포함
- `.github/workflows/cla.yml` — `contributor-assistant/github-action@v2`, signatures/version1/cla.json, allowlist: dependabot[bot]
- `.github/pull_request_template.md` — Summary / Test plan (4 체크박스) / CLA 동의 문구

**T006 — lint/CI:**

- `src-tauri/rustfmt.toml` — edition=2021, max_width=100 (nightly-only imports_granularity/group_imports 제외)
- ESLint@9 + typescript-eslint + eslint-plugin-react/hooks/refresh + prettier + globals 설치 (pnpm)
- `eslint.config.js` — flat config, tseslint.config(), react.configs.flat, allowConstantExport: true
- `.prettierrc` — semi, singleQuote: false, trailingComma: all, printWidth: 100
- `.prettierignore` — dist, node_modules, src-tauri/target|gen, pnpm-lock.yaml, LICENSE, Cargo.lock
- `package.json` — scripts 추가: lint, lint:fix, format, format:check, typecheck
- `.github/workflows/ci.yml` — rust job (fmt/clippy/test) + frontend job (typecheck/lint/format:check)
- 기존 소스 파일 전체 prettier 포맷 일괄 적용

**T007 — README.md 재작성:**

- Vite 기본 템플릿 완전 대체
- 섹션: 제목+뱃지, About, Features(8개), Tech Stack, Platforms, Getting Started, Dev Commands, License, Contributing, 한국어 요약

**최종 검증 결과:**

- `cargo fmt --check` — exit 0
- `cargo clippy -D warnings` — exit 0
- `cargo test --workspace` — exit 0 (smoke 8개 통과)
- `pnpm typecheck` — exit 0
- `pnpm lint` — exit 0 (warn 2개: react-refresh/only-export-components, 허용 수준)
- `pnpm format:check` — exit 0
- LICENSE 크기 34,523 bytes (30KB 이상 기준 통과)
- `.github/workflows/ci.yml`, `.github/workflows/cla.yml` 존재 확인

**커밋:** `de3706d` chore: AGPL-3.0 라이선스·CLA·lint/CI·README 추가 (T004~T007)

### T003 — Tauri v2 플러그인 활성화 (implementator 에이전트)

**추가된 Rust 의존성 (`api-vault-app/Cargo.toml`):**

- `tauri-plugin-sql@2.4.0` (features=["sqlite"])
- `tauri-plugin-clipboard-manager@2.3.2`
- `tauri-plugin-shell@2.3.5`
- `tauri-plugin-os@2.3.2`
- `tauri-plugin-notification@2.3.3`
- `tauri-plugin-deep-link@2.4.7`
- `tauri-plugin-http@2.5.8`
- `tauri-plugin-updater@2.10.1` (데스크톱 전용 cfg)
- `tauri-plugin-biometric@2.3.2` (모바일 전용 cfg)
- `tauri-plugin-stronghold@2.3.1` — **일시 주석 처리** (AppLocker 빌드 차단 이슈)

**이슈 (AppLocker):**

- `iota_stronghold` → `libsodium-sys-stable` 빌드 스크립트가 Windows AppLocker에 차단됨.
- 관리자 권한으로 target 디렉터리 Defender 예외 추가 후 Cargo.toml/lib.rs 주석 해제 시 활성화 가능.
- `cfg(desktop)` 대신 `cfg(not(any(target_os="android", target_os="ios")))` 사용 (Cargo dependency resolution 시점 cfg 플래그 제한).

**추가된 capability permissions:**

- `capabilities/default.json`: sql, clipboard-manager, shell, os, notification, deep-link, http
- `capabilities/desktop.json` (신규): updater:default (데스크톱 플랫폼 전용 분리)

**JS 패키지 설치 (pnpm):**

- `@tauri-apps/plugin-{sql,stronghold,clipboard-manager,shell,os,updater,notification,biometric,deep-link,http}` 각 ^2

**검증 결과:**

- `cargo build --workspace` — exit 0
- `cargo test --workspace` — exit 0
- `cargo clippy --workspace -- -D warnings` — exit 0
- `pnpm exec tsc --noEmit` — exit 0

### T008+T009 — Tailwind 시맨틱 토큰 + shadcn/ui primitive 12종 (implementator 에이전트)

**T008 — vault 시맨틱 토큰 추가:**

- `src/styles/globals.css` `:root`에 4쌍(danger/warning/success/info + 각 foreground) 추가
- `.dark` 블록에 다크 모드 버전 동일하게 추가
- `@theme inline`에 `--color-vault-*` 매핑 8개 추가
- `src/components/ui/badge.tsx` 신규 작성 (cva, variant: default/secondary/destructive/outline/danger/warning/success/info)

**T009 — shadcn/ui CLI 12종 설치:**

- 설치 명령: `pnpm dlx shadcn@latest add dialog input label form tabs tooltip sonner dropdown-menu command scroll-area separator skeleton --yes --overwrite`
- 생성된 파일 12개: dialog.tsx, input.tsx, label.tsx, form.tsx, tabs.tsx, tooltip.tsx, sonner.tsx, dropdown-menu.tsx, command.tsx, scroll-area.tsx, separator.tsx, skeleton.tsx
- CLI가 button.tsx도 최신 버전으로 업데이트 (radix-ui 통합 패키지 사용, Slot.Root 방식)
- 신규 패키지: `radix-ui@^1.4.3`, `sonner@^2.0.7`, `cmdk@^1.1.1`, `react-hook-form@^7.73.1`, `@hookform/resolvers@^5.2.2`, `zod@^4.3.6`, `next-themes@^0.4.6`

**추가 조치:**

- `sonner.tsx`의 `useTheme` import를 `next-themes` → `@/components/theme/theme-provider`로 교체
- `src/main.tsx`에 `<Toaster />` (sonner) 마운트 (ThemeProvider 내부)

**검증 결과:**

- `pnpm typecheck` — exit 0 (에러 없음)
- `pnpm lint` — exit 0 (경고 5개, 에러 없음; react-refresh/only-export-components, shadcn/ui 패턴상 무시 가능)
- `pnpm format` → `pnpm format:check` — exit 0
- `cargo build --workspace` — exit 0 (Rust 영향 없음)
