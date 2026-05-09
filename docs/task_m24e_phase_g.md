# Tasks — M24-E Phase G (차별화 기능 5종, sub-task 분해)

> 작성자: Planner Agent (claude-opus-4-7)
> 작성일: 2026-05-09
> 상태: GATE 2-bis 입력 — 사용자 승인 대기
> 본 문서: **`docs/task_m24e.md` 의 Phase G 부속 문서**.
> 도구 제약 (task_m24e.md 는 90k 토큰으로 단일 Write 어려움) 으로 분리. 본문 사양은 task_m24e.md Phase A~F 와 동일 스키마.
> 참조: `docs/architecture.md` 11장 (M24-E Phase G), `docs/integrator_report_m24e.md`, `docs/project-decisions.md` [2026-05-09] **M24-E Phase G 신설**.

---

## 변경 사실 명시 (2026-05-09)

### task_m24e.md 의 변경 사항 (orchestrator 가 Phase G 진입 첫 commit 시 반영할 diff)

다음 위치를 수정한다 (본 파일 작성 시점에는 ❌, Phase G 진입 시점에 적용):

**1. `docs/task_m24e.md` 라인 33** — 현재 "Phase A~F 6 phase, 총 49 sub-task, 예상 55일" 을 다음으로 교체:

```markdown
> **변경 사실**: 기존 [2026-04-22] T-24-E 사양 ("스켈레톤 only — 실 구현 후속") 은 [2026-05-09] M24-E GATE 1 승인으로 풀구현 격상. Phase A~F 6 phase + Phase G (차별화 5종) 추가 [2026-05-09], 총 51 sub-task, 예상 76일 (55일 + Phase G 21일).
```

**2. `docs/task_m24e.md` 라인 745~ (Phase F 끝 `---` 직후)** — Phase G 섹션 삽입:

```markdown
## Phase G — Secretbank 차별화 기능 5종 (예상 21일, ~3주)

(본 파일 `docs/task_m24e_phase_g.md` 의 Phase G 본문 8 sub-task 를 그대로 이관)
```

**3. `docs/task_m24e.md` 라인 796** — 총 sub-task 카운트 갱신:

```markdown
**총 sub-task: 51** (Phase A 7 + B 10 + C 8 + D 6 + E 5 + F 8 + **G 8** — Phase G 신설 [2026-05-09]. 마일스톤 표 표기는 Phase G 완료 시점 `🔄 N/51 완료`).
```

**4. `docs/task_m24e.md` 라인 802~828 의존성 그래프** — Phase G 가지 추가:

```
... (기존 A~F 그래프 그대로) ...

(M3 + M5 + M20 + M18 자산 재사용 — Phase G 의 모든 sub-task 는 D6 + E4 후 진입)
D6 + E4 ──► G1-1 ──► G1-2 ──► G1-3
D6 + E4 ──► G2-1 ──► G2-2
D6 + E4 ──► G3-1 ──► G3-2
D6 + E4 ──► G4-1 ──► G4-2
D6 + E4 ──► G5-1

G1~G5 모두 완료 ──► F1 ──► F2 ──► F7
                              └─► F6 (Phase F-2)
```

**5. `docs/task_m24e.md` 라인 747~795 진행 현황 표** — Phase G sub-task 8개 행 추가 (본 파일 마지막 섹션 참조).

**6. `docs/task.md` 라인 56 (마일스톤 행)** — `🔄 13/43 완료` → 분모 갱신:

```markdown
| **M24-E** | **Browser Extension (Phase A~F 풀구현 + Phase G 차별화)** | T-24-E-A1~G5 | 51 sub-tasks | 🔄 N/51 완료 |
```

> **위 1~6 변경은 본 plan GATE 2-bis 승인 후 implementator 가 Phase G 진입 첫 commit 에 통합 반영. 본 문서는 사양 source of truth.**

---

## Phase G 진입 시점

**기존 Phase 순서**: A → B → C → D → E → F-1 → F-2

**[2026-05-09] 변경 후**: A → B → C → D → E → **G** → F-1 → F-2

- Phase G 는 Phase E 완료 후 진입 (D + E 산출물 모두 필요 — popup CredentialList, SaveBanner, content-script Shadow DOM 격리)
- Phase F-1 (Chrome + Firefox 출시) 직전에 모든 차별화 기능 inline 통합
- Q6 결정 (1~2일 sub-task 단위) 그대로 적용 — 5 main 기능 → **8 sub-task 분할**

---

## 재사용 자산 매핑 (G-N 별)

| sub-task | 재사용 자산                                                                                                      | 신규 코드 비율       |
| :------- | :--------------------------------------------------------------------------------------------------------------- | :------------------- |
| **G-1**  | M3 (`graph_fetch` Tauri command + `DependencyGraph` + `MiniGraph.tsx` 패턴) + M24 1.5 hover mini-graph           | 25% (어댑터)         |
| **G-2**  | M5 (`secretbank-feeds::matcher::match_incident` + `IncidentRepo`) + M20 (`secretbank-supply::OsvClient`)         | 30% (어댑터)         |
| **G-3**  | M3 (`blast_radius_for_credential` Tauri command + `secretbank-core::blast_radius`)                               | 20% (어댑터)         |
| **G-4**  | M18 (`secretbank-mcp` 의 `tools/list` + `tools/call` JSON-RPC) + 신규 `site_context_push` MCP tool               | 50% (신규 tool 추가) |
| **G-5**  | M5 RAILGUARD (`secretbank-railguard::RuleKind` 의 host 도메인 매핑) + 확장 content-script Shadow DOM (C8 재사용) | 40% (host 매칭 + UI) |

**평균 신규 코드 비율 = 33%** (1 P 동등 차별화 통합치고는 가벼움)

---

## sub-task 스키마 (task_m24e.md 와 동일)

- **ID**: `T-24-E-G{Number}` 또는 `T-24-E-G{N}-{sub}` (예: `T-24-E-G1-1`)
- **Goal**: 1 줄
- **DoD**: 검증 가능한 기준 3~5개
- **Files Touched**: 예상 파일 경로
- **Tests**: Rust unit / Vitest / Playwright / 수동
- **Depends on**: 선행 sub-task ID
- **Risk**: LOW / MEDIUM / HIGH + 완화
- **예상 토큰**: 8~14k 단위

---

## Phase G — 차별화 기능 5종 (예상 21일, 위험도 MEDIUM)

기존 자산 (M3 / M5 / M20 / M18 / RAILGUARD) 재사용으로 신규 코드 ↓.
**1~2일 단위 sub-task 분할** (Q6 결정).

---

### T-24-E-G1-1. Inline 의존성 mini-graph — 데이터 어댑터 (Tauri command + nm-host 라우팅)

- **Goal**: extension popup 의 CredentialCard hover 시 표시할 mini-graph 데이터를 nm-host 통해 가져온다.
- **DoD**:
  - nm-host 신규 메시지 타입: `graph_for_credential` (req: credential_id / resp: { center_label, project_nodes: [{id, label, env}], edges: [{from, to}] })
  - nm-host → 데스크톱 IPC → 기존 `graph_fetch` Tauri command 호출 → 응답에서 해당 credential 의 1-hop subgraph 추출 (center = credential, fan-out = projects)
  - 응답 크기 상한 20 nodes (M24 1.5 의 `MAX_VISIBLE = 5` 정책 따라 5+ "more" 축약 — `secretbank-app::commands::graph` 패턴)
  - audit log 1건 (`extension.graph.fetch`)
  - Rust 단위 테스트: subgraph 추출 결정성 + 5+ projects 일 때 5 + "+N more" 축약
- **Files Touched**: `src-tauri/crates/secretbank-nm-host/src/ipc.rs` (신규 메시지 라우팅), `src-tauri/crates/secretbank-app/src/commands/graph.rs` (`graph_for_credential` Tauri command 신설 — 기존 `graph_fetch` 의 subgraph 헬퍼), `packages/shared/src/types/graph.ts` (mini-graph 응답 타입)
- **Tests**: Rust unit (subgraph 추출 + 축약 로직), Vitest (TS 타입 호환)
- **Depends on**: D6 (popup CredentialCard 존재), B7 (session token), B8 (audit 통합)
- **Risk**: LOW (M3 graph 엔진 재사용)
- **예상 토큰**: 9k

---

### T-24-E-G1-2. Inline 의존성 mini-graph — 확장 popup 컴포넌트 (SVG fan-out)

- **Goal**: popup CredentialCard hover 시 220×110 SVG mini-graph 렌더 + 클릭 → 데스크톱 GraphPage deep-link.
- **DoD**:
  - `extension/components/MiniGraph.tsx` — `src/features/inventory/MiniGraph.tsx` (M24 1.5) 의 SVG fan-out 패턴 그대로 이관 (centered credential + radial project nodes + edge curves)
  - hover 200ms delay (실수 hover 방지)
  - 데이터 = G1-1 의 `graph_for_credential` 응답
  - 클릭 → `chrome.tabs.create({ url: 'secretbank://graph?credential=<id>' })` deep-link (Tauri custom protocol 등록)
  - Closed Shadow DOM ❌ 적용 — popup 내부라 host 페이지 격리 무관
  - Vitest 렌더 테스트: 5 projects fixture → SVG 노드 5개 검증, 7 projects → 5 + "+2" 검증
- **Files Touched**: `extension/components/MiniGraph.tsx`, `extension/components/CredentialCard.tsx` (hover 통합 — E4 산출물 확장), `extension/lib/deep-link.ts`
- **Tests**: Vitest (렌더 + hover state + deep-link 호출)
- **Depends on**: G1-1, E4 (CredentialCard)
- **Risk**: LOW (기존 SVG 패턴 재사용)
- **예상 토큰**: 10k

---

### T-24-E-G1-3. Inline 의존성 mini-graph — Tauri custom protocol deep-link 핸들러

- **Goal**: 데스크톱 앱이 `secretbank://graph?credential=<id>` URL 수신 시 GraphPage 로 navigate + 해당 credential 노드 focus.
- **DoD**:
  - Tauri v2 deep-link plugin (`tauri-plugin-deep-link`) 등록
  - `secretbank://` scheme — 3 OS 모두 (Windows registry, macOS LSSetDefaultHandlerForURLScheme, Linux .desktop)
  - 핸들러: `useDeepLink` 훅이 `?credential=<id>` 파싱 → `navigate('/graph?focus=<id>')`
  - GraphPage 가 `?focus=` query 수신 → 해당 노드 highlight + viewport center
  - 수동 검증: 확장 popup MiniGraph 클릭 → 데스크톱 GraphPage 가 해당 credential 노드 highlight 한 채 열림
- **Files Touched**: `src-tauri/Cargo.toml` (tauri-plugin-deep-link 의존 추가), `src-tauri/tauri.conf.json` (deepLink schemes), `src/features/graph/GraphPage.tsx` (focus query 처리), `src/lib/deep-link.ts` (훅)
- **Tests**: Vitest (URL 파싱 + GraphPage focus state), 수동 3 OS deep-link 검증
- **Depends on**: G1-2
- **Risk**: MEDIUM (3 OS deep-link 등록 차이 — B2 패턴 재사용)
- **예상 토큰**: 10k

---

### T-24-E-G2-1. Supply chain banner — host → incident 매칭 어댑터

- **Goal**: content-script 가 현재 호스트를 nm-host 에 query → 데스크톱이 IncidentRepo 검색 + supply chain CVE 매칭 → banner JSON 응답.
- **DoD**:
  - nm-host 신규 메시지: `incident_check_for_host` (req: host, resp: { matches: [{incident_id, severity, title, published_at, source}], package_advisories: [{package, version, cve, severity}] })
  - 데스크톱 IPC → 기존 `incident_matches_for_credential` 의 일반화 → `incident_matches_for_host` Tauri command 신설
  - 매칭 알고리즘: M5 의 `match_incident` 의 Rule 2 (domain match) 재사용 + IssuerRepo 의 domains[] 컬럼 사용 (false positive 회피)
  - severity ≥ MEDIUM 만 응답 (low-severity 노이즈 차단)
  - 응답 캐시: chrome.storage.local 1h TTL (네트워크/IPC 부하 ↓)
  - audit log 1건 (`extension.incident.lookup`)
  - Rust 단위 테스트: 5+ host fixture (github.com / openai.com / lastpass.com) → 매칭 검증
- **Files Touched**: `src-tauri/crates/secretbank-nm-host/src/ipc.rs`, `src-tauri/crates/secretbank-app/src/commands/incidents.rs` (`incident_matches_for_host` 신설), `src-tauri/crates/secretbank-feeds/src/matcher.rs` (host-only 매칭 헬퍼 — credentials 인자 불필요), `packages/shared/src/types/incident.ts`
- **Tests**: Rust unit (host normalization + match), Vitest (응답 캐시)
- **Depends on**: D6, B8
- **Risk**: MEDIUM (false positive 회피 — M5 매칭 알고리즘 검증 필요)
- **예상 토큰**: 11k

---

### T-24-E-G2-2. Supply chain banner — content-script in-page banner (Shadow DOM)

- **Goal**: content-script 가 페이지 로드 시 host → G2-1 호출 → 매칭 있으면 in-page sticky banner 표시.
- **DoD**:
  - `extension/components/SupplyChainBanner.tsx` — 페이지 상단 sticky (top: 0, z-index: max), Closed Shadow DOM (C8 재사용)
  - banner 텍스트: "⚠ <hostname> 이(가) <N>일 전 보안 사고가 보고됐습니다 — <CVE-ID> (<severity>). 자세히 보기 → 비밀번호 변경 권장"
  - "자세히 보기" 클릭 → 데스크톱 IncidentsPage deep-link (`secretbank://incidents?host=<host>` — G1-3 패턴 재사용)
  - "Dismiss" 클릭 → 같은 host 7일 미표시 (chrome.storage.local 의 dismissed_hosts 큐)
  - severity 별 색상: HIGH=red, MEDIUM=amber, LOW=인근 (skip)
  - Vitest 렌더 테스트: 매칭 있음/없음 fixture, dismiss 후 재진입 시 미표시 검증
  - 수동 검증: 5+ 실 사이트 (chrome 확장 store 의 알려진 CVE 사이트) → banner 표시
- **Files Touched**: `extension/components/SupplyChainBanner.tsx`, `extension/entrypoints/content.ts` (host check + banner 마운트), `extension/lib/banner-cache.ts` (dismiss 큐)
- **Tests**: Vitest + 수동 5 사이트 검증
- **Depends on**: G2-1, C8 (Closed Shadow DOM)
- **Risk**: MEDIUM (false positive 시 사용자 신뢰 ↓ — G2-1 매칭 알고리즘 정확도 의존)
- **예상 토큰**: 10k

---

### T-24-E-G3-1. Blast radius preview — autofill / save 시 nm-host 어댑터

- **Goal**: 사용자가 form 의 `autocomplete="new-password"` 필드에 값 입력 시 (= rotation 시도) blast radius preview 카드 표시.
- **DoD**:
  - extension SaveBanner (D3) 가 "이 비밀번호 변경 시 영향받는 항목" 카드 추가 표시
  - nm-host 신규 메시지: `blast_radius_for_host` (req: host, resp: { credential_id, affected: [{kind, label, status}], total: N })
  - 데스크톱 IPC → 기존 `blast_radius_for_credential` Tauri command 호출 — 단, host → credential 매핑은 M3 의 `IssuerRepo.find_by_domain` (또는 동등 헬퍼) 신설
  - host → credential 0개 매칭 시 preview 카드 hidden (신규 가입은 영향 없음)
  - host → credential 1+ 매칭 시 BFS 결과 (M3 BlastRadius struct) 의 affected nodes 카운트 + 라벨 5개 미리보기
  - audit log 1건 (`extension.blast_radius.preview`)
- **Files Touched**: `src-tauri/crates/secretbank-nm-host/src/ipc.rs`, `src-tauri/crates/secretbank-app/src/commands/graph.rs` (`blast_radius_for_host` Tauri command 신설), `src-tauri/crates/secretbank-storage/src/sqlite/repositories/issuer.rs` (find_by_domain 헬퍼)
- **Tests**: Rust unit (host → credential → blast radius 체인)
- **Depends on**: D4 (save-handler 신규/rotation 분기), B8
- **Risk**: LOW (M3 blast radius 재사용)
- **예상 토큰**: 10k

---

### T-24-E-G3-2. Blast radius preview — SaveBanner 통합 UI

- **Goal**: SaveBanner 의 "Update" 분기 UI 에 blast radius preview 카드 inline 표시.
- **DoD**:
  - SaveBanner 의 "Update" 모드 진입 시 G3-1 호출 → 응답이 affected.total > 0 이면 카드 노출
  - 카드 내용: "이 변경이 다음 N개 항목에 영향: [project A][deployment B][URL C] 외 +K개"
  - 카드 클릭 → 데스크톱 GraphPage blast radius 모드 deep-link (`secretbank://graph?blast_credential=<id>` — G1-3 deep-link 확장)
  - "변경 진행" 버튼 — 사용자가 confirm 후 비번 저장
  - Vitest: affected 0/3/10 fixture → 카드 표시/축약 검증
- **Files Touched**: `extension/components/SaveBanner.tsx` (확장 — D3 산출물), `extension/components/BlastRadiusPreviewCard.tsx`, `extension/lib/save-handler.ts` (D4 호출 흐름 갱신)
- **Tests**: Vitest (3 fixture), 수동: 데스크톱에 사전 등록된 credential 의 비번 변경 시 banner 카드 표시 검증
- **Depends on**: G3-1, D3 (SaveBanner)
- **Risk**: LOW
- **예상 토큰**: 9k

---

### T-24-E-G4-1. MCP context push — nm-host 큐 + MCP server queue tool 신설

- **Goal**: 확장이 현재 사이트 컨텍스트 (URL host + 매칭 credential 메타) 를 nm-host → MCP server 의 internal queue 에 push. AI 에디터의 MCP query 시 최근 push 받은 context 응답.
- **DoD**:
  - **사용자 opt-in 강제** (Settings UI): 기본값 OFF. ON 일 때만 push 동작 (privacy)
  - nm-host 신규 메시지: `mcp_context_push` (req: { host, credential_meta: [{id, name, issuer}], timestamp }, resp: ack only)
  - MCP server (`secretbank-mcp`) 신규 in-memory queue: `Arc<Mutex<VecDeque<SiteContext>>>` (capacity 10, FIFO)
  - MCP server 신규 tool: `current_site_context` — 최근 push 받은 site context 5개 응답 (또는 빈 배열 if opt-in OFF)
  - MCP server 의 tool description: "User's currently visited site context (only available if user has opted in via desktop settings)"
  - audit log 1건 (`extension.mcp.context_push`)
  - 데이터 최소화: credential plaintext ❌, ID + name + issuer 만
  - Rust 단위 테스트: queue capacity 10 → 11번째 push 시 oldest pop, opt-in OFF → empty 응답
- **Files Touched**: `src-tauri/crates/secretbank-nm-host/src/ipc.rs`, `src-tauri/crates/secretbank-mcp/src/main.rs` (queue + 신규 tool), `src-tauri/crates/secretbank-app/src/commands/extension_settings.rs` (opt-in toggle), `src/features/settings/ExtensionSettings.tsx` (toggle UI)
- **Tests**: Rust unit (queue + opt-in 분기), Vitest (Settings UI)
- **Depends on**: B7 (session_token + Settings), B8 (audit)
- **Risk**: MEDIUM (privacy — opt-in 강제 + 데이터 최소화로 완화)
- **예상 토큰**: 12k

---

### T-24-E-G4-2. MCP context push — 확장 content-script push 트리거 + 빈도 제한

- **Goal**: content-script 가 페이지 진입 + form focus 시점에 host + credential meta 를 nm-host 로 push.
- **DoD**:
  - 빈도 제한: 같은 host 5분 1회 (chrome.storage.session 의 last_push_at)
  - opt-in 검사: chrome.storage.local 의 mcp_context_opt_in === true 일 때만 호출 (Settings UI 와 양방향 동기화)
  - credential meta 는 G2-1 의 매칭 결과 그대로 재사용 (issuer + credential id + name)
  - 사용자 가시성: popup 우상단에 "MCP 활성" 인디케이터 (opt-in ON 시) — 사용자가 자신이 push 중임을 인지
  - Vitest: 5분 내 동일 host 2회 호출 시 두 번째 skip 검증
- **Files Touched**: `extension/entrypoints/content.ts` (push 트리거), `extension/lib/mcp-push.ts`, `extension/entrypoints/popup/App.tsx` (인디케이터)
- **Tests**: Vitest (빈도 제한 + opt-in 분기)
- **Depends on**: G4-1, G2-1 (credential meta 매칭 재사용)
- **Risk**: MEDIUM (privacy 인식 — 인디케이터로 완화)
- **예상 토큰**: 9k

---

### T-24-E-G5. RAILGUARD 인라인 hint — AI 에디터 사이트 sidebar 경고

- **Goal**: content-script 가 chatgpt.com / cursor.com / copilot.github.com / gemini.google.com / claude.ai / poe.com 등 AI 에디터 사이트 매칭 시 sidebar 경고 표시.
- **DoD**:
  - host 매칭 목록: `extension/lib/ai-editor-hosts.ts` 에 6+ host (chatgpt.com / cursor.com / copilot.github.com / gemini.google.com / claude.ai / poe.com / perplexity.ai)
  - 매칭 시 sidebar 고정 banner 표시 (Closed Shadow DOM, C8 재사용): "⚠ AI 에 API 키 / 비밀번호 입력 시 secretbank Kill Switch 적용 ❌. 키 노출 위험. RAILGUARD 룰 자동 생성 하기 →"
  - "RAILGUARD 룰 생성" 클릭 → 데스크톱 deep-link `secretbank://railguard` (M5 RAILGUARD 페이지로 이동)
  - "이 도메인 1주 미표시" 옵션 (G2-2 dismiss 패턴 재사용)
  - host 목록은 hard-coded (Phase F 후 사용자 추가 가능 — 별도 마일스톤)
  - host 목록 출처 명시: 코드 주석에 "갱신 주기 = 분기별, AI 에디터 시장 변화 시 hotfix"
  - Vitest: 6 host fixture → banner 표시, 비-AI host → 표시 ❌
- **Files Touched**: `extension/components/RailguardHintBanner.tsx`, `extension/lib/ai-editor-hosts.ts`, `extension/entrypoints/content.ts` (host 매칭 + 마운트)
- **Tests**: Vitest (host 매칭 + dismiss + deep-link), 수동: chatgpt.com / cursor.com 방문 → sidebar 표시
- **Depends on**: C8 (Closed Shadow DOM), G1-3 (deep-link 등록)
- **Risk**: LOW (정적 host 목록 + 단순 banner)
- **예상 토큰**: 8k

---

## Phase G 검증 게이트 (T-24-E-G1-1~G5 모두 완료 후)

- 매 sub-task 회귀 게이트 PASS (cargo test / cargo clippy / pnpm typecheck / pnpm lint / pnpm vitest run / extension build)
- **G-1 hover graph**: 5+ credential (의존성 graph 등록된 사이트) 시각 검증 → popup hover → mini-graph 렌더 + deep-link 동작
- **G-2 banner**: 5+ 실 사이트 (CVE/breach 보고된 사이트, 예: lastpass.com / okta.com / circleci.com / equifax.com / capitalone.com) → in-page banner 정확 표시 + dismiss 후 7일 미표시 검증
- **G-3 blast radius preview**: 데스크톱에 사전 등록된 credential 의 비번 변경 → SaveBanner 의 blast radius 카드 결과 = 데스크톱 GraphPage blast radius 결과와 일치
- **G-4 MCP context push**: opt-in ON → AI 에디터 (Claude Desktop / Cursor) 의 MCP query (`current_site_context`) → 최근 5 site context 응답. opt-in OFF → 빈 배열
- **G-5 RAILGUARD**: chatgpt.com / cursor.com 방문 → sidebar 표시. dismiss → 1주 미표시. 비-AI 사이트 → 표시 ❌

---

## sub-task 의존성 그래프 (Phase G 만)

```
D6 (popup CredentialList) + E4 (CredentialCard) ──► G1-1 ──► G1-2 ──► G1-3
                                                                       │
D6 + B8 ──► G2-1 ──► G2-2                                              │
                                                                       │
D4 (save-handler) ──► G3-1 ──► G3-2                                    │
                                                                       │
B7 (session) + B8 (audit) ──► G4-1 ──► G4-2                            │
                                                                       │
C8 (Closed Shadow DOM) ──────────────────────► G5 ◄────────────────────┘
                                                (deep-link 재사용)

G1-3 + G2-2 + G3-2 + G4-2 + G5 ──► Phase G 검증 게이트 ──► F-1 진입
```

**병렬 실행 가능 구간 (Phase G 내)**:

- G1-1 / G2-1 / G3-1 / G4-1 (4개 어댑터) 동시 가능 — 모두 nm-host + 데스크톱 IPC 신규 메시지 추가
- G1-2 / G2-2 / G3-2 / G4-2 / G5 (5개 UI) 동시 가능 — 모두 어댑터 완료 후 UI 통합

---

## 위협 모델 영향 평가 (T1~T7 + R 신설)

기존 architecture.md 10.7 위협 모델 (T1~T7) 에 더해, Phase G 가 추가하는 위협:

| Phase G 기능             | 기존 T1~T7 매핑              | 신규 위협                                                | 완화                                                                                                                           |
| :----------------------- | :--------------------------- | :------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| G-1 mini-graph 데이터    | T2 (postMessage 도청)        | 동일 — popup 영역, in-page postMessage 미사용            | 기존 T2 완화로 충분                                                                                                            |
| G-2 supply chain banner  | T3 (DOM Clickjacking)        | 동일 — Closed Shadow DOM                                 | C8 + G2-2 재사용                                                                                                               |
| G-3 blast radius preview | T2 + T4 (phishing 가짜 form) | 동일 — host 매칭 정확도                                  | G3-1 의 issuer.domains[] 매칭 정확도 의존                                                                                      |
| **G-4 MCP context push** | (신규)                       | **R6 (NEW): privacy — 사용자 사이트 정보 데스크톱 push** | **opt-in 강제 + 데이터 최소화 (host + credential ID + name 만, plaintext ❌) + popup 인디케이터 + audit log + 큐 capacity 10** |
| G-5 RAILGUARD hint       | T7 (extension 권한 abuse)    | 동일 — Closed Shadow DOM 격리                            | C8 재사용                                                                                                                      |

**신규 잔여 위험 R6**: MCP context push 의 privacy 우려.

- **완화**: 4 계층 (opt-in OFF 기본값 / 데이터 최소화 / 인디케이터 / audit log)
- **잔여**: 사용자가 opt-in ON 한 상태에서 본인이 "sensitive" 사이트 방문 시 host 가 데스크톱 큐에 일시 보관됨. 단, host 만 (credential plaintext ❌) + 큐 capacity 10 + 5분 1회 빈도 제한 + 사용자 인지 (인디케이터)
- **architecture.md 11.6 (신규 섹션)** 에 R6 명시 (다음 산출물)

---

## 진행 현황 — Phase G (orchestrator 가 commit 직후 즉시 갱신)

> **task_m24e.md 의 진행 현황 표 (라인 749~795) 끝에 다음 행 추가**:

| Sub-task ID | 제목                                             | 완료일 | 커밋 해시 |
| :---------- | :----------------------------------------------- | :----- | :-------- |
| T-24-E-G1-1 | mini-graph 데이터 어댑터                         | -      | -         |
| T-24-E-G1-2 | mini-graph popup SVG                             | -      | -         |
| T-24-E-G1-3 | deep-link 핸들러 (3 OS)                          | -      | -         |
| T-24-E-G2-1 | supply chain host → incident 어댑터              | -      | -         |
| T-24-E-G2-2 | supply chain in-page banner                      | -      | -         |
| T-24-E-G3-1 | blast radius host 어댑터                         | -      | -         |
| T-24-E-G3-2 | blast radius preview UI (SaveBanner 통합)        | -      | -         |
| T-24-E-G4-1 | MCP context queue + tool 신설 (opt-in)           | -      | -         |
| T-24-E-G4-2 | MCP context push 트리거 + 빈도 제한 + 인디케이터 | -      | -         |
| T-24-E-G5   | RAILGUARD 인라인 hint                            | -      | -         |

**Phase G 총 sub-task: 10** (5 main → G-1 (3 sub) + G-2 (2 sub) + G-3 (2 sub) + G-4 (2 sub) + G-5 (1) = 10).

> 정정: 사용자 입력 "5 main → 8~10 sub-tasks" 의 상한 채택. G-1 의 deep-link 핸들러 (G1-3) 가 3 OS 등록 작업이라 단독 sub-task 로 분리. G-4 의 opt-in toggle + queue + tool 신설 (G4-1) 과 push trigger + 빈도 제한 (G4-2) 도 분리.

---

## 핵심 요약 — GATE 2-bis 사용자 승인 표

### Phase G sub-task 분포

| 항목                  | 값                                                                                         |
| :-------------------- | :----------------------------------------------------------------------------------------- |
| Phase G sub-task 총수 | **10** (G1-1, G1-2, G1-3, G2-1, G2-2, G3-1, G3-2, G4-1, G4-2, G5)                          |
| 예상 일수             | **21일** (≈ 3주)                                                                           |
| 위험도 분포           | LOW × 5 (G1-1, G1-2, G3-1, G3-2, G5) / MEDIUM × 4 (G1-3, G2-1, G2-2, G4-1, G4-2) — HIGH ❌ |
| 새 위협               | **R6** (MCP context push privacy) — 4 계층 완화 적용                                       |
| 새 의존성 (npm)       | 없음 (재사용 100%)                                                                         |
| 새 의존성 (Rust)      | `tauri-plugin-deep-link` (G1-3) — Tauri v2 공식 plugin, 신뢰도 높음                        |
| 신규 코드 비율 평균   | **33%** (M3/M5/M18/M20 재사용)                                                             |
| 일정 영향             | **8주 → 11주** (Phase G 21일 추가, +37%)                                                   |
| 마일스톤 표 분모      | `🔄 N/43` → `🔄 N/51` (Phase G 8 sub-task 추가)                                            |

> 정정: 위 표는 "Phase G sub-task 총수 = 10" 이지만, "마일스톤 분모 = 51" 은 8 sub-task 가산 (43 + 8). 차이는 G1 / G4 의 sub 분할 (G1-1/2/3 = 1 main 으로 카운트, G4-1/2 = 1 main 으로 카운트). **정확성을 위해 마일스톤 분모 = 51 (43 + 10 - 2 = 51, sub 분할은 main 카운트로 합산하는 관례)**. orchestrator 가 마일스톤 표 갱신 시 분모 = **53 (43 + 10)** 또는 **51 (43 + 8 main)** 중 선택. 본 plan 은 **분모 = 53 (sub 단위 카운팅)** 권고 — Phase A~F 가 sub 단위로 카운팅됐기 때문.

**최종 권고**: **마일스톤 분모 = 53** (43 + Phase G 10 sub-task).

---

_M24-E Phase G task 문서 끝._
