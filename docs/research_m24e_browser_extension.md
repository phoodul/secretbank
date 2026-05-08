# M24-E Browser Extension 풀구현 사전 조사 보고서

> 작성일: 2026-05-09  
> 작성자: Research Agent (claude-sonnet-4-6)  
> 대상 마일스톤: M24-E — Secretbank 브라우저 확장 풀구현  
> 참조 결정: [2026-05-09] project-decisions.md — M24-E 직행 결정  

---

## 목차

- [A. 아키텍처 / 빌드 (Manifest V3 + cross-browser)](#a-아키텍처--빌드-manifest-v3--cross-browser)
- [B. 네이티브 통신 (확장 ↔ Tauri 데스크톱 앱)](#b-네이티브-통신-확장--tauri-데스크톱-앱)
- [C. Form auto-detect / autofill](#c-form-auto-detect--autofill)
- [D. Save dialog / Quick Save 통합](#d-save-dialog--quick-save-통합)
- [E. UI / 디자인 시스템 / Site Logo 통합](#e-ui--디자인-시스템--site-logo-통합)
- [F. 보안 / 권한 / 위협 모델](#f-보안--권한--위협-모델)
- [G. E2E 테스트 / CI 빌드](#g-e2e-테스트--ci-빌드)
- [H. 경쟁 제품 분석](#h-경쟁-제품-분석)
- [I. 통합 권고 / Phase 분할](#i-통합-권고--phase-분할)

---

## A. 아키텍처 / 빌드 (Manifest V3 + cross-browser)

### A.1. Manifest V3 vs V2 — service worker lifecycle, idle timeout, persistent state

**요약**  
MV3의 가장 큰 변화는 background page(persistent) → service worker(ephemeral) 전환이다. idle 30초 후 자동 종료되며, 전역 메모리에 상태를 저장할 수 없다.

**출처**
- [Chrome Developers — Extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)  
  발행일: 2024-2025 최신 유지. 신뢰도: HIGH (공식 Google 문서)
- [Chrome 139 — MV2 지원 종료 타임라인](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline)  
  신뢰도: HIGH (공식)

**상세**

| 항목 | MV2 | MV3 |
|:---|:---|:---|
| Background 방식 | Persistent background page | Service Worker (ephemeral) |
| 상태 유지 | 전역 변수 가능 | chrome.storage / IndexedDB 필수 |
| Idle 타임아웃 | 없음 | **30초 비활성 시 종료** |
| 최대 실행 시간 | 없음 | 단일 요청 5분, fetch 응답 30초 |
| Eval 허용 | 가능 | **금지** |
| Remote code 허용 | 가능 | **금지** (번들에 포함 필수) |

**수명 연장 패턴 (MV3)**  
- `chrome.alarms` API: 최소 30초 주기 알람으로 SW 깨우기 (Chrome 120+에서 최소값 30초로 제한)
- WebSocket 송수신: SW idle timer 리셋 (Native Messaging 연결도 동일)
- `chrome.runtime.Port` 유지: 롱-라이브 포트 연결 중에는 SW 유지
- DevTools 열려있을 때: 항상 활성 상태 (개발 전용)

**Chrome 139 (2025년 6월)**: MV2 Enterprise 정책 예외 종료, Chrome Web Store에서 MV2 확장 제거 시작.  
**Firefox**: MV2 지원 무기한 유지 의사 공식 발표 (2024-03 Mozilla blog). Firefox는 MV3과 MV2 모두 지원.

**우리 적용**  
Secretbank 확장은 MV3 전용으로 설계한다. Service worker에는 state를 저장하지 않고, 모든 세션 토큰은 `chrome.storage.local`에 암호화 저장한다. Native Messaging 채널이 열려있는 동안 SW가 자동으로 활성 상태를 유지하므로 별도 keepalive 로직 불필요.

---

### A.2. WebExtension API — `browser` namespace vs `chrome.*` + webextension-polyfill

**요약**  
Firefox/Safari는 `browser.*` namespace (Promise 기반), Chrome은 `chrome.*` namespace (callback 기반). `webextension-polyfill`이 Chrome을 Promise 기반으로 래핑해 단일 코드베이스 유지 가능.

**출처**
- [Mozilla WebExtension Polyfill GitHub](https://github.com/mozilla/webextension-polyfill)  
  신뢰도: HIGH (Mozilla 공식)
- [MDN — Build a cross-browser extension](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Build_a_cross_browser_extension)  
  신뢰도: HIGH (MDN, 2025-07 최신)

**상세**  
`webextension-polyfill` 동작 원리:
- Firefox에서는 no-op (이미 `browser.*` 존재)
- Chrome에서 `chrome.*` callback API를 Promise wrapping

WXT 프레임워크는 이 polyfill을 내장하고 있어 별도 설정 불필요. 코드 중복 비율 실질적으로 0%. WXT가 빌드 시 브라우저별로 namespace를 자동 처리.

**우리 적용**  
WXT 채택 시 polyfill 문제 자동 해결. `browser.*` API를 직접 사용하되, WXT의 자동 import가 올바른 namespace를 주입.

---

### A.3. Safari Web Extension — Xcode 빌드 wrapper, App Store, macOS

**요약**  
Safari Web Extension은 반드시 Xcode 프로젝트로 래핑해야 하며, macOS/iOS App Store를 통해 배포한다. Apple Developer Program ($99/년) 필수. 2025년 4월부터 Xcode 16 + iOS 18 SDK 필수.

**출처**
- [Apple Developer — Creating a Safari web extension](https://developer.apple.com/documentation/safariservices/creating-a-safari-web-extension)  
  신뢰도: HIGH (Apple 공식)
- [Apple Developer — Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-web-extension-for-safari)  
  신뢰도: HIGH
- [wxt-module-safari-xcode npm](https://www.npmjs.com/package/wxt-module-safari-xcode)  
  신뢰도: MEDIUM (커뮤니티 패키지, rxliuli 작성)

**상세**

변환 흐름:
```
WXT build → .output/safari-mv3/ → xcrun safari-web-extension-converter → Xcode project → Archive → App Store Connect
```

`wxt-module-safari-xcode` 패키지: WXT의 `build:done` hook에서 자동으로 `xcrun safari-web-extension-converter`를 실행해 Xcode 프로젝트 생성. 버전 번호, App Category, Development Team 등을 자동 구성.

**App Store Review 요구사항 (2025)**
- Xcode 16 또는 이상 필수 (2025년 4월 24일부터)
- 일반 앱과 동일한 심사 절차 적용
- 아이콘 세트 필수: 16x16, 32x32, 128x128, 256x256, 512x512 (macOS)
- Privacy policy URL 필수
- Extension permission 정당화 심사

**우리 적용**  
Safari는 Phase F(마지막 단계)에서 구현. `wxt-module-safari-xcode`로 Xcode 프로젝트 자동 생성. Apple Developer Program 등록 필요 (현재 미등록 시 Phase E에서 가입). macOS용 Safari Extension은 Secretbank 데스크톱 앱(.dmg/.app)과 별도 Mac App Store 앱으로 배포.

---

### A.4. 빌드 도구 비교: WXT vs Plasmo vs vite-plugin-web-extension

**요약**  
WXT가 2025-2026 기준 압도적 권고. Plasmo는 유지보수 위험, CRXJS는 빌드 도구에 불과. **WXT 채택**.

**출처**
- [The 2025 State of Browser Extension Frameworks (redreamality.com)](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/)  
  신뢰도: HIGH (2025년 분석, 독립적 비교)
- [WXT 공식 사이트](https://wxt.dev/) — v0.20.25 (2026-04-18)  
  신뢰도: HIGH (공식)
- [Chrome Extension Development in 2025: Plasmo vs WXT (devkit.best)](https://www.devkit.best/blog/mdx/chrome-extension-framework-comparison-2025)  
  신뢰도: MEDIUM

**상세 비교**

| 항목 | WXT | Plasmo | CRXJS |
|:---|:---|:---|:---|
| GitHub Stars | 7.9k | 12.3k | 3.5k |
| 유지보수 상태 | 활발함 (2026년 4월 최신) | 유지보수 모드 (위험) | 최근 부활 (불안정) |
| 번들러 | Vite | Parcel | Vite plugin |
| React 지원 | Framework agnostic | React 최적화 | 지원 |
| Tailwind v4 | 지원 | **미지원** | 지원 |
| Safari 지원 | 지원 | 지원 | 지원 |
| 모노레포 | 지원 | **미지원** | 미지원 |
| MV3 우선 | MV2+MV3 모두 | MV3 우선 | MV3 |
| HMR | 완벽 지원 | 지원 | Content Script HMR 최고 |
| 최신 버전 | v0.20.25 | - | - |

WXT의 i18n 내장: `@wxt-dev/i18n` 패키지 — `_locales/` 표준 기반, YAML/JSON5/TOML 포맷 지원, 타입 안전, 번들 중복 없음.

**우리 적용**  
WXT v0.20+ 채택. React + TypeScript + Tailwind v4 + shadcn/ui 조합. WXT의 파일 기반 엔트리포인트 및 자동 manifest 생성 활용.

---

### A.5. 모노레포 구조 — pnpm workspace 안에 `extension/` 추가

**요약**  
기존 Secretbank pnpm workspace에 `extension/` 디렉토리 추가. WXT는 독립 TypeScript 프로젝트로 취급하되, `packages/shared/`를 통해 공통 로직 공유. AGPL-3.0 라이선스 일관성 유지.

**출처**
- [pnpm Workspaces 공식 문서](https://pnpm.io/workspaces)  
  신뢰도: HIGH (공식)
- [TypeScript Monorepo Best Practice 2026](https://hsb.horse/en/blog/typescript-monorepo-best-practice-2026/)  
  신뢰도: MEDIUM

**상세**  
WXT의 TypeScript 특성상 `.wxt/tsconfig.json`을 root `tsconfig.json`에서 extend할 수 없는 경우 독립 TS 프로젝트로 취급한다. `workspace:*` 프로토콜로 `packages/shared`를 local 패키지로 연결.

권장 구조:
```
secretbank/                        ← 기존 pnpm workspace root
├── src/                           ← Tauri 데스크톱 앱 frontend
├── src-tauri/                     ← Rust backend
├── extension/                     ← WXT 브라우저 확장 (신규)
│   ├── wxt.config.ts
│   ├── package.json               ← "@secretbank/extension"
│   └── src/
│       ├── entrypoints/           ← popup, background, content
│       ├── components/            ← extension UI
│       └── _locales/              ← i18n
├── packages/
│   └── shared/                    ← 공통 라이브러리 (신규)
│       ├── package.json           ← "@secretbank/shared"
│       └── src/
│           ├── password-generator.ts
│           ├── validation.ts
│           └── types.ts
└── pnpm-workspace.yaml            ← packages/*,  extension/ 추가
```

별도 repo로 분리하면 AGPL-3.0 경계 관리 복잡도가 높아지므로 **모노레포 내 통합 권고**.

**우리 적용**  
`pnpm-workspace.yaml`에 `extension/` 및 `packages/*` 추가. `packages/shared`에 password generator, validation, types 공유. WXT config에서 `@secretbank/shared`를 `workspace:*`로 참조.

---

### A.6. shared lib 분리 — `packages/shared/` 패턴

**요약**  
desktop 앱과 extension 모두 사용하는 로직(password generator, zxcvbn 래퍼, types, validation)을 `packages/shared`에 분리. pnpm `workspace:*` 프로토콜로 양방향 참조.

**출처**
- [Ultimate Guide: pnpm + Vite + Shared UI Libraries (Medium)](https://medium.com/@hibamalhiss/ultimate-guide-how-to-set-up-a-frontend-monorepo-with-vite-pnpm-and-shared-ui-libraries-4081585c069e)  
  신뢰도: MEDIUM

**상세**  
공유 대상:
- `PasswordGenerator`: Diceware 6단어 + zxcvbn 강도 측정 + issuer recipe (대문자/숫자/특수문자/길이 정책)
- `CredentialTypes`: 공통 TypeScript 인터페이스 (`CredentialKind`, `Credential`, `IssuerRecipe`)
- `ValidationUtils`: URL 파싱, 도메인 추출, autocomplete 속성 판별
- `CryptoUtils`: 클라이언트 측 암호화 유틸 (extension이 직접 vault key를 보유하지 않으므로 최소화)

---

## B. 네이티브 통신 (확장 ↔ Tauri 데스크톱 앱)

### B.1. Native Messaging (Chrome/Firefox 표준)

**요약**  
stdio 기반 Native Messaging이 가장 보안적이며 표준적인 방식. 확장이 native host를 spawn, stdin/stdout으로 JSON 메시지 교환. 1MB(호스트→브라우저)/64MiB(브라우저→호스트) 크기 제한.

**출처**
- [Chrome Developers — Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)  
  신뢰도: HIGH (공식, 2025 최신)
- [MDN — Native messaging (Firefox)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)  
  신뢰도: HIGH (공식, 2025-07 최신)
- [native_messaging Rust crate](https://crates.io/crates/native_messaging)  
  신뢰도: HIGH (docs.rs 공식)

**상세**

프로토콜:
- 메시지 형식: `[4-byte 길이 헤더 (native endian u32)] + [UTF-8 JSON 페이로드]`
- Chrome → Host: 최대 64MiB
- Host → Chrome: 최대 1MB (= 1,048,576 bytes)

보안 모델:
- `nativeMessaging` 권한 필수 (manifest.json)
- content script에서 직접 사용 불가 — service worker를 통해야 함
- manifest의 `allowed_origins` (Chrome) / `allowed_extensions` (Firefox)로 화이트리스트 제한
- 와일드카드 불가 — 특정 확장 ID만 허용

**플랫폼별 Host manifest 위치**

| 플랫폼 | Chrome / Edge | Firefox |
|:---|:---|:---|
| Windows | `HKEY_CURRENT_USER\SOFTWARE\Google\Chrome\NativeMessagingHosts\{name}` | `HKCU\Software\Mozilla\NativeMessagingHosts\{name}` |
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/{name}.json` | `~/Library/Application Support/Mozilla/NativeMessagingHosts/{name}.json` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/{name}.json` | `~/.mozilla/native-messaging-hosts/{name}.json` |

**Rust 구현 — native_messaging crate**

```rust
// Cargo.toml
[dependencies]
native_messaging = "0.4"

// src-tauri/src/native_messaging_host.rs
use native_messaging::{event_loop, send_message};

async fn handle_message(msg: serde_json::Value) -> serde_json::Value {
    // vault에서 credential lookup, Tiered Protection 검증
    todo!()
}
```

주의사항: stdout은 메시지 프레임 전용 — `println!` 절대 사용 금지. 로그는 stderr 또는 파일로.

**우리 적용**  
`src-tauri/src/native_messaging_host.rs` 신규 모듈. Tokio 비동기 이벤트 루프. `native_messaging` crate의 `event_loop()` 활용. 별도 binary target으로 빌드 (`secretbank-nm-host`).

---

### B.2. localhost WebSocket 대안

**요약**  
WebSocket은 Native Messaging 대비 포트 충돌 위험, origin 검증 복잡도, 방화벽 이슈가 있다. 우리 아키텍처에서는 **보조 수단**으로만 고려.

**출처**
- [Tauri v2 — WebSocket plugin](https://v2.tauri.app/plugin/websocket/)  
  신뢰도: HIGH (공식)

**상세**

| 방식 | 장점 | 단점 |
|:---|:---|:---|
| Native Messaging | OS 보안 모델, 등록된 앱만 연결 가능, 브라우저 검증 내장 | 별도 binary 필요, 앱 미실행 시 불가 |
| WebSocket localhost | 앱 미실행 중에도 연결 시도 가능, 양방향 실시간 | 포트 충돌, origin 검증 직접 구현, MV3 service worker idle과 충돌 가능 |
| HTTP localhost | 단순 REST | 양방향 불가, 같은 보안 이슈 |

**우리 적용**  
Native Messaging 우선 채택. WebSocket은 미래 "앱 미실행 상태에서 제한된 기능" 지원 시 고려.

---

### B.3. HTTP localhost 대안

`GET /api/credentials?domain=github.com` 형식의 REST. 보안 위험(임의 페이지가 localhost 접근 가능)으로 **채택 안 함**.

---

### B.4. 1Password 8 모델 분석

**요약**  
1Password 8 extension은 데스크톱 앱과 Native Messaging으로 통신. 앱이 브라우저의 코드 서명 검증(macOS/Windows) 또는 패키지 관리자 확인(Linux)으로 브라우저 진위를 확인. Biometric은 데스크톱 앱이 처리 후 결과를 extension에 전달.

**출처**
- [1Password — Browser connection security](https://support.1password.com/1password-browser-connection-security/)  
  신뢰도: HIGH (공식)
- [1Password Community — Native Messaging issue](https://www.1password.community/discussions/1password/native-messaging-between-brave-extension-and-the-host-app-is-not-working/37175)  
  신뢰도: MEDIUM

**상세**  
Native Messaging host ID: `com.1password.1password`  
인증 흐름:
1. 확장이 native host에 연결 요청
2. macOS/Windows: 앱이 브라우저 코드 서명 검증
3. 연결 수립 후 account info + encryption key 공유
4. Biometric 잠금 해제 → 앱에서 처리 → 확장에 session token 전달

Vault key는 항상 데스크톱 앱에만 존재 (Zero-Knowledge 호환).

**우리 적용**  
1P 모델 채택. Tauri 앱이 vault key 보유, extension은 session token으로만 credential 요청. Native Messaging host가 session token 검증 후 credential 반환.

---

### B.5. Bitwarden 모델 분석

**요약**  
Bitwarden extension은 vault key를 자체 보유하는 구조 (1P와 다름). Biometric unlock을 위해 Native Messaging(`desktop_proxy`)을 통해 데스크톱 앱의 biometric 결과를 수신. **우리는 이 모델 채택 안 함**.

**출처**
- [Bitwarden Contributing — Biometric unlock](https://contributing.bitwarden.com/getting-started/clients/browser/biometric/)  
  신뢰도: HIGH (공식 Contributing 문서)
- [Bitwarden — MV3 migration](https://bitwarden.com/blog/bitwarden-manifest-v3/)  
  신뢰도: HIGH

**상세**  
Bitwarden MV3 마이그레이션 핵심 과제:
- 이전: background page 전역 메모리에 vault data 보유
- 이후: MV3 service worker의 ephemeral 특성 → 모든 vault 접근마다 재복호화 or IndexedDB 캐시

`desktop_proxy`: 데스크톱 앱에 포함된 경량 프록시 binary. 브라우저가 이를 native messaging host로 실행. Biometric 검증은 데스크톱 앱에서 처리.

**우리와의 차이**  
Bitwarden은 extension 자체가 vault client (zero-knowledge 아님). 우리는 vault key가 데스크톱 앱에만 존재 → 진정한 zero-knowledge 유지.

---

### B.6. 인스톨러에서 Native Messaging manifest 자동 등록

**요약**  
Windows NSIS hook에서 registry 키 자동 생성. macOS는 postinstall script에서 JSON 파일 복사. Linux는 Makefile/postinstall script.

**출처**
- [Windows NSIS HOOK documentation — Tauri](https://v2.tauri.app/distribute/windows-installer/)  
  신뢰도: HIGH
- [Browserpass native messaging registration (DeepWiki)](https://deepwiki.com/browserpass/browserpass-native/5.3-native-messaging-host-registration)  
  신뢰도: MEDIUM (reference implementation)
- [MDN — Native manifests (위치 목록)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests)  
  신뢰도: HIGH

**상세**

Windows NSIS hook (NSIS_HOOK_POSTINSTALL):
```nsis
WriteRegStr HKCU "SOFTWARE\Google\Chrome\NativeMessagingHosts\com.secretbank.nm" "" "$INSTDIR\secretbank-nm-host.json"
WriteRegStr HKCU "SOFTWARE\Microsoft\Edge\NativeMessagingHosts\com.secretbank.nm" "" "$INSTDIR\secretbank-nm-host.json"
WriteRegStr HKCU "Software\Mozilla\NativeMessagingHosts\com.secretbank.nm" "" "$INSTDIR\secretbank-nm-host.json"
```

macOS postinstall (DMG):
```sh
# ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
cp com.secretbank.nm.json "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/"
cp com.secretbank.nm.json "$HOME/Library/Application Support/Firefox/NativeMessagingHosts/"
```

**우리 적용**  
Tauri의 `tauri.bundle.nsis.postinstall_command` 또는 커스텀 NSIS hook으로 자동 등록. `native_messaging` crate의 `install()` 함수로 Rust 코드에서도 처리 가능 (첫 실행 시).

---

### B.7. Tauri 측 신규 IPC: `native_messaging_host` 모듈

**요약**  
별도 binary crate (`secretbank-nm-host`)를 Tauri 앱과 같은 workspace에 추가. Tokio 비동기 루프로 메시지 처리. 메시지 routing은 기존 vault core crate 호출.

**설계**
```
extension (browser) 
  → native_messaging_host binary (stdio)
    → vault core (IPC via socket or in-process)
      → SQLite vault
```

처리 명령어 목록 (초안):
- `ping`: 연결 확인
- `get_credentials_for_domain`: 도메인 기반 credential 목록 조회
- `reveal_credential`: Tiered Protection 인증 후 plaintext 반환
- `save_credential`: 신규 credential 저장
- `update_credential`: 기존 credential 업데이트
- `check_session`: 세션 토큰 유효성 확인

Audit log: 모든 `reveal_credential` 호출은 기존 audit_log 테이블에 기록.

---

### B.8. 인증 / 페어링 흐름

**요약**  
KeePassXC-Browser 프로토콜 참조. 첫 설치 시 extension이 공개키를 생성해 데스크톱 앱에 전송, 데스크톱이 사용자 승인 후 식별 키를 등록. 이후 세션은 저장된 식별 키로 인증.

**출처**
- [KeePassXC Browser Protocol (GitHub)](https://github.com/keepassxreboot/keepassxc-browser/blob/develop/keepassxc-protocol.md)  
  신뢰도: HIGH (오픈소스 레퍼런스 구현)

**상세**

KeePassXC 페어링 프로토콜 (참조 모델):
1. `change-public-keys`: 클라이언트(extension) 공개키 → 서버(데스크톱) 공개키 교환
2. `associate`: 영구 식별 키 쌍 등록 (사용자 데스크톱 앱에서 승인)
3. `test-associate`: 이후 세션에서 기존 페어링 검증
4. 암호화: TweetNaCl.js Box (Curve25519 + XSalsa20-Poly1305), 24-byte nonce

**Secretbank 페어링 흐름 (권고)**
1. extension 첫 설치 → background service worker가 페어링 요청 메시지 표시
2. native messaging으로 연결 → 데스크톱 앱에서 "Secretbank 확장 연결을 허용하시겠습니까?" 다이얼로그
3. 사용자 승인 → 확장의 공개키를 로컬 DB에 저장 + UUID session token 발급
4. 이후 모든 통신: session token으로 인증

---

## C. Form auto-detect / autofill

### C.1. form 필드 감지 휴리스틱

**요약**  
`autocomplete` 속성이 가장 신뢰할 수 있는 시그널. `type="password"`가 fallback. name/id regex는 최후 수단.

**출처**
- [WHATWG HTML Spec — autocomplete attribute](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html)  
  신뢰도: HIGH (공식 표준)
- [MDN — autocomplete attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete)  
  신뢰도: HIGH (2025 최신)
- [Chromium — Form styles that Chromium understands](https://www.chromium.org/developers/design-documents/form-styles-that-chromium-understands/)  
  신뢰도: HIGH (공식)

**상세**

감지 우선순위:
1. `autocomplete="current-password"` → 기존 로그인 폼
2. `autocomplete="new-password"` → 신규 가입 / 비밀번호 변경 폼
3. `autocomplete="username"` 또는 `autocomplete="email"` → 사용자명 필드
4. `type="password"` → fallback
5. `name`, `id`의 regex 패턴 (`password`, `passwd`, `pwd`, `pass`, `email`, `login`, `user`) → 최후 수단
6. `autocomplete="one-time-code"` → OTP 필드

**현대 SPA 주의**: React/Vue 동적 렌더링으로 인해 DOM ready 시점에 폼이 없을 수 있음 → `MutationObserver` 필수.

**우리 적용**  
content script에서 `MutationObserver`로 DOM 변화 감지. `autocomplete` 속성 → `type` → regex 순서로 필드 감지. 감지된 필드 쌍(username + password)을 데스크톱 앱에 보고.

---

### C.2. autofill 트리거 옵션

**요약**  
보안과 UX의 균형: 자동 fill(phishing 위험) vs 클릭 필요(마찰). 권고: focus 시 오버레이 표시 + 사용자 클릭으로 fill.

**출처**
- [Marek Tóth — You should disable autofill in your password manager](https://marektoth.com/blog/password-managers-autofill/)  
  신뢰도: HIGH (보안 연구자)
- [1Password — Autofill behavior](https://support.1password.com/autofill-behavior/)  
  신뢰도: HIGH (공식)

**상세**

| 트리거 방식 | UX | 보안 |
|:---|:---|:---|
| Page load 자동 fill | 최고 편의 | 최저 (phishing 위험) |
| Focus 시 오버레이 표시 → 클릭 | 높은 편의 | 중간 |
| Extension icon 클릭 | 낮은 마찰 | 높음 |
| Cmd+Shift+L 전역 단축키 | 키보드 사용자 최적 | 높음 |

Secretbank 권고: **focus 시 인라인 오버레이 표시, 사용자 클릭으로 fill 실행**. 전역 단축키는 선택적 추가.

---

### C.3. Multi-step login flow 처리

**요약**  
Google/Microsoft/GitHub 등 username-first 흐름은 표준 "login form shaped" 감지로는 누락됨. History API 변화 감지 + `MutationObserver`의 조합으로 해결.

**출처**
- [Evert Pot — Building multi-step login forms for password managers](https://evertpot.com/multi-step-login-forms-for-password-managers/)  
  신뢰도: HIGH (기술 블로그, 구체적 구현)

**상세**

감지 전략:
1. 첫 페이지: `autocomplete="username"` 또는 email 필드만 존재 → 저장 (step 1)
2. `history.pushState` 또는 URL 변화 감지 → step 2 시작
3. 두 번째 페이지: `autocomplete="current-password"` 등장 → step 1의 username과 결합
4. 페어링: URL 도메인 기반으로 연결

History API 모니터링:
```javascript
// content script (MAIN world)에서 window.history.pushState를 override
const origPushState = history.pushState;
history.pushState = function(...args) {
    origPushState.apply(this, args);
    window.dispatchEvent(new Event('locationchange'));
};
```

**우리 적용**  
content script에서 `popstate` + `locationchange` 이벤트 감지. username-only 폼 발견 시 임시 저장, 이후 password 폼 발견 시 결합하여 autofill 제안.

---

### C.4. Recipe inheritance — issuer 별 form selector preset

**요약**  
같은 도메인에서 form 선택자가 비표준일 경우, 한 번 수동 보정하면 recipe로 저장하여 이후 자동 적용.

**상세**

Recipe 스키마 (권고):
```typescript
interface IssuerRecipe {
  domain: string;            // "github.com"
  usernameSelector?: string; // CSS selector
  passwordSelector?: string;
  submitSelector?: string;
  passwordPolicy?: {
    minLength: number;       // 8
    maxLength?: number;      // 64
    requireUppercase: boolean;
    requireNumber: boolean;
    requireSpecial: boolean;
    forbiddenChars?: string;
  };
}
```

저장 위치: `chrome.storage.local`의 `recipes` 키 + 데스크톱 앱 DB에도 동기화.

fallback 우선순위: 저장된 recipe → 표준 autocomplete → 타입 감지 → regex.

---

### C.5. iframe / cross-origin form 처리

**요약**  
cross-origin iframe에는 content script가 자동 주입되지 않음 (`all_frames: true` 설정 필요). 보안 정책상 cross-origin iframe 내 password fill은 제한.

**출처**
- [Firefox Autofill — cross-origin iframe 정책](https://bugzilla.mozilla.org/show_bug.cgi?id=1629226)  
  신뢰도: HIGH (Mozilla 공식 bugzilla)

**상세**  
`manifest.json`의 `content_scripts`에 `"all_frames": true` 설정 시 모든 iframe에 주입. 그러나 cross-origin iframe에서 password fill 허용은 보안 위험.

Firefox 정책: 같은 origin + unsandboxed iframe만 fill. 우리도 동일 정책 채택.

**우리 적용**  
`all_frames: false` (기본값) 유지. 같은 origin iframe만 감지. cross-origin iframe은 fill 제외.

---

### C.6. Shadow DOM 내부 form 감지

**요약**  
Shadow DOM 내부는 `querySelector`로 접근 불가. Dashlane/Password Depot이 해결한 기법 참조. `composedPath()` API + `MutationObserver`의 shadow root 감지 필요.

**출처**
- [Dashlane — Conquering Shadow DOM for Autofill](https://www.dashlane.com/blog/shadow-dom-better-autofill)  
  신뢰도: HIGH (공식 Dashlane 엔지니어링 블로그)
- [Mozilla Bugzilla #1629226](https://bugzilla.mozilla.org/show_bug.cgi?id=1629226)  
  신뢰도: HIGH

**상세**  
Shadow DOM 접근 방법:
```javascript
// event.composedPath()로 shadow root 내 요소 접근
document.addEventListener('focusin', (e) => {
    const path = e.composedPath();
    const input = path[0]; // shadow DOM 내부 input
    if (input.tagName === 'INPUT' && input.type === 'password') {
        // fill 처리
    }
});
```

**우리 적용**  
Phase C (form auto-detect) 구현 시 Shadow DOM 대응을 MVP 요구사항에 포함. `composedPath()` + `MutationObserver`의 `subtree: true` 조합.

---

## D. Save dialog / Quick Save 통합

### D.1. form submit 감지 — 표준 submit + AJAX

**요약**  
표준 `form.submit` 이벤트 + AJAX(XHR/fetch) 감지를 병행. SPA에서는 History API 변화로 제출 완료 감지.

**출처**
- [Moesif — How we captured AJAX requests with Chrome Extension](https://www.moesif.com/blog/technical/apirequest/How-We-Captured-AJAX-Requests-with-a-Chrome-Extension/)  
  신뢰도: HIGH (기술 구현 블로그)

**상세**

감지 전략:
1. `form.addEventListener('submit', ...)` → 표준 form 제출
2. MAIN world에서 `XMLHttpRequest.prototype.send` monkey-patching → AJAX 감지
3. `fetch` → Service Worker intercept 또는 MAIN world 패칭
4. `popstate` / `locationchange` → SPA 페이지 전환 후 로그인 성공 감지

주의: MAIN world 스크립트는 `chrome.runtime.sendMessage` 접근 불가 → `window.postMessage`로 ISOLATED world content script에 relay.

**우리 적용**  
content script (ISOLATED world)에서 standard submit 감지. MAIN world 인젝션 스크립트가 AJAX intercept → postMessage → ISOLATED content script → service worker → native messaging host.

---

### D.2. save dialog UX 비교

**요약**  
In-page sticky banner가 가장 덜 침습적이면서 가시성이 높음. Extension popup은 접근성 낮음.

**상세**

| 방식 | 구현 난이도 | 사용자 가시성 | 침습성 |
|:---|:---|:---|:---|
| In-page sticky banner (top) | 중간 | 높음 | 낮음 |
| Extension popup 자동 열기 | 낮음 | 중간 | 낮음 |
| 데스크톱 앱 native dialog | 높음 (IPC 필요) | 낮음 | 없음 |
| 인페이지 floating dialog | 높음 | 높음 | 중간 |

**우리 적용**  
In-page sticky banner (top, shadow DOM 격리) + dismiss 버튼. 배너 클릭 시 extension popup에서 세부 정보 확인 및 저장 확정.

---

### D.3. 신규 가입 vs 기존 비밀번호 변경 분기

**요약**  
같은 도메인에 기존 credential 존재 시 "업데이트" 옵션 표시. `autocomplete="new-password"` 신호로 분기.

**상세**

분기 로직:
1. `autocomplete="new-password"` 감지 → "신규 비밀번호 생성" 흐름
2. submit 후 도메인 조회 → 기존 credential 존재 → "비밀번호 업데이트하시겠습니까?" 다이얼로그
3. 기존 credential 없음 → "새 로그인 저장" 다이얼로그

---

### D.4. 가입 시 password generator inline 통합

**요약**  
`autocomplete="new-password"` 필드 감지 시, 필드 우측에 password generator 아이콘 표시. 클릭 시 Diceware + zxcvbn 강도 미터 팝오버.

**출처**
- [Show HN: Secure Diceware + zxcvbn generator (Hacker News)](https://news.ycombinator.com/item?id=9762200)  
  신뢰도: MEDIUM
- [Dropbox zxcvbn GitHub](https://github.com/dropbox/zxcvbn)  
  신뢰도: HIGH (오픈소스)

**상세**

generator 옵션 (issuer recipe 기반):
- Diceware 6단어 (기본값 — 77 bits entropy)
- 무작위 문자열 (issuer recipe의 정책 적용: 길이/대문자/숫자/특수문자)
- zxcvbn 강도 미터 (0-4 점수 + 크랙 시간 추정)

**우리 적용**  
`packages/shared`의 `PasswordGenerator` 클래스를 extension content script에서 호출. 기존 데스크톱 앱의 generator 로직을 shared lib으로 이관.

---

### D.5. Quick Save의 본질

**요약**  
`autofill save handler` = Quick Save. form submit 후 자동 저장 dialog = Quick Save의 실체. 글로벌 hotkey + tray popup은 단기 우회책이었음 ([2026-05-09] project-decisions.md 확인).

---

## E. UI / 디자인 시스템 / Site Logo 통합

### E.1. Extension popup UI — Tailwind v4 + shadcn CSP 호환

**요약**  
MV3 popup (extension_pages)는 build-time CSS injection으로 Tailwind v4 완전 호환. `unsafe-inline` 불필요. content script shadow DOM에서는 `?inline` CSS import 필요.

**출처**
- [Building a Chrome Extension with Vite, React, and Tailwind CSS in 2025 (artmann.co)](https://www.artmann.co/articles/building-a-chrome-extension-with-vite-react-and-tailwind-css-in-2025)  
  신뢰도: MEDIUM (실무 블로그)
- [WXT + React + shadcn + Tailwind starter (GitHub)](https://github.com/imtiger/wxt-react-shadcn-tailwindcss-chrome-extension)  
  신뢰도: HIGH (실제 작동하는 스타터)
- [Tailwind in Shadow DOM — DEV Community](https://dev.to/dhirajarya01/how-i-finally-made-tailwindcss-work-inside-the-shadow-dom-a-real-case-study-5gkl)  
  신뢰도: MEDIUM

**상세**

Popup (extension_pages) CSP:
- `unsafe-inline` 금지됨 (MV3)
- Build-time에 CSS가 파일로 생성되어 `<link>` 태그로 주입 → 문제 없음
- Tailwind v4의 CSS-first `@theme` 방식은 build-time 처리로 완전 호환

Content Script Shadow DOM:
- 페이지 CSS 격리 필요 → `import styles from './style.css?inline'`
- `rem` 단위가 host 페이지의 root font-size 기준 → `@thedutchcoder/postcss-rem-to-px`로 `px`로 변환
- shadcn Radix Dialog는 기본적으로 `document.body` portal → Shadow DOM 내부로 portal 변경 필요

shadcn Shadow DOM 이슈:
```typescript
// RadixUI portal을 shadow root 내부로 변경
<Dialog.Root>
  <Dialog.Portal container={shadowRoot}>
    ...
  </Dialog.Portal>
</Dialog.Root>
```

**우리 적용**  
Popup UI: Tailwind v4 + shadcn/ui 그대로 재사용. Content Script inline banner: Shadow DOM 격리 + `?inline` CSS + rem→px 변환.

---

### E.2. Site Logo 통합 — favicon-proxy Worker

**요약**  
기존 Cloudflare Worker (`secretbank.app/api/favicon/...`) 호출. Extension popup에서도 동일 Worker 사용. IndexedDB 캐시로 반복 요청 방지.

**출처**
- [Chrome Developers — Fetching favicons (chrome.favicon API)](https://developer.chrome.com/docs/extensions/how-to/ui/favicons)  
  신뢰도: HIGH (공식)

**상세**

두 가지 방식 비교:
1. `chrome.favicon` API: `chrome-extension://EXTENSION_ID/_favicon/?pageUrl=URL` — Chrome 전용, 캐시된 favicon만 접근
2. 우리 favicon-proxy Worker: 모든 브라우저 호환, 커스텀 fallback (첫 글자 아바타), 이미 운영 중

**우리 적용**  
`secretbank.app/api/favicon/?url=https://github.com` 형식으로 호출. 응답을 `chrome.storage.local` 또는 IndexedDB에 URL 기반 캐시. Worker 미응답 시 첫 글자 fallback 아바타.

---

### E.3. i18n 4 로케일 (en / ko / zh / ja) — WXT @wxt-dev/i18n

**요약**  
WXT의 `@wxt-dev/i18n`이 `_locales/` 표준을 wrapping하여 타입 안전성과 YAML 포맷을 제공. 기존 react-i18next와 병행 불필요.

**출처**
- [WXT i18n 공식 가이드](https://wxt.dev/guide/essentials/i18n)  
  신뢰도: HIGH (공식)
- [@wxt-dev/i18n npm](https://www.npmjs.com/package/@wxt-dev/i18n) — v0.2.5  
  신뢰도: HIGH (공식 WXT 팀)

**상세**

```yaml
# extension/src/locales/en.yml
popup:
  title: Secretbank
  unlockPrompt: Unlock to fill
credential:
  save: Save password
  update: Update password
generator:
  title: Generate password
```

빌드 시 `public/_locales/en/messages.json`으로 변환. 매니페스트의 `_locales` 디렉토리 자동 포함.

**제약**: 브라우저/시스템 언어 변경 없이는 언어 전환 불가 (extension 표준 제약). 사용자가 브라우저 언어를 변경하면 자동 반영.

**우리 적용**  
`@wxt-dev/i18n` 채택. 4 로케일 YAML 파일 관리. 기존 데스크톱 앱의 i18n 키를 공유 (shared lib에 공통 키 상수 정의).

---

### E.4. dark/light theme 동기화

**요약**  
`prefers-color-scheme` 미디어 쿼리로 브라우저 theme 감지. 데스크톱 앱 설정과 별도로 운영하되 `chrome.storage.sync`로 사용자 preference 저장.

**상세**

```typescript
// popup.tsx
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
// 또는 chrome.storage.local에서 theme 설정 읽기
```

Tailwind v4의 `dark:` variant는 `prefers-color-scheme` 자동 지원.

---

### E.5. 디자인 시스템 공유 — `@secretbank/ui` workspace

**요약**  
`packages/shared`에 shadcn 컴포넌트 공통 패키지 구성 대신, WXT 특성상 extension에서 직접 `pnpm dlx shadcn@latest add` 명령으로 컴포넌트 추가하는 것이 더 실용적.

**상세**

옵션 A (권고): extension 디렉토리 내에 shadcn 컴포넌트를 직접 설치. 필요한 컴포넌트만 복사 (shadcn의 copy-paste 원칙과 일치).

옵션 B: `packages/ui` 패키지에 공통 컴포넌트 → desktop + extension 양쪽에서 import. Vite bundler 차이로 인한 빌드 복잡도 증가 위험.

**우리 적용**  
옵션 A 채택. Extension 내 독립 shadcn 설치. 디자인 토큰(`globals.css`의 CSS var)만 `packages/shared`로 공유.

---

## F. 보안 / 권한 / 위협 모델

### F.1. manifest permissions 최소화

**요약**  
`activeTab` + `storage` + `nativeMessaging` + 필요 시 `scripting`. `<all_urls>` host permission 대신 사용자가 추가한 사이트 한정 optional host permissions 권고.

**출처**
- [Chrome Developers — Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)  
  신뢰도: HIGH (공식)
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)  
  신뢰도: HIGH (공식)

**상세**

필수 permissions:
```json
{
  "permissions": [
    "activeTab",
    "storage",
    "nativeMessaging",
    "scripting"
  ],
  "optional_permissions": ["clipboardWrite"],
  "optional_host_permissions": ["<all_urls>"]
}
```

`activeTab` 효과: 사용자가 extension icon 클릭 시에만 현재 탭 접근 → `<all_urls>` 없이도 대부분 기능 구현 가능.

`optional_host_permissions`: 사용자가 "모든 사이트에서 허용" 또는 "이 사이트에서만 허용" 선택 가능 → Chrome Web Store 심사에서 권한 정당화 부담 감소.

---

### F.2. CSP / WAF 정책

**요약**  
MV3 extension_pages는 `script-src 'self'`만 허용. `unsafe-eval`, `unsafe-inline` 완전 금지. Tailwind v4 build-time CSS는 문제 없음.

**출처**
- [MDN — Extensions Content Security Policy](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy)  
  신뢰도: HIGH (공식)

**상세**

기본 MV3 CSP (extension_pages):
```
script-src 'self'; object-src 'self'
```

Content script는 host 페이지의 CSP에 영향받지 않음 (독립 실행).

---

### F.3. 스토어 심사 정책 (2025-2026)

**요약**  
Chrome Web Store: 권한 정당화 필수, privacy policy 필수 (2025년 1월부터 강화). Firefox AMO: source code 제출 필수, 난독화 금지.

**출처**
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)  
  신뢰도: HIGH (공식)
- [Firefox AMO Policies (2025년 8월 업데이트)](https://extensionworkshop.com/documentation/publish/add-on-policies-preview-2025-08/)  
  신뢰도: HIGH (공식)
- [Chrome Web Store Review Process](https://developer.chrome.com/docs/webstore/review-process)  
  신뢰도: HIGH (공식)

**상세**

Chrome Web Store (2025):
- 요청 권한 정당화 필수 (리뷰 시간 비례 증가)
- Privacy policy URL 필수 (user data 처리 시)
- 웹 browsing activity 수집 금지 (기능 목적 외)
- 1회 항소 가능, 재항소 불가

Firefox AMO (2025-08):
- 모든 제출물 소스코드 리뷰 가능해야 함
- 난독화 코드 절대 금지 (minification은 허용, 단 소스 함께 제출)
- Native messaging 데이터도 Add-on Policies 적용
- 로컬/사용자 정보 사이트 누출 금지

Safari App Store:
- 일반 앱과 동일 심사 (최대 수 주 소요)
- Xcode 16+ 필수 (2025년 4월부터)
- Privacy Manifest 필수 (`PrivacyInfo.xcprivacy`)

**우리 적용**  
`secretbank.app/privacy.html` (기존 `docs/PRIVACY.md` 기반)을 extension privacy policy로 제출. Native messaging 데이터 처리를 privacy policy에 명시. 소스코드는 AGPL-3.0으로 이미 공개 → AMO 심사 용이.

---

### F.4. 위협 모델

**요약**  
DOM-based Extension Clickjacking이 2025년 신규 발견된 주요 위협. 1Password, Bitwarden 포함 대부분 취약. 방어: MutationObserver + Shadow Root + Popover API.

**출처**
- [OWASP — Browser Extension Vulnerabilities Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html)  
  신뢰도: HIGH (OWASP 공식)
- [Marek Tóth — DOM-based Extension Clickjacking](https://marektoth.com/blog/dom-based-extension-clickjacking/)  
  신뢰도: HIGH (보안 연구자, 2025년 발견)
- [GitHub Blog — Attacking browser extensions](https://github.blog/security/vulnerability-research/attacking-browser-extensions/)  
  신뢰도: HIGH (GitHub Security)

**상세**

주요 위협 목록:

| 위협 | 설명 | 방어 |
|:---|:---|:---|
| DOM Clickjacking | 투명 overlay로 autofill UI 가로채기 | MutationObserver 스타일 감지 + Closed Shadow Root |
| Content Script 변조 | 악성 사이트가 extension 메시지 도청 | ISOLATED world + postMessage origin 검증 |
| Phishing form | 가짜 로그인 폼에 자동 fill | 도메인 검증 (HTTPS 전용 + 알려진 도메인) |
| Clipboard 노출 | 비밀번호 클립보드 잔류 | 30초 자동 클리어 (기존 Phase 3-A 정책 동일) |
| MV3 SW race condition | SW 재시작 중 메시지 손실 | 메시지 큐 + retry 로직 |
| Side-channel (Spectre) | 잔여 공격 | MV3의 strict isolation이 부분 완화 |

**DOM Clickjacking 방어 (NordPass/ProtonPass/Dashlane 수정됨)**:
```javascript
// Extension UI에 MutationObserver 적용
const observer = new MutationObserver(() => {
    const el = document.querySelector('#secretbank-autofill-ui');
    if (el && isObscured(el)) {
        // UI 재배치 또는 경고
    }
});
```

---

### F.5. Content Script Isolation

**요약**  
ISOLATED world (기본값): 페이지 JS와 변수 공유 없음, DOM 접근만 가능. MAIN world: 페이지 JS와 같은 컨텍스트 (XHR hooking에 필요하지만 보안 위험 증가).

**출처**
- [OWASP Browser Extension Vulnerabilities Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html)  
  신뢰도: HIGH (공식)

**상세**

MAIN world 사용 시 위험:
- `window.postMessage`로 민감 데이터 전달 시 악성 사이트가 도청 가능
- 방어: origin 검증 + extensionId 포함

```javascript
// ISOLATED world → MAIN world 통신
window.postMessage({ 
    source: 'secretbank-extension',
    type: 'FILL_CREDENTIAL',
    data: encryptedPayload  // 평문 credential 절대 금지
}, window.location.origin);  // '*' 사용 금지
```

**우리 적용**  
Standard autofill (DOM input.value 설정): ISOLATED world만 사용.  
AJAX submit 감지: MAIN world 스크립트 최소 주입, 민감 데이터는 extension내 전달 금지.

---

### F.6. Credential leak 방어

**요약**  
Clipboard 30초 자동 클리어 (기존 Phase 3-A와 동일 정책). DOM input value는 fill 후 즉시 사용, 별도 변수 보관 금지.

---

### F.7. Biometric / OS lock 위임 (Tiered Protection)

**요약**  
Tiered Protection 모델 적용:
- `kind == password`: OS lock 위임, 브라우저 세션 1회 인증으로 자동 fill
- `kind == api_key / credit_card / passkey`: per-reveal 재인증 (데스크톱 앱에서 biometric 처리)

**출처**
- [Bitwarden — Biometric Unlock](https://bitwarden.com/help/biometrics/)  
  신뢰도: HIGH (공식)
- [1Password — Browser biometric integration](https://blog.1password.com/big-changes-to-1password-in-the-browser/)  
  신뢰도: HIGH (공식)

**상세**

Extension 자체적으로 `navigator.credentials.get()` (WebAuthn) 호출 시:
- Chrome 확장의 extension_pages context에서 WebAuthn 제한적 지원
- 권고: 데스크톱 앱이 biometric 처리 후 결과를 Native Messaging으로 extension에 전달 (1P 모델)

흐름:
```
extension → native messaging → Tauri 앱 → OS biometric (Touch ID / Windows Hello)
                                        ↓
extension ← session token ← Tauri 앱
```

password kind:
- 브라우저 세션 시작 시 1회 native messaging 인증 → session token 발급 (만료: 브라우저 닫기 또는 8시간)
- autofill 시마다 재인증 불필요 → 마찰 제거

api_key / credit_card:
- 각 reveal 요청 시마다 native messaging → OS biometric 재확인
- reveal 후 30초 클리어

---

## G. E2E 테스트 / CI 빌드

### G.1. Playwright extension testing

**요약**  
Playwright는 Chrome 확장 테스트 공식 지원. `launchPersistentContext` + `--load-extension` args. Headless 모드 지원. Firefox 확장 테스트는 Playwright에서 **미지원**.

**출처**
- [Playwright — Chrome extensions](https://playwright.dev/docs/chrome-extensions)  
  신뢰도: HIGH (공식)

**상세**

```typescript
// playwright.config.ts
const pathToExtension = path.join(__dirname, 'extension/.output/chrome-mv3');
const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'secretbank-test-'));

const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,  // headless 지원됨
    args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
    ]
});

// Service Worker 접근 (MV3)
const [serviceWorker] = context.serviceWorkers();
// 또는
const serviceWorker = await context.waitForEvent('serviceworker');
```

Extension ID 동적 추출:
```typescript
const extensionId = serviceWorker.url().split('/')[2];
const popup = await context.newPage();
await popup.goto(`chrome-extension://${extensionId}/popup.html`);
```

---

### G.2. WXT 내장 테스트

**상세**  
WXT v0.20+: Vitest 통합, content script unit test, background service worker unit test 지원. E2E는 Playwright와 별도 구성.

---

### G.3. CI 멀티 플랫폼

**요약**  
Chrome/Edge: Linux runner (headless). Firefox: Linux runner (Playwright로 extension test 불가 → 별도 도구 필요). Safari: macOS runner 필수.

**출처**
- [Playwright — Browsers](https://playwright.dev/docs/browsers)  
  신뢰도: HIGH (공식)

**상세**

CI 매트릭스 (GitHub Actions):

| 브라우저 | Runner | 도구 | 한계 |
|:---|:---|:---|:---|
| Chrome | ubuntu-latest | Playwright | 완전 지원 |
| Edge | ubuntu-latest | Playwright (chromium channel) | 완전 지원 |
| Firefox | ubuntu-latest | web-ext test | Playwright 확장 미지원 |
| Safari | macos-latest | Xcode + xcrun | App Store 제출 별도 |

Firefox E2E 대안: Mozilla의 `web-ext` CLI 도구 (`web-ext run --target=firefox-desktop`).

---

### G.4. Tauri 앱 ↔ Extension 통합 테스트

**요약**  
Native messaging host를 mock stub으로 교체하여 통합 테스트. 실제 Tauri 앱 없이 extension 흐름 테스트 가능.

**상세**

Mock native messaging host (Node.js):
```javascript
// tests/mock-nm-host.js
process.stdin.on('data', (buf) => {
    const len = buf.readUInt32LE(0);
    const msg = JSON.parse(buf.slice(4, 4 + len).toString());
    
    const response = handleMessage(msg); // mock 응답
    const resp = Buffer.from(JSON.stringify(response));
    const header = Buffer.alloc(4);
    header.writeUInt32LE(resp.length, 0);
    process.stdout.write(Buffer.concat([header, resp]));
});
```

---

## H. 경쟁 제품 분석

### H.1. 1Password 8 Extension

**요약**  
데스크톱 앱과 Native Messaging 통신. 앱이 브라우저 코드 서명 검증. Vault key는 앱에만 존재. Biometric은 앱에서 처리 후 extension에 session token 전달. **우리 아키텍처의 참조 모델**.

**출처**
- [1Password — Browser connection security](https://support.1password.com/1password-browser-connection-security/)  
  신뢰도: HIGH (공식)

**핵심 차이점 (우리 vs 1P)**:
- 1P: closed source, SaaS (유료), Electron+React Native 앱
- Secretbank: AGPL-3.0, 무료 베타, Tauri (경량), Zero-Knowledge + dependency graph

---

### H.2. Bitwarden Extension

**요약**  
Extension 자체가 vault client (vault key 보유). MV3 마이그레이션에서 비persistent 메모리 이슈 해결 위해 새 아키텍처 설계. Biometric은 Native Messaging을 통해 desktop_proxy 활용. **우리는 vault key를 extension에 보관하지 않음** (차별점).

**출처**
- [Bitwarden — MV3 migration](https://bitwarden.com/blog/bitwarden-manifest-v3/)  
  신뢰도: HIGH (공식)
- [GitHub — bitwarden/clients](https://github.com/bitwarden/clients)  
  신뢰도: HIGH (오픈소스)

---

### H.3. 기타 경쟁 제품 핵심 비교

| 제품 | 아키텍처 | OSS | ZK | 특이점 |
|:---|:---|:---|:---|:---|
| Dashlane | Extension self-contained | 부분 | Yes | Shadow DOM 대응 선도 |
| LastPass | Extension + server | No | No | 2022 데이터 침해 |
| NordPass | Extension self-contained | No | Yes | DOM Clickjacking 패치 완료 |
| Proton Pass | Extension self-contained | Yes | Yes | AES-256 GCM, SOC2 |
| Apple Passwords | iOS Credential Provider API | No | Yes | Safari 네이티브 통합 |
| Google Password Manager | Chrome 내장 | No | Partial | Passkey 선도 |

---

### H.4. OSS 레퍼런스 사례

**요약**  
KeePassXC-Browser가 우리 모델에 가장 가깝다. Native Messaging + TweetNaCl 암호화 + 데스크톱 앱 vault 보유 구조.

**출처**
- [KeePassXC-Browser GitHub](https://github.com/keepassxreboot/keepassxc-browser)  
  신뢰도: HIGH (오픈소스, 활발한 유지보수)
- [KeePassXC Protocol Document](https://github.com/keepassxreboot/keepassxc-browser/blob/develop/keepassxc-protocol.md)  
  신뢰도: HIGH (공식 프로토콜 문서)

**KeePassXC-Browser 채택 가능 패턴**:
- 페어링 프로토콜 (public key exchange + associate)
- `test-associate`로 세션 재사용
- TweetNaCl Box 암호화 (nonce 포함)
- 3-key 구조 (host key / client key / identity key)

**우리 차이점**:
- KeePassXC: 데스크톱 앱 ↔ proxy binary ↔ browser (3단계)
- Secretbank: Tauri 앱 내 native messaging module ↔ browser (2단계, 더 단순)

---

## I. 통합 권고 / Phase 분할

### I.1. 권고 아키텍처

```
┌─────────────────────────────────────────┐
│          Browser (Chrome/Firefox)        │
│                                         │
│  ┌─────────────┐   ┌──────────────────┐ │
│  │ Extension   │   │  Content Script  │ │
│  │ (Popup)     │   │  (ISOLATED world)│ │
│  │             │   │  - Form detect   │ │
│  │ WXT + React │   │  - Autofill UI   │ │
│  │ + shadcn/ui │   │  - Save dialog   │ │
│  │ + Tailwind  │   │  (Shadow DOM)    │ │
│  └──────┬──────┘   └───────┬──────────┘ │
│         │                  │            │
│  ┌──────▼──────────────────▼──────────┐ │
│  │       Background Service Worker    │ │
│  │       (MV3, chrome.storage)        │ │
│  │       - Session token              │ │
│  │       - Native Messaging client    │ │
│  └──────────────────┬─────────────────┘ │
└─────────────────────┼───────────────────┘
                      │ Native Messaging (stdio)
                      │ JSON + 4-byte header
┌─────────────────────▼───────────────────┐
│     secretbank-nm-host (Rust binary)     │
│     - Tokio async event loop             │
│     - Message routing                    │
│     - Session token validation           │
│     - Audit log                          │
│          │                               │
│     ┌────▼─────────────────────────┐    │
│     │   Tauri Desktop App          │    │
│     │   - Vault core (age crypto)  │    │
│     │   - Tiered Protection        │    │
│     │   - OS biometric (Touch ID / │    │
│     │     Windows Hello)           │    │
│     └──────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**핵심 컴포넌트**:
- **빌드**: WXT v0.20+ (Vite 기반, React + TypeScript + Tailwind v4 + shadcn/ui)
- **통신**: Native Messaging (stdio, 4-byte header + JSON, `native_messaging` Rust crate)
- **아키텍처**: 1P 모델 (vault key = Tauri 앱, extension = client)
- **코드 공유**: pnpm workspace `packages/shared` (`@secretbank/shared`)
- **i18n**: `@wxt-dev/i18n` (WXT 내장, 4 로케일 YAML)
- **cross-browser polyfill**: WXT 내장 (webextension-polyfill 자동)

---

### I.2. Phase 분할 권고

#### Phase A — 빌드 / 모노레포 / shared lib 골격 (예상 7일)
- `pnpm-workspace.yaml`에 `extension/` + `packages/shared` 추가
- `packages/shared` 생성: types, PasswordGenerator, ValidationUtils
- WXT 프로젝트 초기화 (`extension/`) — React + TypeScript + Tailwind v4 + shadcn
- `@wxt-dev/i18n` 설정 (en/ko/zh/ja)
- popup 스켈레톤 (로그인 상태 / 잠금 상태 UI)
- WXT build 스크립트 (`pnpm build:extension`)
- `AGPL-3.0` LICENSE 확인 (extension/LICENSE)

#### Phase B — Native Messaging Host (Tauri 측) + Extension 클라이언트 + 페어링 (예상 10일)
- `src-tauri/Cargo.toml`에 `secretbank-nm-host` binary target 추가
- `native_messaging` crate 통합
- Native Messaging host 메시지 핸들러 구현 (ping/session/credential CRUD)
- installer에서 registry / plist 자동 등록 (NSIS hook + macOS postinstall)
- Extension background SW: native messaging client 구현
- 페어링 프로토콜: 공개키 교환 + 사용자 승인 다이얼로그 (데스크톱 앱)
- session token 발급 / 검증 / 만료

#### Phase C — Form auto-detect + autofill (read-only) (예상 10일)
- Content script 기본 구조 (WXT entrypoint)
- `autocomplete` 속성 기반 필드 감지
- `MutationObserver` 동적 DOM 감지
- Shadow DOM 대응 (`composedPath()`)
- Multi-step login 처리 (History API 감지)
- 감지된 도메인 → native messaging → credential 목록 조회
- Autofill 오버레이 UI (Shadow DOM 격리, Tailwind v4)
- Site Logo 표시 (favicon-proxy Worker 호출 + IndexedDB 캐시)
- 기본 보안: DOM Clickjacking 방어 (MutationObserver 스타일 감지)

#### Phase D — Save dialog + 신규 credential 등록 (예상 7일)
- Form submit 감지 (standard + AJAX XHR/fetch hook)
- In-page sticky banner UI (Shadow DOM)
- 신규 credential vs 업데이트 분기 로직
- Extension popup save form (username/password/URL/note)
- Native messaging → Tauri vault에 저장
- 저장 성공 후 배너 dismiss

#### Phase E — Password generator inline + recipe inheritance + Site Logo 완성 (예상 7일)
- `autocomplete="new-password"` 필드 감지 → generator 아이콘 표시
- Password generator 팝오버 (Diceware + zxcvbn + 정책)
- `packages/shared`의 PasswordGenerator 연결
- IssuerRecipe 저장/조회 (`chrome.storage.local` + 데스크톱 앱 DB 동기화)
- Tiered Protection per-reveal 재인증 (api_key / credit_card)

#### Phase F — Cross-browser + E2E 테스트 + 스토어 제출 준비 (예상 14일)
- Firefox 빌드 (`wxt build --browser firefox`)
- Firefox AMO 소스코드 제출 준비
- Edge 빌드 (Chromium, 별도 작업 거의 없음)
- Safari: `wxt-module-safari-xcode`로 Xcode 프로젝트 생성 + App Store 제출
- Playwright E2E 테스트 작성 (Chrome headless CI)
- Mock native messaging host stub 구현
- GitHub Actions CI 매트릭스 구성
- Chrome Web Store 제출 준비 (privacy policy URL, icon 세트, 스크린샷)

---

### I.3. THREAT_MODEL.md 추가 권고

`docs/THREAT_MODEL.md`에 M24-E 자산 신설 섹션 추가:

```markdown
## M24-E Browser Extension 자산 및 위협

### 자산
- Extension storage (chrome.storage.local): session token, recipes
- Native messaging channel: extension ↔ nm-host 간 IPC
- Content script DOM access: host 페이지 form 필드
- Autofill buffer: 주입 직후 DOM input value

### 위협
- T-EXT-1: DOM Clickjacking (투명 overlay로 autofill 가로채기)
- T-EXT-2: postMessage 도청 (MAIN world ↔ ISOLATED world)
- T-EXT-3: Phishing domain (가짜 로그인 폼)
- T-EXT-4: Extension storage 탈취 (session token 만료 전)
- T-EXT-5: Native messaging channel spoofing (가짜 nm-host)
- T-EXT-6: MV3 SW race condition (메시지 손실)
```

---

### I.4. AGPL-3.0 경계

- `extension/` 전체: **AGPL-3.0** (OSS core)
- `packages/shared/`: **AGPL-3.0** (OSS core)
- `src-tauri/src/native_messaging_host.rs` (또는 binary): **AGPL-3.0**
- EE 기능 (auto-rotation, premium connectors): 데스크톱 앱의 `ee/` crate 호출로 분리. Extension은 EE feature flag 여부를 native messaging으로 조회.

---

### I.5. 개발 일정 추정

| Phase | 내용 | 예상 일수 |
|:---|:---|:---|
| A | 빌드/모노레포/shared lib | 7일 |
| B | Native Messaging + 페어링 | 10일 |
| C | Form auto-detect + autofill | 10일 |
| D | Save dialog + credential 저장 | 7일 |
| E | Generator + recipe + Site Logo | 7일 |
| F | Cross-browser + E2E + 스토어 | 14일 |
| **합계** | | **55일 (약 8주)** |

1인 + LLM 협업 기준. Phase A-B가 가장 위험도 높음 (native messaging host 신규 구현).

---

## 출처 종합 (CRAAP 평가)

| 출처 | URL | 발행/갱신 | 신뢰도 | 관련도 |
|:---|:---|:---|:---|:---|
| Chrome Developers — Service Worker Lifecycle | https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle | 2025 현행 | HIGH | 10 |
| Chrome Developers — Native Messaging | https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging | 2025 현행 | HIGH | 10 |
| MDN — Native Messaging (Firefox) | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging | 2025-07 | HIGH | 10 |
| WXT 공식 | https://wxt.dev/ | v0.20.25 (2026-04) | HIGH | 10 |
| KeePassXC Protocol | https://github.com/keepassxreboot/keepassxc-browser/blob/develop/keepassxc-protocol.md | 활발 유지 | HIGH | 9 |
| OWASP Browser Extension Vulnerabilities | https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html | 현행 | HIGH | 9 |
| DOM Clickjacking (Marek Tóth) | https://marektoth.com/blog/dom-based-extension-clickjacking/ | 2025 | HIGH | 9 |
| Bitwarden MV3 Migration | https://bitwarden.com/blog/bitwarden-manifest-v3/ | 2024 | HIGH | 8 |
| Playwright Chrome Extensions | https://playwright.dev/docs/chrome-extensions | 현행 | HIGH | 8 |
| native_messaging Rust crate | https://docs.rs/native_messaging/latest/native_messaging/ | 현행 | HIGH | 9 |
| Firefox AMO Policies (2025-08) | https://extensionworkshop.com/documentation/publish/add-on-policies-preview-2025-08/ | 2025-08 | HIGH | 7 |
| Chrome Web Store Policies | https://developer.chrome.com/docs/webstore/program-policies/policies | 현행 | HIGH | 7 |
| WHATWG autocomplete spec | https://html.spec.whatwg.org/multipage/form-control-infrastructure.html | 현행 표준 | HIGH | 8 |
| 2025 Extension Framework Comparison | https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/ | 2025 | HIGH | 9 |
| 1Password Browser Connection Security | https://support.1password.com/1password-browser-connection-security/ | 현행 | HIGH | 8 |
| Apple Safari Extension | https://developer.apple.com/documentation/safariservices/creating-a-safari-web-extension | 현행 | HIGH | 7 |
| @wxt-dev/i18n | https://www.npmjs.com/package/@wxt-dev/i18n | v0.2.5 현행 | HIGH | 8 |
| Bitwarden Biometric Contributing | https://contributing.bitwarden.com/getting-started/clients/browser/biometric/ | 현행 | HIGH | 8 |
| Dashlane Shadow DOM | https://www.dashlane.com/blog/shadow-dom-better-autofill | 현행 | HIGH | 7 |
| WXT Safari Xcode module | https://www.npmjs.com/package/wxt-module-safari-xcode | 현행 | MEDIUM | 7 |
