# Firefox AMO 제출 패키지 — M24-E Phase F-2

Last updated: 2026-05-10.

이 문서는 Mozilla Add-ons (AMO) 심사 제출에 필요한 모든 항목을 정리한 체크리스트입니다.
**Chrome Web Store (F-1) 패턴을 기준으로 Firefox 고유 차이점만 작성합니다.**
실제 제출(계정 등록, 스크린샷 촬영, 이미지 업로드, listing 입력, 제출 버튼)은 사용자 액션입니다.

4개 스토어 비교: [m24e_store_matrix.md](./m24e_store_matrix.md)

---

## Firefox vs Chrome 핵심 차이점

| 항목                | Chrome Web Store (F-1)          | Firefox AMO (F-2)                          |
| :------------------ | :------------------------------ | :----------------------------------------- |
| 등록비              | $5 일회                         | **무료**                                   |
| Manifest 버전       | MV3                             | **MV2** (Firefox 현재 공식 지원)           |
| 빌드 타겟           | `dist/chromium-mv3/`            | **`dist/firefox-mv2/`**                    |
| 소스코드 제출       | 불필요                          | **minified JS 사용 시 unminified 동봉 필수** |
| gecko.id            | 해당 없음                       | **`browser_specific_settings.gecko.id` 권고** |
| 심사 방식           | 자동 심사 우선 (1~3 영업일)     | **사람 심사 가능 (1~7일)**                 |
| 카테고리            | Developer Tools / Productivity  | **Privacy & Security** 또는 Other          |
| 라이선스 필드       | 없음                            | **AGPL-3.0 선택 가능**                     |
| Review Note         | 권장                            | **필수 (Native Messaging 명시)**           |

---

## 제출 체크리스트

### 1. Mozilla Add-ons (AMO) 계정 등록 — 사용자 액션 (무료)

- URL: https://addons.mozilla.org/developers/
- Firefox 계정(또는 신규 생성)으로 로그인
- "Submit a New Add-on" → "On this site" (AMO 호스팅) 선택
- 등록비 없음 — 무료

---

### 2. Firefox MV2 빌드 ZIP 준비

```powershell
# 프로젝트 루트에서
cd extension
pnpm build:firefox   # dist/firefox-mv2/ 생성 (wxt build --browser firefox)
# dist/firefox-mv2/ 폴더 전체를 ZIP으로 압축
Compress-Archive -Path dist/firefox-mv2/* -DestinationPath secretbank-firefox-0.1.0.zip
```

업로드 대상 파일: `extension/secretbank-firefox-0.1.0.zip`

예상 빌드 결과물 (`extension/dist/firefox-mv2/`):

```
manifest.json          ← manifest_version: 2, background.scripts, browser_specific_settings.gecko.id
popup.html
content-main.js        ← MAIN world content script
content-scripts/
  content.js           ← ISOLATED world (autofill, save, banner)
assets/
  popup-*.css
_locales/
  en/ ko/ ja/ zh/      ← i18n 4개 언어
```

**주의: `browser_specific_settings.gecko.id` 추가 필요**

`extension/wxt.config.ts` 또는 Firefox 타겟 manifest override에 추가:

```typescript
// extension/wxt.config.ts — Firefox 타겟 설정
firefox: {
  manifest: {
    browser_specific_settings: {
      gecko: {
        id: "secretbank@secretbank.app",
        strict_min_version: "109.0",
      },
    },
  },
},
```

gecko.id는 AMO 제출 시 확장의 고유 식별자로 사용됩니다. 한 번 설정하면 변경하지 마세요.

---

### 3. Listing 입력 — 사용자 액션

#### Name
```
Secretbank
```

#### Summary (최대 250자)
```
The secrets manager that understands your dependency graph. Save, fill, and manage API keys with Zero-Knowledge security — integrated with your Secretbank desktop vault.
```

#### Description

아래 텍스트를 AMO 상세 설명 필드에 붙여넣기 (F-1 기반 + Firefox 부연):

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

FIREFOX NOTES

• This extension uses Manifest V2, which Firefox fully supports.
• Native Messaging requires the Secretbank desktop app to be installed
  and the native messaging host registered (automated by the installer).
• The extension does not function standalone — the desktop app is required.

REQUIREMENTS

The extension requires the Secretbank desktop app (Windows / macOS /
Linux) to be installed and running. The native messaging host is
registered automatically by the desktop installer.
Download: https://secretbank.app

PRIVACY

• Only the current site's hostname is sent externally (to Google S2
  Favicons for site icons). No credentials, no user ID, no page content.
• MCP context push is opt-in and off by default.
• Full privacy policy: https://secretbank.app/privacy.html
```

#### Categories
- **Primary**: `Privacy & Security`
- **Secondary** (선택): `Other`

#### License
- `GNU Affero General Public License v3.0`
- AMO 드롭다운에서 `AGPL-3.0` 선택 가능

#### Language
- Primary: `English`
- Additional: Korean / Japanese / Simplified Chinese

---

### 4. 권한 정당화 — AMO "Notes to Reviewer" 및 권한 설명

AMO는 별도의 권한 정당화 입력 필드 대신 **"Notes to Reviewer"** 필드에 통합 작성합니다.
아래 텍스트를 "Notes to Reviewer" 섹션에 입력하세요.

#### Notes to Reviewer 전문

```
Thank you for reviewing Secretbank.

NATIVE MESSAGING DEPENDENCY

This extension requires the Secretbank desktop application
(https://secretbank.app) to be installed and running. The desktop
installer automatically registers the native messaging host for
Windows, macOS, and Linux per Mozilla's native messaging documentation.

Without the desktop app, the extension popup loads but displays a
"Connect desktop app" pairing screen — no vault functionality is
accessible. This is by design (Zero-Knowledge architecture).

PERMISSION JUSTIFICATIONS

activeTab
  Required to read the current page's URL and hostname for:
  (1) matching vault credentials to the active site for autofill,
  (2) detecting credential-entry forms to show the save prompt,
  (3) identifying npm/PyPI/Cargo package pages for supply-chain banners.
  No page content beyond form field detection is read or transmitted.

storage
  browser.storage.local stores:
  - Pairing metadata (X25519 public key + device ID) for the encrypted
    Native Messaging channel.
  - Short-lived session token cache (cleared on expiry).
  - User "never save on this site" domain list.
  - Supply-chain banner dismiss timestamps (7-day TTL per hostname).
  - Temporary pending-save data (password plaintext ≤ 5 minutes,
    deleted immediately on save or cancel).

nativeMessaging
  The extension communicates with the Secretbank desktop application via
  the browser's Native Messaging API to:
  - Retrieve matched credentials from the local encrypted vault.
  - Save newly captured credentials back to the vault.
  - Check supply-chain incident data for the current site.
  - Forward MCP context metadata (opt-in only) to the on-device queue.
  All messages are encrypted with X25519 + ChaCha20-Poly1305 (AEAD).
  No data leaves the local device through this channel.

<all_urls> (content_scripts matches)
  The autofill and form-detection content scripts must run on any site
  because users store credentials for arbitrary domains. There is no
  feasible way to restrict this to a predefined list.

SOURCE CODE

This extension is open-source (AGPL-3.0). The full unminified source is
available at: https://github.com/phoodul/secretbank
Build instructions: cd extension && pnpm install && pnpm build:firefox

If a source zip is required per AMO policy, the unminified source zip is
uploaded alongside this submission (see "Source Code" upload field).
```

---

### 5. 소스코드 제출 — AMO 특수 요건

AMO 정책: minified/obfuscated JS를 포함하는 경우 **unminified 소스코드 동봉 필수**.

```powershell
# 프로젝트 루트에서 소스코드 zip 생성 (node_modules, dist, .git 제외)
cd C:/Users/JSS/Projects/secretbank
git archive --format=zip --output=docs/release/secretbank-source-0.1.0.zip HEAD
```

또는 git archive 대신 수동 압축:
- 제외 대상: `node_modules/`, `extension/node_modules/`, `extension/dist/`, `.git/`, `target/`
- 포함 대상: `extension/src/`, `src-tauri/`, `src/`, `package.json`, `extension/wxt.config.ts`

**AGPL-3.0 공개 저장소이므로 소스코드 제출이 자동으로 충족됩니다.**
AMO 제출 시 GitHub 저장소 URL (`https://github.com/phoodul/secretbank`) 을 Review Note에 명시하면
별도 zip 없이도 인정될 가능성이 높습니다. 심사 결과에 따라 zip 추가 제출 대응.

---

### 6. Privacy Policy URL

```
https://secretbank.app/privacy.html
```

Chrome 제출(F-1)과 동일. 배포 확인 필수.

---

### 7. 스크린샷 (5개 이상 필수) — 사용자 캡처 액션

AMO 요구사항: 최소 1개, 권장 5개. **1280×800 PNG** (또는 최소 600×400).
F-1 Chrome 캡처본 100% 재사용 가능 (동일 UI).

| # | 화면 | 캡처 방법 |
| :- | :--- | :-------- |
| 1 | Popup — CredentialList (사이트 로고 + 카드 목록) | 크레덴셜이 있는 사이트에서 팝업 열기 |
| 2 | In-page SaveBanner (폼 submit 후 배너 표시) | 새 사이트 로그인 폼 입력 후 submit |
| 3 | Popup — GeneratorPanel (Diceware + Random 탭) | 팝업 → Generator 탭 |
| 4 | Autofill 동작 (폼 필드에 값 채워진 상태) | autofill 실행 후 폼 화면 |
| 5 | Supply chain banner (npm 패키지 페이지) | npmjs.com 에서 취약 패키지 페이지 방문 |

캡처 도구: Firefox DevTools → Responsive Design Mode → 1280×800 고정 후 캡처.

---

### 8. gecko.id 확인

AMO 제출 시 `manifest.json`에 `browser_specific_settings.gecko.id`가 있어야 합니다.

권고 ID: `secretbank@secretbank.app`

빌드 후 확인:
```powershell
Get-Content extension/dist/firefox-mv2/manifest.json | Select-String "gecko"
```

출력 예시:
```json
"browser_specific_settings": {
  "gecko": {
    "id": "secretbank@secretbank.app",
    "strict_min_version": "109.0"
  }
}
```

gecko.id가 없으면 AMO가 자동 생성하지만, 버전 업데이트 시 동일 확장으로 인식하려면 고정 ID가 필수입니다.

---

### 9. 심사 제출

1. AMO Developer Hub에서 모든 항목 입력 완료 확인
2. "Submit Version" 클릭
3. 심사 결과 예상: **1~7일** (Mozilla 자원봉사 + 직원 사람 심사)
   - 자동화 검사는 즉시 → 추가 검토 필요 시 사람 심사 대기열 진입
4. 심사 거부 시 이메일로 사유 수신 → 수정 후 재제출

---

### 10. 심사 거부 주요 원인 및 대응

| 거부 사유 | 대응 |
| :-------- | :--- |
| "Native messaging host not bundled" | README 및 Review Note에 desktop app 설치 안내 명시 — 번들 불필요(별도 앱 모델) |
| "License clarification required" | AGPL-3.0 GitHub 저장소 URL 명시, AMO 라이선스 필드에서 AGPL-3.0 선택 |
| "Source code obfuscation detected" | unminified 소스 zip 업로드 또는 GitHub URL 명시 (§5 참조) |
| "gecko.id missing or mismatch" | `wxt.config.ts` Firefox 타겟에 gecko.id 추가 후 재빌드 |
| "Privacy Policy URL 미동작" | `secretbank.app/privacy.html` 배포 확인 |
| "`nativeMessaging` 정당화 불충분" | Notes to Reviewer §4 텍스트 보강, desktop app 의존 재명시 |
| "`<all_urls>` over-permission" | 단일 목적 선언 강화, autofill 필요성 재정당화 |
| "Functionality not working in review" | desktop app 없을 때 기본 팝업 UI (페어링 화면) 동작 확인 |
| "MV2 deprecation concern" | Firefox는 MV2를 계속 지원 — 공식 Mozilla 정책 문서 링크 제공 |

---

## 빠른 참조 — 제출 URL

- AMO Developer Hub: https://addons.mozilla.org/developers/
- AMO 정책: https://extensionworkshop.com/documentation/publish/add-on-policies/
- Native Messaging (Firefox): https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging
- 소스코드 제출 정책: https://extensionworkshop.com/documentation/publish/source-code-submission/
- MV2 지원 현황: https://blog.mozilla.org/addons/2022/05/18/manifest-v3-in-firefox-recap-next-steps/
- gecko.id 문서: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings
