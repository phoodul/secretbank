# E2E Testing Runbook

## 개요

Secretbank 의 E2E 회귀는 두 단계로 분리된다:

| 단계                      | 무엇을 검증                                                    | 도구                                                    | 상태                           |
| :------------------------ | :------------------------------------------------------------- | :------------------------------------------------------ | :----------------------------- |
| **A. Browser-mode smoke** | React 앱이 부팅되고 라우팅·i18n·정적 렌더가 회귀 없이 동작     | Playwright + Vite dev server + `tauri-mock.ts` polyfill | ✅ 활성 (CI 통합)              |
| **B. Desktop binary E2E** | 실제 Tauri 바이너리가 OS 이벤트·IPC·deep-link 까지 포함해 동작 | tauri-driver + `webdriverio` (또는 selenium)            | 🚧 deferred (인프라 결정 보류) |

본 runbook 은 **A 의 운영 가이드** 와 **B 의 진입 조건 / 사용자 액션 체크리스트** 를 담는다.

---

## A. Browser-mode smoke (현재 운영 중)

### 무엇을 잡는가

- 라우트 전환 (`/` → `/settings`, `/auth/sign-in`) 시 화면이 빈 화면이거나 console error 가 나는지
- i18n 키 누락 (예: `auth.signIn.title` 같은 키가 missing 일 때 헤딩이 안 보임)
- React 19 + Tailwind v4 + shadcn primitives 결합에서 hydration 문제
- Tauri invoke 실패 시 fallback (예: vault_status 실패 → LockScreen 표시) 동작

### 무엇을 못 잡는가

- 실제 OS-level deep-link (`Secretbank://...`) 라우팅 → tauri-driver 필요
- 실제 SQLite/age 암호화 라운드트립 → Rust 통합 테스트로 보완
- 멀티 윈도우 / 트레이 / 알림 등 OS 위젯 → tauri-driver 필요

### 로컬 실행

```sh
pnpm e2e:install   # 최초 1회 — Chromium 다운로드 (~150MB)
pnpm e2e           # headless 실행
pnpm e2e:ui        # UI 모드 (디버그 시)
```

### 새 smoke test 추가하기

1. `e2e/smoke.spec.ts` 또는 별도 `*.spec.ts` 파일에 작성
2. `buildInitScript(map, settings?)` 로 invoke / settings_get 응답을 사전 주입
   - `map` 은 commandName → `{ kind: "ok", value }` 또는 `{ kind: "err", error }` 매핑
   - `settings` 는 settings_get 의 키별 응답을 따로 지정 (onboarding flag 등)
3. 마운트가 비동기인 컴포넌트는 `expect(...).toBeVisible({ timeout: 10_000 })` 사용
4. **금지**: 실제 invoke 구현이 필요한 시나리오 (예: 실제 vault_unlock 후 데이터 검증) — 이런 건 Rust unit/integration test 또는 단계 B 로 미룸

### CI

- `.github/workflows/ci.yml` 의 `e2e` 잡이 `frontend` 통과 후 자동 실행
- 실패 시 `playwright-report/` 가 artifact 로 업로드됨 (7일 보관)
- Playwright 브라우저는 `~/.cache/ms-playwright` 에 캐시되어 재실행 시 빠름

---

## B. Desktop binary E2E (deferred)

### 왜 미뤘는가

- **tauri-driver** 는 OS-specific WebDriver shim 이 별도 필요:
  - Windows: `msedgedriver.exe` (WebView2 버전과 정확히 일치해야 함, 자동 업데이트 시 깨짐)
  - macOS: 자체 WKWebView driver (Apple silicon / Intel 분기)
  - Linux: WebKitGTK driver
- 각 OS 의 CI runner 에서 매트릭스 빌드 시간 증가 (~10분/OS)
- M11 (Mobile Port) 시점에 어차피 mobile E2E 인프라를 새로 도입해야 함 — 그때 단계 B 도 함께 결정하는 편이 자원 효율적

### 진입 시점 (어느 마일스톤?)

다음 셋 중 하나라도 발생하면 단계 B 를 즉시 도입한다:

1. M9 Sync 동작이 회귀로 망가졌는데 unit/Vitest 가 못 잡은 사례 ≥ 2건 누적
2. M11 Mobile Port 진입 — Android/iOS E2E 인프라와 함께 묶음
3. 베타 릴리스 직전 안정성 검증 라운드 (M13 i18n + Updater + Release)

### 사용자 액션 체크리스트 (B 도입 시)

```sh
# Windows
pnpm add -D @wdio/cli @wdio/local-runner @wdio/mocha-framework
cargo install tauri-driver --locked
# msedgedriver: WebView2 버전 확인 후 https://msedgewebdriverstorage.z22.web.core.windows.net/ 에서 정확히 일치하는 빌드 다운로드
# (자동 매처 스크립트는 단계 B 도입 시 작성)

# macOS / Linux 는 별도 가이드 (단계 B 진입 전 추가)
```

### 권장 구조 (단계 B 도입 시)

```
e2e-desktop/
├── wdio.conf.ts        # webdriverio config (chromedriver port 4444 → tauri-driver)
├── specs/
│   ├── lock-unlock.spec.ts
│   ├── deep-link.spec.ts   # Secretbank://auth/callback / github/callback round-trip
│   └── ipc-roundtrip.spec.ts
└── README.md
```

`pnpm e2e:desktop` 같은 별도 npm script 를 추가 (browser-mode 와 분리).

---

## 트러블슈팅 (단계 A)

### `Cannot find module '...vite/bin/vite.js'`

playwright.config.ts 의 webServer.cwd 가 e2e 디렉토리에 잡혀 있어 발생. 현재 config 는 `cwd: REPO_ROOT` 로 고정해 둠. 수정했다면 cwd 를 다시 확인.

### `vite is not recognized as an internal or external command` (Windows)

Windows 의 PATH 분리 정책으로 `pnpm vite` / `pnpm exec vite` 가 셸에서 직접 인식 안 됨. config 는 `node ./node_modules/vite/bin/vite.js` 로 직접 노드 실행하므로 발생 안 해야 함. 발생 시 `node_modules/vite/bin/vite.js` 가 실제로 존재하는지 (`pnpm install` 누락) 확인.

### `expect(... heading ...).toBeVisible()` 가 timeout

i18n 로딩이 비동기라서 가끔 첫 1~2초간 리졸버가 키만 표시. 모든 heading 비교에 `{ timeout: 10_000 }` 부여. 실패 attachment screenshot 으로 실제 화면 확인 가능 (`test-results/<test>/test-failed-1.png`).

### console error: "Tauri invoke called outside Tauri context"

`buildInitScript` 가 host page 의 `__TAURI_INTERNALS__.invoke` 를 polyfill 하지만, 이 polyfill 이 적용되기 전에 invoke 가 호출되면 발생. `page.addInitScript` 는 navigation 이전에 적용되므로 `await page.goto()` 호출 순서가 옳다면 발생 안 해야 함. 발생 시 페이지가 init script 후 reload 되었거나 (HMR 등) 의심.

---

## 관련 파일

| 파일                                                      | 역할                                 |
| :-------------------------------------------------------- | :----------------------------------- |
| `e2e/playwright.config.ts`                                | webServer · 브라우저 · 타임아웃 설정 |
| `e2e/lib/tauri-mock.ts`                                   | invoke polyfill 빌더                 |
| `e2e/smoke.spec.ts`                                       | 현재 smoke 회귀 (3건)                |
| `.github/workflows/ci.yml` (`e2e` job)                    | CI 자동 실행                         |
| `package.json` 의 `e2e` / `e2e:install` / `e2e:ui` script | 로컬 진입점                          |
