# Edge Add-ons 제출 패키지 — M24-E Phase F-7

Last updated: 2026-05-10.

이 문서는 Microsoft Edge Add-ons 심사 제출에 필요한 모든 항목을 정리한 체크리스트입니다.
**Edge는 Chromium 기반이므로 Chrome Web Store (F-1) 빌드를 100% 재사용합니다.**
Listing 텍스트, 권한 정당화, 스크린샷 모두 F-1과 동일합니다. 차이점만 이 문서에 기술합니다.
실제 제출(계정 등록, listing 입력, 제출 버튼)은 사용자 액션입니다.

4개 스토어 비교: [m24e_store_matrix.md](./m24e_store_matrix.md)

---

## Edge vs Chrome 핵심 차이점

| 항목                    | Chrome Web Store (F-1)              | Edge Add-ons (F-7)                        |
| :---------------------- | :---------------------------------- | :---------------------------------------- |
| 등록비                  | $5 일회                             | **무료**                                  |
| 계정 플랫폼             | Google 계정                         | **Microsoft Partner Center** (MS 계정)    |
| Manifest 버전           | MV3                                 | **MV3 동일** (Chromium 기반)              |
| 빌드 타겟               | `dist/chromium-mv3/`                | **`dist/chromium-mv3/` 100% 재사용**      |
| 소스코드 제출           | 불필요                              | **불필요** (Chrome과 동일)                |
| 카테고리                | Developer Tools / Productivity      | **Productivity** 또는 Tools               |
| 심사 기간               | 1~3 영업일                          | **1~7일**                                 |
| nativeMessaging 심사    | 표준 정당화로 충분                  | **더 엄격할 수 있음** — 상세 설명 필요   |
| Privacy Policy          | 필수                                | **필수** (동일 URL)                       |
| 스크린샷                | 1280×800 PNG                        | **1280×800 PNG** (F-1 캡처 100% 재사용)  |
| 아이콘                  | 16/32/48/128 PNG                    | **동일** (manifest.json icons 재사용)     |

---

## 제출 체크리스트

### 1. Microsoft Partner Center 계정 등록 — 사용자 액션 (무료)

- URL: https://partner.microsoft.com/dashboard/microsoftedge/overview
- Microsoft 계정 (Outlook / Hotmail / MSA) 으로 로그인
- "개발자 등록" → Edge Add-ons 프로그램 등록 (무료, 즉시)
- "새 확장 만들기" 버튼으로 새 아이템 생성

---

### 2. 확장 ZIP — Chrome 빌드 100% 재사용

Edge는 Chromium 기반이므로 별도 빌드 없이 Chrome 빌드 ZIP을 그대로 업로드합니다.

```powershell
# F-1에서 생성한 ZIP 재사용
# extension/secretbank-chrome-0.1.0.zip → 그대로 업로드
# 또는 동일 소스로 재생성
cd extension
pnpm build   # dist/chromium-mv3/ 생성 (Chrome과 동일)
Compress-Archive -Path dist/chromium-mv3/* -DestinationPath secretbank-edge-0.1.0.zip
```

업로드 대상 파일: `extension/secretbank-edge-0.1.0.zip` (= Chrome ZIP과 동일 내용)

---

### 3. Listing 입력 — 사용자 액션 (F-1 텍스트 재사용)

#### Name
```
Secretbank
```

#### Short description
```
The secrets manager that understands your dependency graph. Save, fill, and manage API keys with Zero-Knowledge security.
```

#### Detailed description

F-1 Chrome 제출의 상세 설명 전문을 그대로 사용합니다.
→ [`m24e_chrome_submission.md` §3 Detailed description](./m24e_chrome_submission.md) 참조

#### Category
- **Primary**: `Productivity`
- 대안: `Tools` (Edge Add-ons 카테고리 목록에 "Developer Tools"가 없을 경우)

**참고**: Chrome Web Store와 달리 Edge Add-ons에는 "Developer Tools" 카테고리가 없습니다.
"Productivity" 선택 권장.

#### Language
- Primary: `English`
- Additional: Korean / Japanese / Simplified Chinese

---

### 4. 권한 정당화

Microsoft Partner Center의 "Privacy policies and permissions" 섹션에 입력합니다.
**F-1 Chrome 정당화 텍스트를 그대로 재사용합니다.**
→ [`m24e_chrome_submission.md` §4](./m24e_chrome_submission.md) 참조

#### Edge 고유 추가 사항 — nativeMessaging 보강

Edge Add-ons 심사에서 `nativeMessaging` 권한은 Chrome보다 엄격하게 검토될 수 있습니다.
F-1 정당화 텍스트에 아래 문단을 **추가**하세요:

```
EDGE-SPECIFIC NOTE FOR NATIVEMESSAGING:

The Secretbank desktop application registers a native messaging host
manifest at the OS-standard locations:
  Windows: HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.secretbank.host
  macOS:   ~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/
  Linux:   ~/.config/microsoft-edge/NativeMessagingHosts/

The host manifest is installed automatically by the Secretbank desktop
installer and is registered separately for Edge and Chrome to comply
with browser isolation requirements. The extension does not share native
messaging hosts across browsers.
```

---

### 5. Privacy Policy URL

```
https://secretbank.app/privacy.html
```

F-1 Chrome 제출과 동일. 배포 확인 필수.

---

### 6. 스크린샷 — F-1 캡처 100% 재사용

Edge Add-ons 요구사항: 최소 1개, 최대 10개. **1280×800 PNG** (또는 720×540 이상).
Chrome용으로 캡처한 스크린샷을 그대로 업로드할 수 있습니다.

→ [`m24e_chrome_submission.md` §5](./m24e_chrome_submission.md) 캡처 목록 참조

---

### 7. Edge Add-ons 정책 차이 (vs Chrome Web Store) 노트

| 정책 항목               | Chrome Web Store                  | Edge Add-ons                               |
| :---------------------- | :-------------------------------- | :----------------------------------------- |
| MV2 지원                | 단계적 폐기 중                    | MV3 권장하나 MV2도 허용                    |
| `nativeMessaging` 심사  | 표준 정당화                       | 더 상세한 host 등록 위치 설명 권고         |
| 외부 코드 로딩          | 금지                              | 금지 (동일)                                |
| 원격 코드 실행          | 금지                              | 금지 (동일)                                |
| Privacy Policy          | 필수                              | 필수 (동일)                                |
| Single purpose          | 명시 필요                         | 명시 권장                                  |
| 데이터 수집 공개        | 필수                              | 필수 (동일)                                |
| 스토어 심사             | 1~3 영업일 자동 우선              | 1~7일 (자동 + 수동 가능)                   |
| 재판매 제한             | 없음                              | Edge Add-ons 스토어만 배포 제한 없음       |
| 가격                    | 무료 / 유료 설정 가능             | 무료 / 유료 설정 가능                      |

**주요 정책 차이 요약:**
- Edge는 `nativeMessaging`에 대해 **Windows 레지스트리 경로**를 Review Note에 명시하면 심사가 원활합니다.
- Chrome과 달리 Edge는 Partner Center에서 "단일 목적 선언" 필드가 별도로 없을 수 있습니다 — 상세 설명에 포함하세요.

---

### 8. 심사 제출

1. Partner Center에서 모든 항목 입력 완료 확인
2. "게시" 또는 "Submit for review" 클릭
3. 심사 결과 예상: **1~7일**
4. 심사 거부 시 이메일로 사유 수신 → 수정 후 재제출

**심사 거부 주요 원인 및 대응:**

| 거부 사유 | 대응 |
| :-------- | :--- |
| Privacy Policy URL 미동작 | `secretbank.app/privacy.html` 배포 확인 |
| `nativeMessaging` Windows 레지스트리 경로 미명시 | §4 Edge 고유 추가 사항 텍스트 입력 |
| `<all_urls>` over-permission | 단일 목적 선언 강화, 정당화 텍스트 보강 |
| 스크린샷 품질 미달 | 1280×800 PNG 재촬영 |
| 기능 미동작 (심사 환경) | desktop app 없을 때 기본 팝업 UI (페어링 화면) 동작 확인 |
| "Extension category mismatch" | Productivity 또는 Tools로 변경 |

---

## 빠른 참조 — 제출 URL

- Partner Center: https://partner.microsoft.com/dashboard/microsoftedge/overview
- Edge Add-ons 정책: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/store-policies/ada-addendum
- 개발자 가이드: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension
- nativeMessaging (Edge): https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/native-messaging
- MV3 이전 가이드: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/manifest-v3
