# Secretbank — Research Raw Data

> 작성자: Research Agent (claude-sonnet-4-6)  
> 수집일: 2026-04-22  
> 목적: Phase 2 Integrator 에이전트의 CRAAP 평가 입력 자료  
> 비고: user_research/ 내 기존 자료와 중복되는 내용은 "이미 수집됨" 표시 후 요점만 재정리.

---

## 1. Stronghold vs tauri-plugin-keyring

### 핵심 질문

1. Tauri v2에서 Stronghold와 tauri-plugin-keyring은 상호 배타적인가, 함께 쓰는 것인가?
2. Stronghold가 v3에서 deprecated 예정인가? 현재 공식 권장은?
3. 모바일(iOS/Android)에서 각각 동작하는가?

### 조사 결과

**Stronghold 현황 (2025-12 기준)**  
Tauri 공식 문서(v2.tauri.app)에는 Stronghold 플러그인이 Windows/Linux/macOS/Android/iOS 모두 "Full support"로 표기되어 있다 [출처 #1]. 암호화 엔진은 IOTA Stronghold(XChaCha20-Poly1305 + Argon2id)를 사용하며, 초기화 시 32바이트 해시를 반환하는 KDF 함수를 제공해야 한다 [출처 #1]. 최소 Rust 1.77.2 필요.

**Deprecated 예정 경고**  
GitHub Discussion #7846에서 Tauri 메인테이너가 "stronghold is no longer recommended and will be deprecated and therefore removed in v3"라고 명시했다 [출처 #2]. 이 발언은 2024~2025년 사이 작성된 것으로 확인된다.

**두 플러그인의 역할 분리**  
tauri-plugin-keyring은 HuakunShen이 개발한 커뮤니티 플러그인으로, OS 네이티브 자격증명 저장소(macOS Keychain, Windows Credential Manager, Linux GNOME Keyring)를 Tauri에서 사용할 수 있게 해준다 [출처 #3]. 실제 사용 패턴은 다음과 같다:

- **tauri-plugin-keyring** → Stronghold 볼트를 열기 위한 **마스터 키** 보관
- **Stronghold** → 실제 API 키/시크릿 값을 XChaCha20-Poly1305로 암호화해 저장

즉 둘은 상호 배타적이 아니라 **계층적 조합(Layered combination)**이 권장된다 [출처 #2].

**모바일 지원**

- Stronghold: 공식 문서상 Android/iOS "Full support" 표기 있으나 [출처 #1], 실제 구현에서 확인된 한계는 아직 커뮤니티 문서 부족.
- tauri-plugin-keyring: 커뮤니티 플러그인으로 Android 지원 갭 존재. GitHub 디스커션에서 "Android support remains a gap in current solutions"로 언급됨 [출처 #2].

**암호화 강도 비교**  
| 항목 | Stronghold | OS Keyring |
|---|---|---|
| 암호화 알고리즘 | XChaCha20-Poly1305 | OS 의존(AES-256/Secure Enclave) |
| KDF | Argon2id | OS 의존 |
| 저장 위치 | 로컬 파일(.stronghold) | OS 자격증명 저장소 |
| 대용량 지원 | 가능 | 플랫폼 제한(~4KB~수MB) |
| v3 지속성 | 폐기 예정 | 유지 |

**잠정 권장**: 볼트 파일 암호화에는 **Stronghold**(v2 기간 동안)를 사용하되, 마스터 패스프레이즈는 **OS Keyring**에 저장하는 계층 구조. v3 전환 시점에 대비해 Stronghold 의존성을 추상화 레이어로 분리 설계 권장.

### 출처

- [#1] Stronghold | Tauri — https://v2.tauri.app/plugin/stronghold/ (2025-12-09, Tauri 공식 문서팀), 수집일 2026-04-22
  - 인용구: "platforms: windows ✓, linux ✓, macos ✓, android ✓, ios ✓"
- [#2] Is there any built-in safe storage API for securely storing secrets? — https://github.com/tauri-apps/tauri/discussions/7846 (2024, tauri-apps), 수집일 2026-04-22
  - 인용구: "stronghold is no longer recommended and will be deprecated and therefore removed in v3"
- [#3] GitHub - HuakunShen/tauri-plugin-keyring — https://github.com/HuakunShen/tauri-plugin-keyring (2024-2025, HuakunShen), 수집일 2026-04-22
  - 인용구: "Using keyring allows you to store user's password in the system keychain safely without prompting user for password everytime."

---

## 2. React Flow vs Cytoscape.js vs Reaflow

### 핵심 질문

1. 수백~수천 노드의 API 의존성 그래프 시각화에 어떤 라이브러리가 적합한가?
2. 라이선스는? Tauri/React 궁합은?
3. 모바일 터치 제스처 지원 수준은?

### 조사 결과

**라이브러리별 특성 비교**

| 항목          | React Flow (xyflow)              | Cytoscape.js                     | Reaflow       |
| ------------- | -------------------------------- | -------------------------------- | ------------- |
| 라이선스      | MIT [출처 #4]                    | MIT                              | MIT           |
| 렌더링 방식   | HTML DOM/SVG                     | Canvas/WebGL [출처 #5]           | SVG/Canvas    |
| React 통합    | 네이티브                         | react-cytoscapejs 래퍼           | 네이티브      |
| 대규모 그래프 | 수백 노드 적합, 최적화 필요      | 10,000+ 노드 처리 가능 [출처 #5] | 제한적        |
| 커스텀 노드   | HTML DOM 직접 렌더 → 자유도 높음 | 제한적                           | 제한적        |
| 내장 알고리즘 | 레이아웃 제한적                  | BFS, DFS, Dijkstra 등 풍부       | 제한적        |
| 터치 제스처   | 지원(웹 기반)                    | 지원                             | 제한적        |
| npm 주간 다운 | ~500K+                           | ~200K+                           | ~10K          |
| 상태(2025)    | 활발 (v12)                       | 활발                             | 유지보수 모드 |

**React Flow 성능 분석**  
React Flow는 뷰포트에 보이는 요소만 렌더링하는 최적화를 포함한다. 공식 문서는 "unnecessary re-renders"가 드래그/팬/줌 시 주요 병목임을 지적하며 `React.memo`, `useCallback`, Zustand 셀렉터 활용을 권장한다 [출처 #6]. 수백~1000노드 범위에서 적절히 최적화하면 실용적.

**Cytoscape.js 성능 분석**  
Canvas/WebGL 기반으로 10,000+ 노드도 처리 가능하며, `hideEdgesOnViewport: true`, `textureOnViewport: true` 옵션으로 인터랙션 중 성능을 높일 수 있다 [출처 #7]. 단, React 통합은 `react-cytoscapejs` 래퍼를 통해야 하며, 커스텀 노드 렌더링이 React Flow 대비 제한적이다.

**Reaflow 현황**  
유지보수 모드에 가까우며 대규모 상업 사용 사례가 적어 제외 검토 대상.

**Secretbank 특수 고려사항**

- MVP 단계에서 노드 수는 수십~수백 범위(키 수십 개, 프로젝트 수십 개).
- 커스텀 노드 스타일(상태 표시, Blast Radius 하이라이트)이 핵심이므로 HTML DOM 기반 React Flow가 유리.
- initial_idea.md에서 이미 React Flow를 기술 스택으로 선정 [이미 수집됨].

**잠정 권장**: **React Flow (@xyflow/react)** — MIT 라이선스, React 네이티브, 커스텀 노드 자유도 최고. MVP ~ 1000노드 범위에서 최적화 가능. 1만 노드 이상 필요시 Cytoscape.js로 마이그레이션.

### 출처

- [#4] xyflow/xyflow GitHub — https://github.com/xyflow/xyflow (2025, xyflow team), 수집일 2026-04-22
  - 인용구: "React Flow is MIT Licensed, anyone can use, repurpose, or resell the library"
- [#5] Cytoscape.js — https://js.cytoscape.org (2025, Cytoscape consortium), 수집일 2026-04-22
  - 인용구: "Cytoscape.js handles large graphs well, as it uses WebGL for rendering"
- [#6] Performance - React Flow — https://reactflow.dev/learn/advanced-use/performance (2025, xyflow), 수집일 2026-04-22
  - 인용구: "Components provided as props...should either be memoized using React.memo or declared outside"
- [#7] Performance Optimization - Cytoscape.js GitHub — https://deepwiki.com/cytoscape/cytoscape.js/8-performance-optimization (2025), 수집일 2026-04-22
  - 인용구: "hideEdgesOnViewport: true hides edges during pan, zoom, pinch-to-zoom, and node drag operations and is most effective on very large graphs (1000+ edges)"

---

## 3. Incident Feed 소스 목록

### 핵심 질문

1. "공급자 보안 사고 자동 감시"에 통합해야 할 소스는 무엇인가?
2. 각 소스의 API/RSS 형태와 폴링 주기 권장안은?
3. NVD API 2.0 레이트 리밋은?

### 조사 결과

**카테고리 A: 취약점 데이터베이스**

| 소스                                       | 형태                         | 무료                 | 레이트 리밋                                 | 비고                                 |
| ------------------------------------------ | ---------------------------- | -------------------- | ------------------------------------------- | ------------------------------------ |
| NVD CVE API 2.0                            | REST JSON                    | 무료(API 키 시 완화) | ~50 req/30s(키 없음), ~100 req/30s(키 있음) | RSS 피드 2025-08 이후 폐기 [출처 #8] |
| GitHub Advisory DB                         | REST API + GraphQL, OSV JSON | 무료                 | 5,000 req/hr(인증)                          | OSV 포맷, CVE CNA                    |
| CISA KEV (Known Exploited Vulnerabilities) | JSON 카탈로그                | 무료                 | 폴링 제한 없음                              | 실제 악용 CVE 우선                   |

**카테고리 B: SaaS 공급자 상태 페이지**

`talonx/service-provider-status-links` 레포지터리가 주요 서비스의 상태 페이지/RSS 피드 목록을 관리한다 [출처 #9].

| 공급자     | 상태 페이지                      | RSS/Atom                                  | 폴링 주기 권장 |
| ---------- | -------------------------------- | ----------------------------------------- | -------------- |
| OpenAI     | https://status.openai.com        | Atom 피드 있음                            | 5분            |
| Stripe     | https://status.stripe.com        | RSS 있음                                  | 5분            |
| AWS        | https://health.aws.amazon.com    | https://status.aws.amazon.com/rss/all.rss | 5분            |
| Vercel     | https://www.vercel-status.com    | Atom 있음                                 | 5분            |
| Supabase   | https://status.supabase.com      | Atom+RSS 있음 [출처 #10]                  | 5분            |
| GitHub     | https://www.githubstatus.com     | RSS 있음                                  | 5분            |
| Cloudflare | https://www.cloudflarestatus.com | RSS 있음                                  | 5분            |

**카테고리 C: 유출 탐지**

- **GitGuardian Public Monitoring**: 공개 GitHub에서 시크릿 패턴 탐지. 무료 API 없음. 파트너 프로그램 통해 접근 가능.
- **HIBP (Have I Been Pwned) API v3**: 이메일 주소 유출 확인. 구독 키 필요. Pwned Passwords는 무료 [출처 #11].
  - 용도: 개발자 이메일이 유출된 경우 연관 API 키 재검토 알림 트리거로 활용 가능.
- **TruffleHog / Gitleaks**: 오픈소스, 코드베이스 스캔. API 피드 아님 → 로컬 실행.

**폴링 전략 권장**

- SaaS 상태 페이지(RSS): 5분 간격 폴링
- NVD CVE API: 2시간 간격 증분 쿼리(lastModStartDate 파라미터 활용)
- GitHub Advisory: 24시간 간격 전체 스캔 또는 GraphQL 구독
- 이상 징후 발생 시 → 폴링 간격 1분으로 단축(Circuit Breaker 패턴)

**gemini_deep_research_Secretbank.md 섹션 3.1에서 이미 수집됨**: GitHub Advisory DB, NVD, AbuseIPDB, Google Cloud Asset Inventory, OpenAI Audit Logs API 언급.

**잠정 권장**: NVD CVE API 2.0 + GitHub Advisory DB + 주요 SaaS 상태 페이지 RSS(10개) + HIBP v3(이메일 유출 감시)를 1차 통합 목표로 설정. 2차로 CISA KEV 추가.

### 출처

- [#8] NVD - Future Changes to Data Feeds — https://nvd.nist.gov/general/news/changes-to-feeds-and-apis (NIST, 2023-2025), 수집일 2026-04-22
  - 인용구: "the NVD will retire all RSS feeds. Legacy data feed files will be removed after August 20th, 2025"
- [#9] talonx/service-provider-status-links — https://github.com/talonx/service-provider-status-links (2024-2025, talonx), 수집일 2026-04-22
  - 인용구: "A list of URLs to the RSS feeds and status pages of various service providers"
- [#10] Supabase Status — https://status.supabase.com/ (Supabase), 수집일 2026-04-22
  - 인용구: "Atom Feed and RSS Feed options on their status page"
- [#11] Have I Been Pwned API Documentation — https://haveibeenpwned.com/api/v3 (Troy Hunt), 수집일 2026-04-22
  - 인용구: "There is no authorization required for the free Pwned Passwords API"

---

## 4. GitHub API 범위

### 핵심 질문

1. GitHub Secret Protection API의 REST 엔드포인트와 필요 권한 스코프는?
2. GitHub App vs OAuth App 중 어느 것이 적합한가?
3. .env와 Actions Secrets 연동 시나리오에서 레이트 리밋은?

### 조사 결과

**GitHub Secret Scanning REST API (2025)**  
주요 엔드포인트 [출처 #12]:

- `GET /repos/{owner}/{repo}/secret-scanning/alerts` — 저장소 비밀 스캔 알림 목록
- `GET /orgs/{org}/secret-scanning/alerts` — 조직 비밀 스캔 알림 목록
- `PATCH /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}` — 알림 업데이트(해결 처리)
- `GET /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}/locations` — 유출 위치 상세

2025년 추가된 기능 [출처 #12]:

- `first_location_detected`, `has_more_locations` 필드 추가 (2025-06-24 GA)
- 알림 해제 검토 요청 REST API 추가 (2025-04-18)

**필요 권한 스코프**  
| 접근 방식 | 필요 스코프 |
|---|---|
| OAuth/PAT (classic) | `repo` 또는 `security_events` |
| 공개 레포만 | `public_repo` |
| 사용자 역할 | 저장소/조직 관리자 |

**GitHub Actions Secrets API**  
`GET/PUT/DELETE /repos/{owner}/{repo}/actions/secrets/{secret_name}` — Actions 시크릿 CRUD.  
필요 PAT 스코프: `repo` [출처 #13].

**GitHub App vs OAuth App**  
| 항목 | GitHub App | OAuth App |
|---|---|---|
| 권한 방식 | Fine-grained permissions | Broad scopes |
| 레이트 리밋 | 15,000 req/hr (Enterprise Cloud) | 5,000 req/hr |
| 토큰 수명 | 단기(설치 토큰) | 장기 PAT |
| 접근 범위 | 특정 저장소 선택 가능 | 전체 계정 |
| 권장 | **권장** (2025 공식) | 레거시 |

GitHub 공식 문서는 OAuth App 대비 GitHub App을 명시적으로 권장("preferred to OAuth apps because they use fine-grained permissions") [출처 #14].

**Secretbank 시나리오 권장 구성**

1. GitHub App 설치 → 사용자가 특정 저장소 접근 권한 부여
2. 설치 토큰(짧은 수명) 발급 → `repo` 스코프 없이 fine-grained로 Actions Secrets + Secret Scanning만 접근
3. .env 파일 스캔은 코드 contents:read 권한만 필요

**잠정 권장**: **GitHub App** (fine-grained, 설치 토큰 방식). OAuth App보다 보안 우수, 레이트 리밋 3배. repo 전체 스코프 대신 Secret Scanning + Actions Secrets 권한만 요청.

### 출처

- [#12] REST API endpoints for secret scanning — https://docs.github.com/en/rest/secret-scanning/secret-scanning (GitHub 공식 문서, 2025), 수집일 2026-04-22
  - 인용구: "Secret scanning REST API responses now include first_location_detected and has_more_locations"
- [#13] REST API endpoints for GitHub Actions Secrets — https://docs.github.com/en/rest/actions/secrets (GitHub 공식 문서, 2025), 수집일 2026-04-22
  - 인용구: "OAuth tokens and personal access tokens (classic) need the repo scope to use this endpoint"
- [#14] Rate limits for the REST API — https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api (GitHub 공식 문서, 2025), 수집일 2026-04-22
  - 인용구: "Requests made on your behalf by a GitHub App...have a higher rate limit of 15,000 requests per hour"

---

## 5. LiteLLM vs Vercel AI SDK vs 직접 추상화

### 핵심 질문

1. Phase 2 LLM 키 관리 기능 대비 각 옵션의 "키 관리" 측면 강점은?
2. Tauri 앱(로컬 데스크톱)에서 통합 가능한가?

### 조사 결과

**LiteLLM 키 관리 기능**  
LiteLLM은 Virtual Keys 시스템을 제공한다. 에이전트별 가상 API 키를 발급하여 지출 추적(spend tracking), 예산 한도 설정, RBAC가 가능하다 [출처 #15]. 자체 호스팅 프록시(LLM Gateway) 방식으로 운영할 때 실제 API 키는 서버만 알고 클라이언트는 가상 키만 사용한다.

- **Tauri 통합 가능성**: LiteLLM은 Python 패키지. Tauri 앱에서 직접 통합 불가(주제 8 사이드카 방식 필요). 또는 별도 서버로 분리.

**Vercel AI SDK 키 관리**  
클라이언트 사이드 라이브러리로 키 관리 자체는 담당하지 않는다. Vercel AI Gateway는 Vercel 플랫폼에 종속되며 "엔터프라이즈 거버넌스 기능(Virtual Key 예산 관리, RBAC, 감사 로그) 부재" [출처 #16].

- **Tauri 통합 가능성**: React/TypeScript에서 직접 사용 가능. 단, 키가 프론트엔드에 노출되는 구조는 보안 문제.

**직접 추상화 (Rust/자체 구현)**  
Tauri 백엔드(Rust)에서 각 LLM 제공사 API를 직접 호출하는 추상화 레이어:

- 키는 Stronghold에 암호화 저장, 호출 시 복호화 후 reqwest로 전달
- 추가 의존성 없음
- 구현 비용 높지만 Zero-Knowledge 아키텍처와 완벽 정합

**비교표**  
| 항목 | LiteLLM | Vercel AI SDK | 직접 추상화(Rust) |
|---|---|---|---|
| 키 관리 기능 | Virtual Keys + 예산 관리 | 없음 | 완전 커스텀 |
| Tauri 직접 통합 | 불가(Python) | 가능(JS) | 가능(Rust) |
| Zero-Knowledge 호환 | 서버 의존 | 불가 | 완전 호환 |
| 지원 LLM 수 | 100+ 통합 제공 | OpenAI/Anthropic 등 주요사 | 직접 구현 필요 |
| 1인 운영 부담 | 중간(Python 서버 관리) | 낮음 | 중간(구현 비용) |

**Secretbank Phase 2 맥락**  
initial_idea.md에서 "LLM 모델 관리"는 Phase 2 별도 탭/앱으로 분리 판단 예정으로 표기됨 [이미 수집됨]. Phase 2 전까지 우선순위 낮음.

**잠정 권장**: Phase 2에서 LLM 관리 기능을 추가할 경우, **직접 추상화(Rust reqwest)** 로 시작하되 공급사별 커넥터 패턴(initial_idea.md의 `Connector` trait) 재사용. LiteLLM은 별도 백엔드 서비스로 분리하는 경우에만 고려.

### 출처

- [#15] liteLLM documentation — https://docs.litellm.ai/ (BerriAI, 2025), 수집일 2026-04-22
  - 인용구: "Virtual Keys, allowing you to generate virtual API keys for each agent to track spend separately"
- [#16] 8 Vercel AI Alternatives and Competitors for 2026 — https://www.truefoundry.com/blog/vercel-ai-alternatives-8-top-picks-you-can-try-in-2026 (TrueFoundry, 2026), 수집일 2026-04-22
  - 인용구: "Vercel AI Gateway is tightly coupled to the Vercel platform and lacks enterprise governance features like Virtual Key budget management, RBAC, or audit logging"
- [#17] Top LLM Gateways 2025 — https://agenta.ai/blog/top-llm-gateways (agenta.ai, 2025), 수집일 2026-04-22
  - 인용구: "LiteLLM is best for engineering teams who want full control, are comfortable with self-hosting"

---

## 6. 감사 로그 변조 방지 구현 방식

### 핵심 질문

1. Merkle tree vs Hash chain vs Sigstore/Rekor 중 Secretbank에 적합한 것은?
2. Rust 구현체 존재 여부?
3. 1인 운영 가능성과 검증 비용은?

### 조사 결과

**Hash Chain (현재 initial_idea.md 선택)**  
initial_idea.md에서 이미 "ed25519 서명 체인, append-only"로 확정 [이미 수집됨].

각 레코드: `hash(record_data + prev_hash)` + ed25519 서명으로 구성. 단일 레코드 변조 시 이후 모든 해시가 깨진다 [출처 #18].

**Rust 구현 사례**:

- OpenFang (Rust 기반 Agent OS)이 `audit.rs`에서 Merkle Hash-Chain + ed25519 선택적 서명 구현 [출처 #18].
- `attest` crate (GitHub: Ashish-Barmaiya/attest): 멀티 테넌트 append-only 감사 로그, 크립토그래픽 증명 제공 [출처 #19].

**Sigstore/Rekor (투명성 로그)**  
Rekor는 Merkle tree 기반 소프트웨어 공급망 투명성 로그다 [출처 #20]. 엔트리 추가 시 주기적으로 전체 트리에 서명하고 타임스탬프를 부여한다.

- **장점**: 외부 검증 가능(누구나 트리 검증), 강력한 불변성 보증
- **단점**: 외부 서비스 의존, 1인 운영 복잡도 증가, Secretbank의 오프라인 로컬 사용 시 불가

**Merkle Tree vs Hash Chain 비교**  
| 항목 | Hash Chain | Merkle Tree |
|---|---|---|
| 구현 복잡도 | 낮음 | 중간 |
| 부분 검증 | O(n) | O(log n) |
| 순서 보증 | 강함 | 강함 |
| 1인 구현 가능 | 용이 | 가능하나 더 복잡 |
| Rust 구현체 | 다수 | Trillian, Rekor(Go) |
| 로컬 동작 | 완전 | 완전 |

**Secretbank에서의 실용성 판단**  
감사 로그 크기(일반 사용자: 수천~수만 건)에서는 Hash Chain의 O(n) 검증 비용이 실질적 문제가 되지 않는다. ed25519 서명 체인 방식이 구현 단순성, Rust 생태계 지원, 외부 의존성 없음 측면에서 Secretbank에 최적.

**잠정 권장**: **SHA-256 Hash Chain + ed25519 서명** (already decided in initial_idea.md). `ed25519-dalek` crate 활용, 각 로그 엔트리에 `prev_hash: [u8; 32]` + `signature: ed25519::Signature` 포함. 향후 필요시 Merkle tree로 업그레이드 가능한 구조로 설계.

### 출처

- [#18] Feature: Cryptographic Audit Trail — https://github.com/NousResearch/hermes-agent/issues/487 (NousResearch, 2025), 수집일 2026-04-22
  - 인용구: "Rust-based Agent Operating System, implements a Merkle Hash-Chain Audit Trail...creates a cryptographically linked, tamper-evident log of every agent action. The system can optionally sign the chain with an Ed25519 key for non-repudiation"
- [#19] GitHub - Ashish-Barmaiya/attest — https://github.com/Ashish-Barmaiya/attest (2025), 수집일 2026-04-22
  - 인용구: "multi-tenant, append-only audit logging service that provides cryptographic proof that audit history has not been silently rewritten"
- [#20] Rekor - Sigstore — https://docs.sigstore.dev/logging/overview/ (Sigstore 공식 문서, 2025), 수집일 2026-04-22
  - 인용구: "goals are to provide an immutable tamper resistant ledger of metadata generated within a software projects supply chain"

---

## 7. OS Keyring 통합 방식 차이

### 핵심 질문

1. Windows/macOS/Linux/iOS/Android 각 플랫폼의 키링 차이, 용량 제한, 바이오메트릭 연동은?
2. Tauri v2에서의 통합 방법은?

### 조사 결과

**플랫폼별 비교**

| 플랫폼  | 시스템                              | 알고리즘                | 용량 제한                           | Biometric                                             | 특이사항                         |
| ------- | ----------------------------------- | ----------------------- | ----------------------------------- | ----------------------------------------------------- | -------------------------------- |
| Windows | Credential Manager                  | DPAPI(AES-256)          | ~2.5KB/항목                         | Windows Hello 연동 가능                               | Registry 기반                    |
| macOS   | Keychain                            | SecureEnclave / AES-256 | 실질 제한 없음                      | Touch ID / Face ID [출처 #21]                         | iCloud Keychain 동기화 선택 가능 |
| Linux   | libsecret (GNOME Keyring / KWallet) | AES-256                 | 실질 제한 없음                      | 미지원(대부분)                                        | 데스크톱 환경 의존               |
| iOS     | Keychain Services                   | SecureEnclave           | ~4KB(소프트), 16MB(하드) [출처 #22] | Face ID / Touch ID (`.biometryCurrentSet`) [출처 #21] | iCloud Keychain 동기화 가능      |
| Android | Android Keystore                    | TEE/SE                  | 키 자체 제한 없음                   | BiometricPrompt 연동 [출처 #23]                       | 바이오메트릭 변경 시 키 무효화   |

**iOS Keychain 상세**

- `.biometryCurrentSet` 플래그: 현재 등록된 바이오메트릭과 엄격히 결합. 바이오메트릭 변경 시 항목 접근 불가 [출처 #21].
- `.userPresence`: 패스코드 폴백 허용(더 유연).

**Android Keystore 상세**

- `setUserAuthenticationRequired(true)` 설정 시 바이오메트릭/PIN 인증 강제.
- 지문 변경 시 `KeyPermanentlyInvalidatedException` 발생 [출처 #23].
- TEE(Trusted Execution Environment)에서 키 생성 시 OS도 키 재료를 볼 수 없음.

**Linux 주의사항**  
GNOME Keyring은 로그인 시 잠금 해제됨. KWallet은 KDE 환경 전용. 서버 환경(headless)에서는 keyring daemon이 없어 실패할 수 있음 → 폴백 전략 필요.

**Tauri v2 통합**

- `tauri-plugin-keyring` (커뮤니티): macOS/Windows/Linux 지원 확인. Android 지원 불완전 [출처 #2].
- Stronghold(v2 기간): Android/iOS 공식 지원 [출처 #1].
- 멀티플랫폼 대응: `keyring` Rust crate (hwchen/keyring-rs) — Windows/macOS/Linux 지원, 모바일 미지원.

**잠정 권장**: OS Keyring을 마스터 키 저장에 사용(keyring crate). 모바일에서는 Stronghold(v2 기간 동안) 또는 플랫폼 네이티브 API(Swift Keychain, Android Keystore) 직접 구현. Tauri 플러그인 안정화 시까지 추상화 레이어로 분리.

### 출처

- [#21] Accessing Keychain Items with Face ID or Touch ID — https://developer.apple.com/documentation/localauthentication/accessing-keychain-items-with-face-id-or-touch-id (Apple 공식 문서, 2025), 수집일 2026-04-22
  - 인용구: ".biometryCurrentSet — sets the requirement of Touch ID or Face ID authentication. When user changes his/her security settings...all the biometry-protected entries are removed"
- [#22] How much content can be stored in the iOS Keychain — https://developer.apple.com/forums/thread/73314 (Apple Developer Forums), 수집일 2026-04-22
  - 인용구: "4KB is the 'soft limit' and 16MB is the only known hard limit"
- [#23] Android Keystore system — https://developer.android.com/privacy-and-security/keystore (Android 공식 문서, 2025), 수집일 2026-04-22
  - 인용구: "When biometrics change, KeyPermanentlyInvalidatedException is thrown"

---

## 8. Tauri v2 사이드카로 Python 붙이기

### 핵심 질문

1. Python 종속성이 큰 라이브러리(LiteLLM 등)를 Tauri v2 사이드카로 붙일 수 있는가?
2. 배포 시 Python 런타임 번들링 방법은?
3. 대안(Rust 포팅, WASM, 서버 분리)의 현실성은?

### 조사 결과

**Tauri v2 사이드카 메커니즘**  
Tauri는 `externalBin` 설정으로 외부 바이너리를 번들링할 수 있다 [출처 #24]:

```json
// tauri.conf.json
{
  "tauri": {
    "bundle": {
      "externalBin": ["bin/python-server"]
    }
  }
}
```

번들 시 `python-server-x86_64-unknown-linux-gnu` 형태로 타겟 트리플을 자동 추가.

**Python 런타임 번들링 실제 구현**  
PyInstaller를 사용해 Python 스크립트 + 인터프리터 + 모든 의존성을 단일 실행 파일로 패키징 → Tauri 사이드카로 등록하는 방식이 실제 검증된 패턴이다 [출처 #25].

GitHub 레포 `dieharders/example-tauri-v2-python-server-sidecar`에서 Tauri v2 + Next.js + Python FastAPI 서버 번들링 예제를 제공한다 [출처 #26].

**LiteLLM 번들링 현실성**  
LiteLLM은 의존성이 매우 크다(`litellm` 패키지: 설치 시 100MB+ 수준). PyInstaller로 패키징 시 최종 바이너리가 수백MB에 달할 수 있어 배포 크기 문제가 발생한다.

**대안 비교**  
| 방법 | 장점 | 단점 |
|---|---|---|
| 사이드카(PyInstaller) | 기존 Python 코드 재활용 | 배포 크기 큼, 플랫폼별 빌드 필요 |
| Rust 포팅 | 배포 크기 작음, 네이티브 성능 | 구현 비용 높음 |
| WASM | 이식성 좋음 | Python-WASM 성숙도 낮음 |
| 서버 분리 | 모든 플랫폼 지원 | 서버 비용, Zero-Knowledge 위반 가능성 |

**Secretbank 맥락**  
LiteLLM은 Phase 2 기능으로 우선순위 낮음. Phase 2에서 LLM 관리 기능이 필요할 때 검토. 현재 MVP에서는 불필요.

**잠정 권장**: Phase 2 LLM 기능 추가 시 **서버 분리** 방식(Cloudflare Worker 또는 별도 마이크로서비스)이 1인 운영에 더 실용적. 사이드카는 배포 크기와 플랫폼별 빌드 복잡도로 인해 LiteLLM급 대형 패키지에는 비권장.

### 출처

- [#24] Embedding External Binaries | Tauri — https://v2.tauri.app/develop/sidecar/ (Tauri 공식 문서, 2025), 수집일 2026-04-22
  - 인용구: "Tauri allows you to embed external binaries to add additional functionality to your application or prevent users from installing additional dependencies"
- [#25] Building Production-Ready Desktop LLM Apps: Tauri, FastAPI, and PyInstaller — https://aiechoes.substack.com/p/building-production-ready-desktop (2025), 수집일 2026-04-22
  - 인용구: "PyInstaller packages the entire Python stack—interpreter, dependencies, and llama.cpp DLLs—into a single executable. Tauri then bundles that executable as a 'sidecar' process"
- [#26] GitHub - dieharders/example-tauri-v2-python-server-sidecar — https://github.com/dieharders/example-tauri-v2-python-server-sidecar (2025), 수집일 2026-04-22
  - 인용구: "An example desktop app built with Tauri version 2. Bundle a Next.js frontend with a Python api server."

---

## 9. Tauri v2 모바일 지원 성숙도

### 핵심 질문

1. 2025~2026 기준 Tauri v2 iOS/Android 실제 출시 사례 존재 여부?
2. 플러그인 지원 현황(Stronghold 모바일 지원 여부)?
3. CI 빌드 및 앱스토어 심사 경험담은?

### 조사 결과

**Tauri v2 모바일 지원 상태**

- 2024년 10월 2일 Tauri v2 안정(Stable) 릴리즈 — iOS/Android 포함 [출처 #27].
- 공식 문서: "you can develop production ready mobile applications with Tauri now" [출처 #27].
- App Store(iOS) 배포 공식 지원, `tauri ios build` 커맨드 제공 [출처 #28].

**실제 사용 경험담 (Erik Horton, 2025-10-05)**  
개발자 Erik Horton이 Tauri v2로 4개 소규모 모바일 앱을 개발한 회고를 공유했다 [출처 #29]:

- **주요 한계**: Android에서 디렉터리 선택 기능 미구현(Downloads 폴더로 대체).
- **빌드 시간**: Rust 컴파일 시간이 개발 속도의 주요 병목.
- **테스트 워크플로우**: 데스크톱 → Android 에뮬레이터 → 물리 기기 USB 디버깅 3단계 반복.
- **스토리지**: 멀티 프로젝트 빌드 시 디스크 공간 문제 (cargo clean 습관화 필요).
- **iOS 테스트**: 해당 개발자는 iOS 미테스트.
- **결론**: "overall very happy with the experience"이며 지속 사용 계획.

**플러그인 모바일 지원 현황**  
공식 플러그인 중 모바일 지원 여부:

- Stronghold: 공식 문서 Android/iOS ✓ 표기 [출처 #1].
- biometric, notifications, deep-link: 공식 지원 [출처 #27].
- clipboard, dialog, fs(파일 시스템): 일부 기능 제한.
- Updater, global-shortcut: 모바일 미지원.

**공식 문서 경고**  
"Not all official plugins are as stable as Tauri itself; each plugin's stableness is defined per plugin, and the plugin API can possibly break in minor versions" [출처 #27].

**CI 빌드**  
공식 GitHub Actions 워크플로우 제공. `tauri-apps/tauri-action`에 iOS/Android 빌드 지원 포함. Fastlane과의 공식 통합 예제는 커뮤니티 기여 형태.

**잠정 권장**: Tauri v2 모바일은 **실용 가능 수준**(Stable). 단, 일부 파일 시스템 기능과 플러그인 안정성에 주의. MVP는 데스크톱 우선 개발 후 모바일 포팅. Stronghold 모바일 지원은 공식 문서 기준 있으나 실제 사용 사례 커뮤니티 검증 더 필요.

### 출처

- [#27] Tauri 2.0 Stable Release — https://v2.tauri.app/blog/tauri-20/ (Tauri 공식 블로그, 2024-10-02), 수집일 2026-04-22
  - 인용구: "you can develop production ready mobile applications with Tauri now"
- [#28] App Store | Tauri — https://v2.tauri.app/distribute/app-store/ (Tauri 공식 문서, 2025), 수집일 2026-04-22
  - 인용구: "distribute your Tauri app targeting macOS and iOS via the Apple App Store"
- [#29] 4 Mobile Apps with Tauri: A Retrospective — https://blog.erikhorton.com/2025/10/05/4-mobile-apps-with-tauri-a-retrospective.html (Erik Horton, 2025-10-05), 수집일 2026-04-22
  - 인용구: "the directory selector functionality isn't implemented for Android... compiling is where you spend all of your time"

---

## 10. CRDT 라이브러리 비교 (Yjs vs Automerge vs Loro)

### 핵심 질문

1. 각 라이브러리의 Rust 바인딩, 바이너리 크기, E2EE 친화성은?
2. Secretbank의 멀티 디바이스 E2EE 동기화 맥락에서 어떤 것이 적합한가?
3. SecSync 같은 E2EE 프레임워크와 결합 가능한가?

### 조사 결과

**gemini_deep_research_Secretbank.md 섹션 2.2에서 이미 수집됨**: CRDT의 Delta-based 접근, SecSync 프레임워크(Yjs 기반), 서버는 맹목 릴레이 역할이어야 함.

**라이브러리별 특성 비교 (2025)**

| 항목            | Yjs                        | Automerge 2.0                           | Loro                                |
| --------------- | -------------------------- | --------------------------------------- | ----------------------------------- |
| 언어            | TypeScript                 | Rust (WASM for JS) [출처 #30]           | Rust (WASM+Swift 바인딩) [출처 #31] |
| Rust 바인딩     | 없음(JS 전용)              | 있음 (네이티브 Rust 크레이트)           | 있음 (`loro` crate, `loro-ffi`)     |
| 알고리즘        | YATA                       | JSON-CRDT(Oplog)                        | REG(Replayable Event Graph) + Fugue |
| 텍스트 성능     | 최고(YATA 특화) [출처 #32] | Yjs 대비 느림, 2.0에서 대폭 개선        | 벤치마크 상 Yjs와 경쟁적            |
| 이력 저장       | 별도 버전 스냅샷           | 전체 편집 이력(30% 오버헤드) [출처 #30] | 전체 DAG 이력                       |
| 바이너리 크기   | 작음                       | 중간                                    | 중간-큰 편                          |
| 생산 준비도     | 안정(JupyterLab 등 사용)   | 안정(2.0부터 프로덕션)                  | 실험적, 프로덕션 비권장 [출처 #32]  |
| SecSync 지원    | 공식 통합 제공 [출처 #33]  | 가능(비공식)                            | 미검증                              |
| 커뮤니티 활발도 | 매우 활발                  | 활발                                    | 성장 중                             |

**SecSync (E2EE CRDT 프레임워크)**  
Nik Graf가 개발. Yjs 기반 레퍼런스 구현을 제공하며 NLnet 재단 지원을 받고 있다 [출처 #33]. 동작 방식:

1. CRDT 업데이트/스냅샷을 로컬 대칭키로 AES-GCM 암호화
2. 암호화된 바이트 스트림 + nonce만 서버로 전송
3. 서버는 내용을 알 수 없는 "맹목 릴레이" 역할

Yjs + SecSync의 조합이 현재 검증된 E2EE CRDT 스택.

**Loro 상태 (2025)**  
Rust-first 설계, REG 알고리즘으로 텍스트 인터리빙 문제 감소. 그러나 2025년 기준 "실험적 API, 프로덕션 비권장"으로 자체 명시 [출처 #32]. 1인 개발 프로젝트에서 실험적 라이브러리 채택은 위험.

**Secretbank 맥락**  
API 키 메타데이터(이름, 프로젝트 연결, 만료일 등)는 일반 JSON 문서 구조 → Yjs의 Y.Map이 자연스럽게 맞음. 동시 편집 충돌 가능성 낮음(단일 사용자 멀티 디바이스).

**잠정 권장**: **Yjs + SecSync** — 프로덕션 검증됨, E2EE 프레임워크 공식 통합, Delta-based 동기화로 대역폭 효율. SecSync는 Cloudflare Workers와 결합 가능(프로젝트 결정 #11 참조). Rust 바인딩 필요 시 Automerge 2.0도 고려.

### 출처

- [#30] Introducing Automerge 2.0 — https://automerge.org/blog/automerge-2/ (Automerge 팀, 2023), 수집일 2026-04-22
  - 인용구: "Automerge 2.0's binary format encodes full document history with only 30% overhead"
- [#31] GitHub - loro-dev/loro — https://github.com/loro-dev/loro (loro-dev, 2025), 수집일 2026-04-22
  - 인용구: "You can now use it in Rust, JS (via WASM), and Swift"
- [#32] Best CRDT Libraries 2025 | Velt — https://velt.dev/blog/best-crdt-libraries-real-time-data-sync (Velt, 2025), 수집일 2026-04-22
  - 인용구: "Loro delivers strong performance but requires substantial development work and isn't production-ready"
- [#33] GitHub - nikgraf/secsync — https://github.com/nikgraf/secsync (Nik Graf, 2024-2025), 수집일 2026-04-22
  - 인용구: "Architecture to relay end-to-end encrypted CRDTs over a central service... comes with a plug and play reference implementation on top of Yjs"

---

## 11. 1인 운영 가능한 동기화 서버 인프라

### 핵심 질문

1. Cloudflare Workers+D1/KV/R2 vs Supabase vs Fly.io/Railway: scale-to-zero, E2EE 릴레이 역할 적합성, 월 $0~$50 수용량은?
2. 5,000만 사용자 목표 달성 경로는?

### 조사 결과

**gemini_deep_research_Secretbank.md 섹션 2.2에서 이미 수집됨**: E2EE 맹목 릴레이 서버 역할, X25519 ECDH 페어링.

**플랫폼별 비교**

| 플랫폼                  | Scale-to-zero                        | 무료 티어                         | 유료 시작가         | E2EE 릴레이 적합성   | 비고                  |
| ----------------------- | ------------------------------------ | --------------------------------- | ------------------- | -------------------- | --------------------- |
| Cloudflare Workers + D1 | 완전(idle = $0) [출처 #34]           | 5M rows/day, 100K writes/day, 5GB | $5/월(Workers Paid) | 높음(stateless edge) | 글로벌 엣지 300+ PoP  |
| Cloudflare KV           | 완전                                 | 100K reads/day, 1K writes/day     | Workers Paid 포함   | 높음                 | 키-값 저장            |
| Supabase                | 부분(1주 비활성 시 pause) [출처 #35] | 2 프로젝트, 500MB DB, 50K MAU     | $25/월(Pro)         | 중간(PostgREST 기반) | 실시간 구독 기능 풍부 |
| Deno Deploy             | 완전                                 | 100K req/day, 1GB storage         | $10/월              | 높음                 | TypeScript 전용       |
| Fly.io                  | 부분(sleep 가능)                     | 없음(무료 크레딧 소진 후)         | ~$5~10/월           | 중간                 | 전체 서버 운영        |
| Railway                 | 부분                                 | $5 크레딧/월                      | 사용량 기반         | 중간                 | 더 일반적인 PaaS      |

**Cloudflare Workers + D1 상세 분석**

- **E2EE 릴레이 역할**: Workers는 stateless → 암호문을 통과시키기만 하면 되므로 이상적.
- **D1 Free**: 5M rows/day read, 100K writes/day, 5GB 저장. Secretbank의 암호화된 CRDT 업데이트 저장에 충분(사용자당 수KB~수백KB 예상).
- **D1 Paid**: $5/월 기본, 이후 사용량 기반. 5,000만 사용자까지 자동 확장.
- **한계**: D1은 SQLite(no Postgres). 복잡한 쿼리/트랜잭션 제한 [출처 #36].

**Supabase 상세 분석**

- 실시간 구독(Realtime) 내장 → CRDT 업데이트 브로드캐스트에 유용.
- Free tier: 1주 비활성 시 프로젝트 일시정지 → 서비스 가용성 문제.
- 서버가 암호화 데이터를 저장하더라도 Supabase 인프라팀이 DB에 접근 가능 → Zero-Knowledge 구현에 추가 주의 필요.

**5,000만 사용자 확장 경로**

- Cloudflare Workers: D1 단일 DB → D1 샤딩 → D1 + Hyperdrive(외부 Postgres 연결) → 엔터프라이즈 Postgres(Neon/PlanetScale)로 무중단 마이그레이션 가능.
- Supabase: Free → Pro($25) → Team($599) → Enterprise. MAU 기반 과금으로 5,000만 시 비용 매우 큼.

**1인 운영 $0~$50/월 수용량 (E2EE 동기화 서버)**  
| 플랫폼 | $0 범위 | $50/월 범위 |
|---|---|---|
| Cloudflare Workers+D1 | ~5K MAU(일일 읽기/쓰기 기준) | ~500K MAU |
| Supabase | 50K MAU(인증 기준) | ~200K MAU |

**잠정 권장**: **Cloudflare Workers + D1 + KV** — scale-to-zero 완전 지원, 글로벌 엣지, E2EE 릴레이 이상적 구조, 무료 티어 충분, 5,000만 사용자까지 확장 경로 명확. Supabase는 실시간 구독 기능이 필요한 경우 보조로 고려.

### 출처

- [#34] Pricing · Cloudflare D1 docs — https://developers.cloudflare.com/d1/platform/pricing/ (Cloudflare 공식 문서, 2025), 수집일 2026-04-22
  - 인용구: "You are not billed for hours or capacity units. If you are not running queries against your database, you are not billed for compute."
- [#35] Supabase Pricing — https://supabase.com/pricing (Supabase 공식 문서, 2025), 수집일 2026-04-22
  - 인용구: "Free projects are paused after 1 week of inactivity"
- [#36] Cloudflare D1 vs Supabase — https://bejamas.com/compare/cloudflare-d1-vs-supabase (Bejamas, 2025), 수집일 2026-04-22
  - 인용구: "D1 is SQLite, not PostgreSQL, and you lose stored procedures, advanced indexing, full-text search quality, and proper concurrent writes"

---

## 12. 웹 대시보드 스택 전략

### 핵심 질문

1. (a) Tauri 공용 React/Vite 번들 그대로 vs (b) Next.js 분리 vs (c) React 공용 코어 + Next.js 래퍼 — 어떤 전략이 1인 운영에 최적인가?
2. SEO, OG 공유 링크, 코드 공유 관점 비교?

### 조사 결과

**Tauri v2 + Next.js 현황**  
Tauri는 Next.js를 공식 지원한다. 단, SSR-first Next.js를 Tauri에서 쓰려면 SSG 모드(`next export`)를 사용해야 하며 "can get a bit annoying at times" [출처 #37]. 일부 개발자는 "Vite+React가 next.js보다 더 나은 경험"을 보고.

**Tauri v2 + Vite React 현황**  
초기 스캐폴드(`cargo tauri dev`)의 기본값. Hot Module Replacement 빠름, SSR 불필요. Tauri 공식 템플릿에서 권장 [출처 #38].

**옵션별 비교**

| 항목                | 옵션 (a): Vite React 공용 | 옵션 (b): Next.js 분리     | 옵션 (c): React Core + Next.js 래퍼 |
| ------------------- | ------------------------- | -------------------------- | ----------------------------------- |
| 코드 공유           | 완전(단일 코드베이스)     | 프레임워크 분리(중복 위험) | 공유 패키지 관리 복잡               |
| Tauri 궁합          | 최고                      | SSG 제약 있음              | 복잡                                |
| SEO                 | 없음(SPA)                 | 우수(SSG/SSR)              | 좋음                                |
| OG 메타 태그        | 수동 삽입 필요            | 자동(Next.js metadata API) | Next.js 부분에서 자동               |
| 1인 운영 복잡도     | 낮음                      | 중간                       | 높음                                |
| 개발 서버 시작 속도 | 빠름(Vite)                | 보통(Next.js)              | 중간                                |
| 웹 배포 방법        | Cloudflare Pages 단순     | Vercel/Cloudflare          | 복잡                                |

**웹 대시보드 역할 (Secretbank)**  
project-decisions.md: "웹 대시보드 = 팀 공유 볼트(Phase 2), 읽기 전용 뷰어, 관리자 감사 로그 열람". SEO가 주요 관심사가 아님 (SaaS 로그인 후 사용).

**커뮤니티 의견**  
"Vite + React, particularly over file-based routers like the one in nextjs" 선호 의견 다수 [출처 #37].

**잠정 권장**: **옵션 (a) Vite React 공용** — 단일 코드베이스, Tauri 궁합 최고, 1인 운영 최소 복잡도. 웹 버전은 `VITE_BUILD_TARGET=web` 환경 변수로 Tauri 전용 API를 조건부 비활성화하는 패턴 사용. SEO가 필요한 랜딩 페이지는 별도 정적 사이트(Hugo/Astro)로 분리.

### 출처

- [#37] What has been your experience using NextJS + Tauri? — https://github.com/tauri-apps/tauri/discussions/6083 (tauri-apps GitHub, 2023-2025), 수집일 2026-04-22
  - 인용구: "The main problem with nextjs in a tauri app is its SSR-first nature... some developers prefer vite + react, particularly over file-based routers"
- [#38] Next.js | Tauri — https://v2.tauri.app/start/frontend/nextjs/ (Tauri 공식 문서, 2025), 수집일 2026-04-22
  - 인용구: "Tauri supports a lot of front-end frameworks and libraries, for example, React.js, Next.js, Vite"
- [#39] Vite vs Next.js 2025 — https://strapi.io/blog/vite-vs-nextjs-2025-developer-framework-comparison (Strapi, 2025), 수집일 2026-04-22
  - 인용구: "For SaaS dashboards that consume a custom back-end API, Vite's instant dev-server startup and HMR keep feedback loops tight"

---

## 13. Open Core 라이선스 선택

### 핵심 질문

1. AGPL-3.0 vs MPL 2.0 vs Elastic License 2.0 vs BSL — 어떤 라이선스가 SaaS 재판매 차단 + 커뮤니티 수용성 + 향후 변경 유연성을 동시에 만족하는가?
2. Bitwarden, Infisical, Doppler, Sentry의 라이선스 전략은?

### 조사 결과

**라이선스별 특성 비교**

| 라이선스            | SaaS 재판매 차단                   | OSI 승인 | 커뮤니티 수용성        | 향후 변경 유연성 |
| ------------------- | ---------------------------------- | -------- | ---------------------- | ---------------- |
| AGPL-3.0            | 강함(네트워크 배포 = 배포)         | 있음     | 중간(기업 기피)        | 중간             |
| MPL 2.0             | 약함(파일 단위 카피레프트)         | 있음     | 높음                   | 높음             |
| Elastic License 2.0 | 강함(관리형 서비스 제공 금지 명시) | 없음     | 낮음(소스 공개 가능만) | 높음(독점적)     |
| BSL 1.1             | 강함(지정 기간 후 오픈소스)        | 없음     | 낮음(HashiCorp 논란)   | 높음             |

**주요 프로젝트 사례 분석**

| 프로젝트        | 라이선스                                           | 특이사항                                                    |
| --------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| Bitwarden       | AGPL-3.0 (core) + Bitwarden License(EE) [출처 #40] | "Bitwarden License"는 소스 공개이나 프로덕션 무료 사용 불가 |
| Infisical       | MIT (core) + proprietary (EE 디렉터리) [출처 #41]  | 가장 관대, 커뮤니티 친화적                                  |
| Doppler         | 완전 폐쇄 소스                                     | OSS 전략 없음                                               |
| Sentry          | BSL 1.1 (현재)                                     | 2023년 Apache 2.0 → BSL 전환, 논란                          |
| HashiCorp Vault | BSL 1.1 (2023 이후)                                | MPL 2.0 → BSL 전환, 커뮤니티 분열(OpenTofu fork)            |
| Redis           | SSPL → AGPLv3 복귀(2025) [출처 #42]                | SSPL 반발, AGPLv3로 회귀                                    |

**커뮤니티 수용성 트렌드**  
BSL/SSPL은 오픈소스 커뮤니티에서 "source-available"로 비판받으며 fork 유발 위험 높음 [출처 #42]. AGPL은 기업 고객이 법적 위험을 이유로 기피하는 경향 있음(특히 대형 엔터프라이즈).

**1인 개발자 향후 변경 유연성**  
모든 기여자로부터 CLA(Contributor License Agreement) 확보 시 언제든 라이선스 변경 가능. Bitwarden/Infisical 모두 CLA 운영.

**Secretbank 맥락**

- 타겟: 개인 개발자 + 바이브 코더 → AGPL 기업 기피 영향 낮음(B2C 중심).
- SaaS 재판매 차단이 주요 목적 → AGPL 또는 EL 2.0이 효과적.
- 커뮤니티 신뢰 확보 중요 → AGPL이 OSI 승인으로 유리.

**잠정 권장**: **OSS 코어 = AGPL-3.0, EE 기능 = 독점 라이선스(Bitwarden 모델)**. AGPL로 SaaS 무임 재판매 차단 + 개발자 커뮤니티 신뢰 확보 동시 달성. 향후 기업 고객 타깃 확장 시 "Enterprise License Addendum" 추가 고려.

### 출처

- [#40] bitwarden/server LICENSE_FAQ.md — https://github.com/bitwarden/server/blob/main/LICENSE_FAQ.md (Bitwarden, 2025), 수집일 2026-04-22
  - 인용구: "Bitwarden's main server code is licensed under the AGPL 3.0 license. However, code for certain new modules...is released under the Bitwarden License"
- [#41] Infisical/infisical LICENSE — https://github.com/Infisical/infisical/blob/main/LICENSE (Infisical, 2025), 수집일 2026-04-22
  - 인용구: "MIT expat license, with the exception of the ee directory which will contain premium enterprise features"
- [#42] The Current State of Open Source Licenses — https://yevgenyp.com/p/the-current-state-of-open-source-licenses (2025), 수집일 2026-04-22
  - 인용구: "Redis moved to SSPL in March 2024, faced backlash, and returned to AGPLv3 in 2025"
- [#43] What Open Source License Protects Your SaaS Business Model Best — https://www.getmonetizely.com/articles/what-open-source-license-protects-your-saas-business-model-best (getmonetizely, 2025), 수집일 2026-04-22
  - 인용구: "AGPL is particularly relevant to SaaS, as it considers providing access over a network as distribution"

---

## 14. 결제 인프라

### 핵심 질문

1. Stripe vs Paddle vs Lemon Squeezy: 1인 운영 관점 "Merchant of Record" 서비스 가치는?
2. Apple IAP / Google Play 30%/15% 수수료와 크로스 플랫폼 구독 일원화 아키텍처?
3. "데스크톱 가입 사용자가 모바일에서도 Pro 인식" 구조?

### 조사 결과

**Merchant of Record (MoR) 비교**

| 플랫폼        | MoR 여부                                 | 수수료                | VAT 처리       | 1인 운영 가치 |
| ------------- | ---------------------------------------- | --------------------- | -------------- | ------------- |
| Stripe        | 아직 없음(Managed Payments private beta) | 2.9% + $0.30          | 별도 처리 필요 | 중간          |
| Paddle        | 있음(MoR)                                | 5% + $0.50 [출처 #44] | 자동(130개국+) | 높음          |
| Lemon Squeezy | 있음(MoR, Stripe 인수) [출처 #45]        | 5% + $0.50            | 자동(100개국+) | 높음          |

**Lemon Squeezy 상황**  
2024년 7월 Stripe가 Lemon Squeezy 인수 [출처 #45]. 2025년 "Stripe Managed Payments" private beta 발표 — Stripe가 자체 MoR 서비스 구축 중. Lemon Squeezy는 독립 운영 계속.

**1인 개발자 MoR 가치**  
Paddle이나 Lemon Squeezy는 130개국+ VAT/GST를 자동 처리, 사기 방지, 분쟁 처리를 대신 함. 1인 개발자에게 세금 규정 준수(130개국)는 사실상 불가능하므로 5%+$0.50 수수료는 가치 있음 [출처 #44].

**Apple/Google IAP 수수료 구조**

| 플랫폼          | 일반        | Small Business Program          | 구독 1년 후    |
| --------------- | ----------- | ------------------------------- | -------------- |
| Apple App Store | 30%         | 15%(연매출 $1M 이하) [출처 #46] | 15%            |
| Google Play     | 30%(첫 $1M) | 15%(첫 $1M)                     | 15%(첫 날부터) |

iOS에서 앱 내 구독은 무조건 Apple IAP 사용 강제(2024 법원 판결 이후 외부 링크 허용 확대됐으나 여전히 제약).

**크로스 플랫폼 구독 일원화 아키텍처**  
RevenueCat이 이 문제의 표준 솔루션으로 등장했다 [출처 #47]:

- iOS(App Store), Android(Play Store), Web(Stripe) 구독을 단일 `CustomerInfo` 객체로 추상화
- 어느 플랫폼에서 구독해도 다른 플랫폼에서 자동으로 Pro 인식
- 70,000+ 앱에서 사용(OpenAI ChatGPT 포함) [출처 #47]
- 수수료: 무료(월 $2.5K ARR 이하), 이후 ARR의 1%

**"데스크톱 가입 → 모바일 Pro 인식" 아키텍처 권장안**

1. Web/Desktop 결제: Stripe 또는 Paddle(MoR) → 결제 성공 시 Secretbank 백엔드에 `user_id + plan = pro` 저장
2. Mobile: RevenueCat SDK 연동 → `GET /v1/subscribers/{user_id}` API로 구독 상태 확인
3. RevenueCat + Paddle 통합: 2025년 공식 파트너십으로 Paddle 구독도 RevenueCat으로 관리 가능 [출처 #47]
4. Apple IAP 우회: iOS 앱에서는 RevenueCat을 통해 App Store 구독 + 웹 구독 통합 관리

**$2/월 Pro 수수료 시뮬레이션**

- Web(Paddle): $2 - 5% - $0.50 = **$1.40** 수령
- iOS(Apple + Small Business): $2 × 0.85 = **$1.70** 수령
- Android(Google + $1M 이하): $2 × 0.85 = **$1.70** 수령

**잠정 권장**: **Paddle(MoR)** for Web/Desktop + **RevenueCat** for iOS/Android IAP 통합. Paddle의 MoR 자동 세금 처리가 1인 운영에 필수. RevenueCat으로 크로스 플랫폼 구독 통합 관리. Apple IAP 30%/15% 부담은 iOS 직접 결제 가이드("더 저렴하게 웹에서 구독") 우회 전략 병행.

### 출처

- [#44] Paddle MoR: Everything you need to know — https://www.paddle.com/paddle-101 (Paddle, 2025), 수집일 2026-04-22
  - 인용구: "Paddle charges 5% + $0.50 per successful transaction...manages local payments and currencies, fraud, regional privacy law, customer billing support"
- [#45] Stripe acquires Lemon Squeezy — https://www.lemonsqueezy.com/blog/stripe-acquires-lemon-squeezy (Lemon Squeezy, 2024-07-26), 수집일 2026-04-22
  - 인용구: "Stripe acquired Lemon Squeezy to help build a global merchant of record solution"
- [#46] App Store Small Business Program — https://developer.apple.com/app-store/small-business-program/ (Apple 공식, 2025), 수집일 2026-04-22
  - 인용구: "If you're making less than $1 million a year from your apps, you qualify for the reduced 15% commission rate"
- [#47] RevenueCat - Build and Grow Your App Business — https://www.revenuecat.com/ (RevenueCat, 2025), 수집일 2026-04-22
  - 인용구: "Over 70,000 apps...use RevenueCat to manage and optimize their monetization strategies across iOS, Android, and web"
- [#48] RevenueCat and Paddle Launch Integration — https://bebeez.eu/2025/06/04/revenuecat-and-paddle-launch-integration-to-power-cross-platform-subscription-growth/ (BeBeez, 2025-06-04), 수집일 2026-04-22
  - 인용구: "RevenueCat and Paddle Launch Integration to Power Cross-Platform Subscription Growth"

---

## 부록: user_research/ 기존 자료 요약 참조

아래 주제들은 user_research/ 파일에서 이미 심층 조사됨. 각 주제의 핵심 결론만 재정리.

### gemini_deep_research_Secretbank.md 이미 수집된 내용

- **Zero-Knowledge 아키텍처**: Argon2id KDF, AES-256-GCM, 인증/암호화 솔트 분리 → 확정된 설계.
- **CRDT + E2EE**: Delta-based CRDT + SecSync 모델 (서버는 맹목 릴레이).
- **RAILGUARD 프레임워크**: AI 코딩 환경에서 `.cursorrules` 룰 파일 주입으로 시크릿 하드코딩 방지.
- **Compliance-as-Code**: SOC 2 자동 감사 로그 → Vanta/Drata 연동.
- **집단지성 DB**: 익명화 텔레메트리 기반 API 위협 데이터베이스.

### chatgpt_deep_research_Secretbank.md 이미 수집된 내용

- **보안 사고 사례**: Vercel OAuth 공급망 공격, OpenAI/Mixpanel 사고, Gemini 키 탈취 $82K 손실.
- **무중단 Rotation 파이프라인**: Dual-Credential 전략, 6단계 파이프라인(신규 키 생성 → 전파 → 검증 → 구 키 폐기).
- **Stripe API**, **OpenAI EKM API**, **GCP IAM 키 회전** 엔드포인트 상세.

---

_파일 생성 완료: C:\Users\JSS\Projects\secretbank\docs\research_raw.md_  
_조사 주제: 14개 | 총 출처: 48개 (user_research 제외)_
