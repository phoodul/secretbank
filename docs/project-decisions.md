# Project Decisions

본 문서는 API Vault 프로젝트의 확정된 핵심 결정 사항을 시간순으로 기록한다.
**내용은 근거 없이 변경하지 않는다.** 방향 전환이 발생하면 "갱신" 섹션을 추가하고 기존 결정의 상태를 명시한다.

---

## [2026-04-22] 문서 갱신 정책 — task.md 태스크 상태 추적 의무화

- **배경:** 지금까지 태스크(T001~T022) 구현이 완료됐으나 `docs/task.md` 에 완료 상태나 커밋 해시 매핑이 전혀 없는 채로 세션이 종료될 뻔했다. 사용자가 다른 프로젝트에서도 동일한 누락을 겪었음을 지적.
- **결정:** Orchestrator 는 다음 규칙을 준수한다.
  1. 각 태스크의 commiter 가 커밋을 만든 **직후** `docs/task.md` 의 "진행 현황" 표에 한 줄 추가 (Task ID · 제목 · 완료일 · 커밋 해시).
  2. 같은 시점에 마일스톤 목록 표의 `Status` 컬럼 (⏳ 대기 / 🔄 N/M 진행 / ✅ 완료) 갱신.
  3. 세션 종료 또는 단계 전환(마일스톤 경계, Gate 통과) 직전에 task.md 최신 여부 반드시 확인.
- **영향:**
  - 글로벌 `C:\Users\JSS\.claude\CLAUDE.md` 의 "세션 시작 시", "작업 완료 전" 체크리스트에 `docs/task.md` 항목 추가. 이로써 다른 프로젝트에도 동일 규칙 적용.
  - 프로젝트 `CLAUDE.md` 에 "태스크 완료 즉시 docs/task.md 갱신" 섹션 신설.
  - 본 세션 종료 전 T001~T022 의 완료 기록을 task.md 에 일괄 추가 (22줄, 커밋 해시 7종: 855c33c, da0e5ae, de3706d, 77c8c18, 3c7d12d, df43b55, 09b1079, c8b2c1e, 2ac1674, 57959f7, 9d6841c).

---

## [2026-04-22] 개발 환경 정책 (Windows SAC/Defender + 문제 해결 프로토콜 + 배포 서명 전략)

### A. Windows Defender 실시간 보호 제외 경로 (이미 적용됨)

- **결정:** 로컬 개발자(Windows)는 `C:\Users\JSS\Projects\api-vault\src-tauri\target` 을 Windows Defender 실시간 보호의 제외 경로로 추가한다.
- **수동 실행 (관리자 권한 PowerShell):**
  ```powershell
  Add-MpPreference -ExclusionPath 'C:\Users\JSS\Projects\api-vault\src-tauri\target'
  ```
- **원복:** `Remove-MpPreference -ExclusionPath 'C:\Users\JSS\Projects\api-vault\src-tauri\target'`
- **상태:** 2026-04-22 사용자 적용 완료.

### A-2. Windows Smart App Control (SAC) Off — 개발자 PC 한정

- **문제:** T021+T022 진행 중 `pnpm tauri dev` 풀 빌드가 `markup5ever` 등 proc-macro 와 build script `.exe` 실행 시 `os error 4551 (ERROR_FILE_HASH_NOT_ALLOWED)` 로 차단. 진단 결과 `SmartAppControlState: On` 확인. SAC 가 서명 없는 실행 파일을 일괄 차단하여 Cargo 컴파일이 불가.
- **결정:** 개발자(나)의 Windows 11 기기에서 SAC 를 Off 로 전환한다.
  - 경로: Windows Security → App & browser control → Smart app control settings → **Off**.
  - **한 번 Off 로 전환하면 Windows 재설치 전까지 복구 불가** (Microsoft 공식 정책).
  - 재부팅 후 적용.
- **이 결정의 범위:**
  - ✅ **개발자 PC 만 해당.** 최종 사용자 배포 앱에는 영향 없음.
  - 개발자 PC 는 이미 SmartScreen, Defender 실시간 보호, UAC, Windows Firewall 이 활성 상태로 유지. SAC 이외 방어 계층은 그대로 유지.
- **대안 기록 (기각 사유):**
  - WSL2 이전 → Tauri 는 Windows 네이티브 타깃이므로 실제 앱 창은 여전히 Windows 에서 띄워야 함.
  - 레지스트리 편집 → Microsoft 비공식, Windows Update 로 재활성 위험.
  - CI 전용 빌드 → 피드백 루프가 수 분 단위 → M1~M13 전체 개발 효율 심각 저하.

### A-3. 최종 사용자 배포 시 SAC 대응 = 코드 서명 + reputation (Gate 2 Q6=A 와 일관)

- **결정:** 개발자 PC 의 SAC Off 결정은 사용자 배포에 영향을 주지 않는다. 사용자가 받는 최종 앱은 **Authenticode 서명**으로 SAC 및 SmartScreen 을 통과시킨다.
- **단계별 계획:**
  1. **M13 Release 직전:** [SignPath OSS Foundation](https://signpath.org/) 에 AGPL-3.0 공개 레포 증빙으로 신청 (무료). 승인 1~2주.
  2. **GitHub Actions 에 SignPath 연동:** `actions/signpath-action` 또는 공식 API 로 Tauri 빌드 산출물(`api-vault-setup.exe`, `.msi`) 자동 Authenticode 서명.
  3. **첫 배포 이후 reputation 축적 기간:** 다운로드 수 수십~수백 건 쌓일 때까지 SmartScreen "알 수 없는 게시자" 경고가 일부 사용자에게 뜰 수 있음. README 와 다운로드 페이지에 "More info → Run anyway" 가이드 명시.
  4. **SAC On 사용자 대응:** 소수지만 SmartScreen 경고만으로 부족할 수 있음. 대응 옵션:
     - Microsoft Store 동시 배포 (Store 앱은 SAC 자동 허용) — 심사 1~2주.
     - EV 인증서로 업그레이드 ($300~600/년) — 즉시 reputation, Gate 2 Q6 에 명시된 장기 대안.
- **배포 전 README/docs 에 명시할 안내:**
  - Windows SmartScreen 경고 우회 방법 (스크린샷 포함).
  - Smart App Control 사용자를 위한 "Store 배포 링크" 또는 "allow list 요청 방법".
  - 코드 서명 검증 방법 (`Get-AuthenticodeSignature .\api-vault-setup.exe`).
- **레퍼런스:** Bitwarden / 1Password / Obsidian 등 독립 데스크톱 앱의 초기 배포 경험 — 모두 비슷한 과정을 거침.

### B. 테스트 실행 패턴: `-p <crate>` 우선

- **결정:** `cargo test --workspace` 대신 **각 크레이트별로 `cargo test -p api-vault-<crate>`** 를 우선 사용한다. 전체 워크스페이스 테스트는 CI(Ubuntu) 에서 최종 검증.
- **이유:** A 를 적용해도 일부 환경에서 첫 컴파일 직후 바이너리 실행이 지연될 수 있음. `-p` 로 크레이트를 좁히면 캐시 히트와 재현성이 좋다.
- **영향:** implementator/tester 에이전트 호출 시 `cargo test -p <crate>` 패턴을 명시. 전체 워크스페이스 검증은 `cargo build --workspace` 와 `cargo clippy --workspace` 로 대체 (컴파일 + 정적 분석은 바이너리 실행이 없어 차단 미발생).

### C. 에러 대응 프로토콜 — "1회 자체 시도 → 실패 시 반드시 검색"

- **결정:** implementator / problem-solver / tester 가 에러를 만났을 때:
  1. **1회 자체 수정 시도.** 에러 메시지를 읽고 명백한 원인을 고친다.
  2. **실패 시 반드시 외부 검색** — WebSearch/WebFetch 로 (a) 에러 메시지 원문 인용, (b) 크레이트/라이브러리 공식 이슈 트래커, (c) Stack Overflow · GitHub Discussions · 공식 문서에서 해결책을 찾는다.
  3. **2번째 시도 후에도 실패** 하면 informer 로 사용자에게 보고하고 인간 판단을 기다린다.
- **이유:** 에이전트가 모르는 크레이트 버전 차이, 플랫폼 특이 버그, Tauri v2 변경사항 등은 추측보다 검색이 빠르고 정확. "No package info in the config file" 같은 케이스도 검색으로 T001 구조 이슈를 더 빨리 발견할 수 있었다.
- **영향:**
  - implementator 프롬프트 템플릿에 이 프로토콜을 기본 포함.
  - problem-solver 가 호출될 때 WebSearch 필수 (이미 해당 에이전트 정의에 포함).
  - 검색 질의는 구체적이어야 함: 에러 원문 + 크레이트 이름 + 버전 + 플랫폼.

---

---

## [2026-04-22] 프로젝트 정의 및 포지셔닝

- **결정:** API Vault는 "API 키 저장소"가 아니라 **"API 키 의존성 그래프(Dependency Graph) 관리 플랫폼"** 으로 포지셔닝한다. 타깃 캐치프레이즈는 **"Bitwarden for APIs, with Dependency Graph"**.
- **이유:** 기존 시크릿 매니저(Vault, 1Password, Doppler 등)는 저장/회전은 잘하지만 "어떤 키가 어느 프로젝트/URL/배포환경에 쓰이고, 교체 시 무엇이 깨지는지"를 추적하지 못한다. 이 시장 공백을 노린다.
- **영향:**
  - 단순 CRUD UI가 아니라 **Graph 시각화** + **Blast Radius 계산 엔진** + **Incident Feed 자동 매칭** + **Kill Switch** 가 핵심 기능.
  - 데이터 모델은 `Issuer → Credential → Usage → Project → Deployment → URL` 관계형 그래프로 설계.

---

## [2026-04-22] 타깃 사용자 페르소나 (Q1 확정)

- **결정:** 두 개의 주요 페르소나를 타깃으로 한다.
  1. **전문 개발자 (Power User)** — 여러 SaaS API 키를 관리해야 하는 프리랜서·인디해커·소규모 팀 개발자. 기존 시크릿 매니저의 한계를 인지하고 있음.
  2. **바이브 코더 (Vibe Coder)** — Cursor/v0/Lovable/Bolt 등 AI 보조 도구로 빠르게 앱을 만드는 비전문 빌더. **"API 키 관리의 복잡한 설정을 앱이 대신해주기를 원하는"** 사용자. 시장이 폭발적으로 성장 중인 것으로 판단.
- **구체적 요구사항 차이:**
  - 전문 개발자 → Graph, Blast Radius, Kill Switch 등 고급 기능 수요.
  - 바이브 코더 → **"복잡한 설정을 자동화해주는 가드레일"** 이 핵심. 발급처 보안 사고 자동 대응, 자동 rotation, `.env` 자동 반영 등이 더 중요.
- **이유:** AI 보조 개발 시대에 "API 키를 실제로 다루는 인구"는 전문 개발자 범위를 크게 초과한다. 바이브 코더는 보안 지식이 부족할수록 이런 자동화 도구에 대한 의존도가 크고, Gemini Deep Research의 "RAILGUARD / Cognitive Security Model" 챕터(섹션 4.1)와 정확히 맞닿는다.
- **영향:**
  - UI/UX는 **"개발자 친화 + 비개발자도 이해할 수 있는 시각화"** 를 동시에 만족해야 한다.
  - 온보딩은 **"복잡한 설정을 묻지 않고 자동 탐지/추론"** 을 지향한다 (예: 프로젝트 폴더 드롭 → `.env`/`git` 스캔으로 자동 인벤토리 구축).
  - 5000만이라는 구체 수치는 **aspirational goal**로 유지하되, KPI는 "바이브 코더가 첫 5분 안에 첫 credential을 등록할 수 있는가"에 둔다.

---

## [2026-04-22] 타깃 플랫폼 (Q2 확정) — **[갱신 전 결정 대체]**

- **결정:** **풀스택 멀티 디바이스**. Bitwarden / 1Password 모델에 가까움.
  - 데스크톱: **Windows, macOS, Linux** (Tauri v2)
  - 모바일: **iOS, Android** (Tauri v2 모바일 — Research Phase에서 성숙도 확인 필요)
  - 웹: **웹 대시보드** (뷰어·원격 Kill Switch·팀 공유 중심)
- **이전 결정 (데스크톱 전용)은 폐기.** 이유:
  - 5000만 사용자 목표 달성에 모바일 포기는 불가능 (사용자 풀의 60%+ 손실).
  - 바이브 코더 페르소나는 PC·모바일 간 컨텍스트 전환이 잦다.
  - Gemini Deep Research 섹션 2.2(Local-First + CRDT E2EE)는 명시적으로 "랩탑 + 스마트폰" 멀티 디바이스를 가정.
- **플랫폼 간 역할 분담 (잠정):**
  - **데스크톱** = 풀 기능 (Graph 편집, 코드 스캔, CI 연동, rotation 실행)
  - **모바일** = 빠른 조회, 알림 수신, 긴급 Kill Switch, Biometric 인증
  - **웹** = 팀 공유 볼트(Phase 2), 읽기 전용 뷰어, 관리자 감사 로그 열람
- **영향:**
  - 기술 스택 재검토 필요 (웹 대시보드를 Tauri 웹뷰와 별도로 Next.js/SvelteKit로 갈지, 아니면 공통 React 앱의 웹 버전으로 갈지).
  - Tauri v2 모바일 지원 성숙도(iOS/Android 알파·베타 여부)를 Research Phase에서 확정해야 한다.

---

## [2026-04-22] 기술 스택 — **[일부 갱신]**

- **확정:**
  - Shell: **Tauri v2** (Rust backend + Web frontend) — 데스크톱 확정, 모바일은 Research에서 확인
  - Backend: **Rust** (tokio 비동기, reqwest, sqlx)
  - Frontend: **React + TypeScript**
  - Styling: **Tailwind CSS + shadcn/ui** (최종 디자인 시스템은 UX Research 후 확정)
  - 메타데이터 저장: **SQLite** (로컬) + 동기화 서버(E2EE 릴레이)
  - 시크릿 값 암호화 저장: **Tauri Stronghold** (XChaCha20-Poly1305 + Argon2id)
  - 마스터 키 보관: **OS Keyring**
- **Research Phase에서 확정할 항목 (변경):**
  - Graph 시각화 라이브러리: React Flow vs Cytoscape.js vs Reaflow
  - CRDT 라이브러리: **Yjs vs Automerge vs Loro** (멀티 디바이스 E2EE 동기화용)
  - 동기화 서버 인프라: **Supabase vs Cloudflare Workers + D1 vs 자체 호스팅** (1인 운영 가능성 판단)
  - 웹 대시보드 스택: React(공용) vs Next.js 분리
  - Tauri v2 모바일 지원 성숙도
- **보안 결정 유지:**
  - 감사 로그 = ed25519 서명 체인, append-only
  - 앱 업데이트 = tauri-plugin-updater + minisign 서명 강제
  - 키 메모리 노출 = `secrecy` crate로 Zeroize, 클립보드 자동 만료 30초
  - **영지식(Zero-Knowledge) 아키텍처** — 서버는 암호문과 논스만 릴레이, 복호화 키는 서버가 절대 보지 않음 (Gemini 섹션 2.1)

---

## [2026-04-22] 수익 모델 (Q3 확정)

- **결정: Freemium**
  - **무료 (Free tier)** — 1인 사용자 대상의 핵심 기능 전체
    - 로컬 볼트, 수동 키 등록/조회
    - 단일 기기 사용 (동기화 없음)
    - 기본 Graph 보기
    - CVE/NVD 공용 Incident feed
    - GitHub 커넥터 1개
  - **Pro ($1/월 또는 $10/년)** — 프로슈머·바이브 코더·1인 프리랜서 대상 _(2026-04-25 인하)_
    - **멀티 디바이스 E2EE 동기화** (데스크톱 ↔ 모바일 ↔ 웹)
    - **자동 rotation** (무중단 Zero-Downtime 파이프라인)
    - **Incident Feed 프리미엄** (공급자 status RSS, Twitter/X 모니터링, AI 요약)
    - **Blast Radius 시뮬레이션** (가상 폐기 시 영향 예측)
    - **커넥터 팩** (AWS, OpenAI, Stripe, Vercel, Supabase, Google Cloud 등)
    - **Kill Switch**
    - **Audit Log Export**
  - **Team (Phase 2)** — **$5/seat/월** _(2026-04-25 인하: 기존 $10/seat → $5/seat)_
    - 팀 공유 볼트, SSO, RBAC, SCIM
    - Pro($1) 와 함께 동일한 가격 인하 정책: "API 키 관리" 신규 카테고리 침투 가격대로 정렬. 1Password Teams ($7.99/user) 보다 저렴.
- **이유:** 5000만 사용자 목표에 도달하려면 무료 진입 장벽 제거가 필수 (Bitwarden 모델). 2026-04-25 인하 후 $1/월 = Bitwarden Premium 과 동률, 1Password Individual ($3~5) 보다 한참 저렴한 **신규 카테고리 침투 가격**.
- **영향:**
  - 무료 tier의 기능이 충분히 쓸만해야 한다 ("유인 광고형 무료"는 바이브 코더 페르소나에게 역효과).
  - **"멀티 디바이스 동기화 + 자동 rotation" 이 $1/월 구매 동기의 두 기둥**이 되도록 설계.
  - 결제 인프라(Stripe, Apple IAP, Google Play Billing) 필요 → Research Phase에서 1인 운영 관점으로 비교.

---

## [2026-04-22] 오픈소스 전략 (Q4 확정)

- **결정: Open Core**
  - **오픈소스 (OSS)** — 로컬 코어 (볼트 저장소, 그래프 엔진, 수동 Rotation UI, 기본 Incident Feed)
  - **클로즈드 소스 (Proprietary)** — 프리미엄 커넥터 팩, E2EE 동기화 서비스, 무중단 rotation 파이프라인, 프리미엄 Incident Feed
- **이유:**
  - Bitwarden/Infisical 모델 검증됨. OSS가 **신뢰 확보 + 개발자 커뮤니티 유입 + 보안 감사** 세 가지를 동시에 해결.
  - 1인 개발자가 **프리미엄 기능만 클로즈드**로 유지하면 복제 난이도 확보 가능.
- **영향:**
  - 라이선스: OSS 부분은 **AGPL-3.0 (Bitwarden/Infisical 모델)** 또는 **MPL 2.0** 중 Research Phase에서 선택.
  - 레포지터리 구조를 처음부터 "퍼블릭 코어 + 프라이빗 프리미엄" 분리 가능한 형태로 설계.
  - 프리미엄 기능은 **별도 서버 서비스**로 구현하여 "OSS 빌드만으로는 동기화·자동 rotation 불가" 형태로 자연스런 구분.

---

## [2026-04-22] 팀 구성 및 개발 리소스 (Q5 확정)

- **결정:** **1인 개발 프로젝트로 끝까지 간다.** 극적인 성공 시에만 개발자 추가 채용 고려.
- **영향:**
  - 모든 인프라는 **매니지드 서비스 최대 활용** — 서버 관리 부담 최소화.
  - 프리미엄 기능의 백엔드는 **Cloudflare Workers + D1/KV 또는 Supabase** 같이 "scale-to-zero"가 되는 스택 우선 검토.
  - **AI 보조 개발(Claude Code, Cursor 등) 적극 활용** — 이는 바이브 코더 페르소나에 대한 dogfooding도 됨.
  - **관측성·온콜 부담이 큰 기능은 의도적으로 늦게 출시** (예: 팀 공유 볼트, SCIM).
  - 모든 의사결정에서 **"1인이 운영 가능한가?"** 가 비용·기능 우선순위의 기본 필터.

---

## [2026-04-22] 개발 기간 정책 — **[갱신 전 결정 대체]**

- **결정:** **고정된 MVP 기간 없음.** "3주 MVP" 제약은 폐기.
- **이유:** 목표가 "3주 내 출시"가 아니라 **"실용적이고 가치 있는 앱을 월 $1·년 $10 에 전 세계 사용자에게 제공"**. 품질과 실제 유용성이 출시 시점보다 우선.
- **영향:**
  - MVP 범위는 "3주에 들어가는 것"이 아니라 **"Pro 구독을 $1/월 에 결제할 가치가 있는 최소 기능"** 기준으로 재정의한다.
  - 구체적 태스크 분할은 planner가 `docs/task.md` 에 작성 (Phase 2.6).

---

## [2026-04-22] Gate 1 확정 사항 (Integrator Report 승인 후 8개 오픈 질문 결정)

### Q1 — Kill Switch 무료/Pro 경계 → **C (절충안)**

- **결정:** Kill Switch 자체 (키 revoke, 2단계 확인 UI) 는 **무료** tier 포함. "revoke 이후 새 키 자동 배포"는 **Pro** 전용.
- **이유:** 긴급 사고 대응은 신뢰 확보의 핵심이므로 무료로 제공. 사고 후 자동화 복구 (자동 rotation) 는 Pro 가치를 정당화하는 핵심 기능으로 분리.
- **영향:** Kill Switch UI 와 revoke 엔드포인트는 MVP Must, 자동 배포 파이프라인은 Phase 2 Could.

### Q2 — 모바일 MVP 포함 여부 → **A (데스크톱 + 모바일 동시 출시)** ⚠️ integrator 권장(B)과 반대

- **결정:** 데스크톱과 모바일을 **동시에 MVP에 포함**한다.
- **이유:** "3주는 중요하지 않다, 실용적이고 가치 있는 앱이 목적"이라는 사용자 방향. Pro 구독의 핵심 동기인 "멀티 디바이스 E2EE 동기화"를 반쪽으로 출시하지 않기 위함.
- **영향:**
  - MVP 범위가 **Must + Phase 2 Could** 의 상당 부분까지 확장됨. 특히 **Yjs + SecSync + Cloudflare Workers 동기화 인프라**가 MVP Must로 승격.
  - Tauri v2 모바일 플러그인 안정성 리스크(🟡)를 감수. Stronghold 모바일 동작 여부를 개발 초반에 검증 필수.
  - 개발 기간이 크게 증가. "고정 기간 없음" 정책으로 대응.

### Q3 — 앱스토어 수수료 전략 → **A (RevenueCat + Apple IAP 15% / Google Play Billing)**

- **결정:** iOS는 **Apple IAP Small Business Program (15%)**, Android는 **Google Play Billing**, 웹/데스크톱은 **Paddle MoR**. **RevenueCat** 으로 크로스 플랫폼 구독 상태 통합.
- **이유:** 단순하고 사용자 편리. 외부 결제 링크 유도는 법률 리스크와 UX 복잡도 증가. Small Business 15% 수수료는 수용 가능한 손익.
- **영향:**
  - Paddle(Merchant of Record)로 VAT/세금 자동 처리.
  - RevenueCat 월정액은 매출 $10K까지 무료, 이후 유료 전환.
  - 크로스 플랫폼 구독 동기화를 위해 **유저 계정 인증(OAuth/Passkey)** 이 Phase 1 후반부에 필요.

### Q4 — 라이선스 → **A (AGPL-3.0 + EE 독점 이중 라이선스)**

- **결정:** OSS 코어 = **AGPL-3.0**, 프리미엄/클라우드 기능 = **독점 EE(Enterprise Edition) 라이선스** (Bitwarden 모델).
- **이유:** SaaS 경쟁자의 무임 재판매를 강하게 차단. B2C 중심이므로 기업 기피 영향 미미. 커뮤니티 기여 수령은 CLA(Contributor License Agreement) 필수.
- **영향:**
  - GitHub 레포지터리에 `LICENSE` (AGPL-3.0) + `LICENSE_FAQ.md` (EE 경계 설명) 필수.
  - 기여자 CLA 자동화 (CLA Assistant 봇 등) 가 Phase 1 후반 태스크로 편입.
  - 향후 라이선스 변경(예: BUSL 전환) 가능성 대비 CLA 설정 필수.

### Q5 — GitHub 커넥터 무료 범위 → **B (읽기 무료, 쓰기 Pro)**

- **결정:** 무료 tier = Secret Scanning 조회 + `.env` 파일 스캔(읽기). Pro = Actions Secrets 자동 갱신 + PR 자동 생성(쓰기).
- **이유:** 읽기는 진입 장벽 제거 (유입·신뢰), 쓰기는 Pro 가치 정당화 기능 (자동화로 시간 절약).
- **영향:**
  - GitHub App 권한은 초기 설치 시 읽기·쓰기 모두 요청하되, 쓰기 동작은 Pro 라이선스 검증 후 실행.
  - 무료 사용자도 "이 기능은 Pro에서 1-click 자동화됩니다" 업셀 UX 노출.

### Q6 — Stronghold v3 대체 기술 사전 결정 → **B (지금은 trait 추상화만)**

- **결정:** `VaultStorage` trait 를 지금 설계하고, Stronghold 구현체를 교체 가능한 구조로 만든다. v3 대체 기술은 v3 출시 시점에 결정.
- **이유:** v3 출시 시점 불확실. 미래 결정을 지금 고정하면 오히려 잘못될 수 있음. 추상화 레이어만 있으면 마이그레이션 비용은 관리 가능.
- **영향:**
  - `src-tauri/src/vault/storage/` 디렉터리에 `trait VaultStorage` 정의. Stronghold 구현체는 `StrongholdStorage` 로 격리.
  - 단위 테스트용 `MockVaultStorage` 도 함께 제공.

### Q7 — 웹 대시보드 읽기 전용 뷰어 Phase 1 포함 → **A (포함)**

- **결정:** Phase 1 후반부에 **웹 읽기 전용 뷰어** 를 포함. URL에서 그래프 조회, Incident 알림 조회, 계정 관리(구독 상태)가 가능.
- **이유:** Q2=A(모바일 MVP 포함)와 짝을 이루어 "멀티 디바이스" 가치를 완성. 웹 뷰어는 공유 링크로 협업 트리거 기능도 됨(Phase 2 팀 기능의 기초).
- **영향:**
  - 웹 스택은 **Vite React 공용** (Tauri 번들과 소스 공유, 조건부 분기로 Tauri-only API 보호).
  - 정적 랜딩 페이지는 **Astro** 별도로 구성 (SEO·마케팅 페이지).
  - 도메인·호스팅 필요 (Cloudflare Pages 권장).

### Q8 — RAILGUARD (.cursorrules 자동 생성) MVP 포함 → **A (포함)**

- **결정:** 바이브 코더 페르소나 핵심 차별점으로 MVP Must 에 포함.
- **이유:** 구현 복잡도 낮음 (텍스트 템플릿 + 파일 쓰기). Gemini Deep Research 섹션 4.1 의 "Cognitive Security Model" 해자(Moat) 포인트와 직결.
- **영향:**
  - `.cursorrules` / `.windsurfrules` / `CLAUDE.md` / `.github/copilot-instructions.md` 등 주요 AI 에디터용 룰 파일을 자동 생성·갱신하는 템플릿 엔진 필요.
  - 프로젝트 폴더 드롭 시 자동 검출 → "이 프로젝트를 위한 AI 가드레일 룰을 생성할까요?" 제안 UX.

---

## [2026-04-22] MVP 범위 재정의 (Gate 1 이후)

**Q2=A 결정으로 MVP 범위가 기존 "데스크톱 우선" 플랜에서 크게 확장됨.** planner가 task.md 를 작성할 때 기준이 될 새 범위:

### MVP Must (Phase 1 출시 조건)

로컬 볼트 + 수동 등록 + SQLite 그래프 모델 + React Flow 그래프 + ed25519 감사 로그 + NVD/GitHub Advisory Incident Feed + GitHub 커넥터(읽기) + Progressive Disclosure UX + 드롭&스캔 온보딩 + AGPL-3.0 + **Kill Switch (revoke) + RAILGUARD 룰 파일 생성 + 데스크톱(Win/Mac/Linux) + 모바일(iOS/Android) + 웹 읽기 뷰어 + Yjs+SecSync E2EE 동기화 + Cloudflare Workers 릴레이 서버 + Paddle+RevenueCat 결제 + 유저 인증(Passkey/OAuth)**

### MVP Should (가능하면 출시 포함)

Cmd+K Command Palette + 보안 점수 시각화 + HIBP v3 + 자동 업데이트 + i18n(영/한/일 우선)

### Phase 2 (MVP 이후)

자동 rotation 무중단 파이프라인 + 커넥터 팩(OpenAI/Stripe/AWS/Vercel/Supabase) + Blast Radius 시뮬레이션 + Incident Feed 프리미엄 + 감사 로그 Export + 팀 공유 볼트 + CISA KEV

### Won't

LiteLLM Python 사이드카 + Sigstore/Rekor + 집단지성 DB + Dynamic Secrets + Vanta/Drata 연동

---

## [2026-04-22] 디자인 시스템 선택 (Gate 1.5)

- **결정: Option A — "Security Minimal"**
  - **컴포넌트 라이브러리:** shadcn/ui (copy-paste) + Radix UI primitives
  - **스타일링:** Tailwind CSS v4 (`@theme` 기반 CSS-first 설정)
  - **Base Color Ramp:** **slate** (2026-04-22 부트스트랩 시 `neutral`에서 변경 — 미세한 쿨 톤이 "보안 도구" 신뢰감에 더 부합)
  - **타이포그래피:** 본문 **Inter Variable**, 코드·키 **JetBrains Mono Variable**
  - **아이콘:** **Lucide** (shadcn/ui 기본값, 1450+ 아이콘, MIT)
  - **모션:** **Motion** (구 Framer Motion 후속) — prefers-reduced-motion 자동 대응
  - **보일러플레이트 참고:** `agmmnn/tauri-ui` (Tauri v2 + shadcn/ui 검증 완료)
  - **그래프 테마:** React Flow 노드/엣지를 slate 토큰 + 상태 컬러(위험/주의/안전)로 스타일링하여 일관성 확보
- **이유:**
  1. **Tauri v2 검증 완료**: 공식 지원에 준하는 보일러플레이트 존재 → 1인 개발자가 설계 공수 없이 즉시 시작 가능
  2. **접근성 자동 처리**: Radix primitives 기반이라 WCAG 2.2 AA 키보드 네비게이션 + ARIA 속성이 기본값으로 제공됨
  3. **두 페르소나 균형**: "Security Minimal"의 깔끔·정밀 톤은 전문 개발자 취향과 일치하면서, Progressive Disclosure로 바이브 코더도 수용
  4. **번들 크기·1인 유지보수 최적**: copy-paste 방식이므로 라이브러리 업그레이드 부담 없음
- **하이브리드 보완 (채택):** Option C 의 일부 요소를 선택적으로 결합
  - **Cmd+K Command Palette** (`cmdk` + shadcn/ui Dialog)
  - **조밀한 Graph 파워 뷰** (전문 개발자용 밀도 토글)
  - **Motion One 스타일의 최소 모션** (과도한 애니메이션 지양)
- **영향:**
  - `package.json` 에 추가될 의존성: `tailwindcss@4`, `@radix-ui/react-*` (필요한 primitive만 설치), `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `motion`, `cmdk`
  - 디자인 토큰은 `src/styles/tokens.css` 에 **Radix Colors 기반**으로 정의 (라이트/다크 자동 전환)
  - CLAUDE.md 프론트엔드 섹션에 Option A 구성 명시 (향후 세션에서 일관성 유지)
  - UI 컴포넌트는 `src/components/ui/` 에 shadcn/ui CLI로 설치 (초기엔 Button, Input, Dialog, DropdownMenu, Tooltip, Toast, Tabs, Command 정도)
  - **ui-prototype 스킬** 로 초기 파일 생성 예정 (Tailwind 설정, 토큰, 기본 컴포넌트 몇 개)

---

## [2026-04-22] Gate 2 확정 사항 (Planning 산출물 승인 + Open Issues 결정 7건)

사용자가 `docs/architecture.md`, `docs/task.md`, `docs/implementation_plan.md` 3종을 승인하고 Open Issues 7건을 전부 확정함.

### Q1 — 리포지터리 구조 → **A (분리 레포)**

- **결정:** 코어는 퍼블릭 AGPL-3.0 레포, 릴레이 서버는 별도 프라이빗 EE 레포로 분리한다.
  - `api-vault` (public, AGPL-3.0) — Tauri 앱, 코어 크레이트, React 프론트, 웹 읽기 뷰어
  - `api-vault-relay` (private, EE proprietary) — Cloudflare Workers 동기화 릴레이, 결제 웹훅
- **이유:** EE 라이선스 경계 명확화. 오픈소스 기여자가 릴레이 내부 로직·DB 스키마·인증 흐름에 접근하지 못하게 하여 무임 재판매 위험 차단.
- **영향:**
  - 현재 `C:\Users\JSS\Projects\api-vault\` = 퍼블릭 `api-vault` 레포로 유지.
  - M9 시점에 별도로 `C:\Users\JSS\Projects\api-vault-relay\` 프라이빗 레포 생성 예정.
  - 공통 프로토콜/타입은 퍼블릭 `api-vault` 에 정의하여 릴레이가 참조한다 (단방향 의존).

### Q2 — GitHub Organization 이름 → **`api-vault`**

- **결정:** GitHub Organization 이름은 `api-vault`. 최종 URL은 `github.com/api-vault/api-vault` 와 `github.com/api-vault/api-vault-relay`.
- **이유:** 제품명과 직접 일치, 기억하기 쉬움, 검색 유리.
- **영향:**
  - GitHub Organization 생성(사용자 수동 작업, M0 직전 또는 병행). 결제 없음(무료 org).
  - CLA Assistant 설정 시 org 이름 필요.
  - 도메인(Q4)도 `api-vault.app` 으로 통일 (2026-04-25 확정).

### Q3 — Free tier 디바이스 수 → **A (2대)**

- **결정:** 무료 tier 사용자는 최대 **2대 디바이스**까지 E2EE 동기화 가능. 3대부터 Pro 전환 필요.
- **이유:** 바이브 코더 페르소나는 보통 PC + 스마트폰 두 디바이스에서 작업. 진입 장벽을 낮춰 "직접 써본 뒤 가치 체감" 경로를 열어둔다. 3대째부터 Pro 유도는 Bitwarden 패턴과 유사.
- **영향:**
  - 릴레이 서버의 `device_count` 엔포스먼트 로직에 `if tier == "free" && count >= 2: reject pair` 반영.
  - UI: "현재 2/2 디바이스 사용 중 — 3번째 디바이스를 추가하려면 Pro로 업그레이드" 업셀 메시지.
  - 기존 project-decisions.md의 "Freemium" 설명을 갱신 (단일 기기 사용 → 2대까지 무료 동기화).

### Q4 — 도메인 → **`api-vault.app` 확정 (2026-04-25 갱신)**

- **결정:** **`api-vault.app`** 단일 도메인 등록 확정. M5 릴레이 진입과 함께 즉시 등록 (당초 M12/M13 직전 확보 계획에서 앞당김).
- **갱신 사유:** `apivault.app` 후보 1순위는 이미 사용 중 (제3자 보유). `api-vault.app` 가능 → 즉시 확보. `.app` TLD 는 HSTS preload 강제 (HTTPS 필수) — 보안 도구가 보안 TLD 사용하는 메시지 일관성. M5 릴레이 도메인 + 마케팅 사이트 + product 진입점 통합.
- **`.com` 추가 등록은 M10 (Payments) 시점으로 defer:** 1인 운영 비용 최소화 우선. 이메일 (`support@api-vault.com`) + SEO 안전망은 SaaS 정식 출시 직전에 추가.
- **영향:**
  - 코드의 도메인 표기를 `api-vault.app` 으로 통일. `ee/LICENSE`, `ee/README.md`, README 한국어 요약 등 placeholder 갱신.
  - 비즈니스 이메일 임시: `licensing@api-vault.app` / `support@api-vault.app` (Cloudflare Email Routing 으로 forward 설정 후 사용).
  - 환경변수: 클라이언트는 `VITE_APP_DOMAIN=api-vault.app` (또는 절대 URL 빌드 타임 주입). 릴레이는 `wrangler.toml` 의 `routes` 또는 `custom_domains` 에 `relay.api-vault.app` (서브도메인) 또는 `api-vault.app/api/*` 패턴 사용 — M5 스캐폴드 시 결정.

### Q5 — 계정 등록/결제 타이밍 → **마일스톤별 Just-in-Time**

- **결정:**
  - Apple Developer Program ($99/년) — **M11 시작 직전**에 등록
  - Google Play Console ($25 일회성) — **M11 시작 직전**에 등록
  - Paddle Merchant Account — **M10 시작 2주 전**에 신청 (소프트웨어 벤더 검증 기간 확보)
  - RevenueCat — **M10 시점**에 무료 tier로 생성 ($2.5K ARR까지 무료)
  - Cloudflare Workers Paid ($5/월) — **M9 시작 직전** 활성화 (그전엔 무료 tier로 개발)
  - GitHub App registration — **M5 시점**에 생성 (공식 커넥터 인증용)
- **이유:** 선결제 비용을 최소화하면서 각 마일스톤에 맞춰 필요할 때만 활성화. 1인 개발자의 현금 흐름 보호.

### Q6 — Windows 서명 방식 → **A (SignPath OSS)**

- **결정:** SignPath Foundation의 오픈소스 무료 코드 서명 프로그램을 이용한다.
- **이유:** 비용 제로. 본 프로젝트는 AGPL-3.0 퍼블릭 코어이므로 자격 충족. 승인은 신청 후 1~2주.
- **영향:**
  - M13 Release 직전에 SignPath에 신청 (GitHub org `api-vault`, AGPL 라이선스, public repo 증빙).
  - 승인 후 GitHub Actions에서 SignPath Secure Build 연동 설정.
  - 만약 Pro 사용자 수가 수천 명 규모 이상으로 성장하여 SmartScreen reputation 이슈가 생기면 **EV 인증서 구매로 전환** 검토 (연 $300~600).

### Q7 — 법률 리뷰 예산 → **A (iubenda/Termly로 시작) → 추후 B 전환**

- **결정:** 초기 출시는 자동화된 Privacy Policy/Terms 생성기(iubenda 또는 Termly, 월 $15 수준) 로 시작한다. Pro 사용자가 수천 명 규모로 성장한 시점에 변호사 1회 리뷰($500~$1,500) 로 전환.
- **이유:**
  - 초기 비용 최소화 (1인 운영 원칙).
  - iubenda/Termly는 GDPR/CCPA/CPRA 기본 조항을 자동 생성, 지역별 언어 지원.
  - E2EE 특성상 "개인정보 수집 최소화" 구조이므로 위험 프로파일이 낮음.
- **영향:**
  - M13 Release 직전에 iubenda/Termly 계정 생성 + Privacy Policy/Terms 페이지 생성.
  - Landing 사이트와 앱 내 링크에 삽입.
  - Paddle/RevenueCat의 기본 소비자 보호 조항과 중복되지 않게 정리.

### 추가 — Stronghold 모바일 실패 시 우회 태스크 (planner Open Issue #8)

- **결정:** M11 T105(Stronghold 모바일 PoC)에서 실패하면 즉시 확장 태스크를 열고 대체 구현을 진행한다. 대체 후보: (a) iOS Keychain/Android Keystore 직접 사용 + `age`/`rage` crate로 파일 암호화, (b) `rust-crypto` 직접 구현.
- **이유:** Stronghold v2 모바일 지원은 research_raw.md 에서 🟡 조건부 평가. 데스크톱보다 성숙도 낮음.
- **영향:** M11 T105를 PoC 성격으로 가볍게 설계하고, 실패 시 M11 태스크 수가 6개 → 10~12개로 늘어날 수 있음을 미리 인지.

---

## [2026-04-22] T003 — Tauri v2 플러그인 활성화 (M0)

- **결정:**
  - `api-vault-app/Cargo.toml`에 Tauri 공식 플러그인 9종 추가 (stronghold 포함 시 10종이나 AppLocker 환경 제약으로 일시 비활성화, 아래 이슈 참조).
    - 공통: `tauri-plugin-sql` (features=["sqlite"]), `tauri-plugin-clipboard-manager`, `tauri-plugin-shell`, `tauri-plugin-os`, `tauri-plugin-notification`, `tauri-plugin-deep-link`, `tauri-plugin-http`
    - 데스크톱 전용 `cfg(not(android/ios))`: `tauri-plugin-updater`
    - 모바일 전용 `cfg(android/ios)`: `tauri-plugin-biometric`
  - `lib.rs` Builder 체인에 9개 플러그인 등록. `updater`/`biometric`은 표준 `target_os` cfg 분기 사용.
  - `capabilities/default.json`에 9개 permission 추가. `capabilities/desktop.json`에 `updater:default` 분리.
  - JS 패키지 10종 설치 (`@tauri-apps/plugin-{sql,stronghold,clipboard-manager,shell,os,updater,notification,biometric,deep-link,http}`).
- **이유:** T013(SQLite), T016(Stronghold), T023(Clipboard) 등 후속 태스크들이 사용하는 플러그인 사전 등록.
- **이슈 (AppLocker 환경 특이사항):**
  - `tauri-plugin-stronghold`의 전이 의존성 `iota_stronghold` → `iota-crypto` → `libsodium-sys-stable` 빌드 스크립트가 Windows AppLocker에 의해 차단됨.
  - Rust 의존성은 주석 처리, `lib.rs` 초기화 코드도 주석. JS 패키지는 정상 설치됨.
  - **활성화 조건:** 관리자 권한으로 `Add-MpPreference -ExclusionPath <src-tauri/target>` 실행 후 주석 해제.
  - 동일 이유로 `capabilities/default.json`에서 `stronghold:default`, `biometric:default`는 해당 플러그인 활성화 시 추가.
  - `updater:default`는 `capabilities/desktop.json`으로 분리 (플랫폼별 capability 파일 패턴 도입).
- **영향:**
  - `cfg(desktop)` 대신 `cfg(not(any(target_os = "android", target_os = "ios")))` 표준 cfg 사용 (Tauri build-script cfg 플래그는 cargo dependency resolution에서 사용 불가).
  - Stronghold 활성화 후 `lib.rs`에서 `Builder::with_argon2(salt_path).build()` 패턴 사용 예정 (T017에서 실제 KDF 로직 구현).

---

## [2026-04-22] T001+T002 — Cargo 워크스페이스 분리 + 핵심 의존성 (M0)

- **결정:**
  - `src-tauri/Cargo.toml`을 workspace root로 교체 (`[workspace] members = ["crates/*"]`, `resolver = "2"`).
  - `src-tauri/crates/` 아래 9개 크레이트 생성: `api-vault-app` (bin+lib), `api-vault-{core,storage,crypto,audit,feeds,connectors,railguard,sync}` (lib stub).
  - 기존 `src-tauri/src/` + `src-tauri/build.rs` 를 `api-vault-app` 크레이트 내부로 이동.
  - `api-vault-app/src/lib.rs`에서 `tauri::generate_context!("../../tauri.conf.json")`으로 workspace root의 `tauri.conf.json` 경로 명시.
  - `api-vault-app/build.rs`에서 `std::env::set_current_dir(workspace_root)`로 `tauri-build`가 `tauri.conf.json`을 찾도록 처리.
  - `[workspace.dependencies]`에 공통 의존성 선언 (tokio, serde, serde_json, sqlx, thiserror, anyhow, tracing, tracing-subscriber, ulid, time, reqwest, secrecy, zeroize, tauri, tauri-build, tauri-plugin-opener).
- **이유:** 이후 크레이트별 도메인 분리(crypto, storage, audit 등) + 버전 일원화를 위한 토대.
- **영향:**
  - 모든 Rust 기능 개발은 `src-tauri/crates/` 아래 적절한 크레이트에 배치.
  - `api-vault-app`이 Tauri 진입점. 다른 크레이트는 `tauri` 의존 없이 순수 도메인 로직.
  - `tauri.conf.json`, `capabilities/`, `gen/`은 계속 `src-tauri/` 최상단 유지.

---

## [2026-04-22] Phase 3 실행 모드 → **Auto edits**

- **결정:** 사용자가 **Auto edits 모드**를 선택. implementator·commiter·tester 가 파일 편집·테스트 작성·커밋까지 자동 진행한다.
- **자동 진행 범위 (승인 없이 가능):**
  - 파일 생성/수정/삭제
  - 패키지 설치 (pnpm/cargo)
  - 단위 테스트·통합 테스트 실행
  - `git commit` (단, `git push`는 제외)
  - lint/format/typecheck
  - 로컬 빌드
- **여전히 명시적 사용자 승인이 필요한 위험 작업 (Auto edits 모드와 무관):**
  - `git push` → Gate 4 전까지 절대 금지
  - 앱 배포 / 릴리스 / 앱스토어 제출 → Gate 3
  - `main` 브랜치 병합 (PR·force-push 포함)
  - `.env` / credential 파일 열람·수정
  - 외부 결제 API 호출 (Paddle/RevenueCat 실제 트랜잭션)
  - 외부 SaaS에 대한 쓰기 작업 (GitHub rotate secret, Slack 전송 등)
  - 보안 훅·CLA·라이선스 비활성화
- **영향:**
  - 각 태스크 단위로 commit이 생성됨 → 롤백 용이.
  - 사용자는 중간중간 리뷰보다는 **마일스톤 경계** 또는 **위험 작업 지점**에서 집중 검토.
  - 문제 발생 시 implementator 재시도 1회 → problem-solver 호출 (최대 3 라운드 × 5 방법) → 해결 실패 시 informer로 사용자 호출.

---

## [2026-04-22] 볼트 암호화 엔진 교체: Stronghold → age — **[갱신: 이전 결정 대체]**

- **결정:** 로컬 볼트 암호화 엔진을 **Tauri Stronghold**에서 **`age` crate(v1.2+)** 로 교체한다.
  - `tauri-plugin-stronghold` 와 `@tauri-apps/plugin-stronghold` 는 완전히 제거.
  - `age` (RustCrypto 생태계, MIT/Apache-2.0 듀얼 라이선스) 를 직접 Rust 의존성으로 추가.
  - 파생 키로부터 age identity(X25519) 를 만들어 볼트 파일(`vault.age`)을 암호화/복호화한다.
  - 세부 모드(X25519 recipient vs scrypt passphrase, streaming vs one-shot) 는 M1 T016 진입 시 확정.
- **이유 (4가지):**
  1. **Windows AppLocker/Defender 블로커** — `libsodium-sys-stable` build.rs 바이너리가 Windows 에서 실행 차단 (OS error 4551). 개발자 환경 예외 설정만으로는 **최종 사용자 환경에서도 같은 문제가 재발**할 위험이 있다.
  2. **Stronghold v3 deprecated 예정** — `docs/research_raw.md` 주제 #1 의 🟡 평가. 어차피 교체할 운명이었으며, `VaultStorage` trait 추상화(Q6=B)는 이 교체를 대비한 것.
  3. **모바일 성숙도 이슈 해소** — Stronghold 의 `iota-crypto` 체인은 모바일에서 🟡. `age` 는 pure Rust + 가벼운 의존성이라 iOS/Android 빌드에서 문제 없음.
  4. **단순성** — age는 표준 포맷(X25519 + ChaCha20-Poly1305), 1Password/Fastmail/Mozilla SOPS 등 다수 프로덕션 검증.
- **유지되는 것 (변경 없음):**
  - **OS Keyring 으로 마스터 키 저장** — 그대로.
  - **Argon2id KDF + HKDF 키 파생 체인** — 그대로. 차이는 최종 symmetric key 가 age identity 로 변환되는 점.
  - **Zero-Knowledge 아키텍처** — 서버는 여전히 암호문만 본다.
  - **CRDT 델타 암호화(Yjs + SecSync)** — 독립적 레이어, 영향 없음.
  - **`VaultStorage` trait 추상화(Q6=B)** — 오히려 이 결정을 바로 활용. 구현체 이름만 `StrongholdStorage` → `AgeVaultStorage`.
- **영향:**
  - `src-tauri/crates/api-vault-app/Cargo.toml` 에서 `tauri-plugin-stronghold` dependency 제거 (주석 포함).
  - `src-tauri/crates/api-vault-app/src/lib.rs` 에서 Stronghold 관련 TODO 주석 삭제.
  - `package.json` 에서 `@tauri-apps/plugin-stronghold` 제거.
  - M1 T016 의 태스크 제목을 `StrongholdStorage 구현` → `AgeVaultStorage 구현` 으로 변경 필요 (task.md, implementation_plan.md 정리 태스크를 M1 진입 전에 처리).
  - `docs/architecture.md` 섹션 4(보안) 의 "Stronghold" 언급을 `age` 로 갱신 필요.
- **대안 후보 검토:**
  - `age` (선정) — 표준 포맷, 성숙, RustCrypto, 다수 프로덕션 검증.
  - `orion` — 순수 Rust, 하지만 파일 포맷 표준 없음.
  - `chacha20poly1305` + `argon2` 직접 조합 — 가장 유연하나 포맷 설계/검증 부담 큼.
- **M1 T016 착수 전 확인 항목:**
  - `age::Encryptor::with_recipients(vec![x25519_recipient])` vs `age::scrypt::Recipient` 최종 선택.
  - 볼트 파일 경로: `${app_data_dir}/vault.age` (Tauri path API 로 획득).
  - 키 회전 시 파일 재암호화 배치 절차.

---

## [2026-04-22] 보안 핵심 결정 — **[일부 갱신]**

- 마스터 키 = OS keyring (+ Phase 2에서 Passkey/WebAuthn 선택적 2차 인증)
- 볼트 암호화 = ~~Tauri Stronghold~~ → **`age` crate** (XChaCha20-Poly1305 기반, X25519 또는 scrypt recipient + Argon2id 파생 키). 위 "Stronghold → age 교체" 섹션 참조.
- **영지식 아키텍처 (Zero-Knowledge)** = 클라이언트에서 암호화/복호화, 서버는 암호문만 릴레이
- **멀티 디바이스 페어링** = X25519 ECDH + QR/PIN 대역 외 검증 (Gemini 섹션 2.2)
- **CRDT 동기화** = Delta-based 또는 Operation-based CRDT + E2EE (SecSync 모델 참조)
- 감사 로그 = ed25519 서명 체인, append-only
- 앱 업데이트 = tauri-plugin-updater + minisign 서명 강제
- 키 메모리 노출 = `secrecy` crate로 Zeroize, 클립보드 자동 만료 30초
- Rust `unsafe` 정당화 없이 금지

---

## [2026-04-22] T008 — Tailwind v4 시맨틱 토큰 (vault 상태 색상)

- **결정:** API Vault 고유의 의미적 상태 토큰 4종을 `src/styles/globals.css`에 추가한다.
  - `--vault-danger` / `--vault-warning` / `--vault-success` / `--vault-info` (각각 foreground 포함)
  - 라이트: destructive 기반 빨강, 앰버, 그린, 블루/사이안 oklch 값
  - 다크: 채도 낮추고 밝기 높인 버전
  - `@theme inline`에 `--color-vault-*` 매핑 → Tailwind 유틸리티 클래스 `bg-vault-danger` 등 사용 가능
- **이유:** Badge, Toast, Graph 노드, Incident 알림에서 일관된 상태 색상 표현. shadcn `destructive`만으로는 4가지 상태를 구분할 수 없음.
- **영향:** `badge.tsx`의 danger/warning/success/info variant에서 이 토큰 사용. 이후 모든 상태 표시 컴포넌트는 이 토큰을 참조.

---

## [2026-04-22] T009 — shadcn/ui primitive 12종 + 통합 radix-ui 패키지

- **결정:** shadcn/ui CLI 최신 버전은 개별 `@radix-ui/react-*` 패키지 대신 통합 `radix-ui` 패키지를 사용한다. 이를 수용한다.
  - 설치된 컴포넌트: dialog, input, label, form, tabs, tooltip, sonner, dropdown-menu, command, scroll-area, separator, skeleton
  - 신규 의존성: `radix-ui@^1.4.3`, `sonner@^2.0.7`, `cmdk@^1.1.1`, `react-hook-form@^7.73.1`, `@hookform/resolvers@^5.2.2`, `zod@^4.3.6`
- **이유:** shadcn/ui New York 스타일 + slate baseColor. 이후 M1+ 태스크에서 즉시 사용 가능.
- **조정:** `sonner.tsx`의 `next-themes` 의존성을 자체 `@/components/theme/theme-provider` 로 교체. `main.tsx`에서 `<Toaster />` 마운트 (ThemeProvider 내부).
- **영향:** `next-themes` 패키지는 설치되어 있으나 실제로 사용하지 않음 (shadcn CLI가 자동 설치). 추후 `pnpm remove next-themes`로 제거 고려 (타입체크/린트에는 영향 없음).

---

## [2026-04-22] T001 Cargo 구조 재조정 — `pnpm tauri dev` 수정 [갱신: 이전 T001+T002 결정 부분 대체]

- **결정:** Tauri v2 공식 권장 구조로 재조정. `src-tauri/Cargo.toml`이 `[workspace]` + `[package]` + `[[bin]]`을 동시에 담는 manifest가 된다.
  - `src-tauri/Cargo.toml` — `[workspace]` + `[workspace.dependencies]` 유지. 하단에 `[package]` (name="api-vault"), `[[bin]]` (path="src/main.rs"), `[build-dependencies]` (tauri-build), `[dependencies]` (tauri, tauri-plugin-opener, api-vault-app, 플러그인 9종 mirror) 추가.
  - `src-tauri/src/main.rs` — 한 줄 shim (`api_vault_app::run()`). Tauri CLI가 여기서 바이너리 타겟을 찾음.
  - `src-tauri/build.rs` — 표준 `tauri_build::build()`. capability 검증은 여기서만 실행.
  - `crates/api-vault-app/Cargo.toml` — `[[bin]]` 제거. `[lib]` name="api_vault_app". `tauri-build` build-dependency 제거. 플러그인 deps는 그대로 유지.
  - `crates/api-vault-app/build.rs` — `cargo::rustc-check-cfg` 선언만 (OUT_DIR 확보 + mobile/desktop/dev cfg 인식). `tauri_build::build()` 미호출 (Windows에서 embed-resource가 `rustc-link-arg-bins` 발행하면 lib에서 오류).
  - `crates/api-vault-app/src/main.rs` — 삭제.
  - `src-tauri/Cargo.toml`의 루트 `[dependencies]`에 플러그인 9종을 mirror로 추가한 이유: `tauri_build::build()`가 capabilities 검증 시 직접 dependency만 조회함. lib의 전이 의존성으로는 permission 인식 불가.
  - `tauri.conf.json`에 `plugins.updater` 섹션 추가 (pubkey=""로 초기화).
- **이유:** T001에서 virtual manifest로 교체한 결과 Tauri JS CLI(`@tauri-apps/cli`)가 `[package]` 섹션을 못 찾아 `"No package info in the config file"` 오류로 `pnpm tauri dev` 실패.
- **영향:**
  - `api_vault_app::run()` 공개 API 유지. 9개 lib 크레이트 변경 없음.
  - `crates/api-vault-app`은 이제 library crate. 향후 Tauri 명령 등록 및 플러그인 초기화의 거점 역할 유지.

---

## [2026-04-22] Tauri workspace 에서 `generate_context!` 는 **반드시 root crate 에서** 호출 [갱신: T001 재조정 결정 보강]

- **결정:** `tauri::generate_context!()` 는 root crate (`src-tauri/src/main.rs`) 에서 호출하고 결과를 subcrate 의 `run(context: tauri::Context)` 로 넘긴다. subcrate 의 `lib.rs` 에서 직접 호출하면 안 된다.
  - `src-tauri/src/main.rs` — `api_vault_app::run(tauri::generate_context!())` 로 변경.
  - `src-tauri/crates/api-vault-app/src/lib.rs` — `pub fn run(context: tauri::Context)` 시그니처. 매크로 호출 제거, `.run(context)` 로 전달.
  - `src-tauri/Cargo.toml` root `[dependencies]` 에 `serde`, `serde_json` 추가 (`generate_context!` 매크로 expansion 이 참조).
- **이유:** `tauri_build::build()` 는 root crate 의 `build.rs` 에서 실행되어 `gen/schemas/{capabilities,acl-manifests}.json` 을 **root crate 의 OUT_DIR** 에 emit 한다. `generate_context!` 매크로는 호출 crate 의 `CARGO_MANIFEST_DIR` 기준으로 이 파일들을 찾아 플러그인 ACL 을 로드하는데, subcrate 에서 호출하면 subcrate 의 OUT_DIR 에서 찾다가 실패하여 **모든 플러그인 IPC 가 `Plugin not found` 로 차단된다**. 커스텀 `#[tauri::command]` 는 `core:default` 로만 검증되므로 이 문제가 드러나지 않다가 T023 수동 검증에서 처음 `tauri-plugin-sql` 을 호출했을 때 폭발.
- **영향:**
  - 이전 결정(T001 재조정 라인 450 "`tauri::generate_context!("../../tauri.conf.json")`으로 workspace root의 `tauri.conf.json` 경로 명시") 는 **잘못된 접근이었음**. 경로 명시로 `tauri.conf.json` 은 찾을 수 있지만 `gen/schemas/` ACL 매니페스트는 여전히 subcrate OUT_DIR 기준으로 탐색되어 플러그인이 모두 깨진다.
  - 향후 Tauri workspace 분리 시 이 패턴을 **기본 규칙**으로 유지. `generate_context!` 의 모든 호출은 root crate 에서만 허용.
  - 커밋: `eaece03 fix(tauri): generate_context!를 root crate 로 이동해 플러그인 ACL 복구`.

---

## [2026-04-23] T035 범위 — Project/Usage Tauri 커맨드 동시 구현 (A안)

- **결정:** T035 드롭&스캔 결과 검토 UI 를 구현하면서 `project_create` / `usage_create` Tauri 커맨드 래퍼도 같은 태스크에서 함께 추가한다. T035 DoD ("폴더명으로 Project 자동 생성 → Usage 자동 생성") 를 풀 스코프로 만족시키기 위해 선택된 A안.
- **대안 기각:**
  - B안 (credential 만 등록, project/usage 는 T037/T038 로 연기): DoD 의 "import → project + usage 자동 링크" 가 깨짐. 사용자가 스캔 결과를 import 해도 Inventory 에서 어느 프로젝트에 속하는지 알 수 없어 UX 반쪽.
  - C안 (project 만 추가, usage 는 T038): project 단독으로는 "어느 파일에서 어떤 env var 로 쓰이는가" 추적 불가. UsageGraph (M3) 의 선행 데이터가 쌓이지 않음.
- **구현 범위 (T035 확장):**
  1. `crates/api-vault-app/src/commands/projects.rs` 신설 — `project_create(input: ProjectInput)` + `project_list()` + `project_get(id)`. storage repo `project.rs` 는 이미 존재.
  2. `crates/api-vault-app/src/commands/usage.rs` 신설 — `usage_create(input: UsageInput)` + `usage_list_by_credential(id)`. storage repo `usage.rs` 는 이미 존재.
  3. `commands/mod.rs` 에 `pub mod projects; pub mod usage;` 등록, `lib.rs` 의 `invoke_handler!` 에 커맨드 추가.
  4. Vault unlock 상태 체크(기존 credential 커맨드 패턴) 재사용.
  5. `src/features/onboarding/DetectedKeysReview.tsx` — 테이블 + 일괄 import 플로우 (project_create → credential_create × n → usage_create × n, 단일 트랜잭션 대신 best-effort 순차 실행, 실패 시 toast 에 성공/실패 건수 표시).
- **영향:**
  - T037 "Project 관리 페이지" 는 CRUD UI 측면만 남음 (커맨드는 T035 에서 완비). Priority Should 유지.
  - T038 "Deployment 관리" 는 project-scoped deployment CRUD 가 본 스코프. usage 커맨드와 별개. 영향 없음.
  - UsageGraph (M3 T041~) 선행 데이터 확보 — 드롭&스캔으로 자동 생성된 usage 행들이 그래프 노드/엣지 소스가 됨.

---

## [2026-04-23] i18n 지원 언어 확장 — 중국어(간체) 추가

- **배경:** T011 i18n 초기 구성은 en/ko/ja 만 포함했다. 사용자가 세션 재개 시점에 "이전 대화에서 중국어 추가를 요청했다"고 확인.
- **결정:** 지원 언어를 en / ko / **ja** / **zh(간체)** 4종으로 확장.
- **구현 규약:**
  1. 신규 locale 파일 `src/locales/zh/common.json` 은 en/ko/ja 와 **완전히 동일한 키 구조**를 유지. 누락 키 허용 금지 (i18next fallback 으로 en 표시는 가능하나, 팀 원칙상 4개 언어 일관 번역).
  2. `src/lib/i18n.ts` `supportedLngs` 배열에 `"zh"` 등록 + `resources.zh` 추가.
  3. `SettingsPage` 언어 셀렉터 `currentLang` 분기와 `<SelectItem>` 목록에 "中文" 옵션 추가.
  4. **새 feature 에서 번역 키를 추가할 때마다 4개 언어 전부에 동기 업데이트.** 별도 자동화 없이 수동 규율로 유지 (PR 리뷰 시 locale diff 라인 수 4파일 비교).
- **영향:**
  - T036 Welcome(13키 × 4) / T037 Project(40키 × 4) / T038 Deployment(28키 × 4) / T039 Usage(22키 × 4) / T040 Security Score(20+키 × 4) 모두 동시 번역 완료.
  - 추후 M3~M13 에서 추가되는 feature 는 본 규약을 계속 준수. 자동화(CI 키 누락 검사) 는 M13 Release 전 고려.
- **커밋:** `1168210` (중국어 초기 추가), 이후 모든 T036+ 커밋에 zh 동기 포함.

---

## [2026-04-23] T040 — 보안 점수 설계 (3단계 + 7 factor, Rust authoritative)

- **배경:** T040 DoD 는 "각 credential 에 간단한 위험도 점수 계산 + Card 의 3단계 색상 dot + hover tooltip". 구체 임계값과 factor 목록은 플래너가 지정하지 않음 → 구현자가 결정.
- **결정:**
  - **레벨 임계값**: `total ≥ 80` = **safe**, `total ≥ 50` = **warn**, 그 아래 = **danger**. 만점 100 에서 감점 방식.
  - **Revoked / Compromised 단락**: status 가 Revoked 또는 Compromised 일 때는 나머지 factor 평가를 건너뛰고 즉시 `total=0, level=Danger, factors=[해당 코드]` 반환. 다른 factor 와 혼합하지 않음.
  - **FactorCode 7종과 감점**:
    | FactorCode | 조건 | penalty | severity |
    |:--|:--|:-:|:--|
    | `Revoked` | status==Revoked | 100 (단락) | Danger |
    | `Compromised` | status==Compromised | 100 (단락) | Danger |
    | `Expired` | expires_at ≤ now | 50 | Danger |
    | `ExpiringSoon` | 0 < (expires_at − now) ≤ 30d | 20 | Warn |
    | `RotationOverdue` | last_rotated + policy_days < now | 15 | Warn |
    | `NoRotationHistory` | last_rotated==None & created_at ≤ now − 90d | 10 | Warn |
    | `NoScope` | scope==None | 5 | Info |
  - **Rust authoritative**: 점수 계산 로직은 `api-vault-core/src/security_score.rs` 의 pure 함수 (`score(cred)` / `score_at(cred, now)`). `CredentialSummary` 와 `CredentialFull` 응답에 서버가 계산한 `score: ScoreBreakdown` 필드를 주입. **프런트 TS 에 동일 로직 재구현 금지** — Single source of truth.
  - **FactorCode 직렬화 규약**: `#[serde(rename_all = "snake_case")]` 로 JSON 에서 `"expired"` / `"expiring_soon"` 등 snake_case. 프런트 i18n 키는 `inventory.factor.{code}` / `inventory.factorShort.{code}` 자동 매핑.
- **향후 factor 추가 규칙:**
  1. `api-vault-core/src/security_score.rs` 의 `FactorCode` enum 에 variant 추가 + `score_at()` 내 분기 + 유닛 테스트.
  2. 4개 언어 (`en/ko/ja/zh`) 의 `inventory.factor.{code}` 와 `inventory.factorShort.{code}` 키 동시 추가.
  3. 프런트 UI 코드는 **수정 불필요** — SecurityDot 이 `inventory.factor.{factor.code}` 로 자동 매핑.
- **Follow-up (M3 이후):**
  - `usages.is_empty()` 기반 factor ("NoUsages") 는 `CredentialFull` 전용으로 추가 가능. 현재 list 경로는 usages 를 쿼리하지 않으므로 list 와 detail 의 score 값이 달라질 수 있음 — 추가 시점에 UX 결정 (list 에도 표시할지, detail 에서만 노출할지).
- **커밋:** `11281cd` feat(security-score): T040 Credential 보안 점수 + 3단계 시각화.

---

## [2026-04-23] UI — BottomNav 모바일 6탭 확장 (T037 부수 결정, 재검토 예약)

- **배경:** T037 에서 `/projects` 라우트를 추가하면서 `src/components/shell/BottomNav.tsx` 의 `grid-cols-5` 를 6개 네비 항목 수용을 위해 `grid-cols-6` 로 확장.
- **결정 (잠정):** 모바일 BottomNav 는 6탭 구성 (Inventory / Projects / Graph / Incidents / Audit / Settings). 모바일 5탭 관례를 의도적으로 깼다.
- **재검토 예약 (M3~M6 중):**
  - 후보 A: Audit 탭을 Settings 내부로 이동 → 5탭으로 환원.
  - 후보 B: 탭을 스크롤 구조 (overflow-x) 로 전환 → 7탭 이상 확장 가능.
  - 후보 C: 현재 6탭 유지 (iPad/데스크톱 우선 사용 가정).
- **판단 트리거:** M6 Audit Log 실제 구현 시점에 UX 검증. 만약 모바일에서 Audit 접근 빈도가 낮으면 A안 적용.
- **커밋:** `bf67527` feat(projects): T037 Project CRUD 페이지 + 연결된 credential 뷰 (BottomNav 수정 포함).

---

## [2026-04-24] 그래프 노드 위치 영속화 (T047 follow-up, C 옵션 채택)

- **결정:** 사용자가 드래그로 배치한 노드 위치를 **localStorage 에 영구 저장**. 앱 재시작 및 페이지 이동 후에도 유지.
- **이유:** 사용자 의견 — "드래그해도 저장 안 되면 드래그 기능의 목적이 없다". 유스케이스(복잡한 그래프 정리 / 비즈니스 그룹핑 / 프레젠테이션) 는 모두 영속화 전제. "MVP 이상 탁월함 지향" 비전과 일치.
- **영향:**
  - `src/features/graph/use-graph-node-positions.ts` 훅 신규 (localStorage key `apivault:graph:nodePositions`, `setPosition` / `clear` / `pruneStale` API).
  - `adapter.toReactFlowElements(payload, direction, savedPositions?)` 3번째 파라미터 — dagre 위에 merge.
  - `DependencyGraph` 가 `onNodeDragStop` 저장 + 조건부 "Reset layout" 버튼 + payload 변경 시 stale entry 자동 prune.
  - 4 locales `graph.resetLayout` i18n 키 (en/ko/ja/zh).
- **대안 기각:** A(현상 유지 — UX 의도 미충족), B(세션 내만 — 앱 재시작마다 리셋되어 실익 낮음), D(드래그 기능 제거 — 유스케이스 가치 있음).
- **커밋:** `7d5f3f3` feat(graph): 노드 드래그 위치 영속화 + Reset layout 버튼.

---

## [2026-04-24] 프로젝트 비전 확정 — "MVP 이상 탁월함 지향"

- **결정:** "필요 최소한" 구현 타협 금지. 동 기능 세계 최고 프로그램을 **능가하는** 완성도 목표. 글로벌 SaaS 판매 (가격은 [2026-04-25] 결정 참조).
- **이유:** 저가격 × 고품질 포지셔닝이 시장 경쟁력의 핵심. 저렴한 가격이 UX 허술함의 정당화가 될 수 없다.
- **영향 (이후 모든 의사결정에 적용):**
  - 옵션 제시 시 "빠른 대신 허술함 / 느리지만 제대로" 중 **제대로** 를 기본 권장.
  - 기능 축소(D 옵션 류) 는 "단순화가 실제 사용자 가치에 부합할 때만" 제안. 구현 부담 회피용 제안 금지.
  - UX 디테일(드래그 영속화 같은 당연한 기대) 은 언제나 충족.
- **메모:** 개인 메모리 `project_vision.md` 에 자동 기록됨 (향후 모든 세션에서 로드).

---

## [2026-04-25] 가격 인하 — Pro $2/월·$15/년 → **$1/월·$10/년**

- **결정:** Pro 플랜 가격을 **$1/월 또는 $10/년** 으로 인하. 기존 결정 ($2/월·$15/년) 대체.
- **이유:**
  - 사용자 판단: "$1/월·$10/년 이면 충분히 지갑을 연다." — 진입장벽 ↓ 으로 무료 → Pro 전환률 ↑ 우선.
  - 가격 비교: Bitwarden Premium ($1/월) 과 동률, 1Password Individual ($3-5/월) 보다 한참 저렴 → "API 키 관리 SaaS" 라는 신규 카테고리에 가격 우위로 침투.
  - 연간 할인: $10/년 = 월 $0.83 → 사실상 2개월 무료. 연간 결제 유도.
- **영향:**
  - 기존 모든 의사결정 항목의 "$2/월" / "$15/년" 표기를 일괄 갱신 (이 문서 + README 한국어 요약 + memory `project_vision.md` 등).
  - "Pro 구독을 $X 에 결제할 가치가 있는 최소 기능" 기준점이 $2 → $1 로 낮아지지만, **기능 축소 의미 아님** — 가격 인하는 진입장벽 완화이고 품질 기준은 그대로 유지 (위 비전 결정과 일치).
  - Apple/Google IAP 최소 가격 단위 ($0.99 / $0.99) 와 정렬 — IAP 문제 없음. Paddle MoR 도 $1 결제 처리 가능 (수수료 비율은 약간 ↑).
  - **자동 rotation 은 Pro 핵심 가치 기둥으로 격상** (다음 결정 참조).
  - **팀 플랜 가격 별도 검토 필요** — 사용자당 모델은 향후 결정 (현재 placeholder $10/seat/월 그대로 유지).

---

## [2026-04-25] 자동 rotation — Must 격상 + 본격 마일스톤화

- **결정:** **자동 rotation** 을 Pro 의 **핵심 가치 기둥** 으로 격상하고 별도 마일스톤 (M14 또는 M5 후속) 으로 분리. 기존 task.md 의 T064 (Pro 게이트) 와 별개로, 실제 rotation 파이프라인 구현을 정식 태스크로 추가한다.
- **이유:**
  - 사용자 강조: "자동 rotation 이 기능은 반드시 필요하다."
  - 시장 전략 분석 (`user_research/apivault_strategy.md`) 에서 3단계 (기업이 돈 내는 이유) 의 핵심 기능으로 식별 — "키 회전 자동화" 가 보안 사고 예방·규정 준수·시간 절약의 직접적 가치.
  - 데이터 해자 + 락인 구조의 일부: rotation 파이프라인이 깊게 연동되면 **떠나는 비용 ↑**.
- **영향 — rotation capability 단계화** (T059 `RotationCap { Full / Partial / Manual }` 활용):
  - **Phase R1 — Full**: AWS IAM (`CreateAccessKey + DeleteAccessKey`), GCP Service Account Key, Azure Key Vault. 완전 무중단 자동 rotation 구현.
  - **Phase R2 — Partial**: Stripe restricted key (rolling), GitHub fine-grained PAT (만료일 기반 알림 + 수동 rotation 가이드), Vercel/Netlify 환경변수.
  - **Phase R3 — Manual + Provider intelligence**: OpenAI / Anthropic / Slack 등 자동 rotation 미지원 provider 는 webhook 기반 알림 (provider 가 키 deprecation 발표 시) + 수동 step-by-step 가이드.
  - **Phase R4 — Schedule + Health**: 사용자 정책 (예: 90일마다) + rotation 실패 alert + rollback (이전 키 30일 grace period 후 폐기).
- **마일스톤 신설:** task.md 에 **M14 — Auto Rotation** 추가. M9 (Sync) 완료 후 진입. 릴레이 의존 (provider API 호출 위한 OAuth/credential 보관) 이라 M5/M9 와 동시에 설계 진행.
- **커밋 / 후속:** task.md 에 새 마일스톤 + 6~10 태스크 추가 후 별도 PR.

---

## [2026-04-25] 백로그 — 시장 전략 부합 권장 조치 (사용자 결정 갱신)

`user_research/apivault_strategy.md` 점검 결과 도출된 후속 안건. 즉시 구현 아님, 향후 마일스톤 검토 시 우선 고려.

1. **팀 플랜 가격 결정**: ✅ **$5/seat/월** 확정 (위 가격 인하 결정에 반영). 1Password Teams ($7.99) 보다 저렴, API 키 관리 신규 카테고리 침투 가격대 정렬.
2. **익명 집계 통계 옵트인**: zero-knowledge 가 네트워크 효과 약화 → 사용자가 명시 옵트인 시 "어떤 issuer 가 가장 많이 노출되는가" 같은 익명 집계 채널 도입. 데이터 해자 회복 경로. **M9 동기화 안정화 이후 신설 마일스톤 (M16)** 으로 진행.
3. **SDK 로드맵**: npm (`@apivault/sdk`), pip (`apivault`), cargo (`apivault-sdk`) 패키지로 코드 안에서 import → 락인 강화. **M5 connector 완료 + M9 동기화 안정화 후 신설 마일스톤 (M17)** 으로 진행.
4. **CI/CD 통합 마일스톤**: GitHub Actions / GitLab CI / Vercel preview / Netlify build hook 통합으로 키 누출 차단 자동화. **M5 GitHub connector (T060+) 완료 후 신설 마일스톤 (M15)** 으로 진행. 새 마일스톤 placeholder 는 task.md 에 동시 추가.

마일스톤 신설 순서 (확정):
- **M14** Auto Rotation (T119~T125) — M9 완료 후
- **M15** CI/CD Integration — M5 완료 후
- **M16** Anonymous Telemetry (옵트인) — M9 완료 후
- **M17** SDK Ecosystem (npm/pip/cargo) — M5 + M9 완료 후

---

## [2026-04-25] M5 릴레이 진입 결정 — Cloudflare Workers 스캐폴드 시작

- **결정:** M5 T061 ~ T064 (Cloudflare Workers 릴레이 + GitHub installation token + Secret Scanning + Connector UI) 진입.
- **이유:** "릴레이가 락인의 입구" — `apivault_strategy.md` 분석에서 도출된 우선순위 1번. 자동 rotation, OAuth 인증, 동기화 인프라 모두 릴레이 의존이라 빨리 시작할수록 후속 마일스톤이 풀린다.
- **영향:**
  - T079 (M8 Cloudflare Workers 스캐폴드) 가 사실상 T061 의 선행 작업 — M5 진입 시 자동으로 함께 진행.
  - 외부 인프라 의존 (사용자 수동 처리 필요): Cloudflare 계정, wrangler CLI, D1 데이터베이스, KV namespace, GitHub App 등록 (T060 runbook).
  - 모노레포 vs 별도 repo 결정 — **옵션 C 확정** (다음 결정 참조).

---

## [2026-04-25] OSS / EE 디렉토리 분리 — 옵션 C (실용적 분리) 확정

- **결정:** OSS 코어는 루트에 그대로 두고, EE 코드는 `ee/` 서브트리로 격리한다. `ee/LICENSE` 에 별도 라이선스 (API Vault Enterprise License v1.0) 파일 + `ee/README.md` 명시.
- **이유:**
  - 1인 개발 + 빠른 진입 + 회귀 위험 최소화.
  - "엄격 분리" 의 본질 (라이선스 파일 + 디렉토리 + 안내) 충족 — 옵션 D (모든 OSS 까지 `oss/` 로 이동) 의 import 경로 / Cargo workspace / Tauri config 대규모 이동 비용 회피.
  - Bitwarden 모델과 정렬 — 한 repo 안에 디렉토리별 라이선스 분리.
- **영향:**
  - `ee/api-vault-relay/` 가 Cloudflare Workers 릴레이의 위치. `ee/` 는 향후 다른 EE 모듈 (premium connectors 등) 도 수용.
  - 빌드 파이프라인 분리: OSS 는 기존 GitHub Actions, EE 는 별도 워크플로우 (`.github/workflows/deploy-relay.yml` 예정 — Cloudflare API token 시크릿 의존).
  - LICENSE 텍스트는 placeholder (Bitwarden License v1.0 변형). 정식 라이선스는 변호사 1회 리뷰 후 (project-decisions Open Issue 항목).
- **커밋:** ee/ 골격 — 다음 커밋에 포함.

---

---

## [2026-04-24] 피드 스케줄러 spawn 패턴 확정 (M3 수동 검증 중 발견)

- **결정:** `tauri::Builder::setup` 안에서 tokio 런타임 핸들을 요구하는 **모든 동기 호출** (`JoinSet::spawn`, `tokio::spawn`, `Handle::current`) 은 반드시 `tauri::async_runtime::block_on` 안에서 실행한다.
- **이유:** `setup` 콜백은 tokio 런타임 context 바깥에서 실행돼 동기 spawn 시 panic (`there is no reactor running`).
- **영향:** T054 `spawn_feed_scheduler` 호출이 `setup` 에서 panic → hotfix 로 `block_on` 안으로 이동. 향후 setup 에 추가되는 모든 service 초기화 코드가 같은 패턴 준수 필요.
- **커밋:** `85f347a` fix(app): 피드 스케줄러 spawn 을 tokio context 안으로 이동.

---

## [2026-04-23] M2 종료 (Inventory UI + 드롭&스캔) — 16/16 완료 ✅

- **기간:** 2026-04-22 T025 시작 ~ 2026-04-23 T040 완료.
- **스코프:** 태스크 16 (Must 13 + Should 3) / 완료 100%.
- **커밋 범위:** `ab69319` (T025) ~ `11281cd` (T040) + 문서 정리. 누적 57 commits (프로젝트 전체 기준).
- **핵심 산출물:**
  - **Backend Tauri 커맨드 28개**: vault 4 + credential 6 + issuer 2 + project 5 + deployment 4 + usage 4 + settings 2 + scanner 1.
  - **Frontend features**: `inventory`, `projects`, `onboarding` (DropZone/Scan/Welcome), `settings`, `command-palette`.
  - **도메인 로직 모듈**: `security_score` (T040), `env_scanner` (T033), `issuer-presets` (T028 Rust seed + TS 10종).
  - **테스트**: Rust 95+ 통과 (security_score 9 + 기존), Vitest 140 통과.
- **다음 마일스톤:** M3 Dependency Graph & Blast Radius (T041~T048). PetGraph 의존성 그래프 엔진 → React Flow 렌더 → blast radius 시뮬레이션.
- **Follow-up 큐 (M3 이후 해결):**
  1. 드롭&스캔 secure import 경로 (scan 결과의 실제 값을 재파싱해 age 볼트에 직접 주입 — T035 교훈).
  2. Deployment 삭제 시 `usage.deployment_id` cascade 처리 (T038 교훈).
  3. BottomNav 6탭 UX 재검토 (상단 항목 참조).
  4. Security Score 에 `NoUsages` factor 추가 (CredentialFull 전용).

---

## [2026-04-25] M15 CI/CD Integration 진입 순서 결정

- **결정:** M15 의 두 갈래(Product / Internal) 중 **Internal infra (T132, T133) 를 먼저 구현**하고, Product feature (T126~T131) 는 후속 세션에서 진행한다.
- **이유:** Internal infra 가 안정화되어야 Product feature 의 배포 파이프라인이 작동한다. GitHub Actions Secrets 를 관리하는 코드(T126~T128) 자체도 ci.yml + deploy-relay.yml 을 통해 검증/배포되기 때문에 인프라 선행이 필수.
- **T132 세부 결정:**
  - `deploy-relay.yml` — `paths` 필터로 `ee/api-vault-relay/**` 변경 시만 트리거 (불필요한 배포 방지)
  - `concurrency.cancel-in-progress: false` — 배포 중단은 절대 불가 (wrangler 배포 원자성 보장)
  - `cloudflare/wrangler-action@v3` 사용 (`account_id` 는 `wrangler.toml` 에서 읽음)
  - pnpm 9, Node 20 고정 (현재 lockfile 기준)
- **T133 세부 결정:**
  - 기존 `ci.yml` 에 `ee-relay` job 추가 (별도 파일 아님)
  - CI 단계에서는 시크릿 불필요 — typecheck + vitest 만 실행
  - fork PR 에서도 `ee-relay` job 동작 (시크릿 없이)
- **영향:** `.github/workflows/deploy-relay.yml` 신규, `.github/workflows/ci.yml` `ee-relay` job 추가, `docs/runbooks/cloudflare-api-token.md` 신규, `ee/README.md` CI/CD 섹션 갱신.

---
