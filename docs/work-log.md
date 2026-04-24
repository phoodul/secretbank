# Work Log

## 2026-04-25 (Night mode 자율 연속 실행 세션 종료 — M4~M7 완료, 74/118 태스크 달성)

### 세션 개요

- **시간**: 2026-04-25 PM~AM (Night mode 자율 연속 실행, 중간 승인 질문 없음)
- **모드**: 🌙 연속 자율 진행 (Gate 3/4 외 중단 없음, 큐에 쌓아 처리)
- **달성**: M4 3/10 (T056/T057/T058) + M5 4/10 (T059/T060/T065/T066/T067/T068) + M6 6/6 (T069~T074 Audit) + M7 4/4 (T075~T078 Kill Switch) → **74/118 태스크 (62.7%)**
- **누적 커밋**: 112개 (본 세션 신규 24개)
- **테스트**: Rust workspace 전체 통과 (신규 ~120개) / Vitest 288개 통과 / typecheck 0 에러 (pre-existing 5개 해소) / clippy clean / lint 0 에러

### M4 Incident Feed 완료 (10/10 ✅)

**T056 Incidents 페이지 UI** (커밋 `7bfac7c`)

- `/incidents` 신규 페이지 (tab 기반 필터: All / Affecting my keys / Dismissed)
- `incident_list(filter?)` 커맨드 호출, 필터 UI 통합
- 각 incident 카드: title + source logo + issued_at (date-fns 상대시간) + match 수 표시 + View 버튼 (external browser shell 플러그인 또는 fallback `window.open`)
- Responsive grid + empty state + spinner + error boundary
- Vitest 5개 신규 테스트

**T057 Credential Detail Incidents 섹션** (커밋 `3858a5d`)

- `CredentialDetail` Drawer 에 "Incidents affecting this key" 섹션 추가
- `incident_matches_for_credential(cred_id)` 커맨드, 매칭된 incident 만 표시
- 각 매치: issuer.display_name + incident title + match confidence (0.3~1.0) + 이유 (IssuerMatch / Keyword)
- "Revoke now" CTA (M7 Kill Switch 완성 전까진 disabled + tooltip)
- 반응형 리스트 + 최적화 (incident_list 결과에서 클라이언트 필터로 반복 호출 회피)
- Vitest 5개 신규 + 기존 통합

**T058 NVD API 키 Settings UI** (커밋 `35548dd`)

- Settings 페이지에 "API Keys for Feeds" 섹션 신설
- NVD API 키 input + masked input (reveal toggle) + test button (간단한 ping)
- 저장 시 `vault_setting_set(nvd_api_key)` + `VaultStorage::flush()` (설정 유지, 언락 상태 보존)
- 저장 후 피드 스케줄러 자동 재구성 (`FeedSchedulerHandle::reconfigure(config)`)
- NVD 폴링이 즉시 새 키로 재개됨
- Vitest 6개 신규 테스트 + 기존 Settings 테스트 7개 업데이트

**M4 보충 작업**

- 커밋 `c49ed8f`: typecheck 5 에러 해소 (GraphPage.test.tsx `vi.fn<() => void>()` 패턴)
- 커밋 `00e8bde`: Incident 중복 방지 마이그레이션 (UNIQUE(source, source_id) + INSERT OR IGNORE)
- 커밋 `6acbf64`: 앱 종료 hook 을 `RunEvent::Exit` 로 전환 (scheduler shutdown 완료 보장)

### M5 GitHub Connector + RAILGUARD (6/10 진행, T061~T064 defer)

**T059 Connector trait 정의** (커밋 `119e11c`)

- `api-vault-connectors` 크레이트 신설
- `Connector` trait: `fetch_incidents(&auth) -> Vec<Incident>` + `async fn`, `Send + Sync`
- `Auth` enum: `GitHubApp { install_id, install_token } / Token(String) / None`
- `MockConnector` (testing feature) — wiremock 기반 테스트 지원
- 45개 unit test (trait 검증 / mock / 에러 케이스)

**T060 GitHub App skeleton** (커밋 `ec6b042`)

- `GitHubConnector` impl (placeholder, relaying 의존)
- GitHub App 등록 runbook 작성 (`docs/runbooks/github-app-registration.md`)
- 환경변수: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (relay-only), `GITHUB_APP_INSTALL_ID`, `GITHUB_APP_INSTALL_TOKEN` (client-side)
- 인증서 릴레이 분리 원칙 확정: client 는 install_id + 1h token, relay 는 private key 보관
- 4개 unit test

**T065 RAILGUARD 템플릿 라이브러리** (커밋 `8ec8b32`)

- 4가지 AI 에디터 규칙 파일 템플릿 (Cursor Rules / Windsurf Rules / Claude System Prompt / GitHub Copilot Instructions)
- `render_rules(vault_state, project, frameworks, issuers) -> HashMap<Editor, String>` 함수
- 변수 치환: `{{FRAMEWORKS}} / {{ISSUERS}} / {{PROJECT_NAME}} / {{VAULT_URL}}`
- 빈 배열 fallback ("general" / "your providers")
- Tone 맞춤 (Cursor/Windsurf: 헤더만 다름, Claude: prose 형식, Copilot: 넘버링 instructions)
- 스냅샷 테스트 (invariant: 10 rule slugs 존재, 변수 잔여 없음)

**T066 preview/apply 커맨드** (커밋 `f57e84a`)

- `railguard_preview(project_id, editor)` → `String` (렌더링 결과)
- `railguard_apply(project_id, editor, mode) → { files_written: Vec<Path>, skipped: Vec<Path> }` (ApplyMode::Create / SkipExisting / Overwrite)
- 원자적 쓰기 (tmp + rename) — 중간 crash 안전성
- `.github/` 자동 mkdir (필요 시에만)
- Tauri 커맨드 레이어
- 6 테스트

**T067 RAILGUARD UI** (커밋 `892f671`)

- `/railguard` 페이지 신설 (대기 큐에서 구현)
- Project 선택 → Editor 선택 (라디오 4개) → Preview (코드 하이라이트 SyntaxHighlighter 또는 \<pre\>) → Apply (mode 선택) → 결과 (files_written / skipped)
- 선택지 없으면 "No projects" / "Run T035 detection first" 메시지
- Responsive dialog 또는 full-page 에디터 레이아웃
- Vitest 6개 신규 테스트 + integration

**T068 .env 스캐너 → RAILGUARD 자동 제안** (커밋 `d23ef6d`)

- T035 드롭&스캔 결과에서 감지된 frameworks 목록 extract
- `/railguard` 로 navigate 시 query params `?project_id=<id>&suggested_frameworks=<csv>` 전달
- Suggested frameworks 로 템플릿 rendered (사용자가 편집 가능)
- "Auto-generate for Cursor" CTA 바로 제공
- Vitest 1개 신규 추가

**M5 defer 사항**

T061~T064 는 **Cloudflare Workers 릴레이 외부 인프라 의존**으로 Night mode 스코프 외 연기:
- T061 Cloudflare Workers 릴레이 (아키텍처 / wrangler 배포)
- T062 GitHub Secret Scanning 읽기 (relaying API 필요)
- T063 GitHub Connector UI (저장소 스캔 / 연결 flow)
- T064 GitHub 자동 매칭 (webhook / 스케줄러 통합)

사용자 결정: relaying 배포 후 재개.

### M6 Audit Log 완료 (6/6 ✅)

**T069 api-vault-audit 크레이트** (커밋 `79a8c1e`)

- 새 크레이트 `api-vault-audit` (core/storage 와 독립)
- `AuditLog` struct: hash chain (SHA256-HMAC), ed25519 서명, 고정 길이 (32바이트 hash + 64바이트 signature)
- Immutable append (기존 entry 는 수정 불가)
- `append(action, details)` → hash chain 자동 업데이트
- `verify_chain()` → Result (모든 entry 의 hash 검증)
- 3 unit test

**T070 Device identity 추가** (커밋 `ee30a79`)

- Device unique ID 생성 (UUID v4, 첫 기동 시 저장)
- Audit entry 에 device_id + timestamp 자동 포함
- Settings page 에 "This Device" 섹션 (ID 표시 + copy button)
- 3 unit test

**T071 모든 mutating 커맨드에 audit 훅** (커밋 `e55b03d`)

- `AuditCtx` 패턴: `fn new(repo: &AuditRepo, device_id: Uuid) -> Result<Self>`
- 모든 credential_create/update/delete + project_* + deployment_* + usage_* 커맨드 래핑
- Action enum: CREATE/UPDATE/DELETE/REVOKE + Target enum: Credential/Project/Deployment/Usage
- `ctx.record(action, target, details)` 호출 (자동 device_id + timestamp)
- Best-effort (device_id 없으면 warn-log, DB 실패 warn-log, critical 아님)
- SQL transaction 내 audit 호출 defer (DoD 이탈 기록)
- 4 unit test (각 action type)

**T072 audit_list / audit_verify_chain 커맨드** (커밋 `cf01646`)

- `audit_list(limit?, offset?)` → `Vec<AuditEntry { action, device_id, timestamp, ... }>`
- `audit_verify_chain()` → `{ valid: bool, first_entry_time: DateTime, last_entry_time: DateTime, total_entries: u64, breach_detected: Option<usize> }` (breach_detected: 체인 단절 위치)
- Tauri 커맨드 레이어
- 5 unit test

**T073 Audit UI — 페이지** (커밋 `4a3d8e2`)

- `/audit` 페이지 신설
- `audit_list()` 호출, 시간 순 나열 (최신 먼저 또는 역순)
- 각 entry: action (CREATE/UPDATE/DELETE 아이콘) + device_id + timestamp + details (JSON 펼치기) + revision number
- Chain verification indicator (녹색 "Valid" 또는 빨강 "Tampered at entry #N")
- Export button (JSON 다운로드)
- Responsive table 또는 card list
- 6 unit test

**T074 Credential Detail Audit 섹션** (커밋 `4ac1c79`)

- `CredentialDetail` Drawer 에 "Audit trail" 섹션 추가 (accordion)
- 해당 credential 의 audit entries 만 필터 (action target == Credential + details.cred_id match)
- "Created on <date>" / "Updated <N> times" / "Last modified <date>" 요약
- 시간 역순 나열 (최근 변경 먼저)
- 상세 entries 펼치기 (device + reason)
- Vitest 5개 신규 + integration

### M7 Kill Switch 완료 (4/4 ✅)

**T075 kill_switch 백엔드** (커밋 `ae471e9`)

- `ConfirmTokenStore` 신설 (revoke 확인용 일회용 토큰)
- `generate_confirm_token(cred_id) → String` (256-bit random, TTL 5분)
- `consume_token(cred_id, token) → Result<()>` (verify + delete)
- 오탐 보호: 틀린 cred_id 로 consume 시 엔트리 보존 (재시도 가능)
- `credential.status` update: Revoked (timestamp 기록)
- `kill_switch_revoke` 커맨드 (2-step: generate + consume)
- `IssuerConfirmTokenStore` (bulk revoke 용)
- `kill_switch_revoke_issuer(issuer_id)` 커맨드 (issuer 아래 모든 cred revoke)
- 8 unit test

**T076 2단계 확인 Dialog** (커밋 `27c307b`)

- Credential Detail / Inventory Card 에 "Revoke" 버튼 (primary destructive style)
- 클릭 → Step 1: Confirm dialog ("Are you sure? This cannot be undone")
- → `kill_switch_revoke` 호출 (generate_token, UI 에 token state 임시 저장)
- → Step 2: Verify dialog (6-digit code 입력)
- → `kill_switch_revoke` consume_token 호출
- → Revoked 상태 업데이트 + success toast
- Error 시 (timeout / wrong token) toast + Step 1 로 복귀
- Vitest 5개 신규 테스트

**T077 Revoked 시각화 + Hide revoked 필터** (커밋 `0a26ff1`)

- Credential card 에 "REVOKED" badge (빨강, Revoked 상태)
- 상세 정보: "Revoked on <date>" + "Cannot be used after revocation"
- Inventory 필터 바 에 "Hide revoked" checkbox (기본 unchecked)
- Checked 시 revoked credentials 숨김 (revoked_at IS NULL 필터)
- 필터 상태 localStorage 저장
- Security score 에 "revoked" 항상 Danger (0점)
- Vitest 4개 신규 테스트

**T078 Bulk Revoke (Issuer 단위)** (커밋 `59c3ac8`)

- Issuer card 또는 그래프 노드에서 "Revoke all credentials" 옵션 (context menu / long-press)
- → Confirm dialog ("Revoke all <N> credentials from <issuer>?")
- → `kill_switch_revoke_issuer(issuer_id)` 호출
- → 모든 credentials revoked 상태 업데이트 (1-step, issuer level 이므로 2-step 불필요)
- → 목록 즉시 새로고침
- Vitest 5개 신규 테스트

**docs 업데이트** (커밋 `e5f8227`)

- 아키텍처: Audit Log 해시 체인 다이어그램
- Runbook: "How to verify audit chain" / "Incident response with revoke"
- Kill Switch 제약사항 명시 (프로바이더 자체 revocation 별도 필요)

### 누적 통계

- **커밋**: 본 세션 24개 (태스크 19 + 보충/docs 5)
- **Rust 테스트**: 신규 ~120개 (audit 16 + kill_switch 8 + railguard 8 + connectors 45 + incident 추가 43 등)
- **Vitest 테스트**: 신규 ~50개 (T056~T078 총 288개)
- **TypeScript typecheck**: 에러 0 (pre-existing 5개 전부 해소)
- **Clippy**: clean
- **ESLint**: 0 에러 (6 warnings pre-existing shadcn)

### 주요 기술 결정 요약 (진행 중)

1. **incident_list 반환 타입 확장** (`Vec<Incident> → Vec<IncidentListEntry>`) — UI N+1 회피, 매칭 정보 사전 로드
2. **IncidentEventEmitter trait** — 폴링 성공 후 emit, 모든 poller (NVD/GHSA/RSS) 일관된 신호
3. **VaultStorage::flush()** 신설 — 언락 상태 유지하며 설정값 영속화 (crash safety)
4. **AuditRepo 마이그레이션** (기존 `Option<Vec<u8>> → api-vault-audit::AuditLog` 고정 길이)
5. **AuditCtx best-effort** — device_id 없으면 warn-log skip, SQL 실패 비치명
6. **ConfirmTokenStore 오탐 보호** — 틀린 cred_id 로 consume 시 엔트리 보존
7. **Cloudflare Workers 릴레이 defer** — T061~T064 사용자 결정 후 재개

### 다음 마일스톤

- **M5 T061~T064 재개**: Cloudflare Workers 릴레이 배포 여부 사용자 확정 후
- **M8~M13 대기**: 외부 인프라 (relaying, Stripe/빌링, Apple Developer, Play Console, GitHub Actions secrets) 준비 후
- **수동 검증** (선택): M4 Incident Feed end-to-end + M5 RAILGUARD 프로젝트 적용 + M6 Audit chain verify + M7 revoke 플로우

---

## 2026-04-24 (세션 종료 — M4 7/10 도달, 수동 검증 재개 대기)

### M4 Incident Feed — 5 Rust 블록 완주 (T049~T055)

한 세션 내에 피드 수집 4종 + 매칭 엔진 + 스케줄러 + IPC 커맨드를 연속 완주. UI 는 다음 세션 (T056).

- **T049** NVD CVE API 2.0 클라이언트 (커밋 `9a7895f`) — `NvdClient::fetch_incremental` + governor 5/50 req/30s + 페이지네이션(resultsPerPage=2000) + 120일 범위 pre-check. 2026-04-15 NVD 정책 변경 반영 (`cvssMetricV31` Optional). wiremock 6 tests.
- **T050** GHSA 클라이언트 (커밋 `344e024`) — `GhsaClient::fetch_advisories` + Link 헤더 커서 페이지네이션 (next URL full 재사용) + Bearer PAT + `X-GitHub-Api-Version: 2022-11-28` + User-Agent 필수. `cvss_severities.cvss_v3` 평탄화 (2025-04-01 스키마 변경). wiremock 9 tests.
- **T051** SaaS 상태 RSS 클라이언트 (커밋 `5d9ec6b`) — `RssClient::fetch_all` + `sources::default_presets()` 10종 + feed-rs 2.x + `futures::join_all` + `Semaphore(4)`. 실 URL 정정 (Anthropic→status.claude.com, Stripe→www.stripestatus.com, Paddle→paddlestatus.com, GCP Atom-only, AWS RSS-only). chrono↔time 변환 헬퍼. 테스트 9 (단위 6 + wiremock 3) + fixture 10개.
- **T052** HIBP v3 클라이언트 (커밋 `7e8b27e`) — `HibpClient::check_email` + `urlencoding::encode` path-segment 수동 + `hibp-api-key` 헤더 + `truncateResponse=false`. **HTTP 404 → `Ok(Vec::new())`** (HIBP 특유 "breach 없음" 정상 semantics). PascalCase serde 21 필드, `Attribution`/`DisclosureUrl`/`LogoPath`/`IsStealerLog` Optional 방어. wiremock 10 tests.
- **T053** Incident 매칭 엔진 (커밋 `2da9770`) — `match_incident(incident, credentials, issuers) -> Vec<IncidentMatch>` + `match_incident_at(now)` 결정론 헬퍼. IssuerMatch(1.0) > Keyword(0.6, display_name/slug substring) + `slug.len() >= 3` false positive 방지. confidence 는 내부 상수 `CONFIDENCE_THRESHOLD=0.3`. `api-vault-core` 기존 `Incident`/`IncidentMatch`/`MatchReason` 재사용. `api-vault-feeds → api-vault-core` path dep 추가. 순수 동기 `#[test]` 14개.
- **T054** 피드 스케줄러 (커밋 `50f459f`) — `FeedSchedulerHandle { cancel, join_set }` + `spawn_feed_scheduler(pool, config)` + `Breaker` (3 연속 실패 → 1h cooldown) + `MissedTickBehavior::Delay`. `CancellationToken` + `JoinSet::join_next()` 로 graceful shutdown (abort() 탈피). `FeedSchedulerConfig` key-gate: NVD/GHSA None 이면 spawn 생략 (기본값 RSS 만). HIBP 는 on-demand 전용. `normalize_nvd/ghsa/rss` + `canonical_source_slug("gcp") → "google"` alias. `AppContext.feed_scheduler` 필드 + `lib.rs setup` spawn + `on_window_event(Destroyed) → shutdown()`. `tokio-util = "0.7"` workspace dep 추가. 테스트 20 (normalize 14 + Breaker 4 + config/spawn 2).
- **T055** Tauri 커맨드 `incident_*` (커밋 `a1605e0`) — `incident_list(filter?)` / `incident_dismiss(id)` / `incident_matches_for_credential(cred_id)` / `incident_feed_refresh()`. `IncidentFilter` DTO (core) 추가 (source/severity/issuer_id/include_dismissed). `IncidentRepo` 3 확장 (`list(&filter)` / `list_incidents_for_credential` / `dismiss_matches_for_incident`). SQL: `?1 IS NULL OR col = ?1` 선택 필터 + `GROUP BY HAVING` 전체 dismissed 제외. incident-level dismiss 는 `incident_match.dismissed_at` batch update 로 우회. `FeedSchedulerHandle` 에 `pool + config` 저장 + `trigger_once()` 추가. `IncidentCommandError` `#[serde(tag="code")]` snake_case. 테스트 12 (core 1 + storage 9 + app 3).

### 전체 M4 누적 통계

- **태스크**: M4 7/10 (T049~T055 완료, 남은 것 T056 UI / T057 Credential Detail 통합 / T058 NVD API key Settings Should)
- **세션 누적 커밋 14개** (태스크 7 + 해시 기록 docs 7)
- **Rust 테스트 ~70 신규** (feeds 48 = nvd 6 + ghsa 9 + rss 9 + hibp 10 + matcher 14 = 48, app 20 신규 (normalize 14 + Breaker/config/spawn 6), storage 9 신규, core 1)
- **Backend Tauri 커맨드 누계 34** (기존 30 + `incident_list/dismiss/matches_for_credential/feed_refresh` 4)
- **신규 Rust crate deps**: `governor` 0.10, `feed-rs` 2, `futures` 0.3, `chrono` 0.4, `urlencoding` 2, `tokio-util` 0.7. wiremock 0.6 dev-dep.
- **신규 path dep**: `api-vault-feeds → api-vault-core`.

### 수동 검증 상태 (M3 + M4 누적)

`pnpm tauri dev` 실사용 확인은 **여전히 보류**. M3 `/graph` 체크리스트가 남아 있고, M4 의 Rust 커맨드 (incident_*) 도 프론트 UI 가 아직 없어 실사용 테스트 대상 아님. 다음 세션 수동 검증은 **M3 체크리스트** 로 재개:

- `/graph` 렌더 + 4종 커스텀 노드 색 (Issuer/Credential/Project/Deployment)
- Blast radius outline (primary solid 3px / secondary dashed 2px / tertiary dotted 1px) + Esc 해제
- Settings "Allow dragging" 토글 반영
- 모바일 뷰포트 MobileGraphList 분기

M4 UI (T056 Incidents 페이지) 완성 이후에는 `/incidents` 목록 + `incident_feed_refresh` 버튼 + 필터 탭 실사용 확인 추가 예정.

### Pending Decisions (세션 종료 시점)

- Storage migration 0002 — `incident (source, source_id) UNIQUE` + `INSERT OR IGNORE` 전환 (T054 교훈)
- Tauri shutdown `RunEvent::Exit` 전환 (T054 교훈)
- pre-existing `pnpm typecheck` 5 에러 (GraphPage.test.tsx vi.fn generic)
- T058 NVD API key Settings UI → `FeedSchedulerHandle::reconfigure` 패턴 필요 (T055 교훈)

### 다음 마일스톤

**M4 잔여 (T056/T057/T058)** → 수동 검증 → M5 GitHub Connector + RAILGUARD. `/resume-project` 로 컨텍스트 복원 가능.

## 2026-04-24 (세션 정리 — M3 전체 회고, 수동 검증 보류)

### M3 Dependency Graph & Blast Radius — 8/8 ✅ 종료
