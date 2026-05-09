# Implementation Plan — M24-E Phase G (차별화 기능 5종)

> 작성자: Planner Agent (claude-opus-4-7)
> 작성일: 2026-05-09
> 상태: GATE 2-bis 입력 — 사용자 승인 대기
> 본 문서: **`docs/implementation_plan_m24e.md` 의 Phase G 부속 문서**.
> 도구 제약 (기존 plan 본문 직접 편집 어려움) 으로 분리. 기존 1~10절 (Phase A~F 절차) **변경 없음**.
> 참조: `docs/architecture_phase_g.md` (11장), `docs/task_m24e_phase_g.md`, `docs/project-decisions.md` [2026-05-09] **M24-E Phase G 신설**

---

## 1. 본 plan 과 기존 implementation_plan_m24e.md 의 관계

| 기존 implementation_plan_m24e.md 섹션            | Phase G 영향 | 본 plan 의 갱신                                  |
| :----------------------------------------------- | :----------- | :----------------------------------------------- |
| 0. 문서 정렬                                     | 변경 ❌      | 변경 ❌                                          |
| 1. Phase 진입 순서 (1.1 의존성, 1.2 일정)        | **변경**     | **§2 갱신**                                      |
| 2. 사전 준비 (2.1 환경, 2.2 prereq, 2.3 Blocker) | 추가         | **§3 추가**                                      |
| 3. Phase 별 검증 절차 (3.1~3.7)                  | **추가**     | **§4 신설 3.X (Phase G 게이트)**                 |
| 4. 위험 완화 전략 (4.1~4.5)                      | **추가**     | **§5 신설 4.6 (R6 MCP privacy)**                 |
| 5. 외부 감사 일정                                | **갱신**     | **§6 갱신 (F 종합 audit scope 에 G 포함)**       |
| 6. commit 단위                                   | 변경 ❌      | 변경 ❌                                          |
| 7. dogfooding                                    | **추가**     | **§7 추가 (Phase G dogfooding)**                 |
| 8. Open Issues                                   | **추가**     | **§8 추가 (G-2 매칭 정확도, G-4 opt-in 기본값)** |
| 9. 마일스톤 클로즈 조건                          | **갱신**     | **§9 갱신 (sub-task 분모 갱신)**                 |
| 10. 핵심 요약 (GATE 2 표)                        | **갱신**     | **§10 GATE 2-bis 표**                            |

---

## 2. Phase 진입 순서 갱신 (기존 1.1 + 1.2 갱신)

### 2.1 Phase 의존성 갱신

```
Phase A (모노레포 + shared lib)             — 7일, LOW
    ↓ A 게이트
Phase B (NM Host + 페어링)                  — 10일, HIGH (외부 audit)
    ↓ B 게이트
Phase C (form 감지 + autofill read-only)    — 10일, MEDIUM
    ↓ C 게이트
Phase D (save dialog + credential 저장)     — 7일, MEDIUM
    ↓ D 게이트
Phase E (generator inline + recipe + Site Logo) — 7일, LOW
    ↓ E 게이트
Phase G (차별화 기능 5종 — 신설 [2026-05-09]) — 21일, MEDIUM    ★ NEW
    ↓ G 게이트
Phase F-1 (Chrome + Firefox 출시)           — 14일, MEDIUM
    ↓ F-1 게이트
Phase F-2 (Edge + Safari 출시)              — 가변
    ↓
M24-E 마일스톤 클로즈
```

### 2.2 Phase 별 일정 갱신 (1.2 표 갱신)

| Phase    | 내용                                                | 예상 일수 |   위험도   | sub-task 수 |
| :------- | :-------------------------------------------------- | :-------: | :--------: | :---------: |
| A        | WXT 모노레포 + shared lib 골격                      |    7일    |    LOW     |      7      |
| B        | Native Messaging Host + 페어링                      |   10일    |  **HIGH**  |     10      |
| C        | Form 감지 + autofill (read-only)                    |   10일    |   MEDIUM   |      8      |
| D        | Save dialog + credential 저장                       |    7일    |   MEDIUM   |      6      |
| E        | Password Generator inline + recipe + Site Logo      |    7일    |    LOW     |      5      |
| **G**    | **차별화 5종 (graph/incident/blast/MCP/RAILGUARD)** | **21일**  | **MEDIUM** |   **10**    |
| F        | Cross-browser + E2E + 스토어 제출 + 종합 audit      |   14일    |   MEDIUM   |  8 (가변)   |
| **합계** |                                                     | **76일**  |            |   **53+**   |

**기존 55일 / 43 sub-task → 76일 / 53 sub-task** (Phase G 21일 / 10 sub-task 추가).

### 2.3 Night mode 운용 (1.3 갱신 ❌)

기존 1.3 그대로. Phase G 도 Q6 (1~2일 sub-task) 적용. Phase G 진입 시점 = Phase E 게이트 후 **GATE 2-bis (본 plan 승인) 1회만**, 이후 G1-1~G5 자동 진행.

---

## 3. Phase G 사전 준비 (기존 2.x 에 추가)

### 3.1 환경 변수 / 시크릿 / 계정

| 항목                                       | 용도                 | 등록 위치 | 최초 필요 sub-task | 비고                       |
| :----------------------------------------- | :------------------- | :-------- | :----------------: | :------------------------- |
| Tauri custom protocol `secretbank://` 등록 | G-1 deep-link 핸들러 | 3 OS      |        G1-3        | 사용자 액션 ❌ (자동 등록) |
| `tauri-plugin-deep-link` v2 의존 추가      | G1-3                 | Cargo     |        G1-3        | Tauri 공식 plugin          |
| AI editor host 목록 정적 파일              | G-5 호스트 매칭      | 코드 내   |         G5         | 분기별 갱신                |

신규 외부 의존성 ❌ — `tauri-plugin-deep-link` 만 (Tauri v2 공식 plugin, AGPL 호환).

### 3.2 개발 환경 prereq (2.2 변경 ❌)

기존 prereq 그대로. Phase G 추가 prereq ❌.

### 3.3 Phase G 사전 작업 (Phase E 완료 시점)

**G1-1 사전 작업 (subgraph 추출)**:

- 기존 `secretbank-app::commands::graph::graph_fetch` 의 응답 (전체 graph) 에서 1-hop subgraph 추출 헬퍼 함수 사양 확정
- M24 1.5 `MiniGraph.tsx` 의 fan-out 알고리즘 (5+ "more" 축약) 코드 검토 → ext 측 이관 계획

**G2-1 사전 작업 (false positive 검증)**:

- M5 `match_incident_at` 의 Rule 2 domain match 로직 검증 — `IssuerRepo.domains[]` 컬럼 정확성 확인
- 5+ 실 사이트 (lastpass.com / okta.com / circleci.com / equifax.com / capitalone.com) 에 대해 IncidentRepo + SupplyAdvisoryRepo 매칭 결과 사전 시뮬레이션

**G3-1 사전 작업 (host → credential 매핑)**:

- `IssuerRepo.find_by_domain` 헬퍼 신설 사양 확정 (현재는 list() 후 Rust 측 필터)
- 동일 host 에 multiple credentials (예: `aws.amazon.com` 의 IAM key 다수) 시 처리 정책 = 모든 credential 의 BFS 결과 union (보수적)

**G4-1 사전 작업 (MCP queue + opt-in)**:

- M18 `secretbank-mcp` 의 lock contention 분석 (Arc<Mutex<VecDeque>> 추가 시 기존 tools/call 성능 영향)
- opt-in 토글 UI 의 chrome.storage.local ↔ Tauri Settings 양방향 동기화 패턴 사전 설계

**G5 사전 작업 (host 목록)**:

- AI editor 시장 조사 (2026-05 기준) — 7+ host 확정 (chatgpt.com / cursor.com / copilot.github.com / gemini.google.com / claude.ai / poe.com / perplexity.ai)
- 분기별 갱신 정책 명시 (코드 주석)

---

## 4. Phase G 검증 절차 (기존 3.x 에 추가)

### 4.1 매 sub-task 별 회귀 게이트 (3.1 변경 ❌)

기존 회귀 게이트 그대로:

```bash
cargo test --workspace --manifest-path src-tauri/Cargo.toml
cargo clippy --workspace --manifest-path src-tauri/Cargo.toml -- -D warnings
pnpm typecheck
pnpm lint
pnpm vitest run
pnpm --filter @secretbank/extension build
```

**Phase G 추가 게이트** (G-1 / G-3 의존성):

```bash
# G1-3 deep-link 핸들러 — 3 OS 별 등록 검증
secretbank --register-deep-link    # 데스크톱 앱 CLI 명령 (G1-3 산출물)

# G2-2 banner 의 dismiss 캐시 — chrome.storage.local 상태 검증
# (수동 — Vitest 로 cache hit/miss 시뮬레이션)
```

### 4.2 Phase G 검증 게이트 — sub-task 별 (신설 §3.X)

**3.X.1 G1 (T-24-E-G1-1, G1-2, G1-3 모두 완료 후)**:

- 회귀 게이트 PASS
- **수동**: 데스크톱에 사전 등록된 5+ credential (의존성 graph 가 매핑된 것) 의 popup CredentialCard hover → 200ms 후 mini-graph 표시
- **수동**: mini-graph 클릭 → 데스크톱 GraphPage 가 해당 credential 노드 highlight 한 채 열림 (3 OS 모두)
- **수동**: 5+ projects 인 credential → mini-graph 가 5 + "+N more" 축약 표시
- **단위**: subgraph 추출 결정성 (Rust unit) + SVG 렌더 (Vitest) PASS

**3.X.2 G2 (T-24-E-G2-1, G2-2 모두 완료 후)**:

- 회귀 게이트 PASS
- **수동**: 5+ 실 사이트 (lastpass.com / okta.com / circleci.com / equifax.com / capitalone.com) 방문 → in-page banner 정확 표시
- **수동**: dismiss 클릭 → 7일간 같은 host 미표시 (chrome.storage.local 의 dismissed_hosts 큐)
- **수동**: severity LOW 사이트 → banner 표시 ❌
- **수동**: false positive 검증 — secretbank.app / google.com / github.com (CVE 보고 ❌) → banner 표시 ❌
- **단위**: host normalization (www/subdomain) Rust unit + 캐시 hit/miss Vitest PASS

**3.X.3 G3 (T-24-E-G3-1, G3-2 모두 완료 후)**:

- 회귀 게이트 PASS
- **수동**: 데스크톱에 사전 등록된 credential (의존성 graph 매핑 됨) 의 비번 변경 시도 → SaveBanner 의 BlastRadiusPreviewCard 표시
- **수동**: 카드 결과 (affected nodes 카운트 + 라벨) = 데스크톱 GraphPage blast radius 결과와 일치
- **수동**: 의존성 0개 credential → 카드 hidden
- **단위**: host → credential 매핑 (`find_by_domain`) + blast radius BFS Rust unit PASS

**3.X.4 G4 (T-24-E-G4-1, G4-2 모두 완료 후)**:

- 회귀 게이트 PASS
- **opt-in OFF (기본값) 검증**:
  - 사이트 방문 → push ❌ (audit log 에 `extension.mcp.context_push` 0건)
  - MCP query (`current_site_context`) → 빈 배열 응답
- **opt-in ON 검증**:
  - Settings 토글 ON → popup 우상단 "MCP 활성" 인디케이터 표시
  - 5+ 사이트 방문 → push 발생 → audit log 5+건
  - 5분 내 같은 host 2회 방문 → 두 번째 skip (audit log 1건만)
  - 11번째 push → queue 의 oldest 자동 pop (capacity 10)
- **MCP query 검증**: AI 에디터 (Claude Desktop / Cursor) 의 MCP 연결 → tools/list 에 `current_site_context` 포함 → tools/call → 최근 5 site context 정확 응답
- **단위**: queue 동작 + opt-in 분기 + 빈도 제한 Rust unit + Vitest PASS

**3.X.5 G5 (T-24-E-G5 완료 후)**:

- 회귀 게이트 PASS
- **수동**: chatgpt.com / cursor.com / copilot.github.com / gemini.google.com / claude.ai 방문 → sidebar banner 표시
- **수동**: dismiss → 1주 미표시
- **수동**: 비-AI 사이트 (google.com / wikipedia.org) → banner 표시 ❌
- **수동**: "RAILGUARD 룰 생성" 클릭 → 데스크톱 RailguardPage 로 deep-link
- **단위**: host 매칭 + Closed Shadow DOM 격리 Vitest PASS

### 4.3 Phase G 종합 게이트 (모든 sub-task 완료 후)

- 4.2 의 5 게이트 (G-1/G-2/G-3/G-4/G-5) 모두 PASS
- 회귀 게이트 PASS (cargo test / clippy / typecheck / lint / vitest / extension build)
- **dogfooding**: 사용자가 unpacked extension 을 본인 Chrome / Firefox 에 로드 → 일주일 사용 → Phase G 5 기능 모두 동작 검증 (issue tracker 에 기록)
- **audit log 무결성**: Phase G 가 추가한 audit action (`extension.graph.fetch` / `.incident.lookup` / `.blast_radius.preview` / `.mcp.context_push`) 4종이 hash chain + Ed25519 signature 무결성 유지

---

## 5. Phase G 위험 완화 전략 (기존 4.x 에 추가)

### 5.1 G-2 false positive (기존 4.x 에 추가)

**위험**: 사용자가 banner 의 신뢰성을 잃으면 "Dismiss → 영구 무시" 행동 패턴 형성. 이후 진짜 보안 사고 banner 도 무시.

**완화**:

- IssuerRepo.domains[] 컬럼 정확 매칭 + subdomain-safe + www 정규화
- M5 `MatchReason::DomainMatch` confidence (이미 검증된 알고리즘) 만 사용
- severity HIGH/CRITICAL 만 표시 (기본값) + MEDIUM 옵션 (사용자 Settings)
- 5+ 실 사이트 사전 검증 (G2-2 게이트)
- 응답 캐시 1h TTL — 같은 host 재방문 시 IPC 부하 ↓

**롤백**: false positive 발견 시 → G2-1 의 매칭 알고리즘 hotfix sub-task (severity 필터 강화 / 도메인 매칭 정확도 개선)

### 5.2 G-4 MCP context push privacy (R6 신규 위협)

**위험**: 사용자가 opt-in ON 한 상태에서 sensitive 사이트 (예: 의료 / 금융) 방문 시 host 가 데스크톱 큐에 일시 보관. 큐 capacity 10 + 5분 1회 빈도 제한.

**완화 (4 계층, architecture_phase_g.md §11.4)**:

1. **opt-in OFF 기본값** — 사용자가 명시적으로 ON 해야 push 동작
2. **데이터 최소화** — host + credential ID + name + issuer 만 (plaintext ❌)
3. **사용자 인지** — popup 우상단 "MCP 활성" 인디케이터 (opt-in ON 시 항상 표시)
4. **audit log** — 매 push 마다 `extension.mcp.context_push` 1건 (사후 가시성)

**롤백**: 사용자 신뢰 우려 ↑ 시 → opt-in 기본값 OFF 유지 + 추가 안내 dialog (Settings 첫 진입 시 "이 기능은 사이트 host 를 데스크톱에 보관합니다 — opt-in 시 영향 명시")

### 5.3 G-5 host 목록 노후화

**위험**: AI 에디터 시장 변화 (예: 신규 AI 출시) 시 host 목록 미갱신 → 기능 누락.

**완화**:

- 코드 주석에 "분기별 갱신 정책" 명시
- 사용자 추가 host UI ❌ (Phase G 범위) → Phase F 후 별도 마일스톤 후속

**롤백**: 신규 AI 에디터 발견 시 → host 목록 hotfix sub-task (별도 commits)

### 5.4 G1-3 Tauri custom protocol 3 OS 등록

**위험**: B2 (NM Host installer) 와 동일 — 3 OS 별 등록 차이.

**완화**:

- `tauri-plugin-deep-link` v2 (Tauri 공식) 사용 — 3 OS 표준 패턴
- 데스크톱 앱 첫 실행 시 자동 등록 (B2 와 동일 hook)
- 사용자 수동 명령: `secretbank --register-deep-link` / `--unregister-deep-link`

**롤백**: 등록 실패 시 → 사용자 수동 등록 가이드 (`docs/qa/m24e_deep_link_install_manual.md`) 제공

---

## 6. 외부 감사 일정 갱신 (기존 5.x 갱신)

### 6.1 Phase B 후 페어링 audit (5.1 변경 ❌)

기존 그대로 (Q5 옵션 A).

### 6.2 Phase F 종합 audit scope 갱신

**기존 scope** (5.2): 확장 전체 + nm-host + form-detector + DOM Clickjacking 방어 + Web Store 제출 직전 코드.

**[2026-05-09] 갱신 — Phase G 5 기능 추가**:

| audit 항목               | 검증 포인트                                                               |
| :----------------------- | :------------------------------------------------------------------------ |
| G-1 graph subgraph 추출  | 1-hop subgraph 데이터 leak ❌ + 5+ "more" 축약 결정성                     |
| G-2 host → incident 매칭 | false positive 회피 + IssuerRepo.domains[] 정확성 + 캐시 TTL 1h 적정성    |
| G-3 blast radius preview | host → credential 매핑 (multiple credentials 동일 host) + BFS 결과 정확성 |
| **G-4 MCP context push** | **opt-in OFF 기본값 + 데이터 최소화 + 큐 capacity 10 + audit log 무결성** |
| G-5 RAILGUARD hint       | host 매칭 정확성 + Closed Shadow DOM 격리 + dismiss 큐 위변조 방어        |

**예상 비용**: $15K~$50K → $20K~$55K (Phase G 5 기능 추가 — G-4 privacy 검증이 가장 큰 비중).

**기간**: 2~4주 → 3~5주 (Phase G 검증 1주 추가).

---

## 7. dogfooding 흐름 갱신 (기존 7.x 에 추가)

### 7.1 Phase G 진입 조건 (7.1 추가)

기존 dogfooding (Phase D 완료 후) 에서 발견된 이슈가 Phase E 안에 통합 처리됨. **Phase G 진입 직전 사전 release 빌드** 추가:

- Phase E 완료 + Phase G 진입 1주 전 — 사전 release 빌드 1회 생성
- 사용자가 정식 installer 로 설치 + extension unpacked 로 일주일 사용 → Phase G 진입 시점에 dogfooding 결과 정리

### 7.2 Phase G dogfooding 발견 이슈 처리

- HIGH (Phase G 5 기능 중 하나라도 동작 ❌ / false positive ↑) → 즉시 hotfix sub-task
- MEDIUM (UI 글리치 / banner 빈도 부적절) → Phase G 안에 통합
- LOW (기능 요청) → Phase F 후 별도 마일스톤

### 7.3 dogfooding 정의 준수 (메모리 [feedback_dogfooding])

기존 정책 그대로. `pnpm tauri dev` ❌, 정식 release artifact 만.

---

## 8. Open Issues 갱신 (기존 8.x 에 추가)

### 8.6 G-2 매칭 정확도 검증 — 사용자 액션 요청

- 5+ 실 사이트 (lastpass.com / okta.com / circleci.com / equifax.com / capitalone.com) 의 NVD/GHSA alert 매칭 결과 사용자 검증 필요
- 사용자 액션: Phase G 진입 시점 (Phase E 완료 후) → 5 host 결과 사전 시뮬레이션 결과 검토
- false positive 발견 시 → G2-1 hotfix

### 8.7 G-4 MCP opt-in 기본값 재확인

- 본 plan = OFF (privacy 우선)
- 대안 검토: ON (UX 우선) — 단 Settings 진입 시 명시 안내 dialog
- 사용자 결정 필요 ❌ (privacy 정책 기본값 OFF 가 명확)

### 8.8 G-5 host 목록 분기별 갱신 책임자

- 본 plan = 코드 주석에 "분기별 갱신 정책" 명시
- 사용자 액션: Phase F 후 (출시 후) — AI 에디터 시장 변화 모니터링 + hotfix sub-task 발주

---

## 9. 마일스톤 클로즈 조건 갱신 (기존 9.x 갱신)

기존 9.x 의 1번 항목 갱신:

> ~~1. **Phase A~F 모든 sub-task 완료** (43+ commits)~~

→

> 1. **Phase A~F + Phase G 모든 sub-task 완료** (53+ commits)

기존 7번 항목 갱신:

> ~~7. **`docs/task.md` 의 M24-E Status = `✅ 43/43 완료`**~~

→

> 7. **`docs/task.md` 의 M24-E Status = `✅ 53/53 완료`** (Phase G 10 sub-task 가산)

나머지 (2~6, 8) 변경 ❌.

---

## 10. 핵심 요약 — GATE 2-bis 사용자 승인 표

### 10.1 Phase G 일정

| Phase G sub-task | 내용                                      | 예상 일수 | 위험도 |
| :--------------- | :---------------------------------------- | :-------: | :----: |
| G1-1             | mini-graph 데이터 어댑터                  |    2일    |  LOW   |
| G1-2             | mini-graph popup SVG 컴포넌트             |    2일    |  LOW   |
| G1-3             | Tauri deep-link 핸들러 (3 OS)             |    2일    | MEDIUM |
| G2-1             | supply chain host → incident 어댑터       |    2일    | MEDIUM |
| G2-2             | supply chain in-page banner               |    2일    | MEDIUM |
| G3-1             | blast radius host 어댑터                  |    2일    |  LOW   |
| G3-2             | blast radius preview UI (SaveBanner 통합) |    2일    |  LOW   |
| G4-1             | MCP queue + tool 신설 (opt-in)            |    2일    | MEDIUM |
| G4-2             | MCP push 트리거 + 빈도 제한 + 인디케이터  |    2일    | MEDIUM |
| G5               | RAILGUARD 인라인 hint                     |    3일    |  LOW   |
| **합계**         |                                           | **21일**  |        |

### 10.2 Phase G 위험 완화 사전 작업 요약

- **G1-1**: M24 1.5 MiniGraph fan-out 알고리즘 검토 (Phase E 완료 시점)
- **G1-3**: B2 (NM Host installer) 패턴 재사용 — 3 OS 등록 검증
- **G2-1**: 5+ 실 사이트 false positive 사전 시뮬레이션
- **G3-1**: `IssuerRepo.find_by_domain` 헬퍼 사양 확정
- **G4-1**: `secretbank-mcp` lock contention 분석 + opt-in 양방향 동기화 패턴
- **G5**: AI editor 시장 조사 (2026-05 기준 7+ host)

### 10.3 첫 commit (T-24-E-G1-1) 진입 조건

- Phase E 게이트 PASS (T-24-E-E1~E5 모두 완료)
- 사용자 GATE 2-bis 승인 (본 plan + task_m24e_phase_g + architecture_phase_g)
- pnpm 9+ + Node.js 20.18+ + Rust stable 확인
- Phase G 회귀 게이트 사전 확인 (cargo test 586 + nm-host + extension 회귀 PASS)

### 10.4 GATE 2-bis 승인 시점 다음 액션

1. orchestrator → `docs/task.md` 마일스톤 표 (라인 56) 갱신:
   - 분모 변경: `🔄 N/43` → `🔄 N/53`
   - 제목 변경: "Browser Extension (Phase A~F 풀구현)" → "Browser Extension (Phase A~F 풀구현 + Phase G 차별화)"
2. orchestrator → `docs/task_m24e.md` 본문 라인 33 / 745 / 796 / 802~828 / 747~795 갱신 (`task_m24e_phase_g.md` §"변경 사실 명시" 따름)
3. orchestrator → `docs/architecture.md` 본문 끝 (라인 1452) 에 11장 통합 또는 본 부속 문서 참조 한 줄 추가
4. orchestrator → `docs/implementation_plan_m24e.md` 본문 갱신 (본 plan 의 §2~§9 통합 또는 부속 문서 참조)
5. orchestrator → implementator 에 T-24-E-G1-1 sub-task 전달 → Phase G 진입
6. Night mode = Phase G 끝까지 자동 진행 → G 게이트에서 다음 GATE 호출

---

## 11. GATE 2-bis 승인 사항 핵심 요약

| 항목                  | 값                                                                                                                |
| :-------------------- | :---------------------------------------------------------------------------------------------------------------- |
| Phase G sub-task 총수 | **10** (G1-1, G1-2, G1-3, G2-1, G2-2, G3-1, G3-2, G4-1, G4-2, G5)                                                 |
| 예상 일수             | **21일** (≈ 3주)                                                                                                  |
| 위험도 분포           | LOW × 5 / MEDIUM × 5 / HIGH × 0                                                                                   |
| 신규 위협             | **R6 (NEW)** — MCP context push privacy. 4 계층 완화 (opt-in OFF 기본값 + 데이터 최소화 + 인디케이터 + audit log) |
| 새 의존성 (npm)       | 없음 (재사용 100%)                                                                                                |
| 새 의존성 (Rust)      | `tauri-plugin-deep-link` v2 (Tauri v2 공식, AGPL 호환)                                                            |
| 신규 코드 비율 평균   | **33%** (M3/M5/M18/M20/RAILGUARD 재사용)                                                                          |
| 일정 영향             | **8주 → 11주** (Phase G 21일, +37%)                                                                               |
| 마일스톤 분모         | `🔄 N/43` → **`🔄 N/53`**                                                                                         |
| audit 비용 영향       | F 종합 audit $15K~$50K → **$20K~$55K** (Phase G 검증 추가)                                                        |
| AGPL-3.0 경계         | 모든 Phase G 산출물 = AGPL-3.0 OSS core. EE import ❌                                                             |

---

_M24-E implementation plan Phase G 끝._
