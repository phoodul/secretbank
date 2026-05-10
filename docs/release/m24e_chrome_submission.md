# Chrome Web Store 제출 패키지 — M24-E Phase F-1

Last updated: 2026-05-10.

이 문서는 Chrome Web Store 심사 제출에 필요한 모든 항목을 정리한 체크리스트입니다.
**자동화 가능한 모든 텍스트(권한 정당화, listing 본문, checklist)는 여기 작성되어 있습니다.**
실제 제출(계정 등록, 스크린샷 촬영, 이미지 업로드, listing 입력, 제출 버튼)은 사용자 액션입니다.

---

## 제출 체크리스트

### 1. Chrome Web Store Developer 계정 등록 — 사용자 액션 ($5 일회)

- URL: https://chrome.google.com/webstore/devconsole/
- 1회 등록비 $5 (Google 계정 필요)
- 등록 후 "Add new item" 버튼으로 새 확장 생성

---

### 2. 확장 ZIP 빌드 및 업로드

```powershell
# 프로젝트 루트에서
cd extension
pnpm build   # dist/chromium-mv3/ 생성
# dist/chromium-mv3/ 폴더 전체를 ZIP으로 압축
Compress-Archive -Path dist/chromium-mv3/* -DestinationPath secretbank-chrome-0.1.0.zip
```

업로드 대상 파일: `extension/secretbank-chrome-0.1.0.zip`

현재 빌드 결과물 확인 (`extension/dist/chromium-mv3/`):

```
manifest.json          ← manifest_version: 3, permissions: ["activeTab","storage"]
popup.html
content-main.js        ← MAIN world (XHR/fetch hook)
content-scripts/
  content.js           ← ISOLATED world (autofill, save, banner)
assets/
  popup-*.css
_locales/
  en/ ko/ ja/ zh/      ← i18n 4개 언어
```

---

### 3. Listing 입력 — 사용자 액션

#### Name
```
Secretbank
```

#### Short description (최대 132자)
```
The secrets manager that understands your dependency graph. Save, fill, and manage API keys with Zero-Knowledge security.
```

#### Detailed description

아래 텍스트를 Chrome Web Store 상세 설명 필드에 붙여넣기:

```
Secretbank is the secrets manager that maps how your API keys relate to
your projects, deployments, and URLs — so you always know the blast
radius before you rotate or revoke a key.

KEY FEATURES

🔐 Zero-Knowledge Vault
All secrets are encrypted on-device with age (X25519 + ChaCha20-Poly1305
derived from your master passphrase). The browser extension communicates
with your desktop app over an encrypted Native Messaging channel — your
secrets never leave your device.

💾 Smart Save & Autofill
Detects credential-entry forms on any site. One-click save to your vault,
one-click autofill from the extension popup. Domain-matched, phishing-
resistant (checks the actual origin, not just the visible URL).

🔑 Built-in Password Generator
Diceware 6-word passphrases and cryptographically random passwords with
strength meter. Inline generator inside sign-up forms.

🛡️ Supply Chain Risk Banners
Detects npm / PyPI / Cargo packages on developer portals and cross-
references them against the OSV.dev advisory feed — surfaces known
vulnerabilities right in the browser.

🤖 RAILGUARD Hints
Auto-generates .cursorrules / CLAUDE.md / Copilot instructions for AI
editors so your vault keys never appear in AI prompts.

WHY SECRETBANK IS DIFFERENT FROM 1PASSWORD / BITWARDEN

• API key focused — stores issuer metadata, blast-radius graph, and
  dependency links, not just username + password pairs.
• Local-first — the vault lives on your device; the extension never talks
  to a cloud server (sync is optional and end-to-end encrypted).
• Developer tooling — supply chain risk, MCP context push for Claude /
  Cursor, VS Code integration.
• Open core AGPL-3.0 — you can audit and self-host the entire stack.

REQUIREMENTS

The extension requires the Secretbank desktop app (Windows / macOS /
Linux) to be installed and running. The extension does not work standalone.
Download: https://secretbank.app

PRIVACY

• Only the current site's hostname is sent externally (to Google S2
  Favicons for site icons). No credentials, no user ID, no page content.
• MCP context push is opt-in and off by default.
• Full privacy policy: https://secretbank.app/privacy.html
```

#### Category
`Developer Tools` (또는 `Productivity` — 심사 시 Developer Tools 권장)

#### Language
- Primary: `English`
- Additional locales: Korean / Japanese / Simplified Chinese

---

### 4. 권한 정당화 텍스트 — Permissions Justification 필드에 각각 입력

Chrome Web Store Developer Console → "Privacy practices" 탭에서 권한별 정당화를 입력합니다.

#### `activeTab`
```
Required to read the current page's URL and hostname for three purposes:
(1) match credentials from the vault to the active site for autofill,
(2) detect credential-entry forms to show the save prompt,
(3) identify npm/PyPI/Cargo package pages for supply-chain risk banners.
No page content beyond form field detection is read or transmitted.
```

#### `storage`
```
chrome.storage.local stores:
- Pairing metadata (X25519 public key + device ID) for the encrypted
  Native Messaging channel with the desktop app.
- A short-lived session token cache (cleared on expiry) to avoid
  re-authenticating the vault on every popup open.
- User's "never save on this site" domain list.
- Supply-chain banner dismiss timestamps (7-day TTL per hostname).
- Temporary pending-save data (password plaintext for ≤ 5 minutes,
  deleted immediately on save or cancel).

chrome.storage.session stores:
- MCP opt-in flag cache (5-minute TTL, session-scoped).
- Per-hostname MCP push timestamps for rate-limiting (session-scoped).
```

#### `nativeMessaging`
```
The extension communicates with the Secretbank desktop application
(https://secretbank.app) via the browser's Native Messaging API to:
- Retrieve matched credentials from the local encrypted vault for autofill.
- Save newly captured credentials back to the vault.
- Check supply-chain incident data for the current site.
- Forward MCP context metadata (opt-in only) to the on-device MCP queue.

All messages are encrypted with X25519 + ChaCha20-Poly1305 (AEAD).
No data leaves the local device through this channel.
The extension does not function without the Secretbank desktop app.
```

#### `scripting` (필요 시 추가)
```
Used to inject autofill values into credential fields on web pages.
The injected script only writes to identified form fields; it does not
read page content or execute arbitrary code.
```

#### `contextMenus` (필요 시 추가)
```
Provides a right-click "Autofill with Secretbank" menu item on web pages,
allowing keyboard-free autofill without opening the popup.
```

---

### 5. 스크린샷 (5개 이상 필수) — 사용자 캡처 액션

Chrome Web Store 요구사항: 1280×800 또는 640×400 PNG/JPEG, 최소 1개 최대 5개.

권장 캡처 순서:

| # | 화면 | 캡처 방법 |
| :- | :--- | :-------- |
| 1 | Popup — CredentialList (사이트 로고 + 카드 목록) | 크레덴셜이 있는 사이트에서 팝업 열기 |
| 2 | In-page SaveBanner (폼 submit 후 배너 표시) | 새 사이트 로그인 폼 입력 후 submit |
| 3 | Popup — GeneratorPanel (Diceware + Random 탭) | 팝업 → Generator 탭 |
| 4 | Autofill 동작 (폼 필드에 값 채워진 상태) | autofill 실행 후 폼 화면 |
| 5 | Supply chain banner (npm 패키지 페이지) | npmjs.com 에서 취약 패키지 페이지 방문 |
| 6 | (선택) MiniGraph hover | 팝업에서 그래프 아이콘 hover |
| 7 | (선택) RailguardHintBanner | github.com 등 dev 사이트 방문 |

캡처 도구: Chrome DevTools → Device Toolbar → 1280×800 고정 후 캡처.

---

### 6. Promotional 이미지 — 사용자 디자인 액션 (선택)

Chrome Web Store 심사는 프로모션 이미지 없이도 가능합니다. 심사 통과 후 추가 권장.

| 이미지 | 크기 | 용도 |
| :----- | :--- | :--- |
| Small tile | 440×280 px | 검색 결과 리스트 |
| Large tile | 920×680 px | 확장 상세 페이지 (선택) |
| Marquee | 1400×560 px | Featured 섹션 (선택) |

디자인 가이드라인:
- 텍스트는 이미지 면적의 30% 이하
- 확장 이름 "Secretbank" 포함
- 배경: 어두운 계열 (vault / security 테마)
- 로고: `src/assets/logo.svg` 또는 `extension/public/icons/` 내 자산 활용

---

### 7. Privacy Policy URL

```
https://secretbank.app/privacy.html
```

사이트 배포 확인 필수. `docs/PRIVACY.md` → `site/privacy.html` 빌드 및 배포.

---

### 8. Single Purpose Disclosure

Chrome Web Store "Single purpose" 필드에 입력:

```
Secretbank securely saves, fills, and manages API keys and passwords
by connecting to the Secretbank desktop vault application via an
encrypted Native Messaging channel. All vault data remains on-device.
```

---

### 9. Permissions 정당화 최종 확인

현재 `extension/wxt.config.ts` 및 빌드된 `manifest.json`의 권한:

```json
{
  "permissions": ["activeTab", "storage"],
  "content_scripts": [
    { "matches": ["<all_urls>"], "world": "MAIN" },
    { "matches": ["<all_urls>"], "world": "ISOLATED" }
  ]
}
```

주의: `nativeMessaging` 이 `wxt.config.ts` 에 아직 추가되지 않았습니다.
Phase B-1 에서 추가 예정이거나 누락된 경우, `wxt.config.ts` manifest.permissions 에
`"nativeMessaging"` 을 추가한 뒤 재빌드해야 합니다.

```typescript
// extension/wxt.config.ts — permissions 수정 예시
permissions: ["activeTab", "storage", "nativeMessaging"],
```

over-permission 위험 항목:

| 권한 | 현황 | 권고 |
| :--- | :--- | :--- |
| `<all_urls>` (content_scripts matches) | 모든 사이트에 content script 인젝션 | 정당화 필요 — "autofill은 임의 사이트에서 동작해야 하므로 불가피" |
| `nativeMessaging` | 추가 예정 | 정당화 텍스트 §4 참조 |
| `scripting` | 현재 없음 — autofill이 content script 내에서만 동작하면 불필요 | 필요 시에만 추가 |
| `contextMenus` | 현재 없음 | 필요 시에만 추가 |

---

### 10. 심사 제출 → 결과 대기

1. Developer Console에서 모든 항목 입력 완료 확인
2. "Submit for review" 클릭
3. 심사 결과 예상: **1~3 영업일** (자동 심사) — 정책 위반 시 추가 1~7일 (사람 심사)
4. 심사 거부 시 이메일로 사유 수신 → 수정 후 재제출

**심사 거부 주요 원인 및 대응:**

| 거부 사유 | 대응 |
| :-------- | :--- |
| Privacy Policy URL 미동작 | `secretbank.app/privacy.html` 배포 확인 |
| `nativeMessaging` 정당화 불충분 | §4 텍스트 보강, desktop app 의존 명시 |
| `<all_urls>` over-permission | 단일 목적 선언 강화, 정당화 텍스트 보강 |
| 스크린샷 품질 미달 | 1280×800 PNG 재촬영 |
| 기능 미동작 (심사 환경) | desktop app 연결 없이도 기본 팝업 UI 동작 확인 |

---

## 아이콘 현황

### 현재 상태

`extension/public/icons/` 디렉토리에는 issuer 전용 SVG만 존재:

```
extension/public/icons/issuers/
  github.svg
  google.svg
  aws.svg
  vercel.svg
  cloudflare.svg
  openai.svg
  stripe.svg
```

**Chrome Web Store 필수 아이콘 (`manifest.json` `icons` 필드):**

| 크기 | 파일 경로 |
| :--- | :-------- |
| 16×16 px | `extension/public/icons/icon-16.png` |
| 32×32 px | `extension/public/icons/icon-32.png` |
| 48×48 px | `extension/public/icons/icon-48.png` |
| 128×128 px | `extension/public/icons/icon-128.png` |

**현재 `manifest.json` 에 `icons` 필드가 없습니다.** `wxt.config.ts` 에 추가 필요:

```typescript
// extension/wxt.config.ts — icons 추가
manifest: {
  // ... 기존 설정 ...
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  action: {
    default_icon: {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
    },
  },
},
```

### 아이콘 생성 — 사용자 디자인 액션

자동 생성 불가. 사용자가 다음 방법 중 선택:

**옵션 A: 기존 로고 SVG에서 변환**
```powershell
# Inkscape CLI 사용 (설치 필요)
inkscape src/assets/logo.svg --export-png=extension/public/icons/icon-128.png --export-width=128
inkscape src/assets/logo.svg --export-png=extension/public/icons/icon-48.png --export-width=48
inkscape src/assets/logo.svg --export-png=extension/public/icons/icon-32.png --export-width=32
inkscape src/assets/logo.svg --export-png=extension/public/icons/icon-16.png --export-width=16
```

**옵션 B: 온라인 SVG→PNG 변환**
- https://svgtopng.com/ 또는 https://cloudconvert.com/svg-to-png
- 128 / 48 / 32 / 16 px 4종류 내보내기

**옵션 C: 디자인 도구**
- Figma / Illustrator / GIMP에서 128×128 기본 디자인 후 리사이즈

요구사항:
- PNG 형식
- 투명 배경 또는 단색 배경 (Chrome Store 권장: 투명 배경)
- 16px에서도 식별 가능한 단순 디자인 (자물쇠 또는 'SB' 이니셜 권장)

---

## 빠른 참조 — 제출 URL

- Developer Console: https://chrome.google.com/webstore/devconsole/
- CWS 정책: https://developer.chrome.com/docs/webstore/program-policies/
- 권한 사용 정책: https://developer.chrome.com/docs/webstore/using-permissions/
- MV3 마이그레이션 가이드: https://developer.chrome.com/docs/extensions/develop/migrate/mv2-sunset
