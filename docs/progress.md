# Workflow Progress

## Last Checkpoint
- Time: 2026-04-22 (Gate 2 통과)
- Phase: Phase 3 — Implementation (진입 직전)
- Step: Gate 2 승인 완료. Open Issues 7건 전부 확정 (모노레포→분리, Org=api-vault, Free=2대, 도메인/결제/서명/법률=JIT+권장안). project-decisions.md 갱신. 다음: 실행 모드 선택 → T001 implementator 호출.

## Completed
- [x] Tauri v2 scaffold (commit 8f4c893)
- [x] `user_research/` 자료 검토 (initial_idea.md + ChatGPT/Gemini Deep Research)
- [x] ChatGPT vs Gemini Deep Research 플랫폼 관점 비교 분석 (사용자 요청)
- [x] 프로젝트 방향 대전환 — Q1~Q5 확정
  - Q1: 바이브 코더 페르소나 추가
  - Q2: 풀스택 (데스크톱 + 모바일 + 웹)
  - Q3: Freemium + $2/월 Pro
  - Q4: Open Core (AGPL-3.0 또는 MPL 2.0 검토)
  - Q5: 1인 개발 지속
- [x] `docs/project-decisions.md` 전면 갱신 (8개 결정 섹션)
- [x] **Phase 1 Research 완료**
  - `docs/research_raw.md` — 14개 주제, 48개 출처
  - `docs/ux_research.md` — 디자인 시스템 Option A/B/C 제시, 잠정 추천 Option A("Security Minimal")
- [x] **Phase 2 Integration 완료**
  - `docs/integrator_report.md` — CRAAP 평가 (🟢12 / 🟡4 / 🔴1), MoSCoW 분류, 8개 오픈 질문
- [x] **Gate 1 통과** — 사용자가 8개 질문 전부 답변 (Q1=C, Q2=A, Q3=A, Q4=A, Q5=B, Q6=B, Q7=A, Q8=A)
  - **Q2=A가 integrator 권장(B)과 반대** → 모바일·웹·E2EE 동기화가 MVP Must로 승격 → MVP 범위 대폭 확장
- [x] **Gate 1.5 통과** — Option A (Security Minimal) 확정 + Option C 하이브리드 보완 (Cmd+K, 조밀 Graph 뷰)
- [x] **Phase 2.5 완료** — ui-prototype 스킬 실행
  - 패키지: tailwindcss@4.2.4, @tailwindcss/vite, clsx, tailwind-merge, cva, tw-animate-css, lucide-react, motion, @radix-ui/react-slot, Inter/JetBrains Mono variable fonts
  - 파일: `src/styles/globals.css` (Tailwind v4 + @theme + oklch 라이트/다크 토큰), `src/lib/utils.ts` (cn), `src/components/ui/button.tsx`, `src/components/theme/theme-provider.tsx` (+ useTheme), `components.json`
  - 구성 업데이트: `vite.config.ts` (@tailwindcss/vite + @ alias), `tsconfig.json` (paths), `index.html` (title), `src/main.tsx` (ThemeProvider), `src/App.tsx` (재작성), `src/App.css` 삭제
  - CLAUDE.md 에 UI/UX Architecture 섹션 추가
  - TypeScript 타입체크 통과
- [x] **Phase 2.6 — Planning 완료**
  - `docs/architecture.md` — 9개 섹션(시스템 개요, 데이터 모델, 모듈 경계, 보안, 플랫폼 매트릭스, 외부 의존성, 배포, 관측성, 오픈 이슈). ASCII 아키텍처 다이어그램 + Mermaid ER 다이어그램 포함.
  - `docs/task.md` — **118개 태스크** (Must 82 / Should 21 / Could 15) × **14개 마일스톤** (M0 Foundation ~ M13 Release). 각 태스크마다 ID/Priority/Depends on/Goal/DoD/Files Touched/Tests 명시. Open Issues 7개.
  - `docs/implementation_plan.md` — 마일스톤별 개요/태스크 그룹/핵심 기술 결정/TDD 전략/리스크 완화/검증 체크리스트. 사전 준비(ENV/계정), 전체 롤백 계획, 1인 운영 원칙 재확인 섹션.

- [x] **Gate 2 통과** — 플랜 승인 + Open Issues 7건 결정
  - Q1 리포 구조: **A (분리 레포)** — api-vault (public AGPL) + api-vault-relay (private EE)
  - Q2 GitHub Org: **`api-vault`**
  - Q3 Free tier 디바이스: **2대** (planner 제안 수락)
  - Q4 도메인: M12/M13 직전 확보 (후보: apivault.app → api-vault.dev → keyvault.dev)
  - Q5 계정/결제: 각 마일스톤 직전 JIT (Cloudflare=M9, Paddle=M10-2w, RevenueCat=M10, Apple=M11, Google=M11, GitHub App=M5)
  - Q6 Windows 서명: **SignPath OSS** (무료, AGPL 자격)
  - Q7 법률 리뷰: **iubenda/Termly로 시작**, 성장 후 변호사 전환

- [x] **Phase 3 실행 모드 확정** — Auto edits (파일 편집·커밋 자동, git push·배포·외부 결제만 승인 필요)
- [x] **T001 + T002 완료** — Cargo 워크스페이스 분리 스캐폴드 + workspace.dependencies 설정 (`cargo build --workspace`, `cargo test --workspace` 모두 통과)
- [x] **T003 완료** — Tauri v2 플러그인 9종 활성화 (`cargo build --workspace` exit 0, `cargo test` exit 0, `cargo clippy -D warnings` exit 0, `tsc --noEmit` exit 0). Stronghold만 AppLocker 환경 제약으로 일시 비활성화(주석 처리), JS 패키지는 정상 설치.

## In Progress
- [ ] Phase 3 Implementation — M0 Foundation (T004 이후 진행 중)

## Pending Decisions
- Phase 3 실행 모드 (현재)
- Gate 3 (배포 진행 승인)
- Gate 4 (git push 승인)

## Key Shifts from Initial Plan
| 항목 | 이전 | 현재 |
|:--|:--|:--|
| 플랫폼 | 데스크톱 전용 | 풀스택 (Desktop + Mobile + Web) |
| 기간 | 3주 MVP | 고정 기간 없음, "가치 기준" MVP |
| 동기화 | Phase 2 | Phase 0 필수 (E2EE + CRDT) |
| 타겟 | 개발자 | 개발자 + 바이브 코더 |
| 수익 | $49 단발 + $6/월 | Freemium + $2/월 Pro |
| OSS | 미정 | Open Core (AGPL-3.0 + EE 독점) |

## Next Action
- 사용자가 `docs/architecture.md`, `docs/task.md`, `docs/implementation_plan.md` 검토 → Gate 2 승인
- 승인 시 → Phase 3 Implementation 진입 (implementator 에이전트가 T001 부터 순차 실행)
- Open Issues 7건 중 필수 결정(Free 디바이스 수, 모노레포 구조) 은 Gate 2 에서 함께 확정
