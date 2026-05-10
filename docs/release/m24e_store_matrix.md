# 확장 스토어 제출 비교표 — M24-E Phase F

Last updated: 2026-05-10.

Secretbank 브라우저 확장의 4개 스토어 제출 현황 및 비교.

---

## 4 Store 비교표

| 항목                    | Chrome Web Store          | Edge Add-ons              | Firefox AMO               | Safari Mac App Store      |
| :---------------------- | :------------------------ | :------------------------ | :------------------------ | :------------------------ |
| **Phase**               | F-1                       | F-7                       | F-2                       | F-6                       |
| **등록비**              | $5 일회                   | 무료                      | 무료                       | Apple Developer $99/년    |
| **계정 플랫폼**         | Google 계정               | Microsoft Partner Center  | Mozilla 계정              | Apple Developer Program   |
| **Manifest 버전**       | MV3                       | MV3                       | MV2                       | Safari Web Extension      |
| **빌드 타겟**           | `dist/chromium-mv3/`      | `dist/chromium-mv3/` ♻️   | `dist/firefox-mv2/`       | Xcode wrapper (macOS only)|
| **소스코드 제출**       | 불필요                    | 불필요                    | minified 시 필수           | Xcode 프로젝트            |
| **gecko.id**            | 해당 없음                 | 해당 없음                 | 필수 (권고)               | 해당 없음                 |
| **심사 방식**           | 자동 우선                 | 자동 + 수동 가능          | 사람 심사 (자원봉사)      | Apple 직원 심사           |
| **심사 기간**           | 1~3 영업일                | 1~7일                    | 1~7일                    | 수 주                     |
| **라이선스 필드**       | 없음                      | 없음                      | AGPL-3.0 선택 가능        | 앱 메타데이터             |
| **카테고리**            | Developer Tools           | Productivity              | Privacy & Security        | Utilities / Developer     |
| **스크린샷 규격**       | 1280×800 PNG              | 1280×800 PNG ♻️           | 1280×800 PNG ♻️           | 1280×800 PNG ♻️           |
| **Privacy Policy**      | 필수                      | 필수                      | 필수                      | 필수                      |
| **nativeMessaging 심사**| 표준                      | 엄격 (레지스트리 명시)   | 통합 Notes to Reviewer    | Safari App Extension 방식 |
| **현재 상태**           | docs 완료 (F-1)           | docs 완료 (F-7)           | docs 완료 (F-2)           | Phase F-2 이후 별도       |

♻️ = F-1 결과물 재사용 가능

---

## 제출 문서 링크

| 스토어 | 체크리스트 문서 | 제출 URL |
| :----- | :-------------- | :------- |
| Chrome Web Store | [m24e_chrome_submission.md](./m24e_chrome_submission.md) | https://chrome.google.com/webstore/devconsole/ |
| Edge Add-ons | [m24e_edge_submission.md](./m24e_edge_submission.md) | https://partner.microsoft.com/dashboard/microsoftedge/overview |
| Firefox AMO | [m24e_firefox_submission.md](./m24e_firefox_submission.md) | https://addons.mozilla.org/developers/ |
| Safari Mac App Store | (F-6 별도 — Apple Developer $99/년 필요) | https://developer.apple.com/account/ |

---

## 재사용 관계

```
Chrome Web Store (F-1) — 기준 문서
├── Edge Add-ons (F-7) — 빌드 ZIP 100% 재사용 / listing 텍스트 재사용
│                        차이: nativeMessaging 레지스트리 경로 추가 / 카테고리 변경
├── Firefox AMO (F-2)  — 빌드 Firefox MV2 별도 / listing 텍스트 기반 재사용
│                        차이: gecko.id 필수 / 소스코드 제출 / Notes to Reviewer
└── Safari (F-6)       — 빌드 Xcode wrapper 별도 / Apple Developer Program 별도
                         차이: 비용 $99/년 / 수 주 심사 / macOS 전용 CI runner
```

---

## 사용자 액션 필수 항목 (4 스토어 공통)

1. 각 스토어 개발자 계정 등록
2. 스크린샷 캡처 (1280×800 PNG × 5개 이상) — F-1 캡처 재사용 가능
3. Listing 입력 (이름, 설명, 카테고리, Privacy Policy URL)
4. 심사 제출 버튼 클릭
5. 심사 결과 대기 및 거부 시 수정 재제출

---

## 비용 요약

| 스토어 | 비용 | 비고 |
| :----- | :--- | :--- |
| Chrome Web Store | $5 일회 | Google 계정 |
| Edge Add-ons | 무료 | Microsoft 계정 |
| Firefox AMO | 무료 | Mozilla 계정 |
| Safari Mac App Store | $99/년 | Apple Developer Program — F-6 별도 결정 |
| **소계 (F-1 + F-2 + F-7)** | **$5** | Safari 제외 |
| **소계 (전체 4 스토어)** | **$104** | 첫 해 기준 |
