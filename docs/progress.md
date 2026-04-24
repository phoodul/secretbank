# Workflow Progress

## Last Checkpoint

- **Time:** 2026-04-25 04:xx (Night mode 자율 연속 실행 종료)
- **Phase:** Phase 3 — Implementation, **M4~M7 ✅ 완료**, 74/118 태스크 달성 (62.7%)
- **Commits:** 112개 누적. Night mode 세션 신규 24개:
  - M4 (3 + 보충 3): `7bfac7c` T056 Incidents UI / `3858a5d` T057 Credential Detail / `35548dd` T058 NVD Settings / `c49ed8f` typecheck fix / `00e8bde` incident UNIQUE / `6acbf64` RunEvent::Exit
  - M5 (6): `119e11c` T059 Connector trait / `ec6b042` T060 GitHub skeleton / `8ec8b32` T065 RAILGUARD templates / `f57e84a` T066 preview/apply / `892f671` T067 RAILGUARD UI / `d23ef6d` T068 auto-suggestion
  - M6 (6): `79a8c1e` T069 AuditLog / `ee30a79` T070 Device identity / `e55b03d` T071 audit hooks / `cf01646` T072 audit commands / `4a3d8e2` T073 Audit UI / `4ac1c79` T074 Credential audit section
  - M7 (4): `ae471e9` T075 kill_switch backend / `27c307b` T076 2-step dialog / `0a26ff1` T077 Revoked viz / `59c3ac8` T078 Bulk revoke
  - Docs/보충 (2): `546b06f` M5 architecture docs / `e5f8227` M7 runbooks
- **Tests:** 
  - Rust workspace 전체 통과 (audit 16 + kill_switch 8 + railguard 8 + connectors 45 + github 4 + incident repo 15 + scheduler hooks 43 + feed commands 5 + core 1 신규 외 다수 업데이트)
  - Vitest **288개** 전부 통과 (T056: +5, T057: +5, T058: +6, T067: +6, T068: +1, T073: +6, T074: +5, T076: +5, T077: +4, T078: +5 신규, 기타 pre-existing 업데이트)
  - `pnpm typecheck` **0 에러** (pre-existing 5개 전부 해소)
  - `cargo clippy --workspace -- -D warnings` clean
  - `pnpm lint` 0 에러 (6 warnings: pre-existing shadcn react-refresh)
- **Blocker:** 없음
- **Mode:** 🌙 Night mode 종료. 자율 연속 실행으로 M4~M7 완주
- **Next (사용자 결정 필요):**
  1. **M5 T061~T064 재개 여부**: Cloudflare Workers 릴레이 배포 (외부 인프라 필요) → defer 여부 확정
  2. **M8 Auth 시작**: Passkey + OAuth (relaying 기반), 외부 인프라 준비 후
  3. **수동 검증 (선택)**: M4 Incident Feed (feed poll + refresh + UI filter) + M5 RAILGUARD (프로젝트 auto-generate) + M6 Audit (chain verify) + M7 Kill Switch (revoke flow) end-to-end
  4. **다음 세션 모드**: 일반 모드로 복귀 (Gate 3/4 승인 재개)

---

## M7 Kill Switch 완료 + M6 Audit Log 완료 + M5 RAILGUARD 기초 완료 (Night mode 2026-04-25)

### M7 Kill Switch — 4/4 ✅ 완료

**주요 구현**

- **T075** `ConfirmTokenStore` (5분 TTL, 256-bit 토큰) + `kill_switch_revoke/revoke_issuer` Tauri 커맨드
- **T076** 2단계 확인 Dialog (Confirm → Generate token → Input token → Revoke)
- **T077** "REVOKED" 배지 + "Hide revoked" 필터 + Security score danger (0점)
- **T078** Bulk revoke (Issuer → all credentials revoked 동시)

**교훈**

- Confirm token 오탐 보호 (틀린 cred_id로 consume 시 엔트리 보존)
- Bulk revoke 는 `IssuerConfirmTokenStore` 별도 분리 (2-step 불필요, issuer level authorization)
- Tauri shutdown 시 모든 revoke 진행 중 credential 상태 flush 필요 (M4 RunEvent::Exit 도입)

### M6 Audit Log — 6/6 ✅ 완료

**주요 구현**

- **T069** `api-vault-audit` 크레이트 (hash chain SHA256-HMAC + ed25519 서명, 고정 길이)
- **T070** Device identity (UUID v4, 첫 기동 저장)
- **T071** 모든 mutating 커맨드에 `AuditCtx` 훅 (best-effort, device_id 없으면 warn-log skip)
- **T072** `audit_list` + `audit_verify_chain` 커맨드
- **T073** `/audit` 페이지 (chain verification indicator)
- **T074** Credential Detail "Audit trail" 섹션

**교훈**

- AuditCtx best-effort: device_id 없으면 skip (critical 아님), SQL 실패 warn-log
- SQL transaction 내 audit 호출 defer (DoD 이탈 기록, 향후 재검토)
- Chain verify 는 서버 각 `audit_verify_chain()` 호출 시 fresh 검증

### M5 RAILGUARD — 6/10 진행 (T061~T064 defer)

**완료: T059/T060/T065/T066/T067/T068**

- **T059** `Connector` trait (fetch_incidents, Send + Sync)
- **T060** GitHub App skeleton + runbook (relaying 의존)
- **T065** 4 AI 에디터 템플릿 (Cursor/Windsurf/Claude/Copilot)
- **T066** `railguard_preview/apply` 커맨드 (원자적 쓰기, tmp+rename)
- **T067** `/railguard` UI (editor 선택 → preview → apply)
- **T068** `.env` 스캐너 → auto-suggestion (query params)

**Defer: T061/T062/T063/T064 (Cloudflare Workers relaying 의존)**

- T061: Workers relay (외부 배포)
- T062: GitHub Secret Scanning 읽기 (relay API)
- T063: GitHub Connector UI (저장소 스캔)
- T064: GitHub 자동 매칭 (webhook)

**교훈**

- Relaying 아키텍처 defer → client (install_id + 1h token) / relay (private key 보관)
- Railguard tone 맞춤: Cursor/Windsurf (헤더만), Claude (prose), Copilot (numbered)
- Atomic write = tmp + rename (중간 crash 안전)

### M4 완료 (10/10 ✅) 총 재점검

**T056~T058 + 보충 3 커밋**

- Incidents 페이지 (tab filter: All/Affecting/Dismissed) + 필터 UI
- Credential Detail incidents 섹션 (매칭 detail + confidence)
- NVD API key Settings + `VaultStorage::flush()` (언락 유지)
- typecheck 5 에러 해소 (vi.fn 패턴)
- Incident UNIQUE(source, source_id) migration
- RunEvent::Exit (scheduler shutdown 완료)

---

## M5 착수 + M4 추진 중 (Night mode 초반 2026-04-25)

### 주요 성과

- **M4 Incident Feed 100% end-to-end 동작** (피드 수집 4종 → 매칭 → 저장 → UI 표시 → 설정)
- **M5 RAILGUARD 기초 + GitHub 커넥터 skeleton 완성** (AI 에디터 규칙 자동 생성 가능, 실제 배포는 relaying 의존)
- **T054 follow-up 3건 해소** (typecheck, incident UNIQUE, scheduler shutdown)

### 주요 기술 결정

- `incident_list` 반환 타입: `Vec<IncidentListEntry { incident, matches }>` (UI N+1 회피)
- `IncidentEventEmitter` trait (폴링 성공 후 emit, 모든 poller 일관)
- `VaultStorage::flush()` 신설 (언락 유지하며 설정값 영속)
- `AuditRepo` 마이그레이션: `api-vault-audit::AuditLog` (고정 길이)
- `AuditCtx` best-effort (device_id 없으면 warn-log skip)
- Cloudflare Workers relay defer (T061~T064 사용자 결정 후)

---

## M4 완료 + M5 착수 (Night mode 2026-04-25)

### 주요 성과
- **M4 Incident Feed 100% 완료**. 피드 폴링 → 매칭 → 알림 → UI 표시 → 설정(NVD key) 전체 파이프라인이 end-to-end 로 동작.
- **M5 RAILGUARD 하단 (T065/T066) 완료**. AI 에디터(Cursor/Windsurf/Claude/Copilot) 룰 파일을 프로젝트 컨텍스트로 렌더하고 안전하게 디스크에 쓸 수 있는 기반 확보.
- **M5 커넥터 하단 (T059/T060) 완료**. 공통 `Connector` trait + GitHub connector skeleton. 실제 API 호출 구현은 릴레이 의존 (T061+) 때문에 defer.
- **T054 follow-up 3건 전부 해소**: typecheck 에러, incident UNIQUE, RunEvent::Exit.

## T066 구현 교훈 (M5 후속 영향)

- **원자적 쓰기 = tmp + rename**: `std::fs::rename` 은 POSIX/Windows 둘 다 atomic. 일반 `fs::write` 는 중간에 크래시 시 파일이 truncated 된 상태로 남을 수 있음. tmp 에 전체 쓰고 rename 하는 패턴은 vault 에서 이미 사용 중 → railguard 에도 동일 패턴 복제.
- **`ApplyMode::SkipExisting + 파일 없음 = Create**: 스펙이 "Skip if exists" 의미면 반대로 "없으면 write" 는 자연스러운 동작. 테스트에서 명시적으로 커버.
- **`.github/` 자동 mkdir**: Copilot instructions 경로만 2단계 깊이. 다른 3개는 프로젝트 루트. `path.parent()` 가 프로젝트 루트와 다를 때만 mkdir.
- **`tempfile` 이 dev-dep 에만**: 프로덕션 코드에서 tempfile 사용하려면 `[dependencies]` 로 옮겨야 함. 현재는 수동 tmp 경로 (`{path}.railguard-tmp`) + rename 으로 우회. 추후 여러 크레이트가 atomic write 를 필요로 하면 공통 헬퍼로 추출.

## T065 구현 교훈 (M5 후속 영향)

- **템플릿 엔진 안 씀**: 조건/반복이 필요 없는 단순 `{{VAR}}` 치환은 `str::replace` 세 번이 tera/handlebars 보다 깨끗. 나중에 룰에 조건(e.g. "if has Stripe") 을 넣어야 하면 그때 도입.
- **`{{FRAMEWORKS}}` / `{{ISSUERS}}` 빈 배열 fallback**: 감지 결과가 비었을 때 템플릿에 빈 문자열이 들어가면 어색한 문장("For  projects, ..."). `"general"` / `"your providers"` 로 치환해 자연스럽게 유지.
- **4개 에디터 tone 맞추기**: Cursor/Windsurf 는 거의 동일 (헤더 `For Cursor` ↔ `For Windsurf` 만 다름), Claude 는 prose 형식으로 룰당 설명 1-2문장, Copilot 은 넘버링된 instructions 형식. 스냅샷 테스트는 invariant 만 검증 (10개 룰 번호 모두 존재, 변수 잔여 없음 등) — 정확한 문구 diff 는 insta 없이 유지 관리 불가능하므로 invariant 수준으로.

## T059/T060 구현 교훈 (M5 후속 영향)

- **`fetch_incidents(&Auth)`**: 원 DoD 는 파라미터 없었으나 private repo Secret Scanning 알림 폴링에 auth 필수. trait 전역으로 `&Auth` 추가.
- **`Connector` = `Send + Sync`**: 여러 공급자를 동시에 poll 하려면 trait object 를 `Arc<dyn Connector + Send + Sync>` 로 저장. `async_trait` 가 자동 `Pin<Box<dyn Future>>` 로 변환.
- **`MockConnector` feature-gated (`testing`)**: dev 환경에서 불필요한 dep 제거. M5 후속 태스크 (T062, T063, T064) 가 이 mock 을 테스트에서 사용.
- **GitHub App 는 private key 릴레이 분리 원칙**: 클라이언트(데스크톱)는 `installation_id` + 릴레이 발급 `installation_token` (1h) 만 본다. private key 는 릴레이 wrangler secret. runbook `docs/runbooks/github-app-registration.md` 에 환경변수 표로 명시.

## T058 구현 교훈 (M4 후속 영향)

- **`VaultStorage::flush()` 신설 이유**: 기존엔 `lock()` 에서만 디스크 flush. 설정값(NVD key) 저장 후 언락 유지하면 크래시 시 설정 유실. `flush()` 는 private `flush_unlocked()` 헬퍼를 `lock()` 과 공유.
- **화이트리스트 키**: `vault_setting_set` 는 `nvd_api_key | ghsa_token` 만 허용. 임의 키 쓰기 차단으로 공격면 축소 + 향후 스키마 관리 단순화.
- **스케줄러 재구성 = shutdown + spawn**: `reconfigure` 메서드 대신 handle 교체. `vault_unlock` 성공 후에도 동일 호출 — 저장된 키가 즉시 poller 에 반영됨.
- **`vault_setting_set` 의 scheduler restart 실패는 비치명**: 키는 이미 저장됐으므로 UX 에 에러 노출 안 함, tracing 경고만. 사용자는 다음 폴링에서 자동 복구.

## T057 구현 교훈 (M4 후속 영향)

- **`incident_matches_for_credential` 반환 업그레이드**: T055 에서 `Vec<Incident>` 였으나 T057 UI 가 매칭 detail 필요 → `Vec<IncidentListEntry>` 로 통일. `list_incidents_with_matches_for_credential` 는 해당 credential 의 match 만 포함 (incident 전체 match 아님).
- **Revoke CTA 패턴**: `onRevokeRequested` prop 미전달 시 disabled + tooltip "Available in M7 Kill Switch". CredentialDetail 의 Primary actions 에 이미 Revoke 버튼이 있어 중복 피함.
- **`react-hooks/set-state-in-effect` 우회**: null credentialId 분기에서 `Promise.resolve().then()` microtask 로 setState 를 effect 바깥으로 미룸.

## T056 구현 교훈 (M4 후속 영향)

- **`incident_list` 반환 타입 확장** — `Vec<Incident>` → `Vec<IncidentListEntry { incident, matches: Vec<IncidentMatchDetail> }>`. `IncidentMatchDetail` 은 repo 에서 LEFT JOIN 으로 credential label + issuer display_name 까지 조립해 UI 가 N+1 호출 없이 credential chip 을 렌더 가능. T057 도 동일 패턴 활용 (`incident_matches_for_credential` 확장 불필요 — UI 측에서 `incident_list()` 결과에서 매칭된 것만 필터하거나, 기존 커맨드 반환 타입을 Detail 로 업그레이드).
- **`IncidentEventEmitter` trait** — 프로덕션은 `TauriEmitter { handle: AppHandle }` (clone cheap, `handle.emit(name, ())`), 테스트는 `NoopEmitter`. `FeedSchedulerConfig { emitter: Option<Arc<dyn IncidentEventEmitter>> }` 로 주입 → 기존 20 스케줄러 테스트 업데이트 필요 (NoopEmitter 주입).
- **Emit 타이밍**: 각 폴러 (RSS/NVD/GHSA) 성공 사이클에서 "≥1 insert 성공" 조건일 때만 emit. `trigger_once` 도 같은 조건. `incident_feed_refresh` 커맨드는 scheduler `trigger_once` 가 내부 emit 처리 → 커맨드 재emit 불필요.
- **UI 측 "Affecting my keys" 필터**: 서버 `IncidentFilter` 는 issuer_id 축만 있고 "has matches" 축은 없음. 서버는 `include_dismissed: false` + 전체 목록을 반환하고, 클라이언트에서 `matches.length > 0 && matches.some(m => m.dismissed_at == null)` 로 narrow. Dismissed 탭은 `include_dismissed: true` + `matches.every(dismissed)` 로 narrow. 이 트레이드오프 선택 이유: 사용자 단일 desktop 에서 incident 수백개 수준이라 클라이언트 필터로 충분하고, 서버 SQL 복잡도 증가 회피.
- **`@tauri-apps/plugin-shell` dynamic import + `window.open` fallback** — 설치되지 않은 환경 (Vitest jsdom) 에서도 `View` 버튼 동작. 프로덕션에선 dynamic import 성공해서 `openUrl()` 호출 → external browser.
- **`date-fns@4.1.0`** — ESM-only 이지만 Vite 정상 작동. `formatDistanceToNow` 로 relative date ("2h ago"). 로케일은 i18n 과 별개 — 추후 `formatDistanceToNow(date, { locale: ko })` 로 확장 가능.
- **`react-hooks/set-state-in-effect` lint**: effect 내부에서 setState 호출 금지. `refresh()` callback 에서 `setFetchState({ phase: "loading" })` 호출, effect 는 callback 만 호출. 필터 변경 시 이전 데이터가 유지된 채로 fetch 완료 후 업데이트 (기존 `use-inventory.ts` 패턴과 동일).

## M3 수동 검증 결과 (2026-04-24 저녁)

| # | 항목 | 결과 |
|:--|:----|:----|
| ① | `/graph` 렌더 + 4 노드 색 | ✅ Issuer/Credential/Deployment 확인. Project 는 프로젝트 생성 전이라 육안 검증 defer. |
| ② | TB ↔ LR 방향 토글 + 핸들 회전 | ✅ 모두 정상 |
| ③ | Blast Radius (빨강 실선 + 주황 점선 + Esc 복원 + 비-Credential 무시) | ✅ 전부 통과. "주황 점선이 실선처럼 보인다" 는 시각 오해 (안쪽 카드 border + 바깥쪽 outline 2줄 겹침). 점선 자체는 정상 동작. |
| ④ | Settings "Allow dragging" 토글 | ✅ localStorage `apivault:graph:nodesDraggable` 영속 + 동작 반영 확인. |
| ⑤ | 모바일 MobileGraphList 분기 | 🕒 **M11 defer**. `useIsMobile` 이 OS 기반이라 Windows 에서 viewport 조작으로는 트리거 불가. Vitest 자동 테스트로는 커버됨. |

## 수동 검증 중 발견/처리한 이슈

### 1. 피드 스케줄러 기동 panic (🔥 hotfix)

**증상:** 앱 기동 시 `panic: there is no reactor running, must be called from the context of a Tokio 1.x runtime` — `feed_scheduler.rs:172` `JoinSet::spawn`.

**원인:** `tauri::Builder::setup` 콜백은 tokio 런타임 context 바깥에서 실행됨. `spawn_feed_scheduler` 가 동기적으로 `JoinSet::spawn` 을 호출할 때 tokio 핸들을 요구해서 panic.

**수정:** `spawn_feed_scheduler` 호출을 기존 `block_on(AppContext::new(...))` 패턴과 동일하게 `tauri::async_runtime::block_on` 안으로 이동. 커밋 `85f347a`.

**재발 방지 교훈:** Tauri `setup` 안에서 tokio 런타임 핸들을 요구하는 모든 동기 호출(`tokio::spawn`, `JoinSet::spawn`, `Handle::current`)은 반드시 `block_on(async {...})` 안에서 실행해야 함. 향후 다른 service 를 `setup` 에 추가할 때 같은 패턴 적용.

