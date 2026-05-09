# Architecture — M24-E Phase G (차별화 기능 5종, 신규 11장)

> 작성자: Planner Agent (claude-opus-4-7)
> 작성일: 2026-05-09
> 본 문서: **`docs/architecture.md` 의 11장 부속 문서** (도구 제약 — 본문 직접 편집 어려움). Phase G 진입 시점에 architecture.md 본문 끝에 통합 또는 본 문서 참조.
> 참조: `docs/architecture.md` 1~10장 (변경 ❌), `docs/task_m24e_phase_g.md`, `docs/project-decisions.md` [2026-05-09] **M24-E Phase G 신설**

---

## 11. M24-E Phase G — Secretbank 차별화 기능 5종 (2026-05-09 신설)

> 본 섹션은 [2026-05-09] **M24-E Phase G 신설** 결정의 아키텍처 반영.
> 기존 10.1~10.12 (Phase A~F 모노레포 / 통신 / 페어링 / 위협 모델 등) **변경 없음**.
> Phase G 는 기존 자산 (M3 dependency graph + blast radius / M5 incident feed / M18 MCP server / M20 supply chain / RAILGUARD) 을 확장 안에서 inline 발현.

### 11.0 Phase G 진입 시점 + 5 layer 통신 흐름 영향

```
Phase 순서 (변경): A → B → C → D → E → G → F-1 → F-2

5 layer 통신 흐름 (10.2) 에 추가되는 메시지 (Layer 3 ↔ 4):
  - graph_for_credential          (G-1)
  - incident_check_for_host       (G-2)
  - blast_radius_for_host         (G-3)
  - mcp_context_push              (G-4)
  - (G-5 는 정적 host 매칭 only — nm-host 통신 ❌)
```

기존 5 layer 변경 없음. 메시지 enum 만 확장.

---

### 11.1 G-1 Inline 의존성 mini-graph

**자산 재사용**: M3 (`secretbank-core::DependencyGraph` + `secretbank-app::commands::graph::graph_fetch` + `secretbank-app::commands::graph::blast_radius_for_credential`) + M24 1.5 (`src/features/inventory/MiniGraph.tsx` 의 SVG fan-out 패턴)

**데이터 흐름**:

```
[1] popup CredentialCard (E4 산출물) hover (200ms delay)
        │
        ▼
[2] extension service worker → nm-host
        message = { kind: "graph_for_credential", credential_id: "<id>" }
        │
        ▼
[3] nm-host → 데스크톱 IPC (UDS / Named Pipe)
        Tauri command = graph_for_credential(id)
                        - graph_fetch() 의 subgraph 추출 (1-hop fan-out, 5+ "more" 축약)
                        - 응답 = { center_label, project_nodes[], edges[] }
        │
        ▼
[4] popup 의 MiniGraph.tsx (M24 1.5 SVG 패턴 그대로)
        - 220×110 SVG, 중앙 = credential, 방사 = projects
        - 클릭 → secretbank://graph?credential=<id> deep-link (G1-3)
```

**Tauri custom protocol** (G1-3):

| OS      | 등록 방법                                                                                  |
| :------ | :----------------------------------------------------------------------------------------- |
| Windows | Registry `HKCU\Software\Classes\secretbank\shell\open\command`                             |
| macOS   | `Info.plist` 의 `CFBundleURLTypes` (LSSetDefaultHandlerForURLScheme 자동)                  |
| Linux   | `~/.local/share/applications/secretbank.desktop` 의 `MimeType=x-scheme-handler/secretbank` |

**구현**: `tauri-plugin-deep-link` v2 (Tauri 공식, AGPL 호환).

---

### 11.2 G-2 Supply chain banner (in-page)

**자산 재사용**: M5 (`secretbank-feeds::matcher::match_incident` Rule 2 domain match + `IncidentRepo`) + M20 (`secretbank-supply::OsvClient` + `match_advisories`) + IssuerRepo `domains[]` 컬럼

**데이터 흐름**:

```
[1] content-script 로드 시 host 추출 (window.location.hostname)
        │
        ▼
[2] extension service worker → nm-host
        message = { kind: "incident_check_for_host", host: "lastpass.com" }
        │
        ▼
[3] nm-host → 데스크톱 IPC
        Tauri command = incident_matches_for_host(host)
                        - IncidentRepo.list() → match_incident 의 Rule 2 (domain match) 재사용
                          단, credentials 인자 대신 host 직접 매칭 헬퍼 신설
                        - SupplyAdvisoryRepo (M20) 도 host → package 역매핑 (issuer.package_name 컬럼 활용)
                        - severity ≥ MEDIUM 만 응답
                        - 응답 = { matches: [{incident_id, severity, title, published_at, source}] }
        │
        ▼
[4] content-script → SupplyChainBanner (Closed Shadow DOM)
        - sticky banner: "⚠ <host> N일 전 보안 사고 — <CVE-ID> (<severity>)"
        - "자세히" 클릭 → secretbank://incidents?host=<host> deep-link
        - "Dismiss" 클릭 → chrome.storage.local 의 dismissed_hosts 큐 7일 추가
```

**False positive 방어** (G-2 의 가장 중요한 위험):

- IssuerRepo 의 `domains[]` 컬럼 정확 매칭 (subdomain-safe, www 정규화)
- M5 매칭 알고리즘의 `MatchReason::DomainMatch` confidence 만 사용 (issuer_id 매칭 = credential 단위 → host 단위에서는 ❌)
- severity 필터: HIGH/CRITICAL 만 표시 권장 (MEDIUM 은 옵션)
- 응답 캐시 1h TTL — 같은 host 재방문 시 IPC 부하 ↓

---

### 11.3 G-3 Blast radius preview on revoke

**자산 재사용**: M3 (`secretbank-core::blast_radius::blast_radius` BFS + `secretbank-app::commands::graph::blast_radius_for_credential`)

**데이터 흐름**:

```
[1] content-script form 감지: autocomplete="new-password" + 도메인 매칭 credential 존재
        │
        ▼
[2] SaveBanner (D3) 가 "Update" 모드 진입
        │
        ▼
[3] extension service worker → nm-host
        message = { kind: "blast_radius_for_host", host: "stripe.com" }
        │
        ▼
[4] nm-host → 데스크톱 IPC
        Tauri command = blast_radius_for_host(host)
                        - IssuerRepo.find_by_domain(host) → credential_id
                        - blast_radius(graph, credential_id) → BlastRadius struct
                        - 응답 = { credential_id, affected: [{kind, label, status}], total: N }
        │
        ▼
[5] SaveBanner 의 "Update" 카드 inline 표시 — BlastRadiusPreviewCard
        "이 변경이 N개 항목에 영향: [project A][deployment B] 외 +K개"
        클릭 → secretbank://graph?blast_credential=<id> deep-link (G1-3 확장)
```

**왜 차별화인가**: 1Password 는 비번 변경 시 "이 변경이 어디에 영향" 정보 ❌. Secretbank 는 M3 graph 가 미리 매핑돼 있어 즉시 미리보기. 사용자는 "저장 → 다른 곳에서 깨짐 발견" 의 사후 패닉을 피한다.

---

### 11.4 G-4 MCP context push

**자산 재사용**: M18 (`secretbank-mcp` JSON-RPC server + tools/list + tools/call)

**데이터 흐름**:

```
[1] (사용자가 Settings 에서 mcp_context_opt_in = true 로 설정한 경우만)
        │
        ▼
[2] content-script 페이지 진입 시 (5분 1회 빈도 제한)
        message = { kind: "mcp_context_push",
                    host: "stripe.com",
                    credential_meta: [{id, name, issuer}],
                    timestamp: Date.now() }
        │
        ▼
[3] nm-host → 데스크톱 IPC
        Tauri command = mcp_context_push(payload)
                        - MCP server 의 internal queue (Arc<Mutex<VecDeque>>) 에 push
                        - capacity 10, FIFO (11번째 push 시 oldest pop)
        │
        ▼
[4] (별도 흐름) AI 에디터 (Claude / Cursor) 가 MCP query
        → tools/call: { name: "current_site_context" }
        → 큐의 최근 5 site context 응답 (또는 빈 배열 if opt-in OFF)
```

**MCP server 신규 tool 명세**:

```jsonc
{
  "name": "current_site_context",
  "description": "User's currently visited site context (only available if user has explicitly opted in via desktop settings). Returns recent 5 sites with credential metadata (no plaintext).",
  "inputSchema": { "type": "object", "properties": {} },
  "outputSchema": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "host": { "type": "string" },
        "credential_meta": { "type": "array", "items": { "type": "object" } },
        "timestamp": { "type": "number" },
      },
    },
  },
}
```

**Privacy 4 계층 완화** (R6 잔여 위험 — 11.6 신규 위협 모델):

1. **opt-in 강제**: 기본값 OFF. Settings UI 토글 필요.
2. **데이터 최소화**: host + credential ID + name + issuer 만. plaintext 절대 ❌.
3. **사용자 인지**: popup 우상단 "MCP 활성" 인디케이터 (opt-in ON 시 항상 표시).
4. **audit log**: 매 push 마다 `extension.mcp.context_push` 1건 — hash chain 무결성 유지.

**왜 차별화인가**: 1Password / Bitwarden 의 MCP 통합 ❌. Secretbank 는 M18 MCP 가 이미 있고, 확장이 그 표면을 site-aware 로 확장. AI 에디터에서 "현재 보고 있는 사이트의 credential 어떻게 처리할까?" 즉답 가능.

---

### 11.5 G-5 RAILGUARD 인라인 hint

**자산 재사용**: M5 RAILGUARD (`secretbank-railguard::RuleKind` 의 4 rule 종류 + render template) + Closed Shadow DOM (C8)

**데이터 흐름**:

```
[1] content-script 로드 시 host 추출
        │
        ▼
[2] AI editor host 매칭 (정적 목록):
        chatgpt.com / cursor.com / copilot.github.com /
        gemini.google.com / claude.ai / poe.com / perplexity.ai
        │
        ▼ (매칭 시)
[3] RailguardHintBanner mount (Closed Shadow DOM, sidebar 고정)
        - "⚠ AI 에 API 키 / 비번 입력 시 secretbank Kill Switch ❌. RAILGUARD 룰 자동 생성 →"
        - 클릭 → secretbank://railguard deep-link
        - "이 도메인 1주 미표시" → dismissed_ai_hosts 큐 7일 추가
```

**host 목록 갱신 정책**: 분기별 hotfix sub-task. AI 에디터 시장 변화 시 (예: 신규 AI 에디터 출시) 추가.

**왜 차별화인가**: 사용자가 AI 에 비번 입력하는 행동 자체를 차단 ❌, 단 "이런 행동은 위험하다 + RAILGUARD 룰로 사전 방어 가능" 안내. Secretbank 의 RAILGUARD 자산 (M5) 의 가시성 확장 표면.

---

### 11.6 위협 모델 — Phase G 가 추가하는 위협 (T1~T7 + R6 신설)

기존 architecture.md 10.7 위협 모델 (T1~T7) 그대로 유지. Phase G 추가:

| 신규 ID | 위협                                                                            | 자산                                    | 완화                                                                                                        |
| :------ | :------------------------------------------------------------------------------ | :-------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **R6**  | MCP context push privacy — 사용자 사이트 정보 데스크톱 큐 일시 보관 (opt-in 시) | host + credential meta (큐 capacity 10) | 4 계층: opt-in OFF 기본값 + 데이터 최소화 (plaintext ❌) + popup 인디케이터 + audit log + 5분 1회 빈도 제한 |

**G-1 ~ G-5 의 기존 T1~T7 매핑** (신규 위협 추가 ❌):

| Phase G | 매핑          | 이유                                                                |
| :------ | :------------ | :------------------------------------------------------------------ |
| G-1     | T2            | popup 영역 (in-page postMessage 미사용, 데이터 흐름 = nm-host only) |
| G-2     | T3            | in-page banner = Closed Shadow DOM (C8 재사용)                      |
| G-3     | T2 + T4       | host 매칭 = IssuerRepo.domains[] (subdomain-safe)                   |
| **G-4** | **R6 (신규)** | privacy — 4 계층 완화                                               |
| G-5     | T7            | Closed Shadow DOM 격리                                              |

**잔여 위험 갱신**:

- 기존 R5 (Browser side-channel) — 변경 없음
- 기존 R-DC (DOM Clickjacking 신규 기법) — 변경 없음
- **R6 (MCP context push privacy) — 신설** — opt-in 강제 + 데이터 최소화로 완화. 잔여: opt-in ON 사용자가 sensitive 사이트 방문 시 host 가 큐에 일시 보관 (단 plaintext ❌, capacity 10, 5분 1회 빈도)

---

### 11.7 권한 매니페스트 영향 (10.8 갱신 ❌)

기존 manifest 권한 (`activeTab` / `storage` / `nativeMessaging` / `optional_host_permissions`) 그대로 충분.

Phase G 가 추가하는 권한: **없음** — 모든 통신은 nm-host stdio (이미 nativeMessaging 권한) 또는 정적 host 매칭 (G-5).

**Chrome Web Store 심사 정당화 (B3) 갱신 사항 — Phase F-1 진입 시점**:

- nativeMessaging 정당화에 "supply chain banner / blast radius preview / MCP context push" 추가 명시
- privacy policy: MCP context push opt-in 흐름 명시 (PRIVACY.md 갱신)

---

### 11.8 라이선스 경계 (10.1 D18 갱신 ❌)

| Phase G 산출물             | 위치                                                        | 라이선스 |
| :------------------------- | :---------------------------------------------------------- | :------- |
| MiniGraph.tsx 이관         | `extension/components/MiniGraph.tsx`                        | AGPL-3.0 |
| SupplyChainBanner.tsx      | `extension/components/SupplyChainBanner.tsx`                | AGPL-3.0 |
| BlastRadiusPreviewCard.tsx | `extension/components/BlastRadiusPreviewCard.tsx`           | AGPL-3.0 |
| RailguardHintBanner.tsx    | `extension/components/RailguardHintBanner.tsx`              | AGPL-3.0 |
| MCP context queue + tool   | `src-tauri/crates/secretbank-mcp/src/main.rs` 확장          | AGPL-3.0 |
| graph_for_credential 헬퍼  | `src-tauri/crates/secretbank-app/src/commands/graph.rs`     | AGPL-3.0 |
| incident_matches_for_host  | `src-tauri/crates/secretbank-app/src/commands/incidents.rs` | AGPL-3.0 |
| blast_radius_for_host      | `src-tauri/crates/secretbank-app/src/commands/graph.rs`     | AGPL-3.0 |

**EE 코드 import ❌**. 모든 Phase G 산출물 = AGPL-3.0 OSS core.

---

### 11.9 Phase G 검증 게이트 (10.11 audit 일정 갱신)

기존 audit 일정 (10.11):

- Phase B 완료 후 페어링 흐름 단독 audit (Q5 옵션 A)
- Phase F 완료 후 종합 audit

**Phase G 추가**: Phase G → Phase F-1 사이에 별도 audit ❌. **Phase F 종합 audit scope 에 Phase G 5 기능 포함**:

- G-1 graph subgraph 추출 (M3 재사용 → 추가 audit 부담 ↓)
- G-2 host → incident 매칭 정확도 (false positive 검증)
- G-3 blast radius preview (M3 재사용)
- G-4 MCP context queue (capacity 한계 + opt-in 강제 + audit log 검증)
- G-5 RAILGUARD hint (정적 host 매칭 + Shadow DOM 격리)

**Phase F 종합 audit 비용 영향**: $15K~$50K → $20K~$55K (G-4 MCP context push 의 privacy 검증 추가, G-2 매칭 정확도 검증 추가). 정확한 견적은 Phase G 완료 후 audit 업체 선정 시 확정.

---

### 11.10 cross-browser 빌드 매트릭스 (10.12 갱신 ❌)

기존 빌드 매트릭스 그대로. Phase G 산출물은 모두 popup / content-script 영역 → 4 브라우저 동등 호환.

**예외**: G1-3 deep-link 핸들러는 데스크톱 측 Tauri custom protocol — 브라우저와 무관 (3 OS 등록 차이만).

---

_M24-E architecture Phase G (11장) 끝._
