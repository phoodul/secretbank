# Workflow Progress

## Last Checkpoint

- **Time:** 2026-04-23 (T025 완료 — M2 진입)
- **Phase:** Phase 3 — Implementation, **M2 Inventory UI 1/14**
- **Commits:** 26개 누적 (최신 `ab69319` feat(inventory): Inventory 목록 뷰 + 필터 바 (T025))
- **Tests:** Rust 43개 + Vitest 33개 통과 (Vitest +20: CredentialCard 10 + InventoryPage 10).
- **Blocker:** 없음.

## M2 진행 상황 (1/14)

### 완료 ✅

- T025 Inventory 페이지 목록 뷰 + 필터 바 (커밋 `ab69319`)

### 진행 순서 결정 (2026-04-23)

사용자 방침: **CRUD UI 핵심(T025→T026→T027)을 먼저, 드롭&스캔 블록(T032~T035)은 M2 후반으로.**

- 1순위: T025 ✅ → T026 Credential 등록 다이얼로그 → T027 상세 Drawer
- 2순위: T028 Issuer 프리셋 (T026 combobox 채움) → T029 Cmd+K → T030 Theme/Settings → T031 Auto-lock
- 3순위(드롭&스캔): T032 드롭존 → T033 .env 파서 + 엔트로피 → T034 env_scan_folder 커맨드 → T035 결과 검토 UI
- 마무리: T036 온보딩 / T037 Project / T038 Deployment / T039 Usage / T040 보안 점수

### T025 구현 교훈 (M2 후속에 영향)

- **React 19 대응 eslint-plugin-react-hooks `set-state-in-effect` 규칙 활성화됨**. `useEffect` 안에서 동기 `setState` 호출 시 warn. 해결책: 단일 상태 객체를 union (`{phase:"loading"} | {phase:"ok", data} | {phase:"error", message}`) 로 묶어 관리. `use-inventory.ts` 패턴 참고.
- **Radix Select jsdom 호환성**: `hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`/`scrollIntoView` 폴리필을 `src/test-setup.ts` 에 추가해야 Vitest 에서 Select 가 열림. T026 Dialog/DropdownMenu 테스트에서도 이미 적용돼 있어 재사용 가능.
- **Radix Select 접근성**: SelectTrigger 에 `aria-label` 명시해야 `getByRole("combobox", {name})` 로 찾힘. 선택된 값 텍스트만으로는 accessible name 이 되지 않음.
- **Issuer 이름 표시는 임시로 `issuer_id.slice(0,8)` 축약형**. T028 프리셋 라이브러리가 준비되면 전면 교체 — `CredentialCard` 의 `IssuerBadge` 부분에 TODO 있음.
- **`CredentialSummary` 에 `last_rotated_at` 없음** (서버 응답 누락). 카드에 라벨만 두고 값 `"—"` 로 표시. 추후 서버 DTO 확장 시 채움.

## M1 완료 (12/12)

### 완료 ✅

- T013 SQLite 초기 스키마 + 마이그레이션 (커밋 `df43b55`)
- T014 VaultStorage trait 정의 (커밋 `09b1079`)
- T015 MockVaultStorage + contract tests (커밋 `09b1079`)
- T016 AgeVaultStorage (age 0.11 + 옵션 α, 커밋 `c8b2c1e`)
- T017 KDF (Argon2id + HKDF, 커밋 `2ac1674`)
- T018 OS Keyring 래퍼 (커밋 `2ac1674`)
- T019 SQLite 레포지터리 9개 (커밋 `57959f7`)
- T020 도메인 모델 31 struct + 12 enum + 9 ULID id (커밋 `57959f7`)
- T021 Vault Tauri 커맨드 (init/unlock/lock/status, 커밋 `9d6841c`)
- T022 Credential Tauri 커맨드 (CRUD + reveal, 커밋 `9d6841c`)
- T024 Lock Screen + Create Vault Dialog (zxcvbn 강도 미터, 커밋 `7946476`)
- T023 클립보드 자동 만료 30초 (취소 토큰 + countdown 이벤트, 커밋 `71d37bc`)

### 부수 수정

- `fix(tauri): tauri-plugins feature 에 updater/biometric dep 추가` (커밋 `42b7769`) — 재부팅 후 풀 빌드에서 드러난 E0433 해결
- `chore(docs): prettier 포맷 일괄 적용` (커밋 `781d547`) — 코드 펜스 주변 공백 정리
- `fix(tauri): generate_context! 를 root crate 로 이동` (커밋 `eaece03`) — **플러그인 ACL 구조 문제 해결** (workspace 에서 tauri-build 는 root 에서 실행되어 gen/schemas 를 root OUT_DIR 에 emit 하는데, generate_context! 를 subcrate 에서 호출하면 매니페스트를 찾지 못해 모든 플러그인 IPC 가 `Plugin not found` 로 차단됨. 커스텀 커맨드는 core:default 로 우회되어 이전까지 드러나지 않았음.)
- `chore(dev): M1 수동 검증용 DevTools IPC 보조 설정` (커밋 `987b857`) — `withGlobalTauri`, `window.__dev = {invoke, listen, Database}`, `sql:allow-execute` 추가

### M1 수동 통합 검증 결과 (2026-04-22)

**시나리오 전 흐름 통과:**

1. CreateVault: zxcvbn 강도 미터 표시 → 12자 이상 강한 비번 → `vault.age` + `vault.db` 파일 생성 확인
2. Lock/Unlock: 3회 연속 오답 → 10초 쿨다운 카운트다운 표시, 쿨다운 해제 후 정상 언락
3. Credential CRUD: `credential_create` → SQLite 메타 + age 볼트 값 분리 저장 → `credential_list` 메타만 반환 (`value` 필드 없음) → `credential_reveal` 원본 plaintext 반환
4. Clipboard 30초 만료: `credential_copy_to_clipboard` → 시스템 클립보드에 즉시 복사 + `clipboard:countdown` 이벤트 30→0 로 1초마다 발생 → 30초 후 클립보드 비워짐 확인

**검증 중 발견한 설계 교훈:**

- `IssuerId` 는 `#[serde(transparent)]` 로 감싼 `ulid::Ulid` newtype 이라 Crockford Base32 (`I`, `L`, `O`, `U` 제외) 를 엄격 검증. SQLite TEXT 컬럼은 무검증이라 레이어 간 ULID validation 이 다름 → **프론트는 직접 ULID 문자열을 구성하지 말고 Tauri 커맨드가 서버에서 생성한 값을 전달받는 구조로 가야 함**.
- Tauri v2 `sql:default` 는 read-only (`allow-close + allow-load + allow-select`). INSERT/UPDATE 는 `sql:allow-execute` 명시 opt-in 필요.
- **M2 T026 `issuer_create` 커맨드 구현 시** 서버에서 `IssuerId::new()` 로 생성해 반환하는 패턴 유지 (이미 `IssuerInput` 에 id 필드 없음 — 올바른 설계).

## 다음 세션 Next Actions

1. **M1 통합 검증 (수동)** — `pnpm tauri dev` 로 실제 앱을 띄우고 CreateVault → Unlock → credential create → reveal → copy_to_clipboard (30초 자동 만료 확인) → lock 흐름 검증. 사용자 직접 테스트 권장.

2. **M2 Inventory UI + 드롭&스캔 진입 (T025~T040):**
   - T025 Inventory 페이지 목록 뷰
   - T026 Credential 등록 다이얼로그 (수동)
   - T027~T033 드롭&스캔 (파일시스템 스캐너, 엔트로피/정규식 기반 secret detection, UsageGraph 추출)
   - T034~T040 Inventory 편집/삭제/일괄 처리

## SAC/AppLocker/Defender 정책 기록

`docs/project-decisions.md` 의 "개발 환경 정책" 섹션 A/A-2/A-3 참조:

- A: Defender 실시간 보호 `target/` 예외 (적용됨)
- A-2: 개발자 PC SAC Off (**적용됨**)
- A-3: 배포 시 SignPath OSS Authenticode 서명 (M13 예정)

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

- [x] T025 Inventory 페이지 목록 뷰 + 필터 바 — 커밋 `ab69319`
- [ ] T026 Credential 등록 다이얼로그 (수동) — 다음 태스크

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

- **T026 Credential 등록 다이얼로그** — shadcn/ui Dialog + react-hook-form + zod. Issuer combobox 는 T028 프리셋 도입 전까지 임시 `Input` 으로 ULID 문자열 수동 입력 또는 `Custom` 단일 옵션만 노출. 제출 시 `credential_create` invoke → 성공 toast + `refresh()` 호출로 InventoryPage 에 즉시 반영.
