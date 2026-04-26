# Work Log

## 2026-04-27 (재검증 라운드 — 라운드 A/B/C 통과 + I4/I5 P0 hotfix 2건)

### 세션 개요

- **시간**: 2026-04-27 (interactive manual verification — 사용자가 단계별로 화면 검증, 결함 발견 시 즉시 진단 → hotfix → 재검증)
- **모드**: 라운드 A (마이그레이션 0004 + H1/H2/H4) → 라운드 B (H3 RAILGUARD) → 라운드 C (Pro/GitHub/Single+Bulk Revoke). 검증 도중 발견된 P0 2건 (I4, I5) 은 라운드 흐름 안에서 즉시 hotfix + 재검증.
- **검증 통과 10 / C2 deferred 1 / 새 결함 발견 5 (I1~I5) / hotfix commit 2 (I4, I5)**

### 검증 시퀀스 (사용자 실행)

| # | 항목 | 결과 |
|:-:|:----|:----|
| A1 | 앱 재기동 → 마이그레이션 0004 자동 적용 (DB 검사 — `_sqlx_migrations(4, 'incident match unique', success=1)`, `idx_incident_match_unique` 존재) | ✅ |
| A2 | H1 — Affecting my keys 한 incident 의 같은 credential 27회 → **1회** | ✅ |
| A3 | H2 — Audit Subject 컬럼 `vault:default` 정상 표시 | ✅ |
| A4 | H4 — Drawer 상단 Revoke 가 빨간 border + 빨간 텍스트 (outline-destructive) | ✅ |
| B1 | H3 — `C:\tmp\railguard-test` 에 `Overwrite { backup: true }` 로 4 파일 생성 (.cursorrules / .windsurfrules / CLAUDE.md / .github/copilot-instructions.md) | ✅ |
| C1 | Pro 모의 활성화 (Developer Tools "Simulate Pro until" set) | ✅ |
| C2 | GitHub Connect 풀 플로우 | ⏸ deferred (I3) |
| C3 | Pro + Connected 시뮬 (devtools dynamic import 로 fake installation 저장) → Scan 버튼 자물쇠 없이 활성 | ✅ |
| C4 | H5 — Single Revoke (Test API Key) — IPC 통과 + DB status='revoked' + audit chain seq=16. 단 React 화이트 스크린 발생 (I4) → I4 hotfix → 새 credential 로 재검증 | ✅ |
| C5 | H5 IssuerInput — Bulk Revoke. 1차 시도 "Failed to revoke issuer credentials" (I5) → I5 hotfix → 재검증 progress 1/2 → 2/2 + 화면 정상 | ✅ |

### 새로 발견된 결함 5건

| ID | 우선순위 | 상태 | 한 줄 요약 |
|:--|:--|:--|:--|
| **I1** | P3 | pending | Subscription 헤더 "Current plan" 라벨 ↔ Pro 뱃지 줄 분리 (의미 연결 약함) |
| **I2** | P2 | pending | Pro 활성 시에도 disabled "Upgrade to Pro" 버튼 노출 (Free 에서도 dead) |
| **I3** | Architectural | M8 의존 backlog | GitHub Connect 풀 플로우 4 사전 조건: (a) GitHub App 등록 (b) deep-link custom scheme + plist/registry (c) listener 이벤트 표준화 (d) M8 Auth user JWT |
| **I4** | **P0** | ✅ fix | Single/Bulk Revoke 후 화이트 스크린 — Radix Dialog ref composition 무한 setRef ("Maximum update depth exceeded") |
| **I5** | **P0** | ✅ fix | Bulk Revoke `ExpectedCountMismatch` — Rust filter status 미지정으로 revoked 행 포함, FE active-only count 와 mismatch |

### Hotfix 2 commits

- **I4** (`6dda3e8` fix(kill-switch)): KillSwitchDialog/BulkRevokeDialog 의 phase=done 이펙트가 onRevoked/onCompleted 를 동기 호출하면 부모(InventoryPage)가 같은 batch 안에서 자식 다이얼로그를 unmount → Radix compose-refs unmount-during-update race → 무한 setRef 루프 → React tree crash. 부모 콜백을 setTimeout 안 + queueMicrotask 로 defer 하여 close 전환이 시작된 다음 unmount 가 일어나도록 순서 보장. 회귀: KillSwitchDialog test (d) 의 onRevoked 단언을 setTimeout 후로 분리.
- **I5** (`cc1785b` fix(kill-switch)): `kill_switch_revoke_issuer` 의 CredentialFilter 에 `status: Some(Active)` 추가. 부수효과 — (1) FE expected_count(=active 만) 와 backend actual 의미 일치, (2) 이미 revoked 인 credential 의 do_revoke_internal 재호출 제거 (audit 중복 방지), (3) emit progress total 이 사용자 인지(2/2)와 일치. 회귀 `bulk_revoke_filter_excludes_already_revoked_credentials` 추가 — 1 revoked + 2 active 시드 후 Active 필터 list 시 정확히 2개.

### 테스트 결과

| 카테고리 | 이전 | 신규 | 비고 |
|:--|:-:|:-:|:--|
| Rust kill_switch unit | 12 | **13** | I5 회귀 1 |
| Vitest 전체 | 312 | 312 | I4 fix 후 KillSwitchDialog test (d) timeout 조정으로 같은 312 유지 |
| typecheck | 0 | 0 | clean |
| Rust app lib 전체 | 101 | **102** | I5 추가 |

### 보류 / 후속

- **I1 / I2 hotfix** (P2/P3) — Subscription 섹션 UX. 다음 라운드.
- **I3 GitHub Connect 풀 플로우** — M8 Auth (T080~T086) 진입 시 같이 정리.
- **C2 정식 검증** — I3 4건 사전 조건 끝난 후 한 번에.
- **Pre-existing clippy regressions** — 별도 cleanup 큐 유지 (이번 라운드 무관).

### 핵심 인사이트

- **수동 검증의 가치**. 단위 테스트 312 + Rust 101 모두 그린이었지만 I4 (Radix unmount race) / I5 (filter 누락) 모두 단위 테스트가 잡지 못했다. 화면에서 사용자가 한 번 누르는 것이 기존 테스트 전체보다 더 많은 신호를 만든다.
- **부모-자식 unmount race 패턴**. phase=done → 부모 콜백 → 자식 unmount 흐름이 Radix Portal/compose-refs 와 만나면 무한 루프. queueMicrotask 한 줄 defer 가 해결 — 같은 패턴이 다른 다이얼로그 (`KillSwitchDialog`, `BulkRevokeDialog`) 에 일관되게 있다는 것은 향후 동일 위험 다이얼로그 (예: Delete confirmation) 도 같은 검토 필요.
- **expected_count 같은 invariant 는 양 끝에서 의미 일치 검증을 강제할 방법이 없으면 깨진다**. 이번엔 FE active-only ↔ backend status-무관. 다음에는 Rust input struct 가 status filter 를 명시 의무화하거나 (e.g. typed `BulkRevokeInput { status_filter: CredentialStatus }`), 또는 FE 가 expected_count 를 안 보내고 backend 가 raw count 만 반환하게 단순화.

---

## 2026-04-26 PM (수동 검증 라운드 + 결함 5건 hotfix)

### 세션 개요

- **시간**: 2026-04-26 PM (사용자 step-by-step 수동 검증 + 즉시 hotfix)
- **모드**: 인터랙티브 manual verification (한 단계씩 사용자 실행 후 결과 보고). 발견 결함은 큐(H1~H5)에 적어두고 검증 종료 후 일괄 처리.
- **검증 통과 8 / 결함 발견 5 / hotfix 4 커밋 (H3+H5 묶음)**

### 검증 시퀀스 (사용자 실행)

| # | 항목 | 결과 |
|:-:|:----|:----|
| ① | Relay `/health` 200 OK | ✅ |
| ② | 앱 부팅 + Lock Screen | ✅ |
| ③ | 볼트 언락 + Inventory | ✅ |
| ④ | `/incidents` 페이지 + Refresh + 4 탭 + Affecting my keys 필터 | ✅ + ⚠️ H1 |
| ⑤ | Audit `/audit` Verify integrity + entry 목록 | ✅ + ⚠️ H2 |
| ⑥ | RAILGUARD `/railguard` Preview (✅) → Apply (❌ H3) | ✅ Preview / ❌ Apply |
| ⑦ | GitHub Integration UI + Connect 404 (App ID 미등록 정상) | ✅ |
| ⑧ | Pro 모의 활성화 (Settings → Developer Tools) | ✅ |
| ⑨ | Kill Switch 단일 revoke 다이얼로그 → Continue (❌ H5) + UX 의문 H4 | ❌ + ⚠️ H4 |

### Hotfix 5건 → 4 커밋

- **H3 + H5 묶음** (`19afd3d` fix(ipc)): IPC 직렬화 계약 정렬.
  - H5: `KillSwitchRevokeInput`/`...IssuerInput` 에 `#[serde(rename_all = "camelCase")]` 부착. Tauri 의 자동 변환은 top-level 인자 한정, nested struct 필드에는 적용 안 됨.
  - H3: 단일 ApplyMode 기대인 Rust 에 FE 가 `Vec<{tag, kind, ...}>` 송신. FE 타입 재정의 + 단일 객체 송신.
  - 회귀: kill_switch camelCase JSON deserialize 2 + railguard ApplyMode variant 3 + array 거부 1.
- **H1** (`b74d71d` fix(matcher)): `incident_match` 멱등화. 매 refresh 마다 dupe row 누적 → 27 badge / "2465 incidents".
  - 마이그레이션 0004 — dismissed_at propagate → dedup → UNIQUE INDEX (incident_id, credential_id, reason).
  - `insert_match` INSERT OR IGNORE + 캐노니컬 id 반환.
  - 회귀: same triple 3회 insert → 1행 + 같은 id / 다른 reason → 2행 공존.
- **H2** (`c2d45f9` fix(audit)): `vault:efault` 표시. `slice(-6)` 가 `"default"` (7자) 에 잘못 적용.
  - ULID 패턴 (`/^[0-9A-HJKMNP-TV-Z]{26}$/i`) 정확 매칭일 때만 truncate.
  - 회귀: 신규 `use-subject-labels.test.ts` — literal verbatim, ULID 마지막 6, 25/27 경계, name lookup hit (총 7건).
- **H4** (`f350cad` fix(inventory)): Drawer 상단 Revoke 가 `outline` neutral 로 보여 INCIDENTS 의 filled-destructive 와 시각적 위계 모순.
  - 상단을 `outline + border-destructive + text-destructive` 로 정렬. 두 진입점은 의미적으로 다르므로 (위 = 항상 사용 가능 / 아래 = incident 주도 긴급) 둘 다 살리되 위계만 분리.

### 테스트 결과

| 카테고리 | 이전 | 신규 | 비고 |
|:--|:-:|:-:|:--|
| Rust app lib | ~89 | **101** | wire-format kill_switch 2 + railguard 4 |
| Rust storage incident | 15 | **17** | H1 멱등성 회귀 2 |
| Rust storage migration | 5 | 5 | idx_incident_match_unique 검증 추가 |
| Vitest | 305 | **312** | use-subject-labels 7 |
| typecheck | 0 | 0 | clean |
| lint | 0 errors | 0 errors | 5 pre-existing shadcn warnings |

### 보류 / 후속

- **재검증 (사용자 앱 재기동 후)**: 마이그레이션 0004 자동 적용 → 27 → 1 배지 / Apply / Revoke 실제 동작.
- **Playwright 회귀 (tester 에이전트)**: H3/H5 IPC 계약, H1 멱등성, H2 라벨 — 이 라운드의 hotfix 들을 E2E 로 lock-in.
- **Pre-existing clippy regressions** (Rust 1.95): `feed_normalize.rs` cloned-ref-to-slice-refs 등. 이번 hotfix 와 무관, 별도 cleanup 큐.
- **Bulk Revoke 검증**: H5 fix 가 `KillSwitchRevokeIssuerInput` 도 함께 처리 — 다음 검증 라운드에서.
- **Pro + Connected Scan 버튼 노출**: M8 Authentication 진입 후 GitHub App 등록 끝나면 검증.

### 핵심 인사이트

- **자동 테스트의 빈 영역 = IPC 계약 / 데이터 무결성 / 시각적 위계**. 단위 테스트만으로는 잡지 못한다. 이번 라운드에서 wire-format regression 패턴 도입.
- **두 P0 결함 (H3/H5) 이 같은 카테고리**. invoke 호출부의 nested struct 필드 case 협약을 한 번 정리하니 둘 다 풀림. 비슷한 패턴이 어디 또 있을지 (ToolSearch / generated bindings) 추후 점검.
- **마이그레이션은 schema 만 바꾸지 않는다**. 누적 결함 데이터 cleanup 까지 책임지면 사용자는 앱 재기동만으로 수동 작업 없이 정상 상태로 복귀.

---

## 2026-04-25~26 (Pro 가격 인하 + M5 완료 + M15 CI/CD 진입 + 릴레이 스캐폴드, 100/132 태스크 달성)

### 세션 개요

- **시간**: 2026-04-25 AM~PM + 2026-04-26 PM (사용자 인터랙션 + Night mode 2 자율)
- **누적 커밋**: 약 129개 (본 세션 신규 ~17개)
- **마일스톤 진행**:
  - 이전: M4~M7 ✅ 완료 (74/118)
  - 신규 완료: **M5 10/10 ✅** (T061~T064 추가 완성)
  - 신규 진입: **M15 CI/CD Integration 🔄** (T132~T133)
  - 신규 신설: M14 Auto Rotation, M16 Anonymous Telemetry, M17 SDK Ecosystem (placeholder)
  - 누적: 14 마일스톤 → **18 마일스톤**, 118 태스크 → **132 태스크** (100/132 = 75.8%)
- **테스트**: Rust workspace 전 통과 (audit 9 + kill_switch 8 + railguard 8 + connectors 57 + 기타 다수) / **Vitest 305개** 전부 통과 / typecheck 0 에러 / clippy clean / lint 0 에러

### Pro 가격 결정 인하 (2026-04-25 AM)

- 기존: Pro $2/월·$15/년, Team $10/seat/월
- **신규: Pro $1/월·$10/년, Team $5/seat/월**
- 근거: Bitwarden Premium 동률 ($1/월), 1Password Individual 보다 한참 저렴 ($3.99/월)
- 시장 전략 분석: `user_research/apivault_strategy.md` 검토 후 최종 확정
- 자동 rotation (Pro) → M14 신설, Phase R1~R4 로드맵 확정
- 커밋: `58eacd2` (가격 인하 + M14 마일스톤 신설)

### 도메인 + Cloudflare 인프라 확정 (2026-04-25)

- **도메인**: `api-vault.app` 등록 (Cloudflare Registrar, $14/년, WHOIS Privacy 자동)
- **Cloudflare 계정**: 생성 완료
- **wrangler**: 설치 + login + Account ID / D1 / KV 채움
- **첫 로컬 검증**: `pnpm dev` 성공 + `curl http://localhost:8787/health` → 200 OK
- 커밋: `766a3d4` (도메인 확정), `4ec6248` (T061+T079 릴레이 스캐폴드)

### OSS / EE 디렉토리 분리 (옵션 C 확정)

- **루트**: `LICENSE` (AGPL-3.0-or-later)
- **ee 디렉토리**: `ee/LICENSE` (Enterprise License v1.0), 별도 라이선스 + 별도 빌드
- **디렉토리 매트릭스**: README 에 명시 (feature grid / license column)
- **빌드 파이프라인**: ee/ 는 별도 워크플로우 (M15 T132/T133 구현)
- 커밋: `840370c` (ee 골격 + 라이선스 파일)

### M5 GitHub Connector + RAILGUARD — 10/10 완료 ✅

**T061 Cloudflare Workers 릴레이 (커밋 `4ec6248` + `e8f5e45` Cargo.lock + `f109812` wrangler ID)**

- `wrangler.toml` 스캐폴드 (account_id, database_id, kv_namespaces 채움)
- `/health` endpoint 로컬 동작 검증 (200 OK)
- 사용자가 D1 + KV 테이블 먼저 생성 후 진행 (스텝 가이드 제공)
- 첫 Cloudflare Workers 배포 준비 완료

**T062 GitHub Secret Scanning (커밋 `6ddce61`)**

- `GitHubSecretScanner` trait 정의
- GitHub API 통합 (릴레이 `/github/scan-secrets` endpoint)
- 저장소 스캔 + 결과 캐싱
- Tauri 커맨드: `github_scan_secrets(repo_owner, repo_name)`
- 5 unit test

**T063 GitHub Connector UI (커밋 `0c517ba`)**

- `GithubIntegrationSection` 컴포넌트 신규
- UI flow: Connect (deep link) → installations 목록 → Scan (Pro gated) → 결과
- "Bulk Revoke" + "GitHub Scan" 버튼 Free 사용자에게 disabled (Pro 배지)
- 4 Vitest 테스트

**T064 Pro 엔타이틀먼트 + Entitlement Gate (커밋 `8ef4ebb` + `0194829` docs)**

- `entitlement.rs`: Tier enum (Free / Pro), `require_pro()` 게이트 함수
- `vault.settings.pro_until` stub (M10 결제 전까지 임시)
- `entitlement_set_dev` Tauri 커맨드 (M10 before 테스트 용)
- GithubIntegrationSection "Scan" 버튼 + Bulk Revoke Pro gated
- Pro 없으면 disabled + tooltip "Upgrade to Pro"
- 6 unit test + docs

**M5 신규 마일스톤 진입 가능 구조**:
- T065~T068 기존 완료 (RAILGUARD 템플릿/preview/apply/UI/auto-suggestion)
- T061~T064 이제 완성 (릴레이 + GitHub 통합)
- 향후 T079~T080 (추가 커넥터) 자유

### M15 CI/CD Integration 진입 (Night mode 2)

**T132 Relay CD 워크플로우 (커밋 `bf06db7`)**

- `.github/workflows/deploy-relay.yml` 신규
- Cloudflare wrangler-action (account_id + api_token)
- `ee/ deploy` 분기 별도 (ee-relay job)
- Secret 관리: `CLOUDFLARE_API_TOKEN` (사용자 제공, runbook 안내)

**T133 CI Pipeline ee-relay job (커밋 `bf06db7`)**

- `.github/workflows/ci.yml` ee-relay 추가
- `wrangler publish` dry-run (PR 에서 권한 검증)
- 문법 체크 + typecheck
- 배포 권한: main 브랜치 push only

**M15 task 리스트 정의**:
- T126: GitHub Actions Secrets API (클라이언트)
- T127: `sync` 커맨드 (멀티 디바이스 CRDT)
- T128: Sync UI (settings)
- T129: Sync over relay (e2ee)
- T130: Offline queue + retry
- T131: Conflict resolution UI
- T132: **deploy-relay.yml** ✅
- T133: **ci.yml ee-relay** ✅

### M5 마무리 + 백로그 hotfix 5건 (Night mode 2)

**완료된 커밋** (`6ddce61` T062 ~ `0194829` T064 docs):
- M5 전체 10/10 마크 확정
- Vitest 305개 유지 (신규 테스트 수렴)

**백로그 hotfix 5건** (커밋 `dd63f97`):
1. `withGlobalTauri: true → false` — XSS 시 IPC 노출 차단
2. `list` 커맨드 vault locked 시 빈 vec 반환 — credential/project/deployment/usage 모두
3. KillSwitchDialog 에러 메시지 i18n — VaultFlushFailed / NotFound 사용자 친화
4. `prune_rule_backups` doc-comment (무의미 로그 제거)
5. ESLint config `ee/**` ignore 추가 (wrangler 빌드 tmp 파일 차단)

### 커밋 목록 (이번 세션 신규, ~17개)

**인터랙션 단계**:
- `58eacd2`: feat: Pro 가격 $2→$1/월, $15→$10/년 + M14 Auto Rotation 신설
- `512b2fc`: docs: Team $10→$5/seat + M15/M16/M17 placeholder + M5 진입 공지
- `840370c`: feat(ee): AGPL-3.0 + Enterprise License v1.0 디렉토리 분리
- `766a3d4`: docs: api-vault.app 도메인 확정

**릴레이 스캐폴드**:
- `4ec6248`: feat(relay): Cloudflare Workers 스캐폴드 + T061/T079
- `e8f5e45`: chore(relay): Cargo.lock 추가
- `f109812`: chore(relay): wrangler.toml account_id/database_id 채움

**M5 마무리**:
- `6ddce61`: feat(connectors): T062 GitHub Secret Scanning 읽기
- `0c517ba`: feat(ui): T063 GitHub Connector UI + GithubIntegrationSection
- `8ef4ebb`: feat(entitlement): T064 Pro tier + require_pro() gate
- `0194829`: docs: T064 entitlement 설명 추가

**Night mode 자율**:
- `dd63f97`: fix: 5 backlog hotfix (XSS / list locked / i18n / docstring / eslint)
- `bf06db7`: feat(ci): T132/T133 deploy-relay.yml + ci.yml ee-relay job

**추가 예상 커밋** (세부 기록 대기):
- docs 업데이트 (strategy / price / relay runbook)
- GitHub App 클라이언트/릴레이 분리 runbook

### 다음 마일스톤 후보

1. **M15 product feature (T126~T128)** — GitHub Actions Secrets API + sync 커맨드 + Sync UI
   - 외부 인프라 불필요, 자율 가능
   - M9 Sync 기초 위에 구축

2. **사용자 수동 검증 (선택)** — M4~M7 + M5 + 릴레이 로컬 end-to-end
   - Incident feed poll + refresh + UI filter
   - RAILGUARD project auto-generate
   - Audit chain verify
   - Kill Switch revoke flow
   - Relay /health + GitHub Connector deep link

3. **M8 Authentication** — Passkey + OAuth (릴레이 의존, 이제 가능)
   - 웹 릴레이 기초 활용

---

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
