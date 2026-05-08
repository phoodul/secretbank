# Implementation Plan — M24-E Browser Extension

> 작성자: Planner Agent (claude-opus-4-7)
> 작성일: 2026-05-09
> 상태: GATE 2 입력 — 사용자 승인 대기
> 참조: `docs/architecture.md` 10장, `docs/task_m24e.md`, `docs/integrator_report_m24e.md`, `docs/research_m24e_browser_extension.md`, `docs/project-decisions.md` [2026-05-09]
>
> 본 문서는 기존 `docs/implementation_plan.md` (M0~M13) 와 별개로, M24-E 풀구현 진입 시 implementator 에이전트가 sub-task 단위로 열어 보는 절차서다.

---

## 0. 문서 정렬 — 기존 문서와의 관계

| 문서                                      | 역할                                              | 본 plan 과의 관계                      |
| :---------------------------------------- | :------------------------------------------------ | :------------------------------------- |
| `docs/architecture.md` 10장 (M24-E)       | 모듈 경계 / 통신 흐름 / 위협 모델 / UI 분리       | 본 plan 의 구조 정합성 근거            |
| `docs/task_m24e.md`                       | 43 sub-task 의 DoD / Files Touched / Tests / Risk | 본 plan 의 실행 단위                   |
| `docs/integrator_report_m24e.md`          | CRAAP 평가 + D1~D18 + Q1~Q6 일괄 승인 근거        | 본 plan 의 결정 근거                   |
| `docs/research_m24e_browser_extension.md` | 25+ 출처 연구 자료                                | 본 plan 의 detail / API 사용 패턴 참조 |
| `docs/project-decisions.md` [2026-05-09]  | D1~D18 + Q1~Q6 확정 결정                          | 본 plan 이 따르는 단일 진리 (SoT)      |

---

## 1. Phase 진입 순서

### 1.1 Phase 의존성

```
Phase A (모노레포 + shared lib)
    ↓ 완료 시 게이트 검증
Phase B (NM Host + 페어링) ─── 외부 audit (B9, Q5 옵션 A)
    ↓ 완료 시 게이트 검증
Phase C (form 감지 + autofill read-only)
    ↓
Phase D (save dialog + credential 저장)
    ↓
Phase E (generator inline + recipe + Site Logo)
    ↓
Phase F (cross-browser + 스토어 제출 + 종합 audit)
    ↓
M24-E 마일스톤 클로즈
```

### 1.2 Phase 별 일정 (project-decisions [2026-05-09] D7 기반)

| Phase    | 내용                                           | 예상 일수 |  위험도  | sub-task 수 |
| :------- | :--------------------------------------------- | :-------: | :------: | :---------: |
| A        | WXT 모노레포 + shared lib 골격                 |    7일    |   LOW    |      7      |
| B        | Native Messaging Host + 페어링                 |   10일    | **HIGH** |     10      |
| C        | Form 감지 + autofill (read-only)               |   10일    |  MEDIUM  |      8      |
| D        | Save dialog + credential 저장                  |    7일    |  MEDIUM  |      6      |
| E        | Password Generator inline + recipe + Site Logo |    7일    |   LOW    |      5      |
| F        | Cross-browser + E2E + 스토어 제출 + 종합 audit |   14일    |  MEDIUM  |  8 (가변)   |
| **합계** |                                                | **55일**  |          |   **43**    |

### 1.3 Night mode 운용 규칙 (Q6 결정 = sub-task 분할)

- 1 sub-task = 1~2 일치 작업 = 1 commit (또는 hotfix 가 필요하면 2~3 commits)
- Phase 진입 시점은 사용자 승인 GATE
- Phase 내부에서는 사용자 중간 질문 ❌ — sub-task 별 자동 진행
- sub-task 간 의존성은 `docs/task_m24e.md` 의 의존성 그래프 따름
- 병렬 가능 구간 (A3/A4/A5, B vs C 일부, E1/E3/E4, F1/F2/F7) 은 단일 commit 으로 합칠 수 있음

---

## 2. 사전 준비 사항 (Phase A 진입 전)

### 2.1 환경 변수 / 시크릿 / 계정

| 항목                                   | 용도                       | 등록 위치             | 최초 필요 Phase | 비고                                  |
| :------------------------------------- | :------------------------- | :-------------------- | :-------------: | :------------------------------------ |
| Chrome Web Store 개발자 계정 ($5 일회) | Chrome 출시                | developer.chrome.com  |       F-1       | 1회 결제                              |
| Firefox AMO 계정 (무료)                | Firefox 출시               | addons.mozilla.org    |       F-1       | 무료                                  |
| Apple Developer Program ($99/년)       | Safari 출시                | developer.apple.com   |    F-2 (Q1)     | Phase F-2 진입 시점 결제              |
| Microsoft Partner Center (무료)        | Edge Add-ons 출시          | partner.microsoft.com |       F-2       | 무료                                  |
| 외부 보안 audit 업체 선정              | B9 + F8                    | (사용자 액션)         |     B (Q5)      | Trail of Bits / Cure53 / ROS 등 후보  |
| `secretbank.app/api/favicon/*` Worker  | Site Logo (E3)             | 이미 deployed         |       E3        | [2026-05-08] 결정 정합 — 신규 작업 ❌ |
| `secretbank.app/privacy.html` 갱신     | Chrome Web Store 심사 (B3) | site/                 |       F-1       | nativeMessaging 데이터 처리 명시 필요 |

### 2.2 개발 환경 prerequisites

기존 `docs/implementation_plan.md` 에 명시된 항목 + 추가:

- pnpm 9+ — workspace 모드 (`pnpm-workspace.yaml` 갱신: `extension/`, `packages/*` 추가)
- Node.js 20.18+ — extension 빌드 (Vite 6 + WXT v0.20.x)
- Chrome (Stable) 130+ — 개발 테스트
- Firefox (Stable) 130+ — 개발 테스트
- (Phase F-2 한정) macOS + Xcode 16+ + Apple Silicon — Safari 빌드
- (Phase F-2 한정) Windows 11 + Edge — 수동 검증

### 2.3 Blocker 사전 작업 (Phase B 시작 1주 전)

**B1 사전 작업 (NM Host installer)**:

1. `native_messaging` Rust crate (researcher 보고서 인용) 의 `install()` 함수 패턴 학습 — Phase A 종료 시점
2. 3 OS (Win 11 / macOS 14 / Ubuntu 22.04) 수동 NM 등록 사전 검증:
   - 더미 stdio binary 작성 → registry/plist/config 등록 → Chrome / Firefox unpacked extension 에서 connectNative ping 성공 확인
   - 발견된 OS 차이를 `docs/qa/m24e_phase_b_smoke.md` 초안에 기록
3. UAC / Gatekeeper / SELinux 우회 패턴 정리

**B3 사전 작업 (Chrome Web Store privacy)**:

1. Phase D 진입 시점 (≈ 4주 전) 부터 `docs/PRIVACY.md` 의 nativeMessaging 데이터 처리 챕터 작성 시작
2. 법률 자문 미정 시: Open Core 동등 제품 (1Password / Bitwarden / KeePassXC) 의 privacy policy 참조

**B4 사전 작업 (페어링 audit)**:

1. Phase B-4 + B-5 + B-6 + B-7 commit 후 audit 업체 후보 견적 요청
2. audit 미확정 시 fallback: Q5 옵션 C (audit 없이 진행) — Phase F 종합 audit 으로 통합 처리

**B5 사전 작업 (DOM Clickjacking)**:

1. Phase C-8 commit 전 NordPass / ProtonPass / Dashlane 의 패치 commits 분석 (GitHub 공개 OSS 한정)
2. 2025년 Marek Tóth 발표 (PoC 코드) 동작 재현 환경 셋업

---

## 3. Phase 별 검증 절차

### 3.1 매 sub-task 별 회귀 게이트 (모든 commit 공통)

```bash
# Rust
cargo test --workspace --manifest-path src-tauri/Cargo.toml          # 586 + nm-host 신규 → 회귀 PASS
cargo clippy --workspace --manifest-path src-tauri/Cargo.toml -- -D warnings

# TypeScript / 프론트엔드 + extension
pnpm typecheck
pnpm lint
pnpm vitest run                                                      # 614 + extension/shared 신규 → 회귀 PASS

# Extension 빌드
pnpm --filter @secretbank/extension build                             # Chrome + Firefox 산출물 검증
```

### 3.2 Phase A 게이트 (T-24-E-A1~A7 후)

- 위 회귀 게이트 모두 PASS
- 수동: Chrome 에 unpacked 확장 로드 → popup 표시 → 4 lang 토글 + theme 토글 동작
- 수동: Firefox 에 `web-ext run` 으로 임시 로드 동일 검증

### 3.3 Phase B 게이트 (T-24-E-B1~B10 후) — 가장 중요

- 회귀 게이트 PASS
- **3 OS × Chrome + Firefox = 6 cell 수동 ping round-trip PASS** (T-24-E-B10)
- 페어링 흐름 수동 e2e: 확장 설치 → popup 자동 connect → 데스크톱 dialog → 사용자 승인 → "Paired ✓" 표시
- 첫 password reveal: WebAuthn (Touch ID / Windows Hello) prompt → session_token 발급 → 4h TTL 검증
- 외부 audit (B9) — 결과 수령 또는 옵션 C fallback 결정

### 3.4 Phase C 게이트 (T-24-E-C1~C8 후)

- 회귀 게이트 PASS
- **5+ 실제 사이트 수동 autofill PASS**: Google / GitHub / Stripe / Discord / Cloudflare
- multi-step (Google 이메일 → 비밀번호) PASS
- Shadow DOM 사이트 1+ PASS (Salesforce / Reddit 일부)
- iframe same-origin 1+ PASS
- DOM Clickjacking 시뮬레이션 (transparent overlay 삽입) → 방어 동작

### 3.5 Phase D 게이트 (T-24-E-D1~D6 후)

- 회귀 게이트 PASS
- **실제 사이트 가입 → SaveBanner → "Save" → 데스크톱 vault 에 credential 생성 확인**
- 동일 사이트 비밀번호 변경 → "Update" 분기 동작
- "Never for this site" 클릭 → 같은 도메인에서 banner 미표시
- audit log 에 `extension.save.create` / `.update` 기록 확인

### 3.6 Phase E 게이트 (T-24-E-E1~E5 후)

- 회귀 게이트 PASS
- 신규 가입 폼 (`autocomplete="new-password"`) 에서 generator inline 동작 (en/ko/ja/zh)
- 17 preset issuer + 사용자 보정 후 같은 도메인 재가입 시 recipe 자동 적용
- popup 카드 시각 검증 (desktop 과 디자인 일관) — 스크린샷 비교

### 3.7 Phase F 게이트 (T-24-E-F1~F8 후) — 출시 직전

- 회귀 게이트 PASS
- Playwright E2E (Chrome) PASS
- web-ext E2E (Firefox) PASS
- Chrome Web Store 심사 통과
- Firefox AMO 심사 통과
- (Phase F-2) Edge Add-ons 심사 통과
- (Phase F-2) Safari App Store 심사 통과
- 외부 audit HIGH severity 모두 해소
- `docs/task.md` 의 M24-E Status `✅ 43/43 완료` (또는 audit 발견에 따라 +N)

---

## 4. 위험 완화 전략 (Blocker 별)

### 4.1 B1 — NM Host OS 별 installer (HIGH)

**완화**:

- Phase B 시작 전 1주 — 더미 binary 로 3 OS 등록 사전 검증 (위 2.3)
- `native_messaging` Rust crate `install()` 활용 + Tauri bundler hook 병행
- T-24-E-B2 단독 sub-task 로 분리 + T-24-E-B10 수동 검증 게이트

**롤백**: B2 실패 시 → 더미 manifest 등록 가이드 (`docs/qa/m24e_nm_install_manual.md`) 제공 + 사용자 수동 설치 fallback

### 4.2 B2 — Safari Xcode 빌드 + macOS CI 비용 (HIGH)

**완화**:

- Phase F-2 분리 — Phase F-1 (Chrome + Firefox) 가 출시 차단되지 않음
- Q1 결정 = 단계적 출시 채택
- macOS runner 사용량 모니터링 (GitHub Actions 무료 티어 한도)

**롤백**: Phase F-2 무기한 연기 → Chrome + Firefox 만 운영 (사용자 가치 80% 확보)

### 4.3 B3 — Chrome Web Store privacy policy 강화 (MEDIUM)

**완화**:

- Phase D 진입 시점부터 `docs/PRIVACY.md` 작성 시작
- nativeMessaging / scripting 권한 정당화 텍스트 사전 작성
- Phase F-1 시작 2주 전 privacy policy 초안 완료 + 검토

**롤백**: 심사 거부 시 수정 + 재제출 (수 일 ~ 수 주). 항소 1회 가능, 재항소 ❌.

### 4.4 B4 — 페어링 protocol 보안 audit (MEDIUM)

**완화**:

- secretbank-crypto crate 재활용 → 암호화 primitives audit 비용 ↓
- Phase B 완료 후 audit 발주 (T-24-E-B9)
- audit 일정 미확정 시 fallback: 옵션 C (출시 직전 종합 audit 으로 통합)

**롤백**: audit 발견 HIGH severity 시 Phase C 진입 보류 + 패치 sub-task 추가

### 4.5 B5 — DOM Clickjacking 잔여 위험 (LOW-MEDIUM)

**완화**:

- C8 에서 알려진 기법 (2025년 Marek Tóth) 방어 구현
- Closed Shadow Root + MutationObserver + composedPath() 3중 방어
- 이후 OWASP Browser Extension WG 모니터링 + GitHub Security Blog 구독

**롤백**: 신규 기법 발견 시 hotfix sub-task 추가 (별도 마일스톤 후속 가능)

---

## 5. 외부 감사 일정

### 5.1 Phase B 완료 후 페어링 흐름 audit (Q5 옵션 A)

**대상**: 페어링 protocol + NM channel + session token 흐름 한정
**예상 비용**: $5K~$15K (Trail of Bits / Cure53 / ROS 등 후보 — 사용자 액션 = 업체 선정 + 견적)
**기간**: 1~2주
**산출물**: 발견 사항 별 sub-task 화 + 패치 commits
**Fallback (Q5 옵션 C)**: audit 일정 미확정 시 출시 직전 종합 audit 으로 통합 + 베타 사용자 피드백 수집

### 5.2 Phase F 출시 직전 종합 audit

**대상**: 확장 전체 + nm-host + form-detector + DOM Clickjacking 방어 + Web Store 제출 직전 코드
**예상 비용**: $15K~$50K
**기간**: 2~4주
**산출물**: T-24-E-F8 sub-task → audit 결과 별 commits

---

## 6. commit 단위 운용 (Q6 = sub-task 분할)

### 6.1 commit 메시지 형식 (CLAUDE.md 따름)

```
type(scope): 한글 제목

본문 (선택, "왜" 를 한글로)
```

**M24-E scope 예시**:

- `feat(extension): WXT 골격 + Tailwind v4 셋업 (T-24-E-A1)`
- `feat(nm-host): X25519 페어링 protocol 구현 (T-24-E-B4)`
- `feat(extension): form-detector autocomplete 우선순위 (T-24-E-C1)`
- `fix(extension): Shadow DOM closed 모드 composedPath 처리 (T-24-E-C3)`
- `chore(release): Chrome Web Store privacy policy 갱신 (T-24-E-F1)`

### 6.2 commit 단위 매핑

| commit 단위     | sub-task 매핑           | 비고                                |
| :-------------- | :---------------------- | :---------------------------------- |
| 1 commit        | 1 sub-task              | 기본 운영                           |
| 1 commit (병합) | 2~3 sub-task (병렬가능) | A3/A4/A5 또는 E1/E3/E4 동시 작업 시 |
| 2~3 commits     | 1 sub-task + hotfix     | 회귀 발견 시 추가 hotfix commits    |

### 6.3 Night mode 호환

- sub-task 완료 → commit → 다음 sub-task 진입 (사용자 중간 승인 ❌, Phase 게이트만)
- Phase 게이트 도달 시 사용자 GATE 호출 (질문 큐에 쌓아두고 Phase 끝까지 진행)
- 회귀 실패 발견 시 즉시 hotfix → 같은 sub-task 의 추가 commits 로 처리

### 6.4 회귀 검증 매 commit 마다 (CLAUDE.md "Verification" 강제)

- `cargo test --workspace --manifest-path src-tauri/Cargo.toml` (586 + nm-host)
- `cargo clippy --workspace --manifest-path src-tauri/Cargo.toml -- -D warnings`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm vitest run` (614 + extension/shared)
- (Phase A-1 후) `pnpm --filter @secretbank/extension build` Chrome + Firefox

매 commit 시 CI 가 위를 모두 게이트로 강제. 실패 시 commit revert 또는 hotfix.

---

## 7. dogfooding 흐름 (Phase D 완료 후 사용자 실 사용)

### 7.1 dogfooding 진입 조건

- Phase A~D 완료 (T-24-E-A1 ~ T-24-E-D6)
- 회귀 게이트 PASS
- 사용자가 unpacked extension 을 본인 Chrome / Firefox 에 로드 → 실제 일주일 사용

### 7.2 dogfooding 발견 이슈 처리

- Phase E 진입 전 fix 우선순위:
  - HIGH: autofill 미작동 / 페어링 끊김 / save banner 표시 안 됨 → 즉시 hotfix sub-task 추가
  - MEDIUM: UI 작은 글리치 / 디자인 비일관 → Phase E 안에 통합
  - LOW: 기능 요청 → Phase F 후 별도 마일스톤 후속

### 7.3 dogfooding 정의 준수 (메모리 [feedback_dogfooding])

- `pnpm tauri dev` ❌
- 정식 release artifact (Tauri installer + extension unpacked or signed CRX) 만 dogfooding 인정
- Phase D 완료 시점에 사전 release 빌드 1회 생성 → 사용자 시스템에 정식 설치 + extension 로드 → 실 사용

---

## 8. Open Issues (planner 가 결정 못 한 항목 — 사용자 결정 필요 시)

### 8.1 외부 audit 업체 선정 (Q5)

- 후보: Trail of Bits, Cure53, Radically Open Security, Doyensec
- 사용자 액션: 1~2 업체 견적 요청 → 선정 → Phase B 완료 시점 발주
- 일정 미확정 시: Q5 옵션 C fallback (audit 없이 진행, Phase F 종합 audit 으로 통합)

### 8.2 Apple Developer Program 결제 시점 (B2)

- 결정 = Phase F-2 진입 시점 ($99/년)
- 사용자 액션: Phase F-1 완료 직후 결제

### 8.3 Chrome Web Store / Edge / AMO 개발자 계정 등록

- Chrome: $5 1회 — Phase F-1 시작 2주 전
- Firefox AMO: 무료 — 즉시
- Edge: 무료 — F-2 진입 시점
- 사용자 액션: 위 일정에 맞춰 등록

### 8.4 zxcvbn-ts vs zxcvbn 원본

- integrator 권고 = zxcvbn-ts (zxcvbn 원본은 장기 미유지보수)
- 사용자 결정 필요 ❌ (researcher 보고서에서 권고 충분, A3 에서 zxcvbn-ts 채택)

### 8.5 wxt-module-safari-xcode 커뮤니티 패키지 maintenance 상태

- integrator CRAAP 평가 = 18점 (MEDIUM, Phase F-2 진입 전 재확인 필수)
- Phase F-2 진입 시점 (수개월 후) maintenance 상태 재검증
- 만약 abandoned 상태 → Apple 공식 `xcrun safari-web-extension-converter` 명령 직접 호출로 fallback

---

## 9. 마일스톤 클로즈 조건

M24-E 마일스톤이 `✅ 완료` 로 전환되는 조건:

1. **Phase A~F 모든 sub-task 완료** (43+ commits)
2. **회귀 게이트 항상 PASS** (cargo test / pnpm vitest / typecheck / lint / extension build)
3. **3 OS × 2 brower 수동 검증 PASS** (T-24-E-B10)
4. **Chrome Web Store + Firefox AMO 심사 통과** (T-24-E-F1, F2)
5. **외부 audit HIGH severity 모두 해소** (T-24-E-B9 + F8)
6. **Phase F-2 (Safari + Edge) 도 통과** (조건부 — Q1 단계적 출시 채택, Phase F-1 만으로도 마일스톤 부분 클로즈 가능. Phase F-2 는 별도 commits 로 후속)
7. **`docs/task.md` 의 M24-E Status = `✅ 43/43 완료`**
8. **`docs/work-log.md` + `docs/progress.md` + `docs/project-decisions.md` 갱신 완료**

---

## 10. 핵심 요약 — GATE 2 사용자 승인 표

### 10.1 마일스톤 / Phase 별 일정

| Phase    | 내용                                  | 예상 일수 |  위험도  | sub-task 수 | 주요 산출물                                      |
| :------- | :------------------------------------ | :-------: | :------: | :---------: | :----------------------------------------------- |
| A        | WXT 모노레포 + shared lib             |    7일    |   LOW    |      7      | extension/ + packages/shared/ + CI               |
| **B**    | **NM Host + 페어링** (위험 최고)      |   10일    | **HIGH** |     10      | secretbank-nm-host crate + X25519 페어링 + audit |
| C        | Form 감지 + autofill (read-only)      |   10일    |  MEDIUM  |      8      | form-detector + Shadow DOM + Clickjack 방어      |
| D        | Save dialog + credential 저장         |    7일    |  MEDIUM  |      6      | SaveBanner + 신규/rotation 분기                  |
| E        | Generator inline + recipe + Site Logo |    7일    |   LOW    |      5      | Diceware 4 lang + issuer recipe + favicon        |
| **F**    | **출시 + 종합 audit**                 |   14일    |  MEDIUM  |  8 (가변)   | Chrome/FF/Edge/Safari 스토어 + 종합 audit        |
| **합계** |                                       | **55일**  |          |   **43+**   |                                                  |

### 10.2 위험 완화 사전 작업 요약

- **B1 (NM Host installer)**: Phase A 완료 시 1주 사전 — 더미 binary 로 3 OS 등록 검증
- **B2 (Safari)**: Phase F-2 분리 (Q1 단계적 출시) → Chrome + Firefox 출시 차단 ❌
- **B3 (privacy)**: Phase D 진입 시 `docs/PRIVACY.md` 갱신 시작
- **B4 (audit)**: Phase B 완료 후 페어링 흐름 단독 audit (Q5 옵션 A)
- **B5 (Clickjack)**: C8 에서 NordPass/ProtonPass 패치 기법 적용 (3 계층 방어)

### 10.3 첫 commit (T-24-E-A1) 진입 조건

- 사용자 GATE 2 승인 (본 plan + task_m24e + architecture 10장)
- pnpm 9+ + Node.js 20.18+ 확인
- Phase A 회귀 게이트 사전 확인 (현재 cargo test 586 + pnpm vitest 614 PASS 상태)

### 10.4 GATE 2 승인 시점 다음 액션

1. orchestrator → `docs/task.md` 마일스톤 표 + T-24-E 항목 갱신 (단순 diff, task_m24e.md 의 "변경 사실 명시" 섹션 따름)
2. orchestrator → implementator 에 T-24-E-A1 sub-task 전달 → Phase A 진입
3. Night mode = Phase A 끝까지 자동 진행 → A 게이트에서 다음 GATE 호출

---

_M24-E implementation plan 끝._
