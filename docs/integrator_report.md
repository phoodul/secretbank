# Integrator Report — API Vault

> 작성자: Integrator Agent (claude-sonnet-4-6)
> 작성일: 2026-04-22
> 입력 자료: docs/project-decisions.md, docs/research_raw.md, docs/ux_research.md, user_research/initial_idea.md, user_research/gemini_deep_research_apivault.md, user_research/chatgpt_deep_research_apivault.md
> Gate 1 의사결정 지원 문서

---

## 0. 요약 — Executive Summary

**프로젝트 정의:** API Vault는 "Bitwarden for APIs, with Dependency Graph" — API 키의 저장·회전·영향도 분석·사고 대응을 통합한 Local-First E2EE 멀티 디바이스 플랫폼. 타깃은 전문 개발자와 바이브 코더, 수익은 Freemium($2/월 Pro).

**가장 중요한 의사결정 7개:**

| 항목                                 | 결론                                                           | 신호등 |
| :----------------------------------- | :------------------------------------------------------------- | :----- |
| 볼트 저장(Stronghold)                | v2 기간 동안 사용 가능, v3 폐기 예정 → 추상화 레이어 설계 필수 | 🟡     |
| 그래프 라이브러리(React Flow)        | MVP~1000노드 범위에서 확정 채택                                | 🟢     |
| CRDT 동기화(Yjs + SecSync)           | 프로덕션 검증, E2EE 공식 통합 존재                             | 🟢     |
| 동기화 서버(Cloudflare Workers + D1) | scale-to-zero, 글로벌 엣지, E2EE 릴레이 최적                   | 🟢     |
| 결제(Paddle MoR + RevenueCat)        | 1인 운영 VAT 문제 해결, 크로스 플랫폼 구독 통합                | 🟢     |
| Tauri v2 모바일                      | Stable 출시됐으나 플러그인 성숙도 불균일 → 데스크톱 우선 권장  | 🟡     |
| 디자인 시스템(Option A: shadcn/ui)   | Tauri 검증, 접근성 자동, 1인 유지보수 최적                     | 🟢     |

**Gate 1 승인 후 진행 방향:** 아키텍처의 큰 방향은 모두 조사 결과로 뒷받침된다. 승인 시 planner는 (1) Stronghold 추상화 레이어 설계, (2) 데스크톱 MVP 우선순위 확정, (3) 무료/Pro 경계선 세부 결정의 3가지 열린 질문을 task.md에 반영해야 한다.

---

## 1. 확정된 전제 재확인

아래는 docs/project-decisions.md에 이미 확정된 사항이다. 이후 모든 섹션은 이 전제를 기정사실로 하여 상세화·구체화한다. 뒤집는 권고는 포함하지 않는다.

| 항목        | 확정 내용                                                   |
| :---------- | :---------------------------------------------------------- |
| 포지셔닝    | "Bitwarden for APIs, with Dependency Graph"                 |
| 플랫폼      | 데스크톱(Win/Mac/Linux) + 모바일(iOS/Android) + 웹 대시보드 |
| 스택        | Tauri v2 + Rust + React + TypeScript                        |
| 타겟        | 전문 개발자 + 바이브 코더                                   |
| 수익        | Freemium + $2/월 Pro                                        |
| OSS         | Open Core (AGPL-3.0 + EE 독점)                              |
| 팀          | 1인 운영 + AI 보조                                          |
| 보안        | Zero-Knowledge + E2EE 멀티 디바이스 동기화                  |
| 감사 로그   | ed25519 서명 체인, append-only                              |
| 볼트 암호화 | Tauri Stronghold (XChaCha20-Poly1305, Argon2id KDF)         |
| 개발 기간   | 고정 없음, Pro 구독 $2/월 가치가 있는 최소 기능 기준        |

---

## 2. 기술 스택 종합 판단 (CRAAP 적용)

### 2.1 볼트 & 비밀 저장 (Stronghold + OS Keyring 계층)

**요약:** Tauri Stronghold(v2)는 XChaCha20-Poly1305 + Argon2id KDF로 API 키를 로컬 파일에 암호화 저장한다. OS Keyring은 Stronghold 볼트를 열기 위한 마스터 키를 보관한다. 둘은 상호 배타적이 아닌 계층적 조합이다 [#1, #2].

**CRAAP 평가:** 🟡 조건부 채택

- Currency (4/5): Tauri 공식 문서 2025-12 기준 [#1], GitHub Discussion 2024~2025 [#2]. 최신.
- Relevance (5/5): 프로젝트 핵심 보안 요구사항에 직결.
- Authority (5/5): Tauri 공식 문서, Tauri 메인테이너 직접 발언 [#2].
- Accuracy (4/5): 두 출처가 서로 교차 검증. "Full support" 표기와 "deprecated 예정" 발언이 공존 — 이 모순은 아래 리스크에서 설명.
- Purpose (5/5): 공식 문서 + GitHub Discussion. 중립적.

**핵심 모순:** Tauri 공식 문서는 Android/iOS Full support를 표기하지만 [#1], Tauri 메인테이너는 "stronghold will be deprecated and removed in v3"라고 명시했다 [#2]. 두 출처 모두 1차 공식 소스다.

**해결 방향:** v2 기간 동안은 Stronghold를 사용하되, 볼트 I/O 로직을 추상화 레이어(trait 또는 별도 모듈)로 격리하여 v3 전환 시 Stronghold 의존성만 교체 가능하도록 설계한다. 대체 후보는 `age` 암호화 + SQLCipher 또는 자체 파일 암호화.

**잠정 권장:** Stronghold (마스터 키는 OS Keyring) — v2 기간 사용. 추상화 레이어 필수.

**리스크 & 완화책:**

- v3 폐기 시점 미정 → Tauri GitHub Release Notes를 분기별 모니터링.
- Android에서 OS Keyring 지원 갭 [#2] → 모바일에서는 Stronghold가 직접 마스터 키 역할도 담당하는 구조로 보완.
- tauri-plugin-keyring은 커뮤니티 플러그인 [#3] → 공식 전환 전까지 hwchen/keyring-rs(Rust crate) 직접 사용 검토.

---

### 2.2 그래프 시각화 (React Flow)

**요약:** MVP~1000노드 범위의 API 의존성 그래프에 React Flow(@xyflow/react)가 최적이다. HTML DOM 기반으로 커스텀 노드(Blast Radius 하이라이트, 상태 배지) 자유도가 가장 높다 [#4, #6].

**CRAAP 평가:** 🟢 채택

- Currency (5/5): 2025년 v12 활발히 유지 [#4]. 최신.
- Relevance (5/5): initial_idea.md에서 이미 선택. 커스텀 노드가 핵심 기능.
- Authority (5/5): xyflow 공식 GitHub + 공식 성능 문서 [#6].
- Accuracy (4/5): Cytoscape.js와 성능 비교 검증됨 [#5, #7]. 한계점(1만 노드 이상) 명시.
- Purpose (5/5): 공식 문서. 편향 없음.

**잠정 권장:** React Flow (dagre 레이아웃, MVP). 1만 노드 이상 필요 시 Cytoscape.js 전환.

**리스크 & 완화책:**

- 수백 노드에서 `React.memo` + Zustand 셀렉터 최적화 없으면 성능 저하 가능 [#6] → 노드 컴포넌트 설계 시 memoization 패턴 강제.
- Reaflow는 유지보수 모드 → 선택지에서 제외.

---

### 2.3 Incident Feed 소스 매트릭스

**요약:** NVD CVE API 2.0, GitHub Advisory DB, CISA KEV, 주요 SaaS 상태 페이지 RSS(10개), HIBP v3를 1차 통합 목표로 설정한다 [#8~#11]. NVD RSS 피드는 2025-08 폐기됐으므로 REST API 2.0 사용 필수.

**CRAAP 평가:** 🟢 채택

- Currency (5/5): NIST 2023-2025 [#8], 상태 페이지 2025 [#9~#11]. 특히 RSS 폐기 경고가 2026년 기준 최신.
- Relevance (5/5): Incident Feed는 Pro 기능의 핵심 차별점.
- Authority (5/5): NIST 공식 [#8], 서비스별 공식 상태 페이지 [#10].
- Accuracy (4/5): gemini_deep_research와 일치. 레이트 리밋 수치 교차 검증됨.
- Purpose (5/5): 공식/중립 문서.

**잠정 권장:** NVD CVE API 2.0(2시간 증분 쿼리) + GitHub Advisory(24시간) + SaaS 상태 RSS(5분) + CISA KEV(일일). HIBP는 이메일 유출 연동에 활용.

**리스크 & 완화책:**

- NVD 레이트 리밋(키 없이 50req/30s) → API 키 등록 필수, Circuit Breaker 패턴 구현.
- Twitter/X 모니터링(Pro 기능) → API v2 유료화로 비용 발생. 초기에는 RSS/공식 채널만.

---

### 2.4 GitHub 통합 (GitHub App + 스코프)

**요약:** GitHub App(fine-grained permissions, 설치 토큰)이 OAuth App 대비 보안·레이트 리밋(15,000 req/hr) 모두 우수하다 [#12~#14]. Secret Scanning + Actions Secrets + 코드 contents:read만 요청하는 최소 권한 구성이 권장된다.

**CRAAP 평가:** 🟢 채택

- Currency (5/5): GitHub 공식 문서 2025 [#12, #13, #14]. 2025-06-24 신규 필드까지 반영.
- Relevance (5/5): GitHub 커넥터는 무료 tier에 1개 포함된 핵심 기능.
- Authority (5/5): GitHub 공식 REST API 문서.
- Accuracy (5/5): 세 출처가 서로 다른 관점(Secret Scanning, Actions Secrets, 레이트 리밋)에서 일관성 있게 교차 확인됨.
- Purpose (5/5): 공식 문서.

**잠정 권장:** GitHub App (설치 토큰, fine-grained). 레이트 리밋 3배 + 최소 권한 원칙 동시 달성.

**리스크 & 완화책:**

- Secret Scanning API는 저장소/조직 관리자 권한 필요 → 사용자 안내 UX 설계 필요.
- GitHub Actions Secrets 쓰기 권한은 `repo` 스코프 없이도 가능한지 확인 필요 (fine-grained 권한 목록 추가 검증 권장).

---

### 2.5 LLM 키 관리 (Phase 2) — Rust 직접 추상화 vs 서버 분리

**요약:** Phase 2 기능으로 우선순위 낮음. LiteLLM은 Python 패키지로 Tauri에서 직접 통합 불가 [#15]. Vercel AI SDK는 키 관리 기능 없음 [#16]. Rust reqwest 직접 추상화가 Zero-Knowledge 아키텍처와 완벽 정합한다.

**CRAAP 평가:** 🟡 조건부 (Phase 2 진입 시 재검토)

- Currency (4/5): liteLLM 문서 2025 [#15], TrueFoundry 비교 2026 [#16].
- Relevance (2/5): Phase 2 기능. MVP에 영향 없음.
- Authority (3/5): TrueFoundry [#16]는 경쟁사 블로그로 편향 가능성 있음.
- Accuracy (3/5): LiteLLM 의존성 크기(100MB+) 주장이 독립 교차 검증 부족.
- Purpose (3/5): TrueFoundry 비교 글은 마케팅 의도 혼재.

**잠정 권장:** Phase 2에서 LLM 관리 기능 추가 시 Rust reqwest 기반 직접 추상화로 시작. LiteLLM은 별도 서버 서비스 형태로만 고려.

**리스크 & 완화책:**

- Phase 2 범위이므로 MVP에서 불필요. 초기 아키텍처에 Connector trait 확장 지점만 예약.

---

### 2.6 감사 로그 (Hash Chain + ed25519)

**요약:** SHA-256 Hash Chain + ed25519 서명 방식이 API Vault의 감사 로그 규모(수천~수만 건)에서 구현 단순성, Rust 생태계 지원, 외부 의존성 없음 측면에서 최적이다 [#18, #19]. Sigstore/Rekor는 외부 서비스 의존과 오프라인 사용 불가 문제로 제외.

**CRAAP 평가:** 🟢 채택

- Currency (5/5): Rust 구현 사례 2025 [#18, #19]. Sigstore 공식 문서 2025 [#20].
- Relevance (5/5): 이미 project-decisions.md에 확정. 구현 방법론 검증.
- Authority (4/5): NousResearch 구현 사례 [#18], Ashish-Barmaiya/attest [#19]. 실제 구현 사례.
- Accuracy (4/5): Hash Chain vs Merkle Tree 비교 분석 합리적. Rust 생태계 지원 다수 사례로 검증.
- Purpose (5/5): 기술 분석, 편향 없음.

**잠정 권장:** `ed25519-dalek` crate, 각 로그 엔트리에 `prev_hash: [u8; 32]` + `signature: ed25519::Signature` 포함. 향후 필요 시 Merkle tree 업그레이드 가능한 구조.

**리스크 & 완화책:**

- O(n) 전체 체인 검증 비용 → 대용량 로그에서 사용자에게 검증 진행 상황 표시 UX 필요.
- 오프라인 환경에서도 완전히 작동 → 외부 Rekor 불필요.

---

### 2.7 OS Keyring 플랫폼별 차이

**요약:** Windows(DPAPI, ~2.5KB 제한), macOS(Keychain + Secure Enclave, Face/Touch ID), Linux(libsecret, 데스크톱 환경 의존), iOS(Keychain, ~4KB 소프트 제한, Biometric), Android(Keystore, TEE, 지문 변경 시 키 무효화)가 각각 다르다 [#21~#23].

**CRAAP 평가:** 🟢 채택 (플랫폼별 차이점 인지 후 구현)

- Currency (5/5): Apple 2025, Android 2025, Apple Developer Forums [#21~#23].
- Relevance (5/5): 마스터 키 저장이 보안 모델의 핵심.
- Authority (5/5): Apple 공식 문서, Android 공식 문서, Apple Developer Forums.
- Accuracy (5/5): 플랫폼별 수치(2.5KB, 4KB, 16MB)가 공식 출처에서 직접 확인됨.
- Purpose (5/5): 공식 기술 문서.

**잠정 권장:** 데스크톱은 `hwchen/keyring-rs` crate. 모바일은 Stronghold(v2 기간) 또는 플랫폼 네이티브 API 직접 구현. 모든 플랫폼에서 추상화 레이어로 통일된 인터페이스 제공.

**리스크 & 완화책:**

- Linux headless 환경(CI/CD 서버)에서 keyring daemon 없어 실패 가능 → 폴백 전략(암호화 파일 또는 환경변수 경고) 명시.
- Android 지문 변경 시 `KeyPermanentlyInvalidatedException` → 재등록 UX 흐름 사전 설계.

---

### 2.8 Python 사이드카 판단

**요약:** LiteLLM 등 대형 Python 패키지를 Tauri 사이드카로 번들링 시 배포 크기가 수백MB에 달하고 플랫폼별 빌드가 복잡하다 [#24~#26]. Phase 2 LLM 기능은 서버 분리 방식이 현실적.

**CRAAP 평가:** 🔴 재검토 (MVP에서 불필요, Phase 2 진입 시 재결정)

- Currency (4/5): 2025년 검증 사례 존재 [#25, #26].
- Relevance (1/5): MVP 범위 외.
- Authority (3/5): aiechoes.substack.com [#25]는 개인 블로그. 다만 실제 구현 사례 공유로 신뢰도 있음.
- Accuracy (3/5): 배포 크기 수백MB 주장의 정확한 수치 미검증.
- Purpose (4/5): 기술 경험 공유, 편향 낮음.

**잠정 권장:** MVP에서 사이드카 불필요. Phase 2에서 LLM 기능 시 Cloudflare Worker 서버 분리 우선 고려.

**리스크:** Phase 2 결정 사항이므로 지금 아키텍처에 영향 없음.

---

### 2.9 Tauri v2 모바일 성숙도 (Stronghold 모바일 지원 포함)

**요약:** Tauri v2 모바일은 2024-10-02 Stable 출시 [#27]. App Store 배포 공식 지원 [#28]. 실사용 경험(4개 앱 개발)에서 "전반적으로 만족"이나 Android 파일 시스템 일부 제한, Rust 컴파일 시간 병목 확인 [#29].

**CRAAP 평가:** 🟡 조건부 채택

- Currency (5/5): 2024-10-02 Stable 출시 [#27], 개발자 회고 2025-10-05 [#29].
- Relevance (5/5): 플랫폼 결정에 직결.
- Authority (4/5): Tauri 공식 블로그 [#27, #28] + 개인 개발자 실사용 경험 [#29].
- Accuracy (3/5): 실제 출시 앱 사례가 소수. iOS 앱스토어 심사 경험담 부족. 커뮤니티 검증 더 필요.
- Purpose (5/5): 공식 문서 + 중립 개인 회고.

**핵심 경고:** 공식 문서는 "플러그인 API can possibly break in minor versions"를 명시했다 [#27]. Stronghold 모바일 지원은 공식 문서 기준 있으나 실제 사용 사례 커뮤니티 검증이 부족하다.

**잠정 권장:** 데스크톱 MVP 우선 출시 → 모바일 포팅. 모바일에서 Stronghold 의존 전에 소규모 PoC(Proof of Concept) 선행 권장.

**리스크 & 완화책:**

- 플러그인 마이너 버전 breaking change → 플러그인 버전을 `Cargo.lock`으로 고정.
- iOS 앱스토어 심사 시간(1~2주) → 출시 일정에 충분한 버퍼 확보.
- Android 파일 시스템 제한 → `.env` 스캔 기능을 Android에서는 범위 축소.

---

### 2.10 CRDT 동기화 (Yjs + SecSync)

**요약:** Yjs + SecSync 조합이 현재 가장 검증된 E2EE CRDT 스택이다 [#30~#33]. SecSync는 Yjs 기반 레퍼런스 구현을 제공하며 NLnet 재단 지원을 받는다. Loro는 Rust-first이나 2025년 기준 자체적으로 "프로덕션 비권장" 명시 [#32].

**CRAAP 평가:** 🟢 채택

- Currency (5/5): Automerge 2023 [#30], Loro 2025 [#31], Velt 2025 [#32], SecSync 2024-2025 [#33].
- Relevance (5/5): 멀티 디바이스 E2EE 동기화가 $2/월 Pro의 핵심 기능.
- Authority (4/5): 각 라이브러리 공식 GitHub + NLnet 지원 프로젝트 [#33].
- Accuracy (4/5): Velt 비교 [#32]는 마케팅 블로그이나 Loro의 "프로덕션 비권장" 발언이 자체 공식 발언으로 독립 확인됨.
- Purpose (4/5): Velt는 경쟁 서비스이나 기술 비교 분석 자체는 공정함.

**잠정 권장:** Yjs(TypeScript/JS 레이어) + SecSync(E2EE 레이어) + Cloudflare Workers(릴레이). API 키 메타데이터는 `Y.Map`으로 모델링.

**리스크 & 완화책:**

- Yjs는 Rust 바인딩 없음 → 프론트엔드(TypeScript) 레이어에서 처리, Rust 백엔드에는 암호화된 바이트만 전달.
- Automerge 2.0은 Rust 바인딩 있으나 SecSync 공식 통합 없음 → 향후 Rust 네이티브 CRDT 필요 시 마이그레이션 경로 확보.

---

### 2.11 동기화 서버 인프라 (Cloudflare Workers + D1 + KV)

**요약:** Cloudflare Workers + D1 + KV 조합이 scale-to-zero 완전 지원, 글로벌 엣지 300+ PoP, E2EE 릴레이에 최적이다 [#34~#36]. Supabase는 1주 비활성 pause와 Pro $25/월 진입 장벽이 1인 운영에 불리하다.

**CRAAP 평가:** 🟢 채택

- Currency (5/5): Cloudflare D1 공식 2025 [#34], Supabase 공식 2025 [#35], Bejamas 비교 2025 [#36].
- Relevance (5/5): 1인 운영 + scale-to-zero + $0~$50/월 제약에 직결.
- Authority (5/5): Cloudflare 공식, Supabase 공식, Bejamas(비교 분석 전문).
- Accuracy (5/5): D1 free tier 수치(5M rows/day read, 100K writes/day)가 공식 출처에서 직접 확인. 한계점(SQLite, 복잡한 쿼리 제한)도 명시 [#36].
- Purpose (4/5): Bejamas는 호스팅 비교 서비스이나 D1 vs Supabase 비교 분석 자체는 균형적.

**잠정 권장:** Cloudflare Workers(릴레이 로직) + D1(암호화된 CRDT 스냅샷) + KV(세션, 토큰). Supabase는 실시간 구독이 필요한 경우 보조로만.

**리스크 & 완화책:**

- D1은 SQLite — 복잡한 트랜잭션/쿼리 제한 [#36] → 동기화 서버에는 단순한 암호문 CRUD만 수행. 복잡한 쿼리는 로컬 SQLite에서.
- 5000만 사용자 단계에서 D1 → Hyperdrive + 외부 Postgres 마이그레이션 경로 사전 설계.

---

### 2.12 웹 대시보드 스택 (공용 React vs 분리)

**요약:** 옵션(a) Vite React 공용(단일 코드베이스)이 Tauri 궁합 최고, 1인 운영 복잡도 최저이다 [#37~#39]. 웹 대시보드 역할이 로그인 후 읽기 중심이므로 SEO가 주요 관심사가 아니다.

**CRAAP 평가:** 🟢 채택

- Currency (5/5): Tauri GitHub Discussion 2023-2025 [#37], Tauri 공식 2025 [#38], Strapi 비교 2025 [#39].
- Relevance (5/5): 1인 운영 + 단일 코드베이스 유지보수에 직결.
- Authority (4/5): Tauri 공식 [#38] + 커뮤니티 의견 [#37]. Strapi 블로그 [#39]는 2차 자료.
- Accuracy (4/5): Next.js SSR-first 제약은 다수 개발자가 독립 확인.
- Purpose (4/5): Strapi 블로그는 약간 Vite 편향 가능성. 다만 기술적 사실은 정확.

**잠정 권장:** Vite React 공용 (`VITE_BUILD_TARGET=web` 조건부 분기). SEO 랜딩 페이지는 별도 정적 사이트(Astro/Hugo).

**리스크 & 완화책:**

- 웹 버전에서 Tauri API 호출 시 undefined → `window.__TAURI__` 체크 패턴 일관성 있게 적용.

---

### 2.13 라이선스 전략 (AGPL-3.0 + EE 조합)

**요약:** AGPL-3.0(OSS 코어) + 독점 라이선스(EE 기능) 조합이 SaaS 무임 재판매 차단 + 개발자 커뮤니티 신뢰 확보를 동시에 달성한다 [#40~#43]. Redis의 SSPL 실패(2024 도입 → 2025 AGPLv3 회귀)가 비OSI 라이선스의 위험을 입증했다 [#42].

**CRAAP 평가:** 🟢 채택

- Currency (5/5): Bitwarden/Infisical 2025 [#40, #41], Redis AGPLv3 회귀 2025 [#42], getmonetizely 2025 [#43].
- Relevance (5/5): 비즈니스 모델과 커뮤니티 전략에 직결.
- Authority (4/5): 공식 LICENSE 파일 [#40, #41] + 트렌드 분석 블로그 [#42, #43].
- Accuracy (5/5): 사례들이 서로 교차 검증됨. Redis 사례가 BSL 실패를 독립 확인.
- Purpose (4/5): getmonetizely [#43]은 약한 비즈니스 편향 가능성. 분석 자체는 균형적.

**잠정 권장:** OSS 코어 = AGPL-3.0, EE 기능(동기화 서버, 자동 rotation, 프리미엄 커넥터) = 독점. CLA 도입으로 향후 라이선스 변경 유연성 확보.

**리스크 & 완화책:**

- AGPL은 기업 법무팀이 기피하는 경향 → B2C 중심이므로 초기에는 영향 미미. Team 기능 출시 시 "Enterprise License Addendum" 추가 고려.
- CLA 없이 오픈소스 기여 수령 시 라이선스 변경 불가 → 초기부터 CLA 설정 필수.

---

### 2.14 결제 인프라 (Paddle MoR + RevenueCat)

**요약:** Paddle(MoR, Web/Desktop)이 130개국+ VAT 자동 처리로 1인 운영에 필수적이다 [#44]. RevenueCat이 iOS/Android IAP를 단일 `CustomerInfo`로 추상화, 크로스 플랫폼 구독 인식을 해결한다 [#47]. RevenueCat + Paddle 공식 파트너십 존재 [#48].

**CRAAP 평가:** 🟢 채택

- Currency (5/5): Paddle 2025 [#44], Lemon Squeezy 인수 2024 [#45], Apple 2025 [#46], RevenueCat 2025 [#47, #48].
- Relevance (5/5): 1인 운영 + 크로스 플랫폼 구독이 Pro 기능의 핵심 인프라.
- Authority (5/5): 각 서비스 공식 문서 + Apple 공식 [#46].
- Accuracy (4/5): 수수료 수치(Paddle 5%+$0.50, Apple 15/30%)가 공식에서 직접 확인.
- Purpose (4/5): Paddle [#44], RevenueCat [#47]는 자사 서비스 홍보. 단, 수치는 공식 요금표.

**$2/월 Pro 수수료 시뮬레이션:**

- Web(Paddle MoR): $2 - 5% - $0.50 = **$1.40** 수령 (30% 절감 목표)
- iOS(Apple Small Business 15%): $2 × 0.85 = **$1.70** 수령
- Android(Google Play 15%): $2 × 0.85 = **$1.70** 수령

**잠정 권장:** Paddle(Web/Desktop) + RevenueCat(iOS/Android) + RevenueCat-Paddle 공식 통합.

**리스크 & 완화책:**

- iOS에서 외부 결제 유도(웹 구독 더 저렴) 전략 → Apple 가이드라인 위반 주의. 2024 판결 이후 외부 링크 허용 범위 재확인 필요.
- Lemon Squeezy Stripe 인수 [#45] → Paddle 대안으로 Lemon Squeezy도 유효. 단, 안정성 리스크.

---

## 3. UX / 디자인 시스템 종합 판단

### 3.1 Option A/B/C CRAAP 평가

| 항목             | Option A (Security Minimal)              | Option B (Warm Professional) | Option C (Power Condensed) |
| :--------------- | :--------------------------------------- | :--------------------------- | :------------------------- |
| CRAAP 신호등     | 🟢                                       | 🟡                           | 🟡                         |
| 주요 근거 출처   | UX [#1, #2, #7, #14]                     | UX [#24, #25]                | UX [#22]                   |
| Tauri 검증       | 검증됨 (`agmmnn/tauri-ui`, 1500+ stars)  | 커뮤니티 예제만              | 없음                       |
| 커뮤니티 규모    | shadcn/ui 80,000+ stars                  | Mantine 27,000+ stars        | Ark UI 4,000+ stars        |
| 1인 유지보수     | 낮음-중간 (컴포넌트 소유)                | 낮음 (npm 업데이트)          | 높음 (직접 스타일 작성)    |
| 두 페르소나 공존 | Progressive Disclosure로 자연스러운 공존 | 두 모드 명시적 분리          | Simple Mode 별도 설계 필요 |
| 번들 크기        | 작음 (copy-paste)                        | 큼 (~200kB Mantine)          | 가장 작음                  |

**Option B 조건부 채택 조건:** 배터리 포함 컴포넌트(DataTable, 알림, 폼)의 초기 개발 속도를 우선한다면 고려. 단, Mantine의 CSS variables를 Tailwind v4 토큰 시스템과 통합하는 추가 작업이 필요하다.

**Option C 조건부 채택 조건:** Pro Mode 전문 개발자 경험을 극대화하는 방향으로 Graph 화면 전용으로 채택 가능. UX researcher의 혼합 전략(Option A 기반 + C의 Graph 뷰 조밀함)이 이 방향이다.

### 3.2 두 페르소나 공존 전략 타당성 검토

UX researcher가 제안한 **Progressive Disclosure 3단계** 구조(기본 카드 뷰 → 상세 메타 → Graph/Blast Radius/Kill Switch)는 Firefox UX 연구 [UX #16]와 Grammarly/Cursor 인라인 제안 모델로 검증된 패턴이다. API Vault 맥락에서 타당성이 높다.

**검증 포인트:**

- 바이브 코더가 "겁먹지 않는" 보안 경고 톤 — UX [#15, #16] 뒷받침됨.
- "드롭 & 스캔" 온보딩 — Tauri 파일 시스템 API로 구현 가능하나, 실제 `.env` 파일 스캔 정확도(엔트로피 분석, 접두사 패턴)는 구현 품질에 의존.
- Cmd+K Command Palette — `cmdk` 라이브러리와 shadcn/ui 공식 통합 가이드 존재.

### 3.3 멀티 디바이스 UX 일관성 구현의 현실성

Tailwind v4 `@theme` CSS variables 기반 토큰 공유 전략은 기술적으로 타당하다 [UX #7]. Tauri WebView, 모바일 WebView, 웹 브라우저 모두 동일 CSS variables를 참조한다.

**현실적 도전:**

- 모바일 터치 타겟 최소 24×24px (WCAG 2.5.8) — 조밀한 Graph 뷰와 충돌. 모바일에서 Graph는 읽기 전용 리스트 뷰로 대체하는 UX researcher 권장안이 현실적.
- 데스크톱 Cmd+K vs 모바일 하단 네비게이션 — 플랫폼별 인터랙션 패턴 다름. 공통 컴포넌트에서 플랫폼 분기 필요.

### 3.4 접근성·i18n 초기 범위 권장

WCAG 2.2 AA를 최소 목표로 한다. Radix UI 기반이면 키보드 내비게이션, ARIA 속성이 대부분 자동 처리된다 [UX #10, #11].

**i18n:** MVP는 영어만, `react-i18next` 키 구조로 하드코딩 금지. Phase 2에서 한국어·일본어·중국어 간체·포르투갈어(브라질) 추가.

**그래프 접근성:** `aria-label="API 의존성 그래프"`, 키보드로 노드 탐색(Tab/Enter/Space), Blast Radius 강조에 색상 외 패턴(점선, 두께) 추가.

### 3.5 잠정 추천 검증: Option A + Option C 하이브리드

UX researcher의 최종 권장(Option A 기반 + C의 일부)에 대한 integrator 2차 검증:

**동의하는 이유:**

1. Tauri + shadcn/ui 조합의 실제 검증 사례(`agmmnn/tauri-ui`)가 다른 옵션보다 압도적으로 강력하다.
2. 1인 운영에서 breaking change 없는 컴포넌트 소유 방식이 npm 의존 방식보다 유리하다.
3. Progressive Disclosure가 두 페르소나를 동일 컴포넌트에서 처리하는 가장 경제적인 방법이다.

**추가 권고:**

- Graph 화면에서만 Option C의 조밀한 노드 패딩 적용 → 전문 개발자 경험 강화.
- Mantine의 DataTable이 필요한 경우(Inventory 대용량 키 리스트) → `@tanstack/react-table` + shadcn/ui 패턴으로 해결.

---

## 4. 교차 이슈 (Cross-cutting Concerns)

### 4.1 보안 통합 매트릭스: Stronghold ↔ CRDT ↔ OS Keyring ↔ E2EE 상호작용

```
사용자 마스터 패스프레이즈
       │
       ▼
  OS Keyring (마스터 키 보관)
       │
       ▼
  Stronghold (API 키 값 암호화 저장, XChaCha20-Poly1305)
       │
       ▼
  메타데이터 → CRDT (Y.Map)
       │
       ▼ SecSync E2EE 암호화 (AES-GCM + 로컬 대칭키)
  암호화된 CRDT 델타 바이트
       │
       ▼
  Cloudflare Workers (맹목 릴레이)
       │
       ▼
  Cloudflare D1 (암호문 + nonce 저장)
```

**중요 설계 요점:**

- Stronghold에 저장된 API 키 실제 값은 CRDT로 동기화하지 않는다. CRDT는 메타데이터(이름, 발급처, 만료일, 프로젝트 연결)만 처리한다.
- API 키 값 자체의 멀티 디바이스 동기화는 별도 E2EE 채널로 처리한다 (Gemini 섹션 2.2의 X25519 ECDH 페어링 모델).
- 서버(Cloudflare Workers)는 메타데이터도, 키 값도 복호화할 수 없다.

### 4.2 1인 운영 가능성 체크

| 스택 결정               | 1인 운영 가능성 | 온콜 부담                            | 비고                                     |
| :---------------------- | :-------------- | :----------------------------------- | :--------------------------------------- |
| Cloudflare Workers + D1 | 높음            | 낮음 (scale-to-zero, 자동 장애 복구) | Workers 장애 시 Cloudflare Status 확인만 |
| Supabase Free tier      | 낮음            | 중간 (1주 pause 대응 필요)           | 사용하지 않기로 함                       |
| Stronghold v3 폐기      | 중간 위험       | 중간 (마이그레이션 필요)             | 추상화 레이어로 완화                     |
| RevenueCat              | 높음            | 낮음                                 | 구독 관리 자동화                         |
| Paddle MoR              | 높음            | 낮음 (VAT 자동 처리)                 |                                          |
| React Flow              | 높음            | 낮음 (MIT, 활발한 커뮤니티)          |                                          |
| shadcn/ui               | 높음            | 낮음 (컴포넌트 소유)                 | breaking change 없음                     |

**결론:** 전체 스택이 1인 운영에 설계되어 있다. 최대 위험 요소는 Stronghold v3 폐기 시 마이그레이션 비용이다.

### 4.3 모바일·웹·데스크톱 기능 분담 매트릭스

| 기능                    | 데스크톱    | 모바일                   | 웹 대시보드        |
| :---------------------- | :---------- | :----------------------- | :----------------- |
| 볼트 저장·조회          | 전체        | 조회만                   | 읽기 전용(Phase 2) |
| Graph 편집              | 전체        | 읽기(리스트 뷰)          | 읽기(Phase 2)      |
| Blast Radius 시뮬레이션 | 있음        | 없음                     | 없음               |
| Kill Switch             | 있음        | 있음(긴급, 바이오메트릭) | 있음(Phase 2)      |
| Incident Feed           | 전체        | 알림 수신                | 열람(Phase 2)      |
| .env 스캔               | 있음        | 제한적(Android)          | 없음               |
| Rotation 실행           | 있음        | 없음                     | 없음               |
| Audit Log               | 보기+Export | 없음                     | 열람(Phase 2)      |
| 바이오메트릭 인증       | 선택적      | 필수                     | 없음               |
| 팀 공유 볼트            | Phase 2     | Phase 2                  | Phase 2            |
| Cmd+K Command Palette   | 있음        | 없음(하단 네비)          | 없음               |
| RAILGUARD 룰 파일 생성  | 있음        | 없음                     | 없음               |

### 4.4 무료 vs Pro 경계선 재검토

현재 project-decisions.md의 Pro 기능 목록을 바이브 코더 페르소나 관점에서 검토:

**바이브 코더가 $2/월 결제하게 만드는 진짜 동기:**

1. **멀티 디바이스 동기화** — 맥북에서 키 추가, 아이폰에서 확인. 바이브 코더는 PC·모바일 간 전환이 잦음. ✅ 최강 동기
2. **Incident Feed 프리미엄 + Push 알림** — "내 OpenAI 키에 영향 있는 사고 발생" 실시간 알림. 보안 지식 부족한 바이브 코더에게 핵심. ✅ 강력 동기
3. **자동 rotation** — "교체 버튼 하나"로 GitHub Actions, Vercel, .env 일괄 업데이트. 바이브 코더의 수동 작업 공포 해결. ✅ 강력 동기
4. **Kill Switch** — 사고 발생 시 즉시 대응. 공포 기반 구매 동기. ✅ 중간 동기
5. **Blast Radius 시뮬레이션** — 전문 개발자 중심. 바이브 코더에게는 부차적. 🔶 보조 동기

**재검토 의견:** Kill Switch를 무료 tier에 포함하는 것을 검토할 가치가 있다. Kill Switch는 "갑작스러운 위기 대응"이므로, Pro 가입 전 사용자에게도 제공하면 신뢰 확보 효과가 크다. 단, "Kill Switch 이후 새 키 자동 배포(rotation)"는 Pro 유지.

### 4.5 수익 손익 간이 모델

| 단계  | Pro 사용자 수 | 월 MRR (Paddle 기준, $1.40 수령) | Cloudflare Workers+D1 비용 | 순이익        |
| :---- | :------------ | :------------------------------- | :------------------------- | :------------ |
| Early | 100           | $140                             | ~$0 (무료 tier)            | ~$140         |
| 1K    | 1,000         | $1,400                           | ~$5 (Workers Paid)         | ~$1,395       |
| 10K   | 10,000        | $14,000                          | ~$50~200                   | ~$13,800+     |
| 100K  | 100,000       | $140,000                         | ~$500~2,000                | ~$138,000+    |
| 1M    | 1,000,000     | $1,400,000                       | ~$5,000~20,000             | ~$1,380,000+  |
| 10M   | 10,000,000    | $14,000,000                      | ~$50,000~200,000           | ~$13,800,000+ |

**인프라 비용 비율:** 1K~1M 사용자 구간에서 인프라 비용이 MRR의 1% 미만. Cloudflare의 사용량 기반 과금 구조가 초기 비용 최소화에 결정적이다.

**전제 조건:** 전체 사용자 중 Pro 전환율 2~5%로 가정. 1M 총 사용자 → 20K~50K Pro가 현실적 중기 목표.

---

## 5. 오픈 질문 (사용자 확인 필요 — Gate 1)

다음 8개 항목은 Gate 1에서 사용자가 결정해야 한다. planner가 task.md를 작성하기 전에 결정이 필요하다.

**Q1. Kill Switch를 무료 tier에 포함할지**

- 포함 시: 신뢰 확보 + 바이브 코더 진입 장벽 제거. Pro 전환 동기 소폭 약화.
- 미포함 시: 사고 대응 기능을 Pro 전용으로 유지. 도덕적 논란 가능성.
- integrator 의견: Kill Switch 자체(revoke)는 무료, "Kill Switch 이후 새 키 자동 배포"는 Pro로 분리하는 절충안 검토.

**Q2. 모바일 MVP 포함 여부**

- 포함 시: 출시까지 시간 증가, Tauri 모바일 플러그인 안정성 불확실성 추가.
- 미포함 시: 데스크톱 MVP 먼저, 모바일은 Phase 1.5.
- integrator 의견: 데스크톱 우선 출시 후 모바일 포팅이 1인 운영 리스크 관리에 유리. 단, Pro 구독의 핵심 동기(멀티 디바이스)는 모바일 없이 반쪽이 된다는 긴장감 존재.

**Q3. 앱스토어 우회 수수료 전략 (Apple IAP 15~30% vs 웹 결제 유도)**

- iOS 앱 내: RevenueCat + Apple IAP (15%, Small Business). 단순, 사용자 편리.
- 웹 결제 유도: "웹에서 구독하면 더 저렴"(Apple 제약 확인 필요). 운영 복잡도 증가.
- 결정 전 확인 필요: 2024 Apple 판결 이후 외부 결제 링크 허용 범위 법률 검토.

**Q4. 라이선스 AGPL vs MPL 최종 결정** (project-decisions.md에서 Research 후 결정으로 남아있음)

- integrator 권장: AGPL-3.0. B2C 중심이므로 기업 기피 영향 미미. SaaS 재판매 차단에 더 강력.

**Q5. GitHub 커넥터를 무료 tier에 포함할 범위**

- 현재 결정: 무료 tier에 GitHub 커넥터 1개.
- 미결정: Secret Scanning 읽기만? Actions Secrets 쓰기도? .env 스캔도?
- integrator 의견: 무료는 "읽기(조회·스캔)"만, "쓰기(Actions Secrets 자동 갱신)"는 Pro.

**Q6. Stronghold v3 대체 기술 사전 결정 여부**

- 지금 결정 필요 없음: v3 출시 시점이 불확실하며 현재 v2로 충분.
- 사전 설계 필요: 추상화 레이어를 지금 어떻게 설계할지.
- integrator 권장: `VaultStorage` trait를 정의하여 Stronghold 구현체를 교체 가능한 구조. 이는 planner의 architecture.md에 반영 요청.

**Q7. 웹 대시보드 Phase 2 진입 시점 결정**

- 현재: 팀 공유 볼트 Phase 2.
- 미결정: 웹 읽기 전용 뷰어는 Phase 1 포함 가능한가? (데스크톱 Pro 사용자가 웹에서 조회만 하는 기능)
- integrator 의견: 웹 뷰어를 Phase 1 후반부에 포함하면 "멀티 디바이스" 가치를 모바일 없이도 일부 제공 가능. Q2와 연계.

**Q8. RAILGUARD 기능의 MVP 포함 여부**

- 포함 시: .cursorrules 룰 파일 자동 생성이 바이브 코더 페르소나 핵심 차별점.
- 미포함 시: 구현 복잡도 감소, Phase 2로 미룸.
- integrator 의견: 룰 파일 생성 자체는 단순(텍스트 템플릿 + 파일 쓰기). MVP에 포함해도 구현 비용 낮음. Gemini 섹션 4.1의 독점 해자(Moat) 포인트이기도 함.

---

## 6. Phase 2.5·2.6 준비 — planner에게 넘길 핵심 가이드 (MoSCoW)

### Must (반드시 구현 — MVP 포함)

- 로컬 볼트 (Stronghold + OS Keyring 계층, 추상화 레이어 포함)
- 수동 API 키 등록·조회 (Inventory UI, shadcn/ui 기반)
- SQLite 데이터 모델 (Issuer → Credential → Usage → Project → Deployment → URL)
- React Flow 그래프 (dagre 레이아웃, 커스텀 노드, 기본 Blast Radius 하이라이트)
- ed25519 감사 로그 (append-only Hash Chain)
- NVD CVE + GitHub Advisory + SaaS 상태 페이지 RSS 기본 Incident Feed
- GitHub App 커넥터 (Secret Scanning 읽기 + Actions Secrets 읽기, 무료 1개)
- 보안 경고 UX (Progressive Disclosure, 겁주지 않는 인라인 제안 톤)
- "드롭 & 스캔" 온보딩 (.env 파일 자동 스캔)
- AGPL-3.0 라이선스 적용 + CLA 설정

### Should (가능하면 MVP에 포함)

- Kill Switch (revoke, 2단계 확인 UI)
- RAILGUARD .cursorrules 룰 파일 자동 생성
- Cmd+K Command Palette (cmdk + shadcn/ui)
- 보안 점수 시각화 (색상 기반, tooltip 세부 내역)
- HIBP v3 이메일 유출 감시 연동
- 앱 업데이트 (tauri-plugin-updater + minisign)
- i18n 키 구조 (react-i18next, 영어 우선)

### Could (Phase 2로 미룸)

- 멀티 디바이스 E2EE 동기화 (Yjs + SecSync + Cloudflare Workers)
- Paddle MoR + RevenueCat 결제 인프라
- Pro 자동 rotation 파이프라인 (Dual-Credential, 6단계)
- 커넥터 팩 (OpenAI, Stripe, AWS, Vercel)
- Tauri v2 모바일 포팅 (iOS/Android)
- 웹 대시보드 (읽기 전용 뷰어)
- Blast Radius 시뮬레이션 (가상 폐기 영향 예측)
- Incident Feed 프리미엄 (AI 요약, Push 알림)
- 감사 로그 Export (Pro)
- CISA KEV 통합

### Won't (Phase 3 이후 또는 폐기)

- 팀 공유 볼트 + SSO + RBAC + SCIM (Team 플랜)
- LiteLLM Python 사이드카 통합
- Sigstore/Rekor 외부 투명성 로그
- 집단지성 API 위협 데이터베이스 (4.2 Moat) — 사용자 수 확보 후 가능
- Dynamic Secrets (HashiCorp Vault 모델) — 아키텍처 복잡도 고려 후 재결정
- 컴플라이언스 자동화 (Vanta/Drata 연동) — Enterprise 전환 후

---

## 7. CRAAP 평가 서머리 테이블

| 주제                          | 신호등 | 근거 출처                 | 주요 리스크                                           |
| :---------------------------- | :----- | :------------------------ | :---------------------------------------------------- |
| Stronghold + OS Keyring 계층  | 🟡     | [#1, #2, #3]              | Stronghold v3 폐기 예정 → 추상화 레이어 필수          |
| React Flow (그래프)           | 🟢     | [#4, #5, #6, #7]          | 1만 노드 이상 성능 한계                               |
| Incident Feed 소스            | 🟢     | [#8, #9, #10, #11]        | NVD RSS 폐기 완료, REST API 2.0 전환 필수             |
| GitHub App 통합               | 🟢     | [#12, #13, #14]           | Actions Secrets 쓰기 fine-grained 권한 추가 확인 필요 |
| LLM 키 관리 (Phase 2)         | 🟡     | [#15, #16, #17]           | Phase 2 재검토. LiteLLM 사이드카 비권장               |
| 감사 로그 Hash Chain          | 🟢     | [#18, #19, #20]           | O(n) 검증 비용 (대용량 시 UX 고려)                    |
| OS Keyring 플랫폼별 차이      | 🟢     | [#21, #22, #23]           | Android 지문 변경 시 키 무효화 UX 필요                |
| Python 사이드카               | 🔴     | [#24, #25, #26]           | MVP 외. Phase 2에서 서버 분리 방식으로 대체           |
| Tauri v2 모바일               | 🟡     | [#27, #28, #29]           | 플러그인 안정성 불균일. 데스크톱 우선 권장            |
| CRDT (Yjs + SecSync)          | 🟢     | [#30, #31, #32, #33]      | Loro 프로덕션 비권장 확인. Yjs로 확정                 |
| Cloudflare Workers + D1       | 🟢     | [#34, #35, #36]           | D1 SQLite 한계 — 동기화에는 단순 CRUD만               |
| 웹 대시보드 (Vite React 공용) | 🟢     | [#37, #38, #39]           | Tauri API 조건부 분기 패턴 일관성 유지                |
| 라이선스 AGPL-3.0             | 🟢     | [#40, #41, #42, #43]      | CLA 없이 기여 수령 시 라이선스 변경 불가              |
| 결제 Paddle + RevenueCat      | 🟢     | [#44, #45, #46, #47, #48] | Apple IAP 우회 전략 법률 확인 필요                    |
| UX Option A (shadcn/ui)       | 🟢     | UX [#1, #2, #7, #14]      | DataTable 별도 연동(TanStack Table) 필요              |
| UX Option B (Mantine)         | 🟡     | UX [#24, #25]             | 번들 크기, Tailwind v4 통합 추가 작업                 |
| UX Option C (Ark UI)          | 🟡     | UX [#22]                  | 초기 구현 비용 높음, Tauri 검증 없음                  |

**신호등 분포:**

- 🟢 채택: 12개
- 🟡 조건부: 4개 (Stronghold 추상화, LLM Phase 2 재검토, Tauri 모바일 데스크톱 우선, UX B/C)
- 🔴 재검토: 1개 (Python 사이드카 — MVP 외)

---

## 8. 참고 자료 (신뢰도 순)

### Tier 1 — 공식 문서 (최고 신뢰도)

| #      | 출처                              | URL                                                                             |
| :----- | :-------------------------------- | :------------------------------------------------------------------------------ |
| #1     | Stronghold \| Tauri 공식          | https://v2.tauri.app/plugin/stronghold/                                         |
| #8     | NVD Future Changes \| NIST        | https://nvd.nist.gov/general/news/changes-to-feeds-and-apis                     |
| #12    | GitHub Secret Scanning REST API   | https://docs.github.com/en/rest/secret-scanning/secret-scanning                 |
| #13    | GitHub Actions Secrets REST API   | https://docs.github.com/en/rest/actions/secrets                                 |
| #14    | GitHub REST API Rate Limits       | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api |
| #20    | Rekor - Sigstore 공식             | https://docs.sigstore.dev/logging/overview/                                     |
| #21    | Apple Keychain + Face/Touch ID    | https://developer.apple.com/documentation/localauthentication/...               |
| #23    | Android Keystore System           | https://developer.android.com/privacy-and-security/keystore                     |
| #24    | Tauri Sidecar 공식 문서           | https://v2.tauri.app/develop/sidecar/                                           |
| #27    | Tauri 2.0 Stable Release 블로그   | https://v2.tauri.app/blog/tauri-20/                                             |
| #28    | Tauri App Store 공식              | https://v2.tauri.app/distribute/app-store/                                      |
| #34    | Cloudflare D1 Pricing 공식        | https://developers.cloudflare.com/d1/platform/pricing/                          |
| #35    | Supabase Pricing 공식             | https://supabase.com/pricing                                                    |
| #38    | Tauri + Next.js 공식              | https://v2.tauri.app/start/frontend/nextjs/                                     |
| #40    | Bitwarden LICENSE_FAQ.md          | https://github.com/bitwarden/server/blob/main/LICENSE_FAQ.md                    |
| #41    | Infisical LICENSE                 | https://github.com/Infisical/infisical/blob/main/LICENSE                        |
| #44    | Paddle MoR 공식                   | https://www.paddle.com/paddle-101                                               |
| #46    | Apple Small Business Program      | https://developer.apple.com/app-store/small-business-program/                   |
| UX #7  | Tailwind CSS v4 공식              | https://tailwindcss.com/blog/tailwindcss-v4                                     |
| UX #10 | WCAG 2.2 공식 명세                | https://www.w3.org/TR/WCAG22/                                                   |
| UX #14 | Radix Colors 공식                 | https://www.radix-ui.com/colors                                                 |
| UX #16 | Mozilla Firefox UX 보안 경고 연구 | https://blog.mozilla.org/ux/2019/03/designing-better-security-warnings/         |

### Tier 2 — GitHub 공식 레포·커뮤니티 검증 (높은 신뢰도)

| #      | 출처                                              |
| :----- | :------------------------------------------------ |
| #2     | tauri-apps GitHub Discussion #7846                |
| #3     | HuakunShen/tauri-plugin-keyring                   |
| #4     | xyflow/xyflow GitHub                              |
| #6     | React Flow 성능 최적화 공식 문서                  |
| #11    | Have I Been Pwned API v3                          |
| #18    | NousResearch Rust 감사 로그 구현 사례             |
| #19    | Ashish-Barmaiya/attest                            |
| #22    | Apple Developer Forums (iOS Keychain 용량)        |
| #26    | dieharders/example-tauri-v2-python-server-sidecar |
| #29    | Erik Horton 개발자 Tauri v2 모바일 회고           |
| #30    | Automerge 2.0 공식 블로그                         |
| #31    | loro-dev/loro GitHub                              |
| #33    | nikgraf/secsync GitHub                            |
| UX #1  | agmmnn/tauri-ui GitHub                            |
| UX #17 | React Flow dagre 공식 예제                        |
| UX #18 | React Flow 성능 공식 문서                         |
| UX #22 | chakra-ui/ark GitHub                              |

### Tier 3 — 기술 분석 블로그·비교 자료 (중간 신뢰도, 편향 주의)

| #      | 출처                                         | 편향 주의 사항                           |
| :----- | :------------------------------------------- | :--------------------------------------- |
| #5     | Cytoscape.js 공식                            | 자사 성능 강조 가능성                    |
| #7     | deepwiki Cytoscape 성능                      | 비공식 deepwiki                          |
| #9     | talonx/service-provider-status-links         | 커뮤니티 관리 목록, 업데이트 주기 불확실 |
| #15    | liteLLM 공식 문서                            | 자사 서비스 홍보                         |
| #16    | TrueFoundry Vercel AI 비교                   | 경쟁사 마케팅 편향                       |
| #17    | agenta.ai LLM Gateway 비교                   | 경쟁 서비스                              |
| #32    | Velt CRDT 비교                               | 경쟁 실시간 협업 서비스                  |
| #36    | Bejamas D1 vs Supabase                       | 호스팅 비교 서비스                       |
| #37    | tauri-apps GitHub Discussion (커뮤니티 의견) | 개인 의견 혼재                           |
| #39    | Strapi Vite vs Next.js                       | Strapi CMS 편향 가능성                   |
| #42    | yevgenyp.com 라이선스 트렌드                 | 개인 블로그                              |
| #43    | getmonetizely.com                            | SaaS 비즈니스 컨설팅 편향                |
| #45    | Lemon Squeezy 인수 공식 발표                 | 자사 발표                                |
| #47    | RevenueCat 공식                              | 자사 홍보                                |
| #48    | BeBeez.eu RevenueCat-Paddle                  | 금융 미디어, 신뢰도 중간                 |
| UX #2  | untitledui.com React 라이브러리 비교         | UI 전문 블로그                           |
| UX #3  | midrocket.com UX 트렌드 2026                 | 디자인 에이전시                          |
| UX #4  | LogRocket Linear 디자인 분석                 | 개발 도구 회사                           |
| UX #8  | LogRocket Progressive Disclosure             | 개발 도구 회사                           |
| UX #23 | makersden.io React UI 라이브러리 비교        | 기술 블로그                              |

---

_문서 끝_
