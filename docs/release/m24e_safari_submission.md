# Safari Web Extension 제출 패키지 — M24-E Phase F-6

Last updated: 2026-05-10.

**Status: 보류 — 사용자 결정 대기**

이 문서는 Safari Web Extension (Mac App Store) 제출을 위한 사전 계획입니다.
실제 진행을 위해서는 아래 **진입 조건** 4가지가 모두 충족되어야 합니다.

4개 스토어 비교: [m24e_store_matrix.md](./m24e_store_matrix.md)

---

## 진입 조건 (4가지 모두 충족 필요)

| #   | 조건                                                                          | 담당                    | 현재 상태 |
| :-- | :---------------------------------------------------------------------------- | :---------------------- | :-------- |
| 1   | F-1 (Chrome) + F-2 (Firefox) + F-7 (Edge) 심사 통과 + 사용자 피드백 수집 완료 | 자동 (CI) + 사용자 제출 | 대기 중   |
| 2   | Apple Developer Program $99/년 결제 결정 및 가입                              | **사용자 액션 필수**    | 미결정    |
| 3   | macOS 환경 확보 (Xcode 16+ + Mac App Store 접근)                              | 사용자 환경             | 미확인    |
| 4   | macos-latest CI runner 비용 수용 결정 (GitHub Actions, Linux 대비 8배)        | **사용자 결정 필수**    | 미결정    |

---

## Safari 제출의 Chrome / Firefox / Edge 와의 핵심 차이

| 항목            | Chrome / Firefox / Edge                       | Safari (F-6)                                         |
| :-------------- | :-------------------------------------------- | :--------------------------------------------------- |
| 등록비          | $5 일회 (Chrome) / 무료                       | **$99/년** (Apple Developer Program)                 |
| 빌드 타겟       | `dist/chromium-mv3/` 또는 `dist/firefox-mv2/` | **Xcode wrapper 별도 생성**                          |
| CI 플랫폼       | ubuntu-latest                                 | **macos-latest ($0.08/분 — Linux 8배)**              |
| 심사 기간       | 1~7일                                         | **수 주** (Apple 직원 심사)                          |
| 개발 환경       | 어느 OS 가능                                  | **macOS 전용** (Xcode 16+ 필수)                      |
| WXT 지원        | 공식 지원                                     | 커뮤니티 패키지 (maintenance 상태 확인 필요)         |
| 심사 가이드라인 | Chrome / Firefox / Edge 정책                  | **Apple App Store Review Guidelines** 별도 검토 필요 |

---

## 자동 진행 가능 부분 (진입 조건 충족 시)

진입 조건이 충족되면 아래 작업은 코드로 자동 진행할 수 있습니다.

### 1. WXT Safari 타겟 추가

```ts
// extension/wxt.config.ts — browsers 배열에 safari 추가
export default defineConfig({
  // 기존: ['chromium', 'firefox']
  runner: {
    binaries: {
      safari: "open",
    },
  },
});
```

> 주의: `wxt-module-safari-xcode` 커뮤니티 패키지 maintenance 상태를 F-6 진입 전 재확인.
> 2026-05 기준 WXT 공식 Safari 지원은 experimental. 정식 지원 여부 변경 가능.

### 2. xcrun + Xcode 16+ 빌드 파이프라인

```bash
# macOS 빌드 환경에서 실행
xcrun safari-web-extension-converter dist/safari/ \
  --project-location extension/safari-xcode/ \
  --app-name "Secretbank" \
  --bundle-identifier app.secretbank.extension
xcodebuild -project extension/safari-xcode/Secretbank.xcodeproj \
  -scheme Secretbank -configuration Release archive
```

### 3. CI 워크플로 (.github/workflows/extension-safari.yml)

```yaml
name: Extension Safari

on:
  push:
    branches: [main]
    paths: ["extension/**"]
  workflow_dispatch:

jobs:
  build:
    runs-on: macos-latest # $0.08/분 — Linux 대비 8배 비용
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter extension build:safari
      - name: Convert to Xcode project
        run: |
          xcrun safari-web-extension-converter extension/dist/safari/ \
            --project-location extension/safari-xcode/ \
            --app-name "Secretbank" \
            --bundle-identifier app.secretbank.extension \
            --no-prompt
      - name: Build Xcode project
        run: |
          xcodebuild -project extension/safari-xcode/Secretbank.xcodeproj \
            -scheme Secretbank -configuration Release archive \
            -archivePath extension/safari-xcode/Secretbank.xcarchive
      - uses: actions/upload-artifact@v4
        with:
          name: safari-xcode-archive
          path: extension/safari-xcode/Secretbank.xcarchive
```

### 4. 제출 체크리스트 (F-1 패턴 + Apple App Store Review Guidelines 차이)

- [ ] Apple Developer Program 등록 ($99/년) — **사용자 액션**
- [ ] App Store Connect 에서 새 앱 등록 (Bundle ID: `app.secretbank.extension`)
- [ ] Xcode 빌드 + `.xcarchive` 생성 (macos-latest CI)
- [ ] `xcrun altool` 또는 Xcode Organizer 로 TestFlight 업로드
- [ ] App Store Connect 메타데이터 입력:
  - 이름: "Secretbank — API Key Vault"
  - 카테고리: Utilities / Developer Tools
  - Privacy Policy URL: https://secretbank.app/privacy
  - 연령 등급: 4+
- [ ] 스크린샷 1~10장 (F-1 캡처 재사용 가능, 1280×800 PNG)
- [ ] App Review Notes — nativeMessaging 설명:
  > "This extension communicates with a native Secretbank host app (installed separately) via
  > Safari App Extension APIs. It does not collect user data or transmit credentials externally."
- [ ] 심사 제출 (예상 수 주)
- [ ] 심사 결과 대기 + 거부 시 수정 재제출

---

## 비용 합산

| 항목                        | 비용      | 비고                                 |
| :-------------------------- | :-------- | :----------------------------------- |
| Apple Developer Program     | $99/년    | 연간 갱신 필수                       |
| macos-latest CI             | $0.08/분  | Linux $0.008/분 대비 8배             |
| (참고) F-1 + F-2 + F-7 합계 | $5 일회   | Chrome $5 + Edge 무료 + Firefox 무료 |
| **Safari 포함 첫 해 합계**  | **$104+** | CI 사용량에 따라 추가                |

---

## 권장 진입 시점

**M24-E 정식 출시 후 최소 6개월** 경과 시점:

- Chrome + Firefox + Edge 심사 통과 확인
- 사용자 1000+ 도달 (ROI 검증)
- macOS 사용자 비율 확인 후 결정 (macOS 사용자가 전체의 20% 미만이면 우선순위 재검토)

---

## 대안 — Safari skip (권장 기본값)

macOS 사용자에게 Safari 대신 **Chrome / Firefox / Edge 설치를 권유**합니다.

macOS 사용자는 대부분 Chrome 이나 Firefox 도 함께 사용합니다. Safari 전용 사용자에게는:

> "Secretbank 확장은 Chrome, Firefox, Edge 를 지원합니다.
> Safari 지원은 로드맵에 있으며, 현재는 macOS Chrome 설치를 권장합니다."

이 대안은 Apple Developer Program $99/년 비용 및 macos-latest CI 비용을 절약하며,
Xcode wrapper maintenance 부담 없이 3개 주요 스토어에서 충분한 커버리지를 제공합니다.

---

## 관련 문서

- [m24e_store_matrix.md](./m24e_store_matrix.md) — 4 스토어 비교표
- [m24e_chrome_submission.md](./m24e_chrome_submission.md) — Chrome Web Store (F-1)
- [m24e_firefox_submission.md](./m24e_firefox_submission.md) — Firefox AMO (F-2)
- [m24e_edge_submission.md](./m24e_edge_submission.md) — Edge Add-ons (F-7)
- [docs/audit/m24e_phase_f_audit_plan.md](../audit/m24e_phase_f_audit_plan.md) — Phase F 종합 audit 계획 (F-8)
