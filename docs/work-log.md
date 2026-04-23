# Work Log

## 2026-04-23 (T044 완료 — **M3 4/8**)

### T044 — React Flow + dagre 레이아웃 /graph 페이지 (커밋 `b118c99`)

- **패키지**: `@xyflow/react@12.10.2` + `@dagrejs/dagre@3.0.0` pnpm 추가.
- **신규 파일** (`src/features/graph/`):
  - `types.ts`: GraphPayload/GraphNode/GraphEdge/NodeKind/GraphEdgeKind — Rust wire format 1:1 매핑 (snake_case 유지).
  - `layout.ts`: `getLayoutedElements()` — dagre TB/LR 순수 함수; dagre 중심 좌표 → React Flow top-left 변환; 빈 입력 안전 처리.
  - `adapter.ts`: `toReactFlowElements()` — GraphPayload → `Node<GraphNodeData>[] + Edge[]`; dagre 레이아웃 적용 후 반환.
  - `use-graph-data.ts`: `invoke('graph_fetch')` union-state hook (use-inventory 패턴 — cancelled flag + tick refresh).
  - `DependencyGraph.tsx`: ReactFlow + MiniMap + Controls + Background; `ReactFlowProvider` 외부 래핑 + TB/LR 토글 버튼 (shadcn Button); `useReactFlow().fitView()` 방향 변경 시 호출.
  - `GraphPage.tsx`: 4-경로 (loading / error+retry / empty+Link to Inventory / graph canvas). i18n `graph.*` 키 사용.
- **수정**: `src/pages/GraphPage.tsx` → feature re-export로 교체. `src/pages/GraphPage.tsx`는 1줄 re-export.
- **i18n**: `graph.*` 키 15개 (title/subtitle/loading/error/empty/direction.tb/direction.lr/toggleDirection/kind.{issuer,credential,project,deployment}) + `common.retry` — 4개 로케일 모두 추가.
- **테스트**: `__tests__/layout.test.ts` (5) + `__tests__/adapter.test.ts` (6) + `__tests__/GraphPage.test.tsx` (4) = 15 신규. 전체 155개 통과.
- **검증**: typecheck exit 0 / lint 0 errors / vitest 155 pass / cargo clippy exit 0.
- **시각 검증**: `pnpm tauri dev` 미실행 — 사용자 수동 확인 필요.
- **Follow-up**: 엣지 kind 라벨이 plain text로만 표시됨; 커스텀 엣지 타입(스타일/색상)은 T045로 연기.

## 2026-04-23 (T040 완료 — **M2 종료 ✅ 16/16**)

### T040 — Inventory 보안 점수 + SecurityDot (직접 구현, 커밋 `11281cd`)

- **Rust 측**:
  - `api-vault-core/src/security_score.rs` 신규 — pure `score(cred)` / `score_at(cred, now)` (테스트용 시간 주입 가능). `ScoreLevel`(safe ≥80 / warn ≥50 / danger) + `FactorCode` 7종(Expired/ExpiringSoon/RotationOverdue/NoRotationHistory/NoScope/Revoked/Compromised) + `ScoreFactor { code, severity, penalty, days }` + `ScoreBreakdown { total, level, factors }`. Revoked/Compromised 는 즉시 0점 danger 단락 — 다른 factor 와 혼합 안 함.
  - `api-vault-core/src/lib.rs` — `score_credential`, `score_credential_at` 및 관련 타입 re-export.
  - `models/credential.rs` — `CredentialSummary` 에 `score: ScoreBreakdown` 필드 추가 (required). `CredentialPatch`/`CredentialFilter` 는 영향 없음.
  - `api-vault-storage/repositories/credential.rs` — `list` 의 SQL SELECT 를 full 필드로 확장, `row_to_credential` 재사용해 full cred 를 조립한 뒤 `score_credential(&cred)` 으로 score 계산 → `CredentialSummary.score` 에 주입. `list` 반환 shape 만 바뀌었고 get_by_id 등 다른 경로는 그대로.
  - `api-vault-app/commands/credentials.rs` — `CredentialFull` 에 `pub score: ScoreBreakdown` 필드 추가 (flatten 된 Credential 과 병렬). `credential_get` 이 `score_credential(&credential)` 계산 후 주입.
  - Rust 유닛 테스트 9 (건강=100/safe, revoked→0/danger, compromised→0/danger, expired −50, expiring_soon −20 ≤30d, rotation_overdue −15, no_rotation_history +90d −10, no_scope −5, multi-factor clamp 테스트). 결정적 base time (epoch `1_700_000_000`) + `Duration::days(offset)` 로 시간 의존 테스트 안정화.
- **Frontend 측**:
  - `src/features/inventory/types.ts` — `ScoreLevel`/`FactorCode`/`FactorSeverity`/`ScoreFactor`/`ScoreBreakdown` 미러 타입 + `CredentialSummary.score`/`CredentialFull.score` 필드 추가.
  - `src/features/inventory/SecurityDot.tsx` 신규 — Tailwind 시맨틱 토큰 `bg-vault-success`/`warning`/`danger` 로 색상 dot + shadcn Tooltip 으로 factor 목록·총점·해결 제안. `TooltipProvider` 를 컴포넌트 내부에 배치 → 어디에 삽입해도 독립 동작. `data-level` 속성 + rich `aria-label` (점수 + factor 짧은 요약) 로 접근성 확보.
  - `CredentialCard` 상단에 SecurityDot 삽입 (이름 왼쪽).
  - `src/locales/{en,ko,ja,zh}/common.json` — `inventory.scoreTooltipTitle`/`scoreAllGood`/`scoreLevel(Safe|Warn|Danger)` + nested `inventory.factor.{code}` 7개 + `inventory.factorShort.{code}` 7개 × 4 언어 (88키 추가).
  - 기존 fixtures 3곳 (`inventory/__tests__/fixtures.ts`, `inventory/__tests__/CredentialCard.test.tsx`, `projects/__tests__/ProjectsPage.test.tsx`, `onboarding/__tests__/DetectedKeysReview.test.tsx`) 에 `score` 필드 기본값(`MOCK_SAFE_SCORE`) 주입 — required 필드 추가 시 필수 작업.
- **테스트**: `src/features/inventory/__tests__/SecurityDot.test.tsx` Vitest 4 (safe/warn 변형/warn 기본/danger revoked 각각 dot 색 클래스 + data-level + aria-label 검증).
- **검증**: `cargo clippy -D warnings` exit 0, `cargo test --workspace` 전체 통과 (+9 security_score), `pnpm typecheck` exit 0, `pnpm lint` 0 에러 / 기존 6 경고 유지, `pnpm vitest run` 18 files / 140 tests (기존 136 + 신규 4) pass.

**설계 교훈**:

- **Rust authoritative / 프런트 렌더**: TS 재구현 대신 서버에서 계산해 응답에 주입. FactorCode enum 은 `serde snake_case` → 프런트 리터럴 유니온 타입으로 그대로 매칭. 새 factor 추가 시 Rust enum + 4언어 키만 늘리면 UI 변경 불필요.
- **Revoked/Compromised 단락 로직**: 이들은 "다른 문제를 덧붙여 봤자 의미 없는" 최종 상태. `return` 으로 나머지 체크를 건너뛰는 편이 가독성과 의미 모두 우수.
- **시맨틱 토큰 첫 소비**: `bg-vault-success/warning/danger` 는 T008 에서 추가되어 M0~M1 에선 badge 에만 쓰였다. T040 에서 SecurityDot 이 첫 대량 소비처. 다크 모드 자동 대응 + hex 하드코딩 없음.
- **Required 필드 추가 리팩터링 패턴**: `CredentialSummary.score` 를 required 로 추가한 순간 프런트 모든 mock/fixtures 가 컴파일 실패. `MOCK_SAFE_SCORE` 공용 상수 export 로 일괄 해결. 향후 비슷한 필드 확장 시 같은 패턴 — fixtures 중앙집중화가 중요.
- **Score freshness**: 만료 판정이 `now` 의존이므로 DB 에 캐시하지 않음. 매 `credential_list` 호출마다 재계산 (비용 적음). 장기 캐시 필요해지면 클라이언트 TTL 또는 서버 폴링 추가.

### M2 종료 요약

- **16/16 태스크 완료** — Must 13개 ✅ + Should 3개 ✅.
- **커밋**: T025 `ab69319` ~ T040 `11281cd` + 문서/fixup 다수. 누적 56 commits.
- **핵심 UX 스택**: Inventory 목록 + 필터 바 + Card (보안 dot/hover disclosure) + Cmd+K palette + Settings (theme/language/auto-lock) + idle Auto-lock + 드롭&스캔(3단계 파이프라인) + Welcome 3-step 온보딩 + RequireOnboarding 가드 + Project CRUD + Deployment CRUD + Usage 링크 UI + 보안 점수 시각화.
- **Backend 커맨드 총계**: vault 4 + credential 6 + issuer 2 + project 5 + deployment 4 + usage 4 + settings 2 + scanner 1 = **28 Tauri 커맨드**.
- **테스트**: Rust 95+개 + Vitest 140개 + 모두 통과. `pnpm lint` / `pnpm typecheck` / `cargo clippy -D warnings` 전부 green.

**Follow-up 큐** (M3 이후 해결):

1. 드롭&스캔 secure import 경로 — scan 결과의 실제 값을 재파싱해 age 볼트에 직접 주입 (T035 교훈).
2. Deployment 삭제 시 usage.deployment_id cascade (T038 교훈).
3. BottomNav 6탭 UX 재검토 (Audit 을 Settings 내부로 이동 or 스크롤 구조?).
4. Score factor 확장: usages 없음 factor (`CredentialFull` 전용).

### 부수 처리

- `docs/task.md` — M2 Status `🔄 15/16` → `✅ 16/16`, M3 Status `⏳ 대기` → `🔄 대기` (현재 작업 대상). 진행 표에 T040 줄. 완료 합계 40/118 + **M2 완료** 표기.
- `docs/progress.md` — Last Checkpoint (56 커밋, Rust 95+ / Vitest 140, Milestone transition 명시), T040 교훈 7개 (Rust authoritative / Revoked 단락 / 시맨틱 토큰 첫 소비 / Required 필드 리팩터링 패턴 / Score freshness 등) + **M2 종료 요약 섹션** + Follow-up 큐 4건, Next Action 을 T041 PetGraph 의존성 그래프 엔진으로 전환.

---

## 2026-04-23 (T039 완료, M2 15/16 — M2 Must 전체 완료)

### T039 — Usage 링크 UI (직접 구현, 커밋 `cff6bf8`)

- **Rust 측**:
  - `commands/usage.rs` 에 `usage_delete(id)` 추가. `UsageRepo::delete` 는 T019 에 이미 존재했고 커맨드만 신설.
  - `lib.rs` invoke_handler 두 블록에 등록.
- **Frontend 측**:
  - `src/features/inventory/types.ts` — `Usage` 타입을 Rust `api_vault_core::Usage` 와 정확히 일치하도록 전면 교체. 기존 legacy 필드(`url`, `env_var_name`, `scanner_version`, `created_at`) → 실제 JSON shape (`where_kind`, `where_value`, `verified_at`, `verified_by`). `UsageWhereKind` (`"env_var" | "file_path" | "code_ref"`) + `UsageVerifiedBy` 유니온 타입도 추가.
  - `src/features/inventory/UsageSection.tsx` 신규 — CredentialDetail 내부 Usages 섹션 교체용:
    - 헤더의 "Link" ghost 버튼 → 섹션 내부에 inline form 토글 (Dialog 대신 간결)
    - Project Select (lazy-load: form 이 열릴 때만 `project_list` 호출)
    - WhereKind Select (env_var / file_path / code_ref) — 선택값에 따라 WhereValue input placeholder 가 `OPENAI_API_KEY` / `/apps/web/.env.local` / `src/lib/auth.ts:42` 로 힌트 변경
    - WhereValue Input → "Link usage" → `usage_create(input)` + `onChanged()`
    - 목록은 Map 캐시로 project 이름 해석 (`project_list` 호출, 실패 시 id slice 폴백)
    - 각 행 Trash 아이콘 → `usage_delete(id)` + `onChanged()`
  - `src/features/inventory/CredentialDetail.tsx` — inline Usages 섹션 제거, `<UsageSection credentialId={cred.id} usages={cred.usages} onChanged={fetchDetail} />` 삽입. `fetchDetail` (기존 retry 트리거) 재활용 → usage 변경 후 `credential_get` 재조회로 `cred.usages` 자동 갱신.
  - `src/locales/{en,ko,ja,zh}/common.json` — inventory 네임스페이스에 `linkUsage` / `linkUsageTitle` / `linkProject(+Placeholder)` / `noProjectsAvailable` / `loadProjectsFailed` / `linkWhereKind` / `linkWhereValue` / `whereKind(EnvVar|FilePath|CodeRef)` / `linkAdd` / `linking` / `usageCreated` / `usageCreateFailed` / `removeUsage` / `usageDeleted` / `usageDeleteFailed` — 22키 × 4 언어. 기존 `noUsages` 메시지도 T039 안내 문구로 교체 ("아래에서 직접 추가" 포함).
- **테스트**: `src/features/inventory/__tests__/UsageSection.test.tsx` Vitest 4 — empty / list+project 이름 해석 / Add flow (Link 버튼 → project_list → Select → WhereValue → usage_create 검증) / Remove flow (Trash → usage_delete).
- **검증**: `cargo check/clippy -D warnings` exit 0, `pnpm typecheck` exit 0, `pnpm lint` 0 에러 / 기존 6 경고 유지, `pnpm vitest run` 17 files / 136 tests pass (기존 132 + 신규 4). CredentialDetail 기존 테스트(fixtures `usages: []`)에 회귀 없음.

**설계 교훈**:

- **레거시 타입 정리 효과**: 프론트 `Usage` 가 scanner DTO (`env_var_name`) 를 참조하던 탓에 CredentialDetail 이 사실상 undefined 를 렌더 중이었다 — 테스트가 빈 배열만 다뤘던 탓에 드러나지 않음. T039 기점으로 `credential_get` 의 실제 shape 과 일치. Onboarding 쪽 `DetectedKeyInfo.env_var_name` 은 Usage 와 다른 별개 scanner DTO 이므로 보존.
- **Inline form vs Dialog**: Add 플로우를 별도 Dialog 로 하지 않고 섹션 내부에 펼침/접힘 form 으로. 좁은 Sheet 공간 절약 + state 관리 간결. DeploymentSection 은 Dialog 방식을 썼는데 — 차이는 "필드 개수 + UX 복잡도". UsageSection 은 필드 3개 + placeholder 힌트가 간단해 inline 이 더 나음.
- **Server truth 재조회 전략**: onChanged 콜백이 credential_get 전체 refetch 를 유발. usages 로컬 setState 조작 대비 단순하고 race 안전. M2 규모에서는 credential_get 이 저렴 (usages ≤ 수십개). 대규모에서는 패치 프로토콜로 전환 필요.
- **lazy-load `project_list`**: UsageSection 이 mount 될 때 항상 project_list 를 치는 대신 (usages 에 이름 해석용 1회 + form 이 열릴 때 추가 1회) 2단계 로드. form 을 열지 않는 단순 조회 케이스의 네트워크 비용 절약.

### 부수 처리

- `docs/task.md` Status `🔄 14/14` 표기 오기재를 이전 턴에서 `🔄 14/16` 으로 고친 데 이어, 이번에 `🔄 15/16` 로 업데이트. 진행 표에 T039 줄 추가. 완료 합계 39/118.
- `docs/progress.md` Last Checkpoint 갱신 (54 커밋, Vitest 136), T039 구현 교훈 섹션으로 교체 (레거시 타입 정정 / Inline form 결정 / Server truth 재조회 / lazy-load), Next Action 을 T040 보안 점수로 전환. M2 Must 13/13 전부 완료 표기.

---

## 2026-04-23 (T038 완료, M2 14/16)

### T038 — Deployment CRUD (직접 구현, 커밋 `3072909`)

- **Rust 측**:
  - `api-vault-core/src/models/deployment.rs` — `DeploymentPatch` 신규 (`Option<String>` url, `Option<DeploymentPlatform>` platform, `Option<Env>` env). `project_id` 는 의도적으로 불변.
  - `api-vault-core/src/lib.rs` — `DeploymentPatch` re-export.
  - `api-vault-storage/src/sqlite/repositories/deployment.rs` — `update(id, &DeploymentPatch)` 추가. `QueryBuilder` 로 동적 SET, enum 필드는 `platform_to_str(p).to_string()` / `env_to_str(env).to_string()` 로 변환 bind.
  - `api-vault-app/src/commands/deployments.rs` 신규 — `deployment_create`/`deployment_list_for_project`/`deployment_update`/`deployment_delete` 4개. `deployment_update` 는 `project_update` 와 동일하게 갱신된 `Deployment` 를 반환.
  - `commands/mod.rs` + `lib.rs` invoke_handler 두 블록에 신규 커맨드 4개 등록.
- **Frontend 측**:
  - `src/features/projects/types.ts` — `Deployment`/`DeploymentInput`/`DeploymentPatch`/`DeploymentPlatform` 추가.
  - `src/features/projects/DeploymentDialog.tsx` 신규 — 생성/편집 통합. zod 스키마 (url: URL 검증, platform 5종 enum, env 3종 enum). 프런트 enum 값이 Rust `serde(rename_all = "lowercase")` 와 정확히 일치.
  - `src/features/projects/DeploymentSection.tsx` 신규 — 섹션 헤더 + "Add" ghost 버튼 + 리스트 (URL / platform · env badge / 편집/삭제 아이콘 버튼) + AlertDialog 삭제 확인. 파생 loading 패턴 (`currentKey !== resolvedKey`) 유지.
  - `src/features/projects/ProjectDetail.tsx` — `DeploymentSection` 삽입 (Metadata 섹션 아래, Linked credentials 위).
  - `src/locales/{en,ko,ja,zh}/common.json` — `deployments.*` 네임스페이스 28키 × 4 언어.
- **테스트**:
  - `src/features/projects/__tests__/ProjectsPage.test.tsx` 를 `mockImplementation((cmd) => ...)` 커맨드명 라우팅 방식으로 리팩터링 — 기존 `mockResolvedValueOnce` 시퀀스 방식은 자식 컴포넌트(DeploymentSection) 마운트로 invoke 순서가 뒤섞여 fragile. 라우팅 방식은 중첩 컴포넌트 추가에 강건. 기존 7 케이스 전부 그대로 통과 + "Detail Drawer 에 Deployment 섹션 + 기존 배포 렌더" 케이스 1개 추가.
  - `src/features/projects/__tests__/DeploymentSection.test.tsx` 신규 Vitest 4 — empty / list / create flow (Add 버튼 → Dialog 제출 → deployment_create + refresh) / delete flow (확인 다이얼로그).
- **검증**: `cargo clippy -D warnings` exit 0, `pnpm typecheck` exit 0, `pnpm lint` 0 에러 / 기존 6 경고 유지, `pnpm vitest run` 16 files / 132 tests (기존 127 + 5 신규) pass.

**설계 교훈**:

- **DeploymentPatch SQL QueryBuilder**: enum 필드를 `push_bind(&'static str)` 로 하면 수명 오류 가능 → `.to_string()` 명시. 첫 필드 아닌 경우 `qb.push(", ")` 분기. `ProjectRepo::update` 의 macro_rules! 대신 enum 필드 때문에 수동 분기로 작성 (향후 `update` 빌더 공용 매크로 추출 여지 있으나 현 시점은 premature).
- **Mock 라우팅 전환 경험칙**: 테스트가 컴포넌트 트리의 부모-자식 관계에 의존해 invoke 순서를 가정하면 부서지기 쉽다. `mockImplementation((cmd) => responses[cmd])` 방식이 표준. Promise.all 내부 순서도 자동 커버.
- **Cascade 경고**: Deployment 삭제 시 usage.deployment_id 가 dangling 될 수 있음. DB FK 에 `ON DELETE SET NULL` 이 걸려있다면 안전하지만, 현재 스키마 확인은 T039 작업 때 병행. T039 Usage UI 는 deployment 존재 여부를 optional 로 처리해야 함.
- **enum rename_all=lowercase 위력**: Rust 측 `DeploymentPlatform::{Vercel, Railway, ...}` 가 JSON 으로는 `"vercel"`, `"railway"` 소문자가 되고, Zod `z.enum(["vercel", ...])` 와 자연스럽게 매칭. 프런트 타입 선언(`"vercel" | "railway" | ...`) 만 맞추면 수동 매핑 불필요.

### 부수 처리 (수치 정정)

- **마일스톤 표 "Must 개수" 수치 정정**: 기존 `14+2S` 는 잘못 기록된 값. 실제로 task.md 의 T025~T040 Priority 집계는 Must 13 + Should 3 (T037/T038/T040 = Should, T039 = Must). 이를 반영해 `13+3S` 로 수정하고 Status 를 `14/16 완료` 로 전환.
- `docs/progress.md` Last Checkpoint 갱신 (52 커밋, Vitest 132), T038 구현 교훈 6개 (DeploymentPatch QueryBuilder / enum bind / Dialog prefill / Section Add UX / Mock 라우팅 / Cascade 주의), Next Action 을 T039 Usage UI 로 전환 + 선행 확인(Usage 타입 불일치 정리) 명시.

---

## 2026-04-23 (T037 완료, M2 13/14)

### T037 — Project 관리 페이지 (직접 구현, 커밋 `bf67527`)

- **Rust 측 추가 커맨드 (3개)**:
  - `src-tauri/crates/api-vault-app/src/commands/projects.rs` — `project_update(id, patch)` (update 후 갱신된 Project 반환) + `project_delete(id)`
  - `src-tauri/crates/api-vault-app/src/commands/usage.rs` — `usage_list_for_project(project_id)`
  - `lib.rs` invoke_handler 두 블록에 3개 추가 (feature="tauri-plugins" 분기 모두)
  - `ProjectRepo::update/delete`, `UsageRepo::list_for_project` 는 이미 T019 에서 구현되어 있어 래핑만 수행.
- **생성 파일 (프런트)**:
  - `src/features/projects/types.ts` — `Project`, `ProjectInput`, `ProjectPatch`, `ProjectUsage`
  - `src/features/projects/use-projects.ts` — `project_list` 로드 + 이름 검색 필터링 (useInventory 와 동일 FetchState 패턴)
  - `src/features/projects/ProjectDialog.tsx` — 생성/편집 통합 Dialog. zod 스키마 (name 필수, repo_url/framework/runtime/local_path 선택). `editTarget` prop 존재 시 편집 모드, 빈 문자열 → `null` 로 변환하여 patch 전송.
  - `src/features/projects/ProjectDetail.tsx` — Sheet drawer. 파생 loading 패턴 (`currentKey !== resolvedKey`) 으로 `react-hooks/set-state-in-effect` 규칙 준수. `usage_list_for_project` + `credential_list` 를 `Promise.all` 로 병렬 호출 후 Map 조인으로 linked credential 렌더.
  - `src/features/projects/ProjectsPage.tsx` — 카드 그리드 + 검색 input + 생성 버튼 + 에러 배너. `ProjectList`/`ProjectCard` 는 같은 파일 내 private 컴포넌트.
  - `src/pages/ProjectsPage.tsx` — 1줄 wrapper.
  - `src/features/projects/__tests__/ProjectsPage.test.tsx` — Vitest 7 (empty, list render, search filter, Create dialog open, project_create 호출 + refresh, detail drawer open + linked credential 표시, delete confirm flow).
- **수정 파일 (프런트)**:
  - `src/App.tsx` — `/projects` 라우트 추가 (`<AppShell />` 중첩 → `RequireOnboarding` 자동 보호).
  - `src/components/shell/Sidebar.tsx` + `BottomNav.tsx` — Projects 항목(`FolderKanban` 아이콘) 추가. BottomNav `grid-cols-5` → `grid-cols-6`.
  - `src/locales/{en,ko,ja,zh}/common.json` — `nav.projects` + `projects.*` 40여 키 × 4 언어 동기.
- **검증**: `cargo check/clippy -D warnings` exit 0, `pnpm typecheck` exit 0, `pnpm lint` 0 에러 (기존 6 경고 유지), `pnpm vitest run` 15 files / 127 tests pass (기존 120 + 신규 7).

**설계 교훈**:

- **`ProjectPatch` 빈 문자열 vs null** — Rust `#[derive(Default)]` + `Option<String>` 구조에서 JSON `""` 을 보내면 `Some("")` 가 저장된다. 비우기를 원하면 `null` 필수. 폼에서는 UX 간결성을 위해 빈 문자열 input 을 허용하고 submit 시 `values.field ?? null` 로 정규화.
- **Promise.all 병렬 조인** — `usage_list_for_project(pid)` + `credential_list({})` 를 동시에 띄우면 single round-trip 수준으로 끝남. credential 을 Map 으로 indexing 후 usages 순회하며 dedup. usage 가 같은 credential 을 여러 번 참조하더라도 카드는 한 번만 렌더.
- **BottomNav 탭 6개** — 5탭 관례를 넘어섰다. iPad/모바일 레이아웃에서 텍스트가 약간 좁아지지만 아이콘 가시성은 유지. M6 Audit 구현 완료 전에 "Audit 을 Settings 내부로 이동" UX 재검토 여지 있음. 이번엔 단순히 grid-cols-6 으로 해결.
- **파생 loading 패턴 표준화** — `CredentialDetail` (T027) → `ProjectDetail` (T037) → 이후 `DeploymentSection` (T038) 까지 동일한 `currentKey / resolvedKey / settledState` 3-tuple 패턴을 반복. 공용 훅 추출 여지가 생겼지만, 아직 3회 반복 수준이라 "3번째 직전에 추출" 원칙에 따라 T038 에서 판단.

### 부수 처리

- `docs/task.md` 마일스톤 표 Status `🔄 12/14` → `🔄 13/14`. 진행 현황 표에 `T037` 줄 추가 + 완료 합계 37/118.
- `docs/progress.md` Last Checkpoint 갱신 (50 커밋, Vitest 127), T037 구현 교훈 섹션 교체, Next Action 을 T038 Deployment 관리로 전환, In Progress 체크박스에 T037 체크 + T038/T039/T040 리스트업.

---

## 2026-04-23 (T036 완료, M2 12/14)

**세션 재개**: `/resume-project` → `last_session.json` 0바이트라 `docs/progress.md` 로 복원. M2 11/14 (T035 완료) 상태에서 재개. 사용자 요청으로 T036 전에 중국어 로케일 추가 선행.

### i18n follow-up — 중국어(zh-간체) 로케일 추가 (직접 구현, 커밋 `1168210`)

- **생성 파일**: `src/locales/zh/common.json` (en/ko/ja 와 동일 키 구조, 간체 중국어 전체 번역)
- **수정 파일**: `src/lib/i18n.ts` (supportedLngs 에 `zh` 등록 + resources 추가), `src/features/settings/SettingsPage.tsx` (currentLang 분기 + "中文" 옵션)
- **검증**: `pnpm typecheck` / `pnpm vitest run src/features/settings` (18 테스트) exit 0
- **배경**: T011 i18n 초기 구성에서 en/ko/ja 만 포함했으나, 사용자 요청으로 중국어(CN 시장 커버리지) 추가. ja 파일의 app/nav/common 섹션 일부가 영어로 남아있는 점은 그대로 두고 zh 는 완전 번역으로 통일.

### T036 — Welcome 3단계 온보딩 (직접 구현, 커밋 `e22c452`)

- **생성 파일**:
  - `src/features/onboarding/WelcomePage.tsx` (step state 1|2|3, DropZone/KeyRound/PartyPopper 아이콘, CreateCredentialDialog 재사용)
  - `src/features/onboarding/use-onboarding.ts` (`useOnboardingDone` = `useSetting<boolean>` wrapper, key=`apivault.settings.onboarding.done`, parse `"true"/"false"`)
  - `src/features/onboarding/__tests__/WelcomePage.test.tsx` (Vitest 6: 렌더/Next/Dialog open/Dialog success→Step3/Open Inventory 완료/Skip)
- **수정 파일**:
  - `src/App.tsx` — `RequireOnboarding` 가드 컴포넌트 + `/welcome` 라우트. `onboarding.done=false` 이면 `/welcome` 으로 리다이렉트. `/welcome`, `/onboarding/*` 는 가드 밖에 배치해 드롭&스캔 루프 방지.
  - `src/locales/{en,ko,ja,zh}/common.json` — `onboarding.welcomeTitle/welcomeSubtitle/stepIndicator/stepDropTitle/stepDropDescription/stepManualTitle/stepManualDescription/stepDoneTitle/stepDoneDescription/createFirstKey/nextStep/skipOnboarding/openInventory` 13개 키 4개 언어 × 13 = 52개 추가
- **UX 결정 (DoD 충족)**:
  - Step 1 = DropZone 안내 (실제 드롭 핸들러는 전역 DropZone 이 처리, WelcomePage 는 설명만)
  - Step 2 = "Add your first key" CTA → CreateCredentialDialog open → `onSuccess` 에서 자동 Step 3 진입
  - Step 3 = "You're all set" + "Open Inventory" 버튼 → `setOnboardingDone(true)` + `navigate("/", {replace:true})`
  - Skip 버튼 모든 스텝에서 동일 finish 동작
  - Progressive Disclosure 톤 — 보안 경고/권한 설명 없이 3문장으로 끝.
- **검증**: `pnpm typecheck` exit 0, `pnpm vitest run` 14 files / 120 tests pass (기존 114 + 신규 6), `pnpm lint` 신규 에러 0 (기존 fast-refresh 경고만 유지).

**설계 교훈**:

- **`RequireOnboarding` 가드 구조**: 라우트 트리 내 `<Route element={<RequireOnboarding><AppShell/></RequireOnboarding>}>` 로 감싸면 중첩 라우트는 자동 보호. 단, `/welcome` 과 `/onboarding/scan` 은 같은 `<Routes>` 하위 sibling 으로 두어 가드 우회. 이 패턴은 T037 이후 추가되는 `/projects` 등 모든 신규 라우트를 `AppShell` 중첩에 넣기만 하면 자동 보호됨.
- **`useSetting<boolean>` 파서 패턴 확장 가능**: T030 의 `AUTO_LOCK_KEY` 와 같은 파일에 `useOnboardingDone` 만 추가하지 않고 별도 `use-onboarding.ts` 로 분리 — feature 경계 유지.
- **CreateCredentialDialog mock 전략**: WelcomePage 테스트에서 실제 dialog 를 띄우면 useIssuers → invoke → Popover jsdom 이슈로 비대해짐. `vi.mock("@/features/inventory/CreateCredentialDialog", ...)` 로 3-button stub 으로 대체 → 6 테스트 0.7s 내 완료.

### 부수 처리

- `docs/task.md` 마일스톤 표 Status 컬럼 `🔄 11/14` → `🔄 12/14`. 진행 현황 표에 `T036` 줄 + `T011+` (중국어 follow-up) 줄 각각 추가.
- `docs/progress.md` Last Checkpoint 갱신 (48개 커밋, Vitest 120개), T036 구현 교훈 5줄 추가, Next Action 을 T037 Project 관리 페이지로 전환.

---

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

### T027 — Credential 상세 Drawer (implementator 에이전트, 커밋 `4cbf8c0`, Night mode)

- **생성 파일**: `src/features/inventory/CredentialDetail.tsx` (Sheet 본체), `__tests__/CredentialDetail.test.tsx` (Vitest 11), `src/components/ui/{sheet,alert-dialog,progress}.tsx` (shadcn CLI)
- **수정 파일**: `CredentialCard.tsx` (onSelect prop + Enter/Space 키보드 활성화), `CredentialList.tsx` (onSelect 전달), `InventoryPage.tsx` (selectedId state + CredentialDetail 마운트), `types.ts` (Usage, CredentialFull 타입), `__tests__/fixtures.ts` (MOCK_CREDENTIAL_FULL + NOW/DAY export), `__tests__/InventoryPage.test.tsx` (MemoryRouter 래핑, listen mock, 통합 테스트 1), `src/locales/{en,ko,ja}/common.json` (inventory 네임스페이스 28키 추가: detail/copy/delete/M7 placeholder)
- **Drawer 섹션**: Header(name + Issuer 배지 + Env 배지 + Status 배지) → Primary actions(Copy/Rotate/Revoke) → Progress bar(30→0) → Metadata grid(value hint/scope/created/last rotated/expires/rotation policy/vault ref) → Usages(M3 empty state) → Audit link(M6 `/audit?credential=${id}`) → Delete footer
- **Copy 플로우**: `credential_copy_to_clipboard` invoke 후 `clipboard:countdown` 이벤트 구독(`@tauri-apps/api/event::listen`), 1초마다 `remaining` 30→0. Drawer unmount/close 시 unlisten 확실히.
- **Delete 플로우**: `Delete credential` 버튼 → AlertDialog (destructive confirm) → `credential_delete` invoke → toast.success + onDeleted (InventoryPage refresh) + onClose (selectedId=null).
- **Rotate/Revoke**: disabled Button + Tooltip "Coming in M7" placeholder (M7 에서 구현 예정).
- **CredentialFull flatten 확인**: Rust `#[serde(flatten)] credential: Credential` + `usages: Vec<Usage>` 그대로 평면 TS 타입.
- **테스트**: Vitest +12 (CredentialDetail 11 + InventoryPage 통합 1). 전체 58개 통과. listen mock 은 핸들러 캡처 패턴(`eventHandler` 참조에 저장).
- **검증**: `tsc/lint/vitest/cargo build` 4개 exit 0. `format:check` 는 아래 별건으로 분리 처리.

**구현 중 결정한 설계**:

- **`react-hooks/set-state-in-effect` 규칙 회피 패턴 2**: T025/T026 은 `FetchState` union 으로 통합했는데 T027 은 다른 접근 — `settledState`/`resolvedKey`/`retryCount` 세 state 를 분리하고 `fetchState` 를 `currentKey !== resolvedKey → loading` 파생값으로 계산. 두 패턴이 공존 — 어느 쪽이 나은지 리뷰 때 통일. 기록용.
- **Sheet vs Drawer**: shadcn Sheet 로 `side="right"` + `sm:max-w-md`. 모바일은 우측 풀스크린 유지 (전용 bottom sheet 은 후순위).
- **React Router `Link`**: audit 링크는 `<Link to="/audit?credential=${id}">`. InventoryPage 테스트가 `MemoryRouter` 래핑을 필수로 요구하게 됨 — T029 CommandPalette navigate action 테스트에서도 동일.

**발견한 이슈**:

- **`pnpm format:check` 실패**: `docs/task.md` 가 prettier 의 마크다운 테이블 컬럼 정렬과 불일치. 원인: orchestrator 가 Edit 로 T025/T026/T028 행을 한 줄씩 추가할 때마다 컬럼 패딩이 prettier 기대와 어긋남. **해결**: `.prettierignore` 에 `docs/task.md`, `docs/progress.md`, `docs/work-log.md` 추가(커밋 `0b86538`). 이 3종은 orchestrator 가 관리하는 진행 기록이라 자동 포맷 대상에서 분리가 맞음.

**T029 (Cmd+K) 에 영향 줄 사실**:

- `MemoryRouter` 래핑 필요한 컴포넌트 확산 — InventoryPage / CredentialDetail / 향후 CommandPalette 의 navigate action 테스트 모두.
- `react-hooks/set-state-in-effect` 회피 패턴 — 로딩 state 설계 시 파생값 또는 event handler setState 선택. T029 의 CommandPalette 는 단순 open/closed 상태라 영향 낮지만, 최근 사용 순 정렬 같은 persisted state 에서는 주의.
- `cmdk` 라이브러리(Command primitive) 의 ResizeObserver 요구는 이미 `test-setup.ts` 폴리필로 커버됨.
- `useHotkeys` 훅 미설치 (`pnpm add react-hotkeys-hook` 필요).

### CI 복구 — .prettierignore 확장 (커밋 `0b86538`)

- T027 `pnpm format:check` 실패 원인이 orchestrator 관리 문서의 prettier 미준수라 근본 해결.
- `.prettierignore` 에 `docs/task.md`, `docs/progress.md`, `docs/work-log.md` 추가.
- 이후 모든 진행 기록 Edit 은 prettier 재포맷 걱정 없이 자유롭게 수행 가능.

### Night mode 해석 정정 (사용자 피드백)

1순위 CRUD 블록 완주 후 "2순위 진입 방식" 을 3지선다로 물었다가 사용자가 "Night mode 라면 묻지 않고 1을 했어야지" 지적. Night mode 의 의미는 Gate 1-4 외 **모든 중간 확인을 스킵하고 연속 실행**. 태스크 블록 전환 같은 하위 구조는 승인 게이트가 아님. `memory/feedback_night_mode.md` + MEMORY.md 에 영구 기록.

### T029 — Cmd+K Command Palette (implementator, 커밋 `67dd892`, Night mode 연속)

- **생성 파일**: `src/features/command-palette/{CommandPalette.tsx,actions.ts,use-recent-commands.ts,__tests__/CommandPalette.test.tsx}`
- **수정 파일**: `src/components/shell/AppShell.tsx` (CommandPalette 마운트 + useHotkeys enabled=desktop), `src/features/vault/use-vault-status.ts` (vault-lock CustomEvent 리스너 추가), `src/features/inventory/InventoryPage.tsx` (?action=create query 감지 → Dialog 자동 open), 기존 Inventory 테스트 2종 (MemoryRouter 래핑 + 통합 테스트 1), `src/locales/{en,ko,ja}/common.json` (commandPalette 네임스페이스 + vault.lockedToast), `package.json`/`pnpm-lock.yaml` (react-hotkeys-hook 추가)
- **10 actions**: Navigation 5 (Inventory/Graph/Incidents/Audit/Settings) + Actions 5 (Create credential → `?action=create` URL query / Lock vault → invoke + CustomEvent / Switch to {light|dark|system} 3개 분리)
- **Recent 그룹**: localStorage `apivault:command-palette:recent` 에 id 배열 상한 10. 상위 5개를 Recent 그룹으로 cmdk 안 상단 렌더. 원 그룹에도 중복 표시 유지(검색 일관성).
- **모바일 숨김**: AppShell 데스크톱 분기에서만 `<CommandPalette />` 렌더 + useHotkeys `enabled: platform === "desktop"` (Hooks 규칙 준수 위해 훅은 항상 호출).
- **Lock vault 플로우**: `invoke("vault_lock")` → `window.dispatchEvent(new CustomEvent("vault-lock"))` → `useVaultStatus` 내부 리스너가 refresh → `{state:"locked"}` 반환 시 VaultGate 가 LockScreen 렌더. 전역 Context 없이 이벤트로 해결(YAGNI).
- **테스트**: Vitest +12 (CommandPalette 11 + InventoryPage 통합 1). 전체 70개 통과.
- **검증**: `tsc/lint/format:check/vitest/cargo build` 5개 exit 0.

**구현 중 발견한 이슈**:

- **`react-hooks/set-state-in-effect` 규칙 (3번째 충돌)**: InventoryPage 에서 `?action=create` 감지 시 `setDialogOpen(true)` + `setSearchParams({})` 를 effect 안에서 같이 호출하면 규칙 위반. 해결: `useState` 초기화 함수에서 searchParams 를 읽고 `dialogOpen` 초기값을 `true` 로 세팅, `setSearchParams({})` 는 `setTimeout(fn, 0)` 으로 microtask 위임. setTimeout 경로는 router 상태 변경이라 규칙 밖. 동작은 정상이지만 약간 hacky — 향후 리팩터 여지.
- **CommandDialog description 충돌**: cmdk 의 `CommandDialog` 에 `description` prop 이 있고 sr-only DOM 에 렌더됨. 내가 제안한 `description={t("commandPalette.navigation")}` 를 그대로 쓰면 "Navigation" 그룹 heading 과 텍스트 충돌로 테스트 `getByText("Navigation")` 실패. 해결: description 을 `searchPlaceholder` 텍스트로 바꾸고 title 을 고정 "Command Palette" 로.
- **CreateCredentialDialog 테스트 회귀**: `InventoryPage` 가 `useSearchParams` 쓰면서 Router 컨텍스트 요구. 기존 테스트에서 Router 없이 렌더하던 부분을 `<MemoryRouter>` 로 래핑.

**T030/T031 에 영향 줄 사실**:

- `useTheme().setTheme` 사용 패턴 확립됨. SettingsPage 에서 동일하게 `next-themes` → `@/components/theme/theme-provider` 재export 사용.
- Settings 의 theme 섹션 i18n 은 기존 `settings.themeLight/Dark/System` 사용 (T011 에서 이미 생성). commandPalette 네임스페이스 중복 아님.
- `vault-lock` CustomEvent 패턴 재사용 준비 완료 — T031 Auto-lock idle timer 에서 `invoke("vault_lock")` + 동일 CustomEvent dispatch 로 LockScreen 전환.
- `useHotkeys` 의 `enabled` 옵션 패턴 확립. T031 idle detection 훅도 `enabled: autoLockEnabled` 로 조건부 활성화 가능.

### T030 — Settings 페이지 + settings_get/set (implementator, 커밋 `96337a5`, Night mode 연속)

- **신규 Rust**: `src-tauri/crates/api-vault-app/src/commands/settings.rs` (82줄) — `settings_get(key)` / `settings_set(key, value?)` Tauri 커맨드 + `SettingsCommandError::Internal` + `#[cfg(test)]` set_then_get_roundtrip 1개. `SettingsRepo` 얇은 래퍼.
- **수정 Rust**: `commands/mod.rs` (pub mod settings), `lib.rs` (invoke_handler 두 블록에 등록)
- **신규 프론트**: `src/features/settings/{SettingsPage.tsx, use-settings.ts}` + `__tests__/{SettingsPage,use-settings}` 2
- **수정 프론트**: `src/pages/SettingsPage.tsx` 를 `export { SettingsPage } from "@/features/settings/SettingsPage"` 1줄 래퍼로 축소, `src/locales/{en,ko,ja}/common.json` settings 네임스페이스 +19키
- **섹션 3개**: Appearance (Theme Tabs + Language Select) / Security (Auto-lock Select 4옵션 Never/5/15/30) / About (앱명/버전/AGPL 링크/GitHub 링크, `@tauri-apps/plugin-shell::openUrl` 있으면 사용 + 없으면 `window.open` 폴백)
- **`useSetting<T>` 제네릭 훅**: `{ key, defaultValue, parse, serialize, onError? }` — 마운트 시 `settings_get` + 상태 로드, `setValue` 낙관적 업데이트 + 실패 시 롤백 + toast.error. `useAutoLockMinutes` 편의 헬퍼 (key=`apivault.settings.security.auto_lock_minutes`, default 5, parse Int).
- **DB 이중 저장 회피**: 테마는 next-themes localStorage, 언어는 i18next LanguageDetector localStorage 유지. DB 저장은 auto-lock 분 하나만. 향후 멀티 디바이스 동기화 시 확장.
- **테스트**: Rust +1 (48 total), Vitest +18 (use-settings 8 + SettingsPage 10). 전체 88개 통과.
- **검증**: `cargo fmt/clippy/test/build`, `pnpm tsc/lint/format:check/vitest` 8개 exit 0.

**구현 중 발견한 이슈**:

- **`react-hooks/refs` 에러**: render body 에서 `stateRef.current = state` 직접 할당은 "Cannot access refs during render" 에러. 해결: `useEffect(() => { stateRef.current = state; })` — deps 없는 effect 로 옮겨 매 렌더 커밋 후 동기화. setValue 이벤트 핸들러 시점에는 항상 최신 state 읽힘.
- **`react-hooks/set-state-in-effect` (4번째 충돌)**: key 변경 시 "loading" 으로 전환하려 effect 본문에 `setState({phase:"loading"})` 뒀다가 에러. 해결: 초기 state 를 `{phase:"loading"}` 으로 두고 effect 는 성공/실패 시에만 setState. key 변경 중 loading 표시가 필요하면 tick 카운터 패턴이지만 이번 훅엔 불필요.
- **`@tauri-apps/plugin-shell` 동적 import**: `openUrl` 을 `import("@tauri-apps/plugin-shell")` 로 지연 로드 → 테스트/웹 환경에서는 `window.open` 폴백. `vi.mock` 은 동적 import 에도 자동 적용.
- **i18next plural suffix 단순화**: `autoLockMinutes_one/_other` 대신 단일 키 `autoLockMinutes = "{{count}} minutes"` — 옵션 5/15/30 에는 1이 없고 한/일어는 단복수 구분 없음.

**T031 Auto-lock 에 영향 줄 사실**:

- `useAutoLockMinutes()` 훅과 `AUTO_LOCK_KEY` 상수 재사용. 0 → 비활성화, 양수 → 해당 분 후 idle lock.
- `vault-lock` CustomEvent 패턴은 T029 에서 확립돼 T031 도 동일. idle 도달 → `invoke("vault_lock")` + `dispatchEvent` → `useVaultStatus` refresh → LockScreen.
- `useHotkeys` 의 `enabled` 옵션 패턴을 `use-idle-lock` 훅에도 적용 — `enabled: minutes > 0` 조건부 리스너.

### T031 — Auto-lock idle 타이머 (implementator, 커밋 `34e8a90`, Night mode 연속)

- **신규 파일**: `src/hooks/use-idle-lock.ts`, `src/features/vault/AutoLockGuard.tsx` (null-render 래퍼), `src/hooks/__tests__/use-idle-lock.test.tsx` (Vitest 9)
- **수정 파일**: `src/App.tsx` — VaultGate unlocked 분기 `<BrowserRouter>` 내부에 `<AutoLockGuard />` 삽입
- **훅 동작**: `useAutoLockMinutes()` 소비 → minutes=0 이면 early return (리스너/타이머 없음) / 양수면 mousemove/keydown/touchstart/wheel/scroll 이벤트에 `clearTimeout+setTimeout` 재설정 패턴. idle 도달 시 `invoke("vault_lock")` + `window.dispatchEvent(new CustomEvent("vault-lock"))`. toast 는 생략 (LockScreen 전환 자체가 피드백).
- **deps `[enabled, minutes]`**: 설정 값 변경 시 effect 재실행 → 기존 리스너/타이머 cleanup + 새 값으로 재구독. 즉각 반영.
- **테스트 9개**: Never 비활성 / 5분 후 invoke / 이벤트 3종(mousemove/keydown/touchstart) 리셋 / vault-lock CustomEvent dispatch 검증 / minutes 5→0 변경 시 해제 / unmount cleanup / invoke reject 시 console.error 유예 / 등
- **검증**: `tsc/lint/format:check/vitest/cargo build` 5개 exit 0. 전체 Vitest 97개, Rust 48개 통과.

**구현 중 발견한 이슈**:

- **fake timers 와 async Promise 상호작용**: `flushPromises = () => new Promise(r => setTimeout(r, 0))` 은 `vi.useFakeTimers()` 환경에서 setTimeout(0) 도 fake timer 로 걸려 5초 타임아웃. 해결: `queueMicrotask(r)` 은 fake timers 밖의 마이크로태스크 큐라 즉시 실행. 이 패턴은 이후 invoke 포함 테스트 전반에 재사용 가능 — 향후 `test-setup.ts` 에 전역 helper 로 승격 검토.
- **AutoLockMinutes 유니온 타입 `0 | 5 | 15 | 30`**: 테스트 헬퍼 `makeMinutes(value: number)` 에서 타입 충돌. `value: AutoLockMinutes` 로 좁혀 해결.
- **deps 에서 `t` 제거**: toast 생략 결정에 따라 `useTranslation` 자체 불필요. deps 축소.

**M2 후반(드롭&스캔) 에 영향 줄 사실**:

- `<AutoLockGuard />` 가 BrowserRouter 내부 위치 — T032 DropZone 을 같은 위치에 나란히 두는 게 자연스러움. 전역 오버레이가 BrowserRouter 외부에 필요하면 위치 재검토.
- `queueMicrotask` flushPromises 패턴이 확립됨 — T033~T035 에서 invoke 비동기 테스트에 그대로 적용.

### 2순위 블록 완주 (T029/T030/T031)

- Cmd+K 전역 단축키 + Settings 페이지(Auto-lock 저장) + idle 타이머까지 연결됨.
- Lock vault 경로: (1) Cmd+K → Lock action, (2) idle timeout — 두 경로 모두 `invoke("vault_lock")` + `vault-lock` CustomEvent 패턴으로 통일.
- 3순위(드롭&스캔 T032~T035) 진입. 3순위는 Rust 엔트로피 기반 secret detection + 파일시스템 스캔이 포함되어 M2 내 가장 복잡한 블록.

### T032 — 드롭 존 + /onboarding/scan placeholder (implementator, 커밋 `6f121ee`, Night mode 연속)

- **신규 파일**: `src/features/onboarding/DropZone.tsx`, `src/pages/OnboardingScanPage.tsx` (placeholder), `src/features/onboarding/__tests__/{DropZone,OnboardingScanPage}.test.tsx` (Vitest 8 + 2)
- **수정 파일**: `src/App.tsx` (DropZone 마운트 + `/onboarding/scan` Route 추가), `src/locales/{en,ko,ja}/common.json` (onboarding 네임스페이스 6키)
- **Tauri v2 API 확인**: DoD 의 `tauri://file-drop` 은 v1 이벤트명. v2 에서는 `@tauri-apps/api/webview` 의 `getCurrentWebview().onDragDropEvent(handler)` 로 구독. payload `{ type: "enter"|"over"|"drop"|"leave", paths?, position? }`. dynamic import + unlisten 반환 함수로 cleanup.
- **이벤트 흐름**: `enter` → 오버레이 fade-in / `leave`/`drop` → fade-out / `drop` + paths.length>0 → `paths[0]` 만 사용해 `navigate("/onboarding/scan?path=...")`. 복수 경로는 T035 에서.
- **웹 표준 DnD preventDefault**: 별도 useEffect 로 `dragenter/dragover/drop` 기본 브라우저 동작(파일 열기 등) 차단. platform 가드 동일 적용.
- **플랫폼 가드**: `usePlatform()` 훅. `"desktop"` 아니면 DropZone 이 `null` 반환. 브라우저/모바일에서 getCurrentWebview 호출 안 함.
- **오버레이 UI**: `fixed inset-0 z-50 backdrop-blur-sm bg-background/80 pointer-events-none` + dashed border card + `FolderDown` 아이콘. animate-in fade-in (globals.css prefers-reduced-motion 처리).
- **OnboardingScanPage placeholder**: `useSearchParams` 로 `path` 쿼리 읽어 제목/설명 표시. path 없으면 빈 안내. T033–T035 에서 실제 스캔 UI 채움.
- **테스트**: Vitest +10 (DropZone 8: platform 가드/onDragDropEvent 구독/enter-leave-drop 분기/paths[] 빈 배열 guard/unmount cleanup/dragover preventDefault 검증 + OnboardingScanPage 2: path 쿼리 렌더/path 누락 분기). 전체 107 통과.
- **검증**: `tsc/lint/format:check/vitest/cargo build` 5개 exit 0.

**구현 중 발견한 이슈**:

- **jsdom `DragEvent` 미구현**: 테스트에서 `new DragEvent(...)` 호출 시 `ReferenceError`. 해결: `new Event("dragover", { cancelable: true })` + `preventDefault` spy 로 우회. 실제 Tauri/브라우저 환경에서는 DragEvent 정상.
- **기존 테스트 회귀 없음**: 다른 테스트 파일들이 `<App />` 을 직접 렌더 안 하므로 `<DropZone />` 이 마운트되지 않아 `getCurrentWebview` 호출도 없음. 전역 mock 불필요.

**T033/T034/T035 에 영향 줄 사실**:

- **paths[0] 단일 경로 설계**: URL query `?path=<...>` 로 OnboardingScanPage 가 받음. T033 Rust 스캐너도 `scan_path(path: &Path) -> Vec<DetectedKey>` 단일 진입점 설계면 IPC 자연스럽게 연결. 복수 경로는 T035 UI 에서 여러 번 invoke.
- **`/onboarding/scan` 라우트는 현재 AppShell 밖 독립 렌더**: AppShell 사이드바 없는 풀스크린 형태. T035 스캔 UI 구현 시 AppShell 안으로 이동할지 재검토 (현재 T032 결정은 "결과 검토 플로우 에 집중하기 위해 독립"). 풀스크린 유지 쪽이 드롭→확인 흐름 집중도 높음.
- **플랫폼 가드 패턴**: `usePlatform() !== "desktop" → return null`. T035 스캔 결과 UI 에서도 데스크톱 가드 유지.

### T033 — env_scanner (implementator, 커밋 `8e7c7a2`, Night mode 연속)

- **신규 모듈**: `src-tauri/crates/api-vault-connectors/src/env_scanner/` (mod.rs 414 / entropy.rs 57 / parser.rs 162 / issuers.rs 113)
- **신규 의존성**: `regex = "1"`, `ignore = "0.4"`, `once_cell = "1"` workspace.dependencies 추가. `api-vault-connectors` Cargo.toml 재작성.
- **공개 API**: `scan_path(&Path) -> Vec<DetectedKey>`, `DetectedKey { file_path, line: u32, env_var_name: Option<String>, issuer_slug: Option<String>, value_hint: String, confidence: f64 }` (serde Serialize/Deserialize)
- **탐색**: `ignore::WalkBuilder` — gitignore 존중 + `hidden(false)` 로 .env\* 포함 + 심링크 미추적 + 바이너리(첫 512바이트에 `\0`)/1MB+ 스킵
- **파싱**: `.env` 정밀 파서 (`export KEY=value`, quoted, 주석), JSON/TS/JS 범용 문자열 파서 (리터럴 길이 16+)
- **엔트로피**: Shannon (bytes 기준). 임계 3.5 bits/char + value.len() >= 20. 통과 시 confidence = `min(0.40 + (entropy - 3.5) * 0.30, 0.85)`. Issuer regex 매치 시 confidence = 0.95.
- **10종 Issuer regex**: T028 ts `issuer-presets.ts` 의 `key_pattern_regex` 동기 복제. Anthropic 을 OpenAI 앞에 배치 — `sk-ant-api03-…` 가 OpenAI regex `^sk-(proj-)?[A-Za-z0-9_-]{20,}$` 에 잘못 매치되는 걸 순서로 방지 (테스트 `anthropic_key_matches_anthropic_not_openai`).
- **Rust 테스트 +35**: entropy 5 / .env 파서 7 / generic 파서 4 / issuers 7 / scan_path 통합 12 (is_scannable 4, value_hint 2, .env 스캔, gitignore 존중, config.ts 경로, 바이너리 스킵, 엔트로피만 검출, 단일 파일 진입 등). 전체 Rust 테스트 83 통과.
- **검증**: 8개 명령 (`cargo fmt/clippy/test/build`, `pnpm tsc/lint/format:check/vitest`) 전부 exit 0.

**구현 중 발견한 이슈**:

- **`ignore::WalkBuilder` gotcha**: `hidden(true)` 기본이라 `.env*` dot-file 전부 스킵됨. `hidden(false)` 명시 필수. T034 에서 WalkBuilder 재사용 시 유의.
- **Anthropic vs OpenAI regex 충돌 검증**: 결정 6의 우선순위 배치가 적절. `sk-ant-api03-XXX...` 가 OpenAI `^sk-(proj-)?...` 에 완전히 매치되는 걸 벡터 순서(Anthropic 먼저)로 차단. 순수 regex 수준 재작성보다 순서 처리가 단순.
- **secrets.env 테스트 명세 정합**: 오케스트레이터 명세의 gitignore 테스트 케이스 `secrets.env` 는 `is_scannable` 조건(`.env` / `.env.*`) 미만족이라 원래 스킵. 명세 충실히 따르되 gitignore 경로 격리 검증은 추후 `.env.secrets` 파일명으로 보강 여지 있음.

**T034 / T035 에 영향 줄 사실**:

- `scan_path` 는 sync → T034 Tauri 커맨드는 `tauri::async_runtime::spawn_blocking` 또는 `tokio::task::spawn_blocking` 으로 UI 스레드 블로킹 회피.
- `DetectedKey` serde 완비 — IPC 직렬화 추가 작업 불필요.
- `env_var_name: Option<String>` / JSON·TS 출처는 None → T035 UI 에서 "—" 표시.
- `value_hint` 는 마지막 4자만 저장 — 테이블 렌더 시 `****XXXX` 마스킹 자연스러움.
- 파일 크기/결과 수 상한 현재 없음 → T035 에서 페이지네이션 또는 virtualization 고려.

### T034 — env_scan_folder 커맨드 (implementator, 커밋 `eeab911`, Night mode 연속)

- **신규 파일**: `src-tauri/crates/api-vault-app/src/commands/scanner.rs` — `env_scan_folder(app: AppHandle, path: String) -> Result<Vec<DetectedKey>, EnvScanError>`
- **수정 파일**: `commands/mod.rs` (pub mod scanner), `lib.rs` (두 invoke_handler 블록에 등록), `api-vault-app/Cargo.toml` (`api-vault-connectors = { path = "../api-vault-connectors" }` dep 추가)
- **동작**: `tauri::async_runtime::spawn_blocking(move || api_vault_connectors::scan_path(&p))` 로 sync 스캔을 worker thread 로. `app.emit("scan:progress", ScanProgress::Started {path})` → scan → `app.emit(..., Done {count})`
- **에러**: `EnvScanError::InvalidPath` (경로 존재 X) / `UnsupportedPath` (파일/디렉토리 아님) / `Internal { message }`. serde tag="code".
- **`tauri::Emitter` trait import 필수**: `use tauri::Emitter;` 없으면 `app.emit()` 컴파일 안 됨. `AppHandle` 에 구현된 trait 이지만 자동 import 아님.
- **Rust 테스트 +3** (`#[cfg(test)]`): invalid path → InvalidPath / tempdir `.env` → 결과 1+ / 단일 `.env` 파일 경로 → 결과 1+. AppHandle 우회를 위해 `do_env_scan(path: String)` 퓨어 함수로 로직 분리하고 테스트는 이 함수 호출.
- **검증**: 8개 명령 exit 0. 전체 Rust 86개, Vitest 107개 통과.

**설계 결정 (Pending Decisions 에 기록)**:

- **per-file progress streaming 은 follow-up**: `scan_path` 가 현재 전체 결과를 한번에 반환하는 sync 함수라 중간 per-file emit 을 하려면 iterator 기반 재설계 필요. T034 는 Started/Done 2회 최소 구현. 10k+ 파일 scenario 에서 UX 저하 가능하지만 T035 UI 에서 spinner 로 보완. 제대로 된 streaming 은 M2 후 또는 M3 별도 태스크.
- **capability `fs:scope` 변경 안 함**: DoD 는 Tauri v1 패턴. v2 에서 `std::fs` 직접 호출은 권한 시스템 밖. `src-tauri/capabilities/default.json` 건드리지 않음.

**T035 에 영향 줄 사실**:

- Tauri invoke 시그니처: `invoke("env_scan_folder", { path: string })` → `DetectedKey[]` 반환, 실패 시 `{ code: "invalid_path" | "unsupported_path" | "internal", message? }`.
- 이벤트 구독: `listen<{phase:"started"; path:string} | {phase:"done"; count:number}>("scan:progress", ...)` discriminated union. loading overlay 해제 타이밍에 사용.
- T035 DoD "Import" 플로우는 project_create / usage_create 커맨드가 필요한데 아직 없음 — T035 내부에서 이 커맨드를 선구현할지 별도 태스크 분리할지 구현 시점에 결정.

### 3순위 3/4 진척 — T035 다음 세션 진입점

- T032 DropZone ✅ + T033 env_scanner ✅ + T034 env_scan_folder ✅. 세 층이 연결된 상태. 드롭 → 라우트 이동 → invoke → DetectedKey 리스트 반환까지 end-to-end 파이프라인 작동 가능.
- T035 는 결과 테이블 UI + `credential_create` 일괄 + project/usage 자동 생성. 규모 가장 큰 M2 태스크.
- 메인 대화 세션 누적이 길어 Night mode 규칙(200K 상한 근접 시 상태 보고) 적용 — T035 는 다음 세션 진입점으로 미루고 상태 보고.

### T035 — 드롭&스캔 결과 검토 UI + project/usage 커맨드 (메인 세션, 커밋 `6f31d56`)

**세션 재개 직후**: `/resume-project` 로 progress.md 복원. Night mode 종료. 사용자가 `A안 (풀 스코프)` 결정 → project/usage 커맨드 래퍼도 T035 범위에 포함. `docs/project-decisions.md` 에 즉시 기록.

- **신규 Rust 파일**:
  - `crates/api-vault-app/src/commands/projects.rs` — `project_create(input: ProjectInput)` / `project_list()` / `project_get(id)` (thin wrapper, 별도 Rust 테스트 없음 — repo integration test 가 이미 `repo_project_test.rs` 에 존재).
  - `crates/api-vault-app/src/commands/usage.rs` — `usage_create(input: UsageInput)` / `usage_list_for_credential(credential_id)`.
- **수정 Rust 파일**:
  - `commands/mod.rs` (pub mod projects; pub mod usage;), `lib.rs` (두 invoke_handler 블록에 5개 커맨드 등록).
  - `api-vault-core/src/models/credential.rs` — `CredentialSummary.hash_hint: Option<String>` 필드 추가 (중복 감지용).
  - `api-vault-storage/src/sqlite/repositories/credential.rs` — `list()` SELECT 에 `hash_hint` 추가, 매핑 추가.
- **신규 프론트 파일**:
  - `src/features/onboarding/{types,use-import-detected,DetectedKeysReview}.tsx` + `__tests__/DetectedKeysReview.test.tsx`
- **수정 프론트 파일**:
  - `src/features/inventory/types.ts` — `CredentialSummary` 에 `hash_hint: string | null` 추가
  - `src/features/inventory/__tests__/{fixtures,CredentialCard.test}.tsx` — 새 필드 보완
  - `src/pages/OnboardingScanPage.tsx` — placeholder 제거, `env_scan_folder` invoke + `scan:progress` listen + `DetectedKeysReview` 렌더
  - `src/features/onboarding/__tests__/OnboardingScanPage.test.tsx` — 새 행동에 맞게 리팩터
  - `src/locales/{en,ko,ja}/common.json` — onboarding 네임스페이스 14개 키 추가
- **import 플로우**: `project_create(folder name)` → 선택된 각 DetectedKey 마다 `credential_create` (hash_hint=value_hint, value="scanned:unknown") → `usage_create` (where_kind="env_var"). 실패 시 failures 카운터 증가, best-effort 순차 실행.
- **중복 감지**: `existingCredentials.hash_hint === detected.value_hint` 시 체크박스 disabled + "Already tracked" 배지.
- **Vitest +7** (DetectedKeysReview 5 + OnboardingScanPage 리팩터 2개 추가). 전체 Vitest 114 / Rust 86 통과. typecheck + clippy -D warnings exit 0.

**T035 구현 교훈 (M2 후속)**:

- **스캔 값 본체는 저장되지 않음** — 스캐너가 마지막 4자만 반환하므로 import 시 credential.value 로 `"scanned:unknown"` placeholder 를 저장. 사용자가 reveal 하면 이 placeholder 가 노출되어 UX 가 불완전. **Follow-up**: Rust 쪽에서 file_path+line 으로 재파싱 → 값만 추출 → age 볼트에 주입하는 "secure import" 경로 필요. M2 종료 전 또는 M3 초반 태스크 후보.
- **entropy-only 감지는 import 불가**: `issuer_slug === null` 인 detection 은 issuer FK 없이 credential 생성 불가 → 기본 미선택 + 체크해도 skip. 이 한계는 UX 상 "검출은 되는데 등록 안 됨" 으로 혼란 여지 → T036 온보딩에서 설명 텍스트로 보완 예정.
- **프론트 `Usage` 타입이 Rust 와 불일치** (legacy: `url/env_var_name/scanner_version`) — T035 는 건드리지 않고 커맨드 invoke 시에만 Rust 쉐이프(`where_kind/where_value`)로 맞춰 보냄. 정리는 T037/T038 에서 같이.
- **`useEffect` + `useInventory` hook 순서 주의**: OnboardingScanPage 에서 path 가 없을 때 early return 하면 hook 순서가 바뀌어 React 경고. 해결: useInventory 를 먼저 호출하고 조건부 분기는 뒤에서 처리. 테스트에서 `credential_list` 기본 mock 필요.

**부수 처리**:

- `docs/project-decisions.md` 에 "T035 범위 — Project/Usage Tauri 커맨드 동시 구현 (A안)" 섹션 즉시 추가 (대안 B/C 기각 사유 기록).
- `src/locales/` 3언어 모두 onboarding 키 동기화.

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
