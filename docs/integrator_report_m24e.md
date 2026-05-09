# Integrator Report — M24-E Browser Extension 풀구현

> 작성일: 2026-05-09  
> 작성자: Integrator Agent (claude-sonnet-4-6)  
> 입력: `docs/research_m24e_browser_extension.md` (1370줄) + `docs/project-decisions.md`  
> 목적: USER APPROVAL GATE 1 의 입력 자료

---

## 1. CRAAP 평가 — researcher 출처 신뢰도 분류

CRAAP 5축 (C=Currency / R=Relevance / A=Authority / A=Accuracy / P=Purpose) 각 1-5점. 합계 25점 만점.  
**15점 미만 = LOW (채택 배제) / 15-19점 = MEDIUM (경고 + 보강 필요) / 20점 이상 = HIGH (채택)**

### 1-1. HIGH 신뢰도 출처 (채택)

| 출처                                               |  C  |  R  |  A  |  A  |  P  |  합계  | 비고                               |
| :------------------------------------------------- | :-: | :-: | :-: | :-: | :-: | :----: | :--------------------------------- |
| Chrome Developers — Service Worker Lifecycle       |  5  |  5  |  5  |  5  |  5  | **25** | Google 공식, 2025 현행             |
| Chrome Developers — Native Messaging               |  5  |  5  |  5  |  5  |  5  | **25** | Google 공식, 2025 현행             |
| MDN — Native Messaging (Firefox)                   |  5  |  5  |  5  |  5  |  5  | **25** | Mozilla 공식, 2025-07 최신         |
| WXT 공식 사이트                                    |  5  |  5  |  5  |  5  |  5  | **25** | v0.20.25 (2026-04)                 |
| WHATWG autocomplete spec                           |  5  |  4  |  5  |  5  |  5  | **24** | 국제 표준, 현행                    |
| KeePassXC Browser Protocol                         |  4  |  5  |  5  |  5  |  5  | **24** | OSS 공식 프로토콜 문서             |
| OWASP Browser Extension Vulnerabilities            |  5  |  5  |  5  |  4  |  5  | **24** | OWASP 공식 체크리스트              |
| native_messaging Rust crate (docs.rs)              |  5  |  5  |  5  |  4  |  5  | **24** | crates.io 공식                     |
| DOM Clickjacking (Marek Tóth, 2025)                |  5  |  5  |  4  |  5  |  4  | **23** | 독립 보안 연구자, 2025년 신규 발견 |
| 2025 Extension Framework Comparison (redreamality) |  5  |  5  |  4  |  4  |  4  | **22** | 독립 비교 분석, 2025년             |
| Playwright — Chrome Extensions 공식                |  5  |  5  |  5  |  4  |  4  | **23** | Microsoft 공식                     |
| 1Password — Browser Connection Security            |  4  |  5  |  5  |  4  |  4  | **22** | 공식 지원 문서                     |
| @wxt-dev/i18n npm                                  |  5  |  4  |  5  |  4  |  5  | **23** | WXT 팀 공식 패키지                 |
| Bitwarden MV3 Migration (공식 블로그)              |  4  |  5  |  5  |  4  |  4  | **22** | Bitwarden 공식                     |
| Bitwarden — Biometric Contributing                 |  4  |  5  |  5  |  4  |  4  | **22** | Bitwarden 공식 Contributing 문서   |
| Chrome Web Store Program Policies                  |  5  |  4  |  5  |  5  |  5  | **24** | Google 공식                        |
| Firefox AMO Policies (2025-08)                     |  5  |  4  |  5  |  5  |  5  | **24** | Mozilla 공식                       |
| Apple Developer — Safari Web Extension             |  5  |  4  |  5  |  5  |  5  | **24** | Apple 공식                         |
| Dashlane — Shadow DOM Autofill                     |  4  |  5  |  4  |  4  |  4  | **21** | Dashlane 엔지니어링 블로그         |
| GitHub Blog — Attacking Browser Extensions         |  5  |  5  |  5  |  4  |  4  | **23** | GitHub Security 공식               |
| KeePassXC-Browser GitHub (구현 코드)               |  4  |  5  |  5  |  4  |  5  | **23** | OSS, 활발한 유지보수               |
| 1Password — Autofill Behavior (공식)               |  4  |  5  |  5  |  4  |  4  | **22** | 공식 지원 문서                     |
| Evert Pot — Multi-step login forms                 |  4  |  5  |  3  |  4  |  5  | **21** | 기술 블로그, 구체적 구현 포함      |
| Moesif — AJAX Capture with Chrome Extension        |  4  |  5  |  3  |  4  |  4  | **20** | 실무 구현 블로그                   |
| Marek Tóth — Disable autofill (보안 연구)          |  4  |  4  |  4  |  4  |  5  | **21** | 독립 보안 연구자                   |

### 1-2. MEDIUM 신뢰도 출처 (경고 + HIGH 출처로 보강 필요)

| 출처                                               |  C  |  R  |  A  |  A  |  P  |     합계      | 경고 / 보강 방법                                                                                             |
| :------------------------------------------------- | :-: | :-: | :-: | :-: | :-: | :-----------: | :----------------------------------------------------------------------------------------------------------- |
| wxt-module-safari-xcode (커뮤니티 npm)             |  4  |  4  |  3  |  3  |  4  |    **18**     | 비공식 커뮤니티 패키지. Apple 공식 xcrun 명령이 primary. Phase F 진입 전 패키지 maintenance 상태 재확인 필요 |
| devkit.best — Plasmo vs WXT (2025)                 |  4  |  4  |  3  |  3  |  3  |    **17**     | 독립 비교이나 author 미상. redreamality 분석으로 보강됨 (HIGH)                                               |
| Medium — pnpm + Vite + shared UI                   |  3  |  4  |  3  |  3  |  4  |    **17**     | 블로그. pnpm 공식 문서 (HIGH) 로 보강                                                                        |
| Browserpass NM registration (DeepWiki)             |  3  |  4  |  3  |  3  |  4  |    **17**     | 비공식 위키. MDN NM manifests (HIGH) + Windows NSIS docs (HIGH) 로 보강                                      |
| Chromium — Form styles (형식 감지)                 |  4  |  5  |  4  |  3  |  5  | **21** → HIGH | Chromium 공식이나 내부 문서 성격. WHATWG spec + MDN 으로 이미 보강됨                                         |
| WXT + shadcn starter (GitHub 개인 레포)            |  4  |  4  |  3  |  3  |  5  |    **19**     | 개인 레포이나 실제 작동 검증됨. WXT 공식 + Tailwind v4 공식으로 보강 필요                                    |
| artmann.co — Chrome Extension with Tailwind 2025   |  4  |  4  |  3  |  3  |  4  |    **18**     | 실무 블로그. WXT 공식 문서로 보강                                                                            |
| DEV Community — Tailwind in Shadow DOM             |  4  |  5  |  3  |  3  |  4  |    **19**     | 커뮤니티 블로그. Dashlane 공식 블로그 (HIGH) 로 보강됨                                                       |
| Dropbox zxcvbn GitHub                              |  4  |  4  |  4  |  4  |  5  | **21** → HIGH | 오픈소스, 유지보수는 장기 침체 상태. 대체 라이브러리 (zxcvbn-ts) 검토 권고                                   |
| 1Password Community — NM issue                     |  3  |  4  |  3  |  3  |  4  |    **17**     | 커뮤니티 포럼. 1Password 공식 문서로 보강됨                                                                  |
| TypeScript Monorepo Best Practice 2026 (hsb.horse) |  4  |  3  |  3  |  3  |  4  |    **17**     | 저자 미상 블로그. pnpm 공식 문서로 보강                                                                      |
| HN: Secure Diceware + zxcvbn (2015)                |  1  |  3  |  3  |  3  |  5  |    **15**     | **날짜 노후 (2015).** 개념 참조용. zxcvbn GitHub (HIGH) 로 보강 필요                                         |

### 1-3. LOW 신뢰도 출처 (채택 배제)

해당 없음. 모든 출처가 15점 이상.

### 1-4. 출처 평가 종합

- HIGH (20점 이상): 25개 출처 중 25개. Researcher 보고서는 **신뢰도 매우 높음**.
- MEDIUM (15-19점): 일부 커뮤니티 패키지 / 개인 블로그가 해당하나, 모두 HIGH 출처로 보강되어 있어 채택 가능.
- LOW: 없음.
- 특별 주의: `wxt-module-safari-xcode` (커뮤니티 패키지, 18점) — Phase F 진입 전 최신 maintenance 상태 재확인 필수. HN Diceware 포스트 (15점, 2015년) — 개념 참조용으로만 활용.

---

## 2. 핵심 결정 (GATE 1 사용자 승인 대상) D1 ~ D18

### D1. 빌드 도구 = WXT v0.20.x ✅ 권고

**권고**: WXT v0.20.25 채택.

| 항목                   | WXT                      | Plasmo                | vite-plugin-web-extension |
| :--------------------- | :----------------------- | :-------------------- | :------------------------ |
| GitHub Stars (2026-04) | 7.9k (활발)              | 12.3k (유지보수 모드) | 낮음                      |
| Tailwind v4 지원       | 완전 지원                | 미지원                | 지원                      |
| Safari 빌드            | 지원                     | 지원                  | 미지원                    |
| 모노레포               | pnpm workspace 통합 지원 | 미지원                | 미지원                    |
| React + TypeScript     | 완전 지원                | 최적화                | 지원                      |
| 최신 릴리스            | 2026-04-18               | 장기 미릴리스         | 불명                      |

**장점**: Tailwind v4 완전 호환, Safari 빌드, pnpm workspace 통합, webextension-polyfill 자동 내장, WXT 팀의 `@wxt-dev/i18n` 공식 패키지.  
**단점**: Plasmo 대비 stars 낮음 (12k vs 7.9k). 단 Plasmo 는 유지보수 모드 진입으로 stars 는 의미 없음.  
**대안**: vite-plugin-web-extension — Safari 미지원, 모노레포 미지원으로 탈락.  
**적합 시나리오**: React + Tailwind v4 + shadcn/ui + 모노레포 + Safari 지원 모두 필요한 Secretbank 환경에 최적.

---

### D2. 통신 채널 = Native Messaging ✅ 권고

**권고**: Chrome/Firefox 표준 Native Messaging (stdio, 4-byte 헤더 + JSON) 채택.

| 방식                 | 보안                             | Zero-Knowledge 정합 | 브라우저 지원                   | 구현 난이도 |
| :------------------- | :------------------------------- | :------------------ | :------------------------------ | :---------- |
| **Native Messaging** | 최고 (OS 수준 격리)              | 완전 정합           | Chrome/Firefox/Edge/Safari 표준 | MEDIUM      |
| WebSocket localhost  | 중 (포트 충돌, origin 직접 검증) | 정합                | 모든 브라우저                   | MEDIUM      |
| HTTP localhost       | 낮음 (임의 페이지 접근 가능)     | 미정합              | 모든 브라우저                   | LOW         |

**장점**: OS 보안 모델 위임, 브라우저가 허용된 binary 만 spawn, 1P/KeePassXC 동일 방식.  
**단점**: 데스크톱 앱 미실행 시 사용 불가. OS별 manifest 등록 필요 (Blocker B1).  
**대안**: WebSocket localhost — Zero-Knowledge 정합하나 포트 충돌/방화벽 위험. 미래 "앱 미실행 제한 기능" 전용으로 보류.

---

### D3. vault 모델 = 1P 모델 (vault key = 데스크톱 앱) ✅ 권고

**권고**: Vault key 는 Tauri 앱에만 존재. Extension 은 session token 으로만 credential 요청.

| 모델               | vault key 위치      | Zero-Knowledge  | 설명                                                         |
| :----------------- | :------------------ | :-------------- | :----------------------------------------------------------- |
| **1P 모델 (권고)** | 데스크톱 앱 전용    | 완전 유지       | Extension = 얇은 client, vault key 절대 보유 안 함           |
| Bitwarden 모델     | Extension 자체 보유 | 부분 (MV3 이슈) | Extension 이 vault 복호화 담당. MV3 SW ephemeral 특성과 충돌 |

**근거**: [2026-05-08] Zero-Knowledge 절대 유지 결정과 완전 정합. Extension 이 vault key 를 보유하면 MV3 service worker 가 idle 종료 시 key 관리 복잡도 급증.  
**Bitwarden 모델 채택 불가 사유**: Extension 자체 vault = Zero-Knowledge 위반. project-decisions.md [2026-05-08] 명시적 금지.

---

### D4. NM Host 구현 = 별도 Rust binary ✅ 권고 (대안 비교 후)

**두 옵션 비교**:

| 항목             | 옵션 A: 별도 binary (`secretbank-nm-host`) | 옵션 B: Tauri 앱에 stdio 모드 추가 |
| :--------------- | :----------------------------------------- | :--------------------------------- |
| 구현 복잡도      | MEDIUM (별도 Cargo binary target)          | HIGH (Tauri 앱 런타임 분기 처리)   |
| AGPL-3.0 경계    | 깔끔 (binary = AGPL-3.0 단독)              | Tauri 앱 안에 섞여 경계 불명확     |
| Installer 복잡도 | 별도 binary 포함 필요 (++MB)               | Tauri 앱 실행 파일 하나로 해결     |
| stdout 오염 위험 | 독립 binary 로 `println!` 실수 격리        | Tauri 이벤트 루프와 공유 → 위험    |
| 앱 미실행 시     | NM host 독립 실행 가능                     | Tauri 앱 전체 시작 필요            |
| 유지보수         | 책임 분리 명확                             | Tauri 앱 의존성 변경 시 영향       |

**권고**: 옵션 A (별도 binary). AGPL-3.0 경계 명확성, stdout 오염 격리, 향후 Tauri 앱과 독립적 배포 가능성 모두 우위.  
**단 Open Question 존재** → Q2 참조.

---

### D5. 페어링 프로토콜 = KeePassXC 모델 단순화 ✅ 권고

**권고**: KeePassXC 3-key 모델을 2-key 로 단순화. TweetNaCl 대신 기존 `secretbank-crypto` crate 의 X25519 + ChaCha20-Poly1305 재사용.

**단순화 내용**:

| 단계              | KeePassXC 원본                                  | Secretbank 단순화                                    |
| :---------------- | :---------------------------------------------- | :--------------------------------------------------- |
| Key 구조          | host key / client key / identity key (3-key)    | client key + session token (2-key)                   |
| 암호화 라이브러리 | TweetNaCl.js Box (XSalsa20-Poly1305, JS)        | secretbank-crypto (Rust, X25519 + ChaCha20-Poly1305) |
| 페어링 흐름       | change-public-keys → associate → test-associate | connect → pair → verify (3단계 유지, 내부 단순화)    |

**장점**: 기존 `age` 기반 crypto crate 재활용 → 별도 암호화 라이브러리 audit 비용 제거. 코드베이스 일관성.  
**단점**: KeePassXC 프로토콜 호환성 없음 (상호운용 불필요하므로 무관).  
**페어링 UX** → Q3 참조.

---

### D6. 모노레포 구조 = pnpm workspace 내 `extension/` + `packages/shared/` ✅ 권고

**권고 디렉토리 구조**:

```
secretbank/
├── src/                    # Tauri desktop frontend (기존)
├── src-tauri/              # Rust backend (기존)
│   └── src/
│       └── native_messaging_host.rs  (또는 별도 binary crate)
├── extension/              # WXT 브라우저 확장 (신규)
│   ├── wxt.config.ts
│   ├── package.json        # "@secretbank/extension"
│   └── src/
│       ├── entrypoints/    # popup, background, content
│       ├── components/     # extension UI (shadcn/ui 직접 설치)
│       └── _locales/       # i18n (YAML)
├── packages/
│   └── shared/             # 공통 라이브러리 (신규)
│       ├── package.json    # "@secretbank/shared"
│       └── src/
│           ├── password-generator.ts
│           ├── validation.ts
│           └── types.ts
└── pnpm-workspace.yaml     # extension/, packages/* 추가
```

**장점**: AGPL-3.0 라이선스 일관성, `workspace:*` 프로토콜로 shared lib 양방향 참조, 별도 repo 분리 대비 CI/CD 단순화.  
**단점**: WXT TypeScript 프로젝트가 root tsconfig 와 독립 — `.wxt/tsconfig.json` 별도 관리 필요.

---

### D7. Phase 분할 = A~F 6 Phase (총 55일 ≈ 8주) ✅ 권고

| Phase    | 내용                                                | 예상 일수 |  위험도  |
| :------- | :-------------------------------------------------- | :-------: | :------: |
| A        | 빌드 / 모노레포 / shared lib 골격                   |    7일    |   LOW    |
| B        | Native Messaging Host + 페어링                      |   10일    | **HIGH** |
| C        | Form auto-detect + autofill (read-only)             |   10일    |  MEDIUM  |
| D        | Save dialog + credential 저장                       |    7일    |  MEDIUM  |
| E        | Password Generator inline + recipe + Site Logo 완성 |    7일    |   LOW    |
| F        | Cross-browser + E2E 테스트 + 스토어 제출            |   14일    |  MEDIUM  |
| **합계** |                                                     | **55일**  |          |

**Phase B 가 최고 위험**: Native Messaging Host 신규 구현 + OS별 installer 등록 + 페어링 프로토콜 모두 미검증 영역.  
**Phase 순서 근거**: A(기반) → B(통신 채널, 가장 위험) → C(autofill 핵심 가치) → D(save dialog) → E(generator + logo) → F(cross-browser + 배포).

---

### D8. UI 라이브러리 = popup/shadcn + content/Shadow DOM 인라인 CSS ✅ 권고

**두 영역 분리 처리**:

| 영역                              | 기술 스택                                      | 이유                                              |
| :-------------------------------- | :--------------------------------------------- | :------------------------------------------------ |
| Extension popup (extension_pages) | shadcn/ui + Tailwind v4 (build-time CSS)       | 데스크톱 앱과 동일 디자인 시스템, CSP 'self' 허용 |
| Content script (인페이지 UI)      | Shadow DOM + `?inline` CSS + postcss-rem-to-px | Host 페이지 CSS 격리, rem 단위 충돌 방지          |

**Shadow DOM 필수 적용 이유**: Host 페이지 CSS 가 extension UI 를 망가뜨리는 문제 방지. NordPass/ProtonPass/Dashlane 모두 동일 방식 채택.  
**추가 필요 작업**: Radix UI Dialog 의 `Document.body` portal → Shadow Root 내부 portal 변경. `postcss-rem-to-px` WXT config 에 추가.

---

### D9. i18n = @wxt-dev/i18n (YAML, 타입 안전) ✅ 권고

**권고**: `@wxt-dev/i18n` v0.2.5 채택. 4 로케일 (en / ko / zh / ja).

**장점**: `_locales/` 표준 기반, YAML 포맷 지원, TypeScript 타입 안전, 빌드 시 `messages.json` 자동 변환, WXT 팀 공식 패키지.  
**제약**: 브라우저 언어 변경 없이는 런타임 언어 전환 불가 (extension 표준 제약, 회피 방법 없음).  
**데스크톱 앱과의 분리**: extension 은 `@wxt-dev/i18n`, desktop 은 기존 react-i18next. 공통 키 상수는 `packages/shared/src/i18n-keys.ts` 에 정의.

---

### D10. 권한 최소화 = optional_host_permissions 모델 ✅ 권고

**권고 manifest 권한**:

```json
{
  "permissions": ["activeTab", "storage", "nativeMessaging", "scripting"],
  "optional_permissions": ["clipboardWrite"],
  "optional_host_permissions": ["<all_urls>"]
}
```

**핵심 결정**: `<all_urls>` 를 `optional_host_permissions` 로 분류 → Chrome Web Store 심사 시 권한 정당화 부담 감소. 사용자가 사이트별로 "이 사이트에서만 허용" 또는 "모든 사이트에서 허용" 선택 가능.  
**`activeTab` 효과**: 사용자가 extension icon 클릭 시에만 현재 탭 접근 → 대부분 autofill 기능을 `<all_urls>` 없이 구현 가능.

---

### D11. Tiered Protection 구현 = WebAuthn → Tauri 앱 처리 → session token ✅ 권고

**흐름**:

```
extension → native messaging → Tauri 앱 → OS biometric (Touch ID / Windows Hello)
                                          ↓ session token (HMAC, 8시간 만료)
extension ← session token ← Tauri 앱
```

**자산별 처리**:

| credential kind                         | autofill 흐름                                                    | 재인증 주기              |
| :-------------------------------------- | :--------------------------------------------------------------- | :----------------------- |
| `password`                              | 브라우저 세션 시작 1회 인증 → session token 유지 → 즉시 autofill | 브라우저 종료 또는 8시간 |
| `api_key`                               | 각 reveal 시마다 native messaging → OS biometric 재확인          | per-reveal               |
| `credit_card`, `passkey`, `totp_secret` | per-reveal 재인증                                                | per-reveal               |

**project-decisions.md [2026-05-08] Tiered Protection 모델과 완전 정합**.  
**세션 만료 시간** → Q4 참조.

---

### D12. Site Logo 통합 = 기존 favicon-proxy Worker 재사용 ✅ 권고

**권고 fallback chain** (project-decisions.md [2026-05-08] Site Logo 결정과 동일):

1. Bundled SVG (17개 issuer preset, `simpleicons.org`)
2. `secretbank.app/api/favicon/<domain>` Worker 호출 + IndexedDB 캐시 (24h TTL)
3. 도메인 첫 글자 + brand-aware gradient fallback

**Extension 추가 구현**: Worker 응답을 `chrome.storage.local` 또는 IndexedDB 에 URL 기반 캐시. `chrome.favicon` API 는 Chrome 전용이라 채택 안 함.  
**Privacy 보장**: Worker 가 secretbank 계정 정보와 favicon 요청을 연결할 수 없음. Zero-Knowledge 와 양립.

---

### D13. Password Generator inline = packages/shared/password-generator.ts ✅ 권고

**권고**: 기존 데스크톱 앱 generator 로직을 `packages/shared/password-generator.ts` 로 이관. Extension content script 와 데스크톱 앱 모두 동일 코드 재사용.

**기능 스펙**:

- Diceware 6단어 (en/ko/ja/zh, BIP39 wordlist 기반)
- 무작위 문자열 (issuer recipe 정책: min/max/uppercase/number/special/forbidden)
- zxcvbn 강도 미터 (0-4 + 크랙 시간 추정) — zxcvbn-ts 권고 (zxcvbn 원본은 장기 미유지보수)

**트리거**: `autocomplete="new-password"` 필드 감지 시 필드 우측에 generator 아이콘 표시.

---

### D14. Save dialog UX = in-page sticky banner + popup 보조 ✅ 권고

**UX 흐름**:

```
form submit 감지 → in-page sticky banner (Shadow DOM, 상단 고정)
                  → 사용자 "Save" 클릭 → extension popup 에서 세부 저장 확인
                  → "Never for this site" / "Not now" 옵션 포함 (1P UX 동일)
```

**신규 가입 vs 비밀번호 변경 분기**:

- `autocomplete="new-password"` + 도메인 신규 → "새 로그인 저장" 배너
- `autocomplete="new-password"` + 기존 credential 존재 → "비밀번호 업데이트?" 배너

**AJAX submit 처리**: MAIN world 스크립트가 XHR/fetch intercept → `window.postMessage` → ISOLATED world content script → service worker. 민감 데이터 (credential plaintext) 는 postMessage 로 전달 ❌.

---

### D15. DOM Clickjacking 방어 ✅ 권고

**배경**: 2025년 Marek Tóth 발견. 1Password, Bitwarden 포함 대부분 취약. NordPass/ProtonPass/Dashlane 패치 완료.

**방어 3계층**:

1. **MutationObserver**: Extension UI (`#secretbank-autofill-ui`) 위에 투명 overlay 감지 → 재배치 또는 경고
2. **Closed Shadow Root**: `attachShadow({ mode: 'closed' })` — 외부 JS 가 shadow root 접근 불가
3. **composedPath() 방어**: `focusin` 이벤트의 composedPath 로 실제 target 검증

**잔여 위험**: 모든 사이트 수동 audit 불가능 (Blocker B5). 알려진 기법 방어는 충분, 신규 기법은 지속 모니터링 필요.

---

### D16. E2E 테스트 = Playwright + web-ext + Mock NM Host ✅ 권고

**테스트 매트릭스**:

| 브라우저 | 도구                          | CI Runner        | 비고                    |
| :------- | :---------------------------- | :--------------- | :---------------------- |
| Chrome   | Playwright (headless)         | ubuntu-latest    | 완전 지원               |
| Edge     | Playwright (chromium channel) | ubuntu-latest    | Chrome 과 거의 동일     |
| Firefox  | Mozilla web-ext               | ubuntu-latest    | Playwright 확장 미지원  |
| Safari   | Xcode + xcrun                 | **macos-latest** | CI 비용 ↑ (Q1, Q2 연계) |

**Mock Native Messaging Host**: Node.js stub (stdin/stdout 4-byte 헤더 처리) → Tauri 앱 없이 extension 단독 E2E 테스트 가능. 통합 테스트는 Phase F 에서.

---

### D17. Web Store 제출 = 두 단계 출시 ✅ 권고

| 단계               | 브라우저                        | Phase   | 비고                                                         |
| :----------------- | :------------------------------ | :------ | :----------------------------------------------------------- |
| F-1 (Phase F 초반) | Chrome Web Store + Firefox AMO  | Phase F | AGPL-3.0 소스코드 이미 공개 → AMO 심사 유리                  |
| F-2 (Phase F 후반) | Safari App Store + Edge Add-ons | Phase F | Safari = macOS runner 필요, Apple Developer Program ($99/년) |

**Chrome Web Store 필수 준비**:

- Privacy policy: `secretbank.app/privacy.html` (기존 `docs/PRIVACY.md` 기반)
- 아이콘: 16/32/48/128px (PNG)
- 스크린샷: 최소 1개
- 권한 정당화 문서 (nativeMessaging, scripting 사유)

**첫 출시 범위** → Q1 참조.

---

### D18. AGPL-3.0 경계 = extension + packages/shared = OSS core ✅ 권고

| 경로                                                         | 라이선스       | 내용                                                    |
| :----------------------------------------------------------- | :------------- | :------------------------------------------------------ |
| `extension/`                                                 | **AGPL-3.0**   | WXT 브라우저 확장 전체                                  |
| `packages/shared/`                                           | **AGPL-3.0**   | 공통 라이브러리 (password-generator, types, validation) |
| `src-tauri/src/native_messaging_host.rs` (또는 binary crate) | **AGPL-3.0**   | NM host binary                                          |
| `ee/`                                                        | **EE License** | Auto-rotation, premium connectors (데스크톱 측 호출만)  |

**Extension 이 EE 코드를 포함하지 않는 방법**: Extension 은 native messaging 으로 "이 credential 에 EE 기능 가능?" 여부만 조회. EE 기능 실행은 데스크톱 앱 (`ee/` crate) 이 담당. Extension 코드베이스 내 EE import ❌.

---

## 3. project-decisions 정합성 검증

각 D1~D18 이 기존 확정 결정과 충돌 없는지 표로 검증.

| 결정 ID                 | 참조 project-decisions.md                                                      | 정합 여부 | 충돌 내용 / 해소안                                                                                                           |
| :---------------------- | :----------------------------------------------------------------------------- | :-------: | :--------------------------------------------------------------------------------------------------------------------------- |
| D1 (WXT)                | [2026-05-09] M24-E 직행, M24-E 사양 "manifest v3 / cross-browser"              |    ✅     | WXT 가 MV3 + 4브라우저 모두 지원                                                                                             |
| D2 (Native Messaging)   | [2026-05-08] 보안 절대 우선                                                    |    ✅     | OS 보안 모델 위임, 가장 안전한 통신 방식                                                                                     |
| D3 (1P 모델)            | [2026-05-08] Zero-Knowledge 절대 유지                                          |    ✅     | Extension 이 vault key 미보유 = Zero-Knowledge 완전 유지                                                                     |
| D4 (별도 binary)        | [2026-05-08] AGPL-3.0 / EE 듀얼 라이선스                                       |    ✅     | 별도 binary = AGPL-3.0 단독, 경계 명확                                                                                       |
| D5 (페어링 단순화)      | [2026-05-08] 보안 절대 우선                                                    |    ✅     | secretbank-crypto crate 재사용 → audit 비용 ↓, 보안 수준 유지                                                                |
| D6 (모노레포)           | [2026-05-09] M24-E 안에서 Site Logo / PwGen / Quick Save 통합 발현             |    ✅     | packages/shared 에 PwGen 모듈 → 통합 발현 구조 정합                                                                          |
| D7 (Phase 분할)         | [2026-05-09] Night mode 운용 (Gate 1-4 외 중간 질문 금지)                      |    ✅     | 6 Phase 분할로 Gate 기반 승인 구조 정합                                                                                      |
| D8 (UI 분리)            | [2026-05-08] shadcn/ui + Tailwind v4 디자인 시스템 (CLAUDE.md)                 |    ✅     | Popup = 데스크톱 앱 동일 스택, Content script = Shadow DOM 격리                                                              |
| D9 (i18n)               | [2026-05-09] M24-E 사양 (4 로케일)                                             |    ✅     | @wxt-dev/i18n 4 로케일 YAML                                                                                                  |
| D10 (권한 최소화)       | [2026-05-07] 보안 절대 우선 + Chrome Web Store 심사 현실                       |    ✅     | optional_host_permissions 로 최소 권한 원칙 충족                                                                             |
| D11 (Tiered Protection) | [2026-05-08] Tiered Protection 모델 채택 (password=세션/api_key=per-reveal)    |    ✅     | 완전 정합. session token 유지 시간만 미확정 (Q4)                                                                             |
| D12 (Site Logo)         | [2026-05-08] Site Logo D+E 조합 (favicon-proxy Worker + bundled SVG + 첫 글자) |    ✅     | 완전 정합. extension UI 에서도 동일 Worker 재사용                                                                            |
| D13 (PwGen)             | [2026-05-09] Password Generator M24-E 통합 발현                                |    ✅     | packages/shared 로 이관 = desktop + extension 공유                                                                           |
| D14 (Save dialog)       | [2026-05-08] Quick Save = autofill save handler 가 본질                        |    ✅     | in-page sticky banner = Quick Save 의 실체. 1P UX 동등                                                                       |
| D15 (DOM Clickjacking)  | [2026-05-07] 보안 절대 우선                                                    |    ✅     | 2025년 신규 위협에 선제 대응                                                                                                 |
| D16 (E2E)               | 없음 (신규)                                                                    |    ✅     | 기존 결정과 충돌 없음. CI 비용 현실 감안 단계적 구성                                                                         |
| D17 (스토어 제출)       | [2026-05-09] M24-E 직행 (Chrome/Firefox/Safari/Edge)                           |    ⚠️     | **주의**: [2026-05-09] 에 4 브라우저 동시 명시. 본 보고서는 F-1/F-2 단계 분리 권고. 차이 있음 → **Q1 에서 사용자 결정 필요** |
| D18 (AGPL-3.0 경계)     | AGPL-3.0 / EE 듀얼 라이선스 구조                                               |    ✅     | extension = OSS core, EE = desktop 측만                                                                                      |

**발견된 충돌**:

- D17 vs [2026-05-09] "Chrome / FF / Safari / Edge × manifest v3": 연구자 보고서는 Safari + Edge 를 Phase F-2 로 분리 권고. 이유는 Safari = macOS runner CI 추가 비용 + Apple Developer Program $99/년 미등록 시 블로킹. 원 결정은 4 브라우저 동시 출시 상정. **Q1 에서 사용자 결정 필요**.

---

## 4. 위협 모델 — THREAT_MODEL.md 추가 권고 항목

> 아래는 실제 `docs/THREAT_MODEL.md` 수정 ❌. 보고서에만 권고 기술. 실제 갱신은 Phase B 진입 후 implementator 가 수행.

### T1. NM Channel 도청 / Replay (host process spawning)

**자산**: Native Messaging stdio 채널 (extension ↔ secretbank-nm-host)  
**위협**: 악성 프로세스가 NM host 를 가장하거나, 정상 메시지를 replay 하여 credential 무단 조회.  
**완화 방법**:

- OS 가 NM host binary path 를 registry/plist 에서 검증 → 가짜 host spawn 차단 (브라우저 자체 보안 모델)
- 모든 메시지에 단조 증가 nonce 포함 → replay 차단
- session token 에 만료 시간 (8시간) 포함 → 도난 토큰 유효 기간 제한
- 잔여 위험: host binary 자체가 변조된 경우 (악성 업데이트, T7 참조)

### T2. Content Script ↔ MAIN world postMessage 도청

**자산**: AJAX intercept 결과 (form submit payload)  
**위협**: 악성 사이트 JS 가 `window.postMessage` 를 도청하여 form 데이터 탈취.  
**완화 방법**:

- postMessage 에 `targetOrigin = window.location.origin` 명시 (`'*'` 절대 금지)
- MAIN world → ISOLATED world 전달 시 credential plaintext ❌, 도메인 + 이벤트 타입만 전달
- 실제 credential 조회는 service worker → native messaging 에서만
- 잔여 위험: origin 검증 우회 (XSS 발생 시). XSS 방어는 host 사이트 책임.

### T3. DOM Clickjacking (2025년 신규 위협)

**자산**: Extension autofill UI (shadow DOM 내 버튼)  
**위협**: 악성 사이트가 투명 overlay 로 extension UI 를 가려 사용자 클릭을 가로챔.  
**완화 방법**:

- MutationObserver 로 extension UI 위 element 감지 → 재배치 또는 경고 표시
- Closed Shadow Root (`mode: 'closed'`) → 외부 JS 의 shadow root 접근 차단
- composedPath() 로 실제 이벤트 target 검증
- 잔여 위험: MutationObserver 도입 전 짧은 시간 창, 새로운 clickjacking 기법 (D15 참조)

### T4. Phishing Site 의 가짜 form 자동 fill

**자산**: Credential plaintext (사용자명 + 비밀번호)  
**위협**: Phishing 사이트가 실제 사이트 도메인을 모방하여 자동 autofill 유도.  
**완화 방법**:

- autofill 전 HTTPS 여부 검증 (HTTP 사이트 autofill ❌)
- 도메인 정확히 일치 확인 (subdomain 허용 범위 명시 필요)
- Focus 시 오버레이 표시 후 사용자 클릭 필요 (page load 자동 fill ❌)
- 잔여 위험: 도메인 typosquatting (예: `g1thub.com`). 사용자 주의 + 브라우저 safebrowsing 의존.

### T5. Browser Side-channel (Spectre/Meltdown 잔여)

**자산**: Extension 메모리 내 session token / credential 버퍼  
**위협**: 같은 프로세스 내 타이밍 공격으로 extension 메모리 일부 추출.  
**완화 방법**:

- MV3 의 strict isolation (각 extension 별도 renderer process) 이 부분 완화
- credential 사용 후 즉시 변수 해제, 버퍼 최소화
- 잔여 위험: 브라우저 벤더 수준 패치 의존. Extension 레벨에서 완전 방어 불가.

### T6. MV3 Service Worker 일시정지 시 Race Condition

**자산**: 진행 중인 native messaging 요청 / autofill 상태  
**위협**: idle 30초 후 SW 종료 시 응답 대기 중인 메시지 손실. 재시작 시 상태 불일치.  
**완화 방법**:

- Native Messaging Port 연결 유지 중에는 SW idle 타임아웃 자동 연장 (Chrome 표준 동작)
- `chrome.storage.local` 에 진행 중 요청 큐 저장 → SW 재시작 후 재전송
- UI 레벨 loading spinner → 실패 시 재시도 유도
- 잔여 위험: 매우 빠른 idle 전환 시나리오 (사용자 입력 직후 idle → 드문 케이스).

### T7. Extension 권한 Abuse (악성 업데이트)

**자산**: 사용자 vault credential, native messaging 채널  
**위협**: Web Store 심사 통과 후 업데이트 배포로 악성 코드 삽입 (Supply chain attack).  
**완화 방법**:

- AGPL-3.0 오픈소스 → 소스코드 공개 검증 가능
- Firefox AMO: 모든 소스코드 제출 필수 → 심사 레이어 추가
- 최소 권한 모델 (D10) → 권한 남용 범위 제한
- native messaging host 의 NM manifest `allowed_origins` 에 정확한 extension ID 만 허용
- 잔여 위험: 심사 우회는 모든 extension 의 구조적 한계. 모니터링 + 빠른 패치 배포가 최선.

---

## 5. 잠재적 차단 (Blocker / High Risk)

### B1. Phase B — OS별 NM Host Installer 등록 (High Risk)

**내용**: Windows NSIS hook (registry), macOS postinstall (plist + json), Linux (config dir).  
**위험**: 세 OS 모두 별도 검증 필요. Windows UAC / macOS Gatekeeper / Linux 배포판별 차이.  
**해소 방향**: `native_messaging` Rust crate 의 `install()` 함수를 활용해 Rust 코드에서 첫 실행 시 자동 등록. NSIS hook 과 병행. Phase B 시작 전 세 OS 환경에서 수동 검증 필수.  
**미해소 시**: Windows + macOS 에서 NM connection 실패 → Phase B 전체 블로킹.

### B2. Safari Web Extension — Xcode 빌드 + macOS CI Runner (High Risk)

**내용**: Safari Extension = Xcode 16+ 래핑 필수. App Store 심사 = 최대 수 주. Apple Developer Program $99/년 필수.  
**위험**: macOS runner CI 비용 (GitHub Actions: ubuntu 대비 약 10배). Apple Developer Program 미등록 시 Phase F-2 블로킹.  
**해소 방향**: Phase F-1 (Chrome + Firefox) 완료 후 Phase F-2 진입. Apple Developer Program Phase E 시작 전 가입.  
**미해소 시**: Safari 출시 지연 (Phase F-2 만 영향, Chrome/Firefox 는 독립 출시 가능).

### B3. Chrome Web Store Privacy Policy 강화 (Medium Risk)

**내용**: 2025년 1월 정책 강화. nativeMessaging + scripting 권한 상세 정당화 필수. privacy policy URL 필수.  
**위험**: 심사 거부 시 수정 + 재제출 (수 일 ~ 수 주 소요). 1회 항소 가능, 재항소 불가.  
**해소 방향**: `docs/PRIVACY.md` 를 extension 전용으로 확장 (nativeMessaging 데이터 처리 명시). Phase F-1 시작 2주 전 privacy policy 초안 작성.  
**미해소 시**: Chrome Web Store 첫 제출 지연.

### B4. 페어링 프로토콜 보안 Audit (Medium Risk)

**내용**: KeePassXC 프로토콜 단순화 + secretbank-crypto crate 재활용. 신규 페어링 흐름은 별도 audit 필요.  
**위험**: 페어링 흐름의 취약점이 vault 전체 노출로 이어질 수 있음 (가장 중요한 보안 경계).  
**완화**: secretbank-crypto crate 재활용 = 암호화 primitives audit 비용 절감. 페어링 흐름 설계 자체는 Phase B 완료 후 별도 코드 리뷰 + 외부 감사.  
**해소 방향** → Q5 참조.

### B5. DOM Clickjacking 방어 잔여 위험 (Low-Medium Risk)

**내용**: 알려진 기법 (2025년 Marek Tóth) 은 방어. 신규 기법 방어 불가.  
**위험**: 모든 사이트 수동 audit 불가. 새로운 clickjacking 변형 공격 가능.  
**해소 방향**: Phase C 에서 known 기법 방어 구현 완료. 이후 보안 연구 모니터링 (OWASP Browser Extension WG, GitHub Security Blog).

---

## 6. Open Questions (사용자 결정 필요 — GATE 1)

### Q1. 첫 출시 범위 = Chrome + Firefox 만? 또는 4 브라우저 동시?

**선택지**:

- **A. Chrome + Firefox 우선** (Phase F-1), Safari + Edge 는 Phase F-2 별도 commits
  - 장점: macOS runner CI 비용 없음, Apple Developer Program $99 지연 가능, 출시 시점 단축
  - 단점: [2026-05-09] 원 결정 (4 브라우저) 과 차이. Safari 사용자 대기
- **B. 4 브라우저 동시**
  - 장점: 원 결정 준수
  - 단점: Apple Developer Program 즉시 등록 ($99), macOS CI runner 비용, Safari App Store 심사 수 주 대기로 전체 Phase F 지연

**권고**: A (단계적 출시). 실용성 우선.

### Q2. NM Host = 별도 Rust binary 신설 vs Tauri 앱에 stdio 모드 추가?

**선택지**:

- **A. 별도 Rust binary** (D4 권고): `secretbank-nm-host` 독립 binary. AGPL-3.0 경계 명확.
- **B. Tauri 앱 자체에 stdio 모드**: Tauri 앱 실행 시 `--nm-host` 플래그로 NM host 모드 진입. installer 단순화.

**권고**: A (별도 binary). 단 installer 크기 증가가 수용 가능한지 확인 필요.

### Q3. 페어링 흐름 UX = QR 코드 / one-time PIN / device-bound key 중?

**선택지**:

- **A. One-time PIN** (숫자 6자리): 데스크톱 앱에 표시 → 확장에 입력. 구현 단순.
- **B. QR 코드**: 모바일(M11)에서 직접 페어링 가능하나, desktop-only 시나리오에서는 카메라 필요.
- **C. Device-bound key** (자동): 사용자 개입 없이 첫 연결 시 자동 페어링 → "Secretbank 확장 연결을 허용하시겠습니까?" 승인 다이얼로그만.

**권고**: C (자동 페어링 + 승인 다이얼로그). KeePassXC associate 모델 참조. 마찰 최소화. 단 사용자가 PIN 입력 방식을 더 안전하다고 느낀다면 A 병행 옵션 제공.

### Q4. password session token 유지 시간 = 30분 / 1시간 / 4시간 / 8시간 / 사용자 설정?

**선택지**:

| 옵션                     | UX      | 보안   |
| :----------------------- | :------ | :----- |
| 30분                     | 불편    | 최고   |
| 1시간                    | 중간    | 높음   |
| 4시간                    | 좋음    | 중간   |
| 8시간 (권고 초안)        | 최고    | 낮음   |
| 사용자 설정 (15분~8시간) | 1P 동일 | 선택적 |

**권고**: 기본값 4시간 + 사용자 설정 가능 (15분 / 1시간 / 4시간 / 8시간 / 브라우저 종료 시). Tiered Protection 모델 정신 = 마찰 최소화이므로 4시간 기본값이 적절.

### Q5. Phase B 진입 전 외부 보안 감사?

**선택지**:

- **A. Phase B 완료 후 페어링 흐름만 외부 감사** → Phase C 진입 전
- **B. Phase F 전체 완료 후 종합 감사**
- **C. 감사 없이 진행** (OSS + AGPL-3.0 공개 검증 의존)

**권고**: A. 페어링 + NM 흐름은 vault 전체 접근 통로이므로 핵심 경계. Phase B 완료 후 작은 범위 감사가 비용 대비 효과 최대. 단 감사 업체 선정 + 일정 미확정이면 C 로 진행 후 출시 후 감사도 현실적 옵션.

### Q6. 첫 commit 단위 = Phase A 전체 (7일치) vs sub-task 분할 (각 1~2일)?

**선택지**:

- **A. Phase 단위 (7~10일)**: Night mode 운용과 정합 (Gate 1 승인 후 Phase A → Phase A 완료 → Gate 2 → Phase B...)
- **B. Sub-task 분할 (1~2일)**: 더 잦은 커밋 + 빠른 피드백. Night mode 도중 중간 체크 포인트.

**권고**: B (sub-task 분할). Night mode 에서 1~2일 단위 commit 이 오류 격리 용이. Phase A 안에서 모노레포 설정 / WXT 초기화 / popup 스켈레톤 등 자연스러운 단위로 분할 가능.

---

## 7. 권고 결론

M24-E 브라우저 확장은 Secretbank 의 daily driver 진입을 가능하게 하는 핵심 마일스톤이다. Researcher 보고서가 제시한 18개 결정 항목 (D1~D18) 은 모두 근거가 명확하며, project-decisions.md 의 기존 결정과 충돌하는 항목은 D17 하나뿐이다 (첫 출시 브라우저 범위, Q1 에서 해소 가능). WXT + Native Messaging + 1P 모델의 조합은 Zero-Knowledge 원칙과 Tiered Protection 모델을 모두 만족하며, KeePassXC-Browser 를 OSS 참조 모델로 활용하는 방향은 audit 비용을 현실적으로 절감한다.

Phase B (Native Messaging Host) 가 전체 구현의 최고 위험 지점이다. OS별 installer 등록과 페어링 프로토콜 모두 미검증 영역이며, Phase B 블로킹이 발생하면 전체 M24-E 일정이 지연된다. Phase B 시작 전 세 OS 환경 (Windows / macOS / Linux) 에서 NM host 수동 연결 검증을 선행하고, Phase B 완료 직후 페어링 흐름 단독 보안 리뷰를 진행하는 것을 강력 권고한다. 아래 요약 표에서 D1~D18 과 Q1~Q6 를 한눈에 확인하고, GATE 1 에서 일괄 승인 / 부분 수정 / 거부 중 선택하면 된다.

---

## 8. GATE 1 요약 표 — D1~D18 + Q1~Q6

### 결정 항목 (D1~D18) — 일괄 승인 대상

| ID  | 결정 내용                                                                        |     상태     | 비고                                                    |
| :-- | :------------------------------------------------------------------------------- | :----------: | :------------------------------------------------------ |
| D1  | 빌드 도구 = WXT v0.20.x                                                          |   ✅ 권고    | Tailwind v4 + Safari + 모노레포 통합                    |
| D2  | 통신 채널 = Native Messaging                                                     |   ✅ 권고    | Zero-Knowledge 정합, OS 보안 모델 위임                  |
| D3  | vault 모델 = 1P 모델 (vault key = Tauri 앱)                                      |   ✅ 권고    | extension 이 vault key 미보유 = ZK 유지                 |
| D4  | NM Host = 별도 Rust binary (`secretbank-nm-host`)                                |   ✅ 권고    | AGPL-3.0 경계 명확, stdout 격리 (Q2 연계)               |
| D5  | 페어링 = KeePassXC 단순화 + secretbank-crypto 재사용                             |   ✅ 권고    | audit 비용 절감                                         |
| D6  | 모노레포 = pnpm workspace + `extension/` + `packages/shared/`                    |   ✅ 권고    | 코드 공유 + 라이선스 일관성                             |
| D7  | Phase 분할 = A~F 6 Phase, 총 55일 ≈ 8주                                          |   ✅ 권고    | Phase B 최고 위험                                       |
| D8  | UI = popup/shadcn + content script/Shadow DOM + 인라인 CSS                       |   ✅ 권고    | rem→px 변환 필수                                        |
| D9  | i18n = @wxt-dev/i18n (YAML, 4 로케일)                                            |   ✅ 권고    | 타입 안전, WXT 공식                                     |
| D10 | 권한 = `activeTab` + `storage` + `nativeMessaging` + `scripting` + optional host |   ✅ 권고    | Web Store 심사 부담 최소화                              |
| D11 | Tiered Protection = WebAuthn → Tauri 앱 → session token (HMAC)                   |   ✅ 권고    | password = 세션 유지, api_key/카드/passkey = per-reveal |
| D12 | Site Logo = favicon-proxy Worker 재사용 + IndexedDB 캐시 + fallback              |   ✅ 권고    | [2026-05-08] 결정 정합                                  |
| D13 | Password Generator = packages/shared/password-generator.ts (desktop 공유)        |   ✅ 권고    | Diceware + zxcvbn-ts + issuer recipe                    |
| D14 | Save dialog = in-page sticky banner (Shadow DOM) + popup 보조                    |   ✅ 권고    | Quick Save 의 실체                                      |
| D15 | DOM Clickjacking = MutationObserver + Closed Shadow Root + composedPath()        |   ✅ 권고    | 2025년 신규 위협 선제 대응                              |
| D16 | E2E = Playwright (Chrome/Edge) + web-ext (Firefox) + Mock NM Host                |   ✅ 권고    | Safari CI = Q1 연계                                     |
| D17 | 스토어 = F-1 (Chrome + Firefox) → F-2 (Safari + Edge)                            | ⚠️ 수정 권고 | 원 결정 (4 브라우저 동시) 과 차이 → Q1 결정 필요        |
| D18 | AGPL-3.0 경계 = extension + packages/shared + nm-host = OSS core                 |   ✅ 권고    | EE 코드 extension 내 포함 ❌                            |

### Open Questions (Q1~Q6) — 사용자 결정 필요

| ID  | 질문                                               | 선택지                                                | 권고                                    |
| :-- | :------------------------------------------------- | :---------------------------------------------------- | :-------------------------------------- |
| Q1  | 첫 출시 = Chrome+FF 만? 또는 4 브라우저 동시?      | A: Chrome+FF 우선 / B: 4개 동시                       | A (단계적 출시)                         |
| Q2  | NM Host = 별도 binary 신설 vs Tauri 앱 stdio 모드? | A: 별도 binary / B: Tauri 앱 통합                     | A (별도 binary)                         |
| Q3  | 페어링 UX = QR 코드 / one-time PIN / 자동 페어링?  | A: PIN / B: QR / C: 자동 승인 다이얼로그              | C (자동, 마찰 최소)                     |
| Q4  | password session token 유지 시간?                  | 30분 / 1시간 / 4시간 / 8시간 / 사용자 설정            | 기본 4시간 + 사용자 설정                |
| Q5  | Phase B 완료 후 외부 보안 감사?                    | A: Phase B 후 페어링만 / B: Phase F 후 종합 / C: 없음 | A 권고 (단 일정 미확정이면 C 도 현실적) |
| Q6  | 첫 commit 단위 = Phase 단위 vs sub-task 분할?      | A: Phase 단위 (7~10일) / B: sub-task (1~2일)          | B (sub-task 분할)                       |

---

_본 보고서는 researcher 출처 기반 근거만 사용. 추측 또는 허구 출처 없음._  
_THREAT_MODEL.md 직접 수정 없음. 위 4장의 내용을 Phase B 진입 후 implementator 가 반영._
