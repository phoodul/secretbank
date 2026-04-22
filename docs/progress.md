# Workflow Progress

## Last Checkpoint

- Time: 2026-04-22 (M0 긴급 수정 완료)
- Phase: Phase 3 — Implementation (M0 완료 + T001 구조 수정, M1 진입 준비)
- Step: T001 재구성 완료 — `pnpm tauri dev`가 "No package info" 없이 Rust 컴파일 → 앱 창 오픈까지 정상 진행됨. 다음: M1 핵심 데이터 모델 (SQLite 스키마, 볼트 CRUD, 암호화 등)

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
- [x] **T003 완료** — Tauri v2 플러그인 9종 활성화 (`cargo build --workspace` exit 0, `cargo test` exit 0, `cargo clippy -D warnings` exit 0, `tsc --noEmit` exit 0). Stronghold 플러그인은 AppLocker 이슈로 제외됐고, 이후 2026-04-22 볼트 암호화 엔진을 `age` crate로 교체하는 결정에 따라 완전히 제거됨 (project-decisions.md 참조). JS 패키지는 정상 설치.
- [x] **T004 완료** — LICENSE (AGPL-3.0, 34,523 bytes, curl 다운로드) + LICENSE_FAQ.md (5-Q&A, EE 경계 설명)
- [x] **T005 완료** — .github/CLA.md + .github/workflows/cla.yml (contributor-assistant@v2) + .github/pull_request_template.md
- [x] **T006 완료** — src-tauri/rustfmt.toml, eslint.config.js (flat config), .prettierrc, .prettierignore, package.json scripts 5종 추가, .github/workflows/ci.yml (rust + frontend job)
- [x] **T007 완료** — README.md 전면 재작성 (About/Features/Stack/Platforms/Getting Started/Dev Commands/License/Contributing/한국어 요약)

## Completed (continued)

- [x] **T008 완료** — globals.css vault 시맨틱 토큰 4종 + badge.tsx (cva, 8 variants)
- [x] **T009 완료** — shadcn/ui primitive 12종 설치 + Toaster 마운트
- [x] **T010 완료** — react-router-dom@7 + AppShell/Sidebar/BottomNav + 5개 placeholder 페이지 + BrowserRouter 라우팅
- [x] **T011 완료** — i18next + react-i18next + LanguageDetector, en/ko/ja 번역 파일, SettingsPage 언어 선택 UI
- [x] **T012 완료** — docs/dev-setup.md (Prerequisites/First-time Setup/Daily Dev/Testing/Folder Layout/Troubleshooting/한국어 요약)

**M0 전체 완료.**

- [x] **T001 구조 재조정 (긴급 수정)** — `pnpm tauri dev` 복구. `src-tauri/Cargo.toml`에 `[package]`+`[[bin]]` 복원, `src-tauri/src/main.rs`(shim) + `src-tauri/build.rs`(tauri_build) 신규 생성, `api-vault-app`을 lib-only로 전환, `tauri.conf.json`에 `plugins.updater` 추가. 6개 검증 모두 통과.

## In Progress

- [ ] M1 — 핵심 데이터 모델 + 볼트 CRUD

## Pending Decisions

- Gate 3 (배포 진행 승인)
- Gate 4 (git push 승인)

## Key Shifts from Initial Plan

| 항목   | 이전             | 현재                            |
| :----- | :--------------- | :------------------------------ |
| 플랫폼 | 데스크톱 전용    | 풀스택 (Desktop + Mobile + Web) |
| 기간   | 3주 MVP          | 고정 기간 없음, "가치 기준" MVP |
| 동기화 | Phase 2          | Phase 0 필수 (E2EE + CRDT)      |
| 타겟   | 개발자           | 개발자 + 바이브 코더            |
| 수익   | $49 단발 + $6/월 | Freemium + $2/월 Pro            |
| OSS    | 미정             | Open Core (AGPL-3.0 + EE 독점)  |

## Next Action

- M1 진입: SQLite 스키마 설계 (T013), 볼트 CRUD Rust 커맨드 (T014~T017), 암호화 레이어 (T018~T020)
