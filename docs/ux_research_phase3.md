# UX Research — M24 Phase 3 + 4 (1P / BW 동등 수준 가이드, 2026-05-07)

> **목적**: Secretbank 가 M24 Phase 3 (kind 확장: 신용카드 / passkey / secure_note) 와 Phase 4 (카테고리 시스템) 에 진입하기 전, 1Password / Bitwarden 의 실제 UX 패턴을 분석해 구현 사양의 기초를 마련한다.
>
> **조사 기준일**: 2026-05-07
> **대상 버전**: 1Password 8 (Electron 기반 데스크톱), Bitwarden 2025.x (Electron), Bitwarden 2026.1.x

---

## 0. 요약 (Executive Summary)

### 5 영역 핵심 발견

| 영역                       | 1Password 수준                                                 | 우리의 현재                    | 격차 크기 |
| :------------------------- | :------------------------------------------------------------- | :----------------------------- | :-------- |
| 신용카드 UI                | 시각적 카드 표현 + BIN 자동 감지 + 필드별 마스킹 + copy on tap | 없음 (신규)                    | 큼        |
| Passkey UI                 | 로그인 항목에 통합 저장 + OS-level 인증 (Win Hello / Touch ID) | 없음 (신규)                    | 매우 큼   |
| Secure Note UI             | Markdown 렌더링 + 커스텀 필드 추가 + 검색 내 하이라이팅        | 없음 (신규)                    | 중        |
| 카테고리 시스템            | Tags (중첩 가능) + 22종 기본 카테고리 + 드래그로 tag 적용      | 없음 (신규)                    | 큼        |
| 마이크로인터랙션 / 빈 상태 | warm-informal 톤 + 구체 액션 안내 + skeleton 로딩              | Bento hover 있음 / 나머지 부족 | 중        |

### 우선순위 권고

1. **Phase 3-A** (신용카드): 시각적 카드 표현 + BIN 감지는 차별화 요소이므로 반드시 구현. 작업량 큼.
2. **Phase 3-B** (secure note): 단순 텍스트 + hidden reveal + custom label-value 쌍. 작업량 중.
3. **Phase 4** (카테고리): tags 기반 무제한 생성 + 중첩 + 드래그 적용. 사이드바 UI 변경 필요. 작업량 큼.
4. **Phase 3-C** (passkey): OS API 의존도가 매우 높음. Windows Hello Plugin API (Win11 KB5068861, 2025-11 이후) 사용 가능하나 Tauri 전용 WebAuthn 플러그인이 아직 macOS 미지원. 단기 구현은 "저장 전용 + 메타데이터 표시" 에 집중, 실제 WebAuthn 인증 연계는 추후.

---

## 1. 신용카드 (Credit Card) UI

### 1.1 1Password 분석

#### 기본 필드 구조

1Password 의 신용카드 항목에는 다음 필드가 포함된다:

- **카드 번호** (Card Number)
- **카드 소유자 이름** (Cardholder Name)
- **만료일** (Expiry — Month / Year 분리 저장)
- **보안 코드** (Security Code / CVC)
- **카드사** (Type — Visa / Mastercard / Amex 등 드롭다운)
- **PIN** (선택)
- **유효 날짜** (Valid From — 선택)
- **청구 주소** (Billing Address — Identity 연동)

1Password 의 카테고리 문서("Credit Card: Stores payment details including card numbers, verification codes, and expiry dates") 는 필드를 명시적으로 나열하지 않지만, 실제 앱에서는 위 필드가 확인된다.

#### 카드 시각화 방식

1Password 는 신용카드 항목을 **실물 카드 형태**로 렌더링한다. 카드 앞면에는 카드번호 · 소유자명 · 만료일이 표시되며, 보안 코드(CVC)는 카드 **뒷면**에 위치한다. 사용자가 CVC 필드를 선택하면 카드가 3D flip 으로 뒤집혀 뒷면이 보이는 애니메이션이 동반된다.

카드 색상은 카드사 brand에 따라 자동 적용된다:

- Visa — 고전적인 파란 계열 그레이디언트
- Mastercard — 빨간-주황 계열
- Amex — 초록/티얼 계열
- 기타 — 중립 회색

#### BIN 자동 감지

카드번호 입력 시 첫 자릿수(BIN prefix)로 카드사를 자동 인식한다:

| prefix                       | 카드사           |
| :--------------------------- | :--------------- |
| 4                            | Visa             |
| 51–55 또는 2221–2720         | Mastercard       |
| 34 / 37                      | American Express |
| 6011 / 622126–622925 / 64–65 | Discover         |
| 3528–3589                    | JCB              |
| 36 / 38 / 300–305            | Diners Club      |

감지 즉시 카드 아이콘과 배경 그레이디언트가 전환된다.

#### 번호 마스킹 패턴

표시 시: `•••• •••• •••• 1234` (4자리 그룹핑, 마지막 4자리만 노출)
Amex는 15자리: `•••• •••••• •1234` (4-6-5 그룹핑)
사용자가 hover 하거나 "reveal" 버튼 클릭 시 전체 번호 표시.

#### CVC 처리

- 기본: `•••` 마스킹
- "눈" 아이콘 클릭 → 일시 표시 (타임아웃 없이 수동 숨김)
- 복사 클릭 → 클립보드에 저장 후 일부 플랫폼에서 30–45초 후 자동 클리어 (OS 클립보드 정책 의존)

#### 등록 폼 필드 순서 (자연 순서)

1Password 의 신용카드 등록 폼은 실제 카드 사용 흐름을 반영한다:

1. 카드 번호 (BIN 입력하는 순간 카드사 자동 감지)
2. 만료일 (MM / YY)
3. 보안 코드 (CVC/CVV)
4. 소유자 이름
5. PIN (선택)
6. 청구 주소 (Identity 연동 또는 직접 입력)

#### 자동 채움

1Password 브라우저 확장 프로그램이 결제 폼을 감지하면 필드별 자동 채움 트리거. 데스크톱 앱 자체(확장 없이)는 Cmd+K 팔레트 또는 copy-to-clipboard 방식.

---

### 1.2 Bitwarden 분석

#### 필드 구조

Bitwarden 의 카드(Card) 항목 기본 필드:

- 카드 소유자 이름
- 번호
- 브랜드 (드롭다운 선택)
- 만료 월 / 만료 연도 (분리 필드)
- 보안 코드

Bitwarden 은 **기본 필드에 마스킹 토글이 없다**는 커뮤니티 지적이 수년간 이어졌다. 커뮤니티 포럼("Credit card default fields are not hidden or no option for toggle" 이슈 #173)에 따르면 카드 번호와 CVC 가 기본적으로 평문으로 표시된다. 이는 1Password 대비 큰 UX 결함으로 지적된다.

#### 카드 시각화

Bitwarden 은 실물 카드 형태 렌더링 **없음**. 단순한 항목 목록 행(row)으로 표시하며, 카드사 아이콘도 기본 제공되지 않는다. BIN 자동 감지 기능 없이 사용자가 브랜드를 드롭다운으로 직접 선택한다.

#### 번호 포맷

커뮤니티에서 `XXXX XXXX XXXX XXXX` 그룹핑 포맷 요청이 다수 제기되어 있으며, 현재 버전에서 부분 개선 중이나 완전한 input mask 는 미적용.

---

### 1.3 비교 요약

| 기능          | 1Password                | Bitwarden           |
| :------------ | :----------------------- | :------------------ |
| 카드 시각화   | 실물 카드 3D flip        | 없음                |
| BIN 자동 감지 | 있음                     | 없음 (수동 선택)    |
| 번호 마스킹   | 기본 마스킹, reveal 가능 | 기본 평문 (요청 중) |
| 4자리 그룹핑  | 있음                     | 부분 적용           |
| CVC 마스킹    | 기본 마스킹              | 없음                |
| 카드사 아이콘 | 자동 감지 후 표시        | 없음                |

---

### 1.4 우리 적용 가이드

```
차용할 패턴:
  - 실물 카드 형태 시각화 (앞면: 번호·이름·만료 / 뒷면: CVC)
  - CVC 필드 포커스 시 카드 3D flip (Motion, perspective transform)
  - BIN prefix → 카드사 자동 감지 → 배경 그레이디언트 + 카드사 로고 전환
  - 번호 기본 마스킹 `•••• •••• •••• 1234`, reveal 버튼(눈 아이콘)으로 전환
  - CVC 기본 `•••` 마스킹
  - 입력 폼: 번호 → 만료(MM/YY) → CVC → 소유자명 자연 순서

차별화로 유지할 우리 강점:
  - Bento 카드 그리드에서 신용카드는 독자적인 카드 타입 배지 색상 (예: 금색/눈에 띄는 구분)
  - Blast radius 기능과 연동: 카드 항목도 어느 프로젝트에서 사용 중인지 표시 가능

shadcn/ui + Tailwind v4 구현 참고:
  - shadcn.io/components/finance/credit-card 컴포넌트 (flip animation 포함)
  - react-credit-cards-library npm 패키지 (BIN 감지 + 3D flip, TypeScript 5)
  - 또는 커스텀: CSS perspective + rotateY + Motion animate 로 flip
  - 배경 그레이디언트: oklch 토큰으로 카드사별 색상 정의
    Visa:  oklch(0.35 0.12 270)  → oklch(0.55 0.18 250)
    MC:    oklch(0.45 0.22 25)   → oklch(0.35 0.18 350)
    Amex:  oklch(0.45 0.15 160)  → oklch(0.35 0.12 180)
  - 번호 입력: IMask.js 또는 react-number-format 으로 4자리 그룹핑

작업량 추정: 큼 (카드 컴포넌트 + BIN 감지 + flip 애니메이션 + 마스킹 로직)

첫 번째 implementator 사양에 명시할 핵심 항목:
  - CreditCardCard 컴포넌트: front face / back face 분리 (transform-style: preserve-3d)
  - CardBrandDetector 유틸: BIN prefix → brand enum (visa | mastercard | amex | discover | jcb | diners | unknown)
  - CardNumberMask: 4-4-4-4 또는 4-6-5 (Amex) 자동 전환
  - RevealToggle: 눈 아이콘, 클릭 시 마스킹 해제, 다시 클릭 시 마스킹 복원
  - DB kind = 'credit_card', 필드: card_number (암호화), card_holder, expiry_month, expiry_year, security_code (암호화), brand, pin (선택, 암호화), billing_address (선택)
```

---

## 2. Passkey UI

### 2.1 1Password 분석

#### 저장 방식

1Password 는 passkey 를 **로그인(Login) 항목에 통합**해 저장한다. 기존 로그인 항목에 passkey 가 추가되면 같은 항목 안에 password 와 passkey 가 공존할 수 있다. passkey 를 새 항목으로 저장하는 것도 가능.

저장 데이터:

- private key (WebAuthn credential, 암호화)
- associated site origin (rpId)
- user handle (username/identifier)
- credential ID

#### Vault 내 표시 메타데이터

1Password 에서 passkey 항목은 다음 정보를 포함한다:

- 도메인 (사이트명 + favicon)
- 사용자 이름 (userHandle)
- 생성 일자
- "Passkey" 배지 또는 아이콘으로 일반 Login 과 구분
- Tags, Notes 추가 가능
- 공유 가능 (Families / Business 공유 볼트 통해)

사용자는 여러 passkey 를 동일 서비스에 저장할 수 있으며, 인증 시 선택 목록이 표시된다.

#### 등록 흐름 (브라우저 확장 기준)

1. 사이트에서 "Create passkey" 클릭
2. 1Password 브라우저 확장이 WebAuthn `navigator.credentials.create()` 를 가로챔
3. 팝업 표시: "Save this passkey in 1Password? [Select vault] [Save]"
4. Biometric 인증 (Touch ID / Face ID / Windows Hello)
5. 볼트에 저장 완료

#### 사용 흐름

1. 사이트 로그인 버튼 클릭
2. 1Password 가 `navigator.credentials.get()` 가로챔
3. "Sign in with passkey from 1Password" 팝업
4. Biometric 인증
5. 서명 값 사이트에 반환 → 로그인 완료

#### OS API 통합

| OS                 | 통합 방식                                       | 상태                       |
| :----------------- | :---------------------------------------------- | :------------------------- |
| Windows 11 (24H2+) | Passkey Manager Plugin API (KB5068861, 2025-11) | 1Password MSIX 빌드로 지원 |
| macOS              | ASAuthorization (Apple Passwords API)           | 지원                       |
| iOS 17+            | iOS native passkey sheet                        | 지원                       |
| Android            | Android Credential Manager API                  | 지원                       |

**Windows 11 의 Passkey Plugin API**: 2025년 11월 누적 업데이트(KB5068861)로 Windows 11 24H2/25H2 에서 제3자 passkey 관리자를 시스템 기본값으로 설정 가능. 1Password MSIX 빌드와 Bitwarden(베타)이 최초 지원. Windows Hello(PIN/생체) 가 로컬 인증자로 사용되고, 제3자 관리자는 저장/동기화 담당.

---

### 2.2 Bitwarden 분석

Bitwarden 은 **Login 항목의 Passkey 전용 필드**에 저장. 2025년 11월 버전부터 Chromium 계열 브라우저(Chrome, Edge, Brave) 에서 passkey 로 Bitwarden 자체 로그인도 가능.

PRF(Pseudo-Random Function) extension 지원: PRF 없는 passkey 로 인증 시 마스터 패스워드로 vault 복호화, PRF 있는 passkey 사용 시 마스터 패스워드 없이 vault 복호화 가능 (2026.1.1 부터).

Bitwarden 의 passkey 항목 표시: vault 내 항목에 "Passkey" 라벨이 달린 별도 필드 영역으로 표시. 도메인·유저명 확인 가능.

---

### 2.3 Tauri v2 에서의 Passkey 가능성 평가

#### 사용 가능한 Rust/Tauri 옵션

**Option A: tauri-plugin-webauthn** (Profiidev)

- GitHub: `github.com/Profiidev/tauri-plugin-webauthn`
- 버전: v0.2.0 (2025년 5월), 18 stars, 활발한 유지보수
- 지원: Linux, Windows, Android (API 28+)
- **미지원**: macOS, iOS
- `@simplewebauthn/browser` 의 drop-in replacement
- Windows/Android 는 PIN 처리를 네이티브에서 담당
- Linux 는 PIN 이벤트 처리 필요
- Windows Credential Discovery 미지원

**Option B: tauri-plugin-macos-passkey**

- macOS native Passkey API 전용
- macOS ASAuthorization 호출
- PRF extension 지원
- iOS 미지원

**Option C: 1Password 오픈소스 passkey-rs**

- GitHub: `github.com/1Password/passkey-rs`
- passkey-client, passkey-authenticator, passkey-types, passkey-transports (CTAP HID)
- 서버/authenticator 구현 목적. 브라우저와 통신 레이어가 필요해 Tauri 단독 앱에서는 복잡

**현실 평가**:

| 플랫폼        | 현실적 passkey 구현 방법              | 제약                      |
| :------------ | :------------------------------------ | :------------------------ |
| Windows       | tauri-plugin-webauthn (Windows Hello) | Credential Discovery 불가 |
| macOS         | tauri-plugin-macos-passkey            | iOS 미지원                |
| Linux         | tauri-plugin-webauthn                 | PIN 이벤트 직접 처리 필요 |
| iOS / Android | Tauri Mobile + OS Credential Manager  | 별도 플러그인 필요        |

**결론**: 완전한 cross-platform passkey 구현은 Windows + macOS 별도 플러그인을 조합해야 한다. 단기적으로는 **"passkey 메타데이터 저장 + 표시"** (private key 없이 username / origin / credential ID 만 저장)부터 시작하고, OS 인증 연계는 Phase 3-C 에서 점진적 구현.

---

### 2.4 우리 적용 가이드

```
차용할 패턴:
  - Login 항목에 passkey 통합 저장 (별도 kind 로 분리하되 UI 에서는 Login 카드와 같은 그룹)
  - Vault 내 passkey 항목에 "Passkey" 배지 표시 (Lucide fingerprint 아이콘)
  - 메타데이터 표시: 도메인 favicon + 사용자 이름 + 생성 일자 + 마지막 사용 일자 (선택)
  - 인증 흐름: OS 생체 인증 → 서명 반환. 우리는 데스크톱 우선이므로 Windows Hello / Touch ID 연계

차별화로 유지할 우리 강점:
  - passkey 를 의존성 그래프와 연결: 어느 사이트에서 이 passkey 가 사용 중인지 추적
  - "passkey 를 vault 에 저장하면 어떤 플랫폼에서 사용 가능한지" 표시 (cross-device 교육)

shadcn/ui + Tailwind v4 구현 참고:
  - kind = 'passkey' 항목 카드: Bento 그리드에서 fingerprint 아이콘(Lucide) + 도메인 favicon + 사용자명
  - PasskeyBadge 컴포넌트: `<Badge variant="outline">Passkey</Badge>` + Lucide Fingerprint 아이콘

DB 스키마 (단기):
  - kind = 'passkey'
  - domain (rpId)
  - username (userHandle)
  - credential_id (base64url, 암호화)
  - public_key (COSE, 암호화) — 저장 전용, 실제 서명은 OS 담당
  - created_at, last_used_at

작업량 추정: 매우 큼 (OS API 플랫폼별 분리 구현 필요)

Phase 3-C implementator 사양 핵심 항목:
  - Phase 3-C 는 "저장 전용" 먼저: passkey metadata UI 표시 + 수동 export 지원
  - WebAuthn 실제 인증 연계는 Windows(tauri-plugin-webauthn) + macOS(tauri-plugin-macos-passkey) 각각 구현
  - iOS/Android 는 Tauri Mobile (M11) 단계에서 OS Credential Manager 연계
  - 조건: macOS 플러그인이 iOS 를 지원하거나 별도 플러그인이 안정화될 때까지 Phase 3-C 는 "저장 + 표시" 범위로 제한
```

---

## 3. Secure Note UI

### 3.1 1Password 분석

#### 기본 구조

1Password 의 Secure Note 항목은 두 가지 레이어로 구성된다:

1. **Title** — 항목 이름
2. **Notes 텍스트 영역** — Markdown 렌더링 지원 큰 텍스트 필드

여기에 사용자가 원하는 만큼 **Custom Fields** 를 추가할 수 있다. Custom Field 타입은 11종:

| 타입              | 용도                     |
| :---------------- | :----------------------- |
| Text              | 일반 텍스트 복사         |
| Password          | 마스킹 + reveal + 생성기 |
| Security Question | 보안 질문 답변           |
| Email             | 이메일 주소              |
| Phone             | 전화번호                 |
| URL               | 웹 주소                  |
| Address           | 우편 주소                |
| One-Time Password | OTP TOTP 통합            |
| Date              | 날짜 (만료 알림 포함)    |
| Month/Year        | 연월                     |
| Sign in with      | 소셜 로그인 프로바이더   |

#### Markdown 지원

1Password 8 에서 Secure Note 텍스트 영역은 Markdown 을 지원한다:

- 지원 문법: 제목(#, ##, ###), 굵게(\*_), 기울임(_), 취소선(~~), 글머리(-), 번호 목록, 인용(>), 코드 블록, 코드 스팬, 구분선(---), `https://` 로 시작하는 URL 자동 링크, 백슬래시 이스케이프
- **미지원**: 테이블, 이미지, 체크박스(GFM)
- 미리보기: 편집 후 저장해야 렌더링됨 (실시간 미리보기 없음)
- 설정에서 비활성화 가능 (평문 모드 전환)

#### 검색 내 하이라이팅 (2024 추가)

2024년 업데이트로 검색 결과에서 Secure Note 텍스트 내 일치 단어를 하이라이팅. 기존에는 Secure Note 내용 검색이 불가능했음.

#### 사용 사례별 권장 구조

사용자 예시(현관문 비밀번호 / 가족 주민번호 / 개인통관비밀번호) 와 같은 **짧은 비밀 값**의 경우:

1Password 권장 패턴:

- Title: "현관문 비밀번호"
- Custom Field (type: Password): 4자리 코드 — 기본 마스킹, reveal 가능, copy 가능
- Notes: 메모 (언제 바꿨는지, 누구에게 알려줬는지 등)

단순히 Secure Note 텍스트 영역에 값을 적는 것은 피함. 왜냐하면 텍스트 영역은 copy-on-click 이나 auto-reveal 이 없어서 짧은 비밀 값 관리에 불편하기 때문.

#### 첨부 파일

1Password 는 Secure Note 에 파일(PDF, 이미지 등) 첨부 가능. Document 카테고리로도 따로 저장 가능. 우리는 Phase 3-B 에서는 첨부 없이 텍스트 + custom fields 만 구현.

---

### 3.2 Bitwarden 분석

Bitwarden 의 Secure Note 기본 구조:

- Name (제목)
- Notes (큰 텍스트 영역, **Markdown 미지원**)
- Custom Fields: 4종 — Text, Hidden (마스킹), Checkbox, Linked

**Hidden 타입 Custom Field**: 마스킹 기본 적용, 눈 아이콘으로 reveal. 조직 권한과 연동해 Hidden 필드를 숨기도록 설정 가능. Master password re-prompt 와 결합 시 보안 강화.

**Bitwarden 의 한계**:

- Secure Note 기본 텍스트 영역에 마스킹 없음 (보안 커뮤니티 지적)
- Markdown 미지원
- Custom Field 타입이 4종으로 1Password 대비 단순

---

### 3.3 비교 요약

| 기능                       | 1Password               | Bitwarden         |
| :------------------------- | :---------------------- | :---------------- |
| Markdown 렌더링            | 있음 (저장 후 미리보기) | 없음              |
| Custom Field 타입          | 11종                    | 4종               |
| Custom Field Password 타입 | 있음 (reveal + 생성기)  | Hidden (reveal만) |
| OTP 커스텀 필드            | 있음                    | 없음              |
| 파일 첨부                  | 있음                    | 유료 플랜         |
| 검색 내 하이라이팅         | 있음 (2024+)            | 부분              |

---

### 3.4 우리 적용 가이드

```
차용할 패턴:
  - Secure Note = Title + 큰 텍스트 영역(Markdown) + Custom Label-Value 쌍
  - Custom Field 타입 (Phase 3-B 최소 세트):
      text: 평문 복사 가능
      secret: 마스킹 기본, reveal 버튼, copy on click
      otp: TOTP seed 저장 + 자동 생성 (기존 TOTP 인프라 재사용)
  - 짧은 비밀 값(현관 코드, PIN)은 Custom Field type=secret 으로 저장 권장 (UI 안내 문구 포함)
  - Markdown 지원: 편집 시 raw, 저장 후 렌더링 (1P 패턴 동일). react-markdown 사용.
  - 검색: 텍스트 영역 내용도 검색 대상 포함 + 일치 구간 하이라이팅

차별화로 유지할 우리 강점:
  - Phase 1.5 의 primary_label + secondary_label 자유 value pair 모델과 통일된 UX
  - Secure Note 도 Bento 카드 그리드에 표시, 메모지 느낌의 배경(노란 계열 토큰)으로 시각 구분

shadcn/ui + Tailwind v4 구현 참고:
  - Textarea (shadcn/ui) — resizable, Markdown raw input
  - react-markdown + remark-gfm: 저장 후 렌더링
  - SecretField 컴포넌트: Input + RevealToggle(눈 아이콘) + CopyButton
  - CustomFieldList: Fieldset of { label, value, type } with drag-to-reorder (dnd-kit)

DB 스키마:
  - kind = 'secure_note'
  - title
  - body (암호화, Markdown 평문)
  - custom_fields: JSON array of { label, value (암호화), field_type: 'text'|'secret'|'otp' }

작업량 추정: 중 (Markdown 렌더링 + SecretField 컴포넌트 + CustomFieldList 편집 UI)

첫 번째 implementator 사양 핵심 항목:
  - SecureNoteCard: Bento 그리드에서 노트 배경색 + 메모지 아이콘(Lucide StickyNote)
  - SecureNoteDetail: 편집 모드(Textarea raw) / 보기 모드(react-markdown) 토글
  - CustomFieldEditor: 필드 추가 버튼 → 타입 선택(text/secret/otp) → label/value 입력
  - label 필드는 오른쪽 padding 으로 타입 배지 표시 (예: "secret" = 잠금 아이콘)
```

---

## 4. 카테고리 / 폴더 시스템 UI

### 4.1 1Password 의 카테고리 모델

#### 기본 카테고리 (22종)

1Password 8 은 두 그룹으로 분류:

**Common (5종)**:

1. Login
2. Credit Card
3. Identity
4. Secure Note
5. Password (독립 비밀번호)
6. Document

**Other (16종)**: 7. API Credential 8. Bank Account 9. Crypto Wallet 10. Database 11. Driver License 12. Email Account 13. Medical Record 14. Membership 15. Outdoor License 16. Passport 17. Reward Program 18. SSH Key 19. Server 20. Social Security Number 21. Software License 22. Wireless Router

이 카테고리들은 1Password 의 item type 으로, **사용자가 직접 카테고리를 만들 수는 없다**. 대신 **Tags** 가 사용자 정의 그룹의 역할을 한다.

#### Tags (사용자 정의 분류)

- **무제한 생성**: 원하는 이름으로 자유롭게 생성
- **중첩 지원**: `/` 슬래시로 계층 표현 (`finance/banking`, `work/aws`)
- **사이드바 표시**: Tags 섹션이 사이드바에 자동 노출
- **드래그 적용**: 항목을 사이드바의 tag 위로 드래그하면 해당 tag 자동 적용
- **멀티 태그**: 하나의 항목에 여러 tag 동시 적용 가능
- **tag 이름 변경**: 우클릭 메뉴에서 rename
- **검색 연동**: 검색 시 tag 이름으로도 필터링 가능

#### 사이드바 구조 (1Password 8 데스크톱)

```
[Account/Collection 선택 드롭다운]
─────────────────────────────────
▷ All Items              [숫자 배지 없음 — 요청 중]
★ Favorites
⚠ Watchtower
👤 Profile (기본 카드/Identity 선택)
─────────────────────────────────
VAULTS
  📁 Personal
  📁 Work
─────────────────────────────────
CATEGORIES (설정에서 토글 가능)
  🔑 Logins
  💳 Credit Cards
  🪪 Identities
  📝 Secure Notes
  ...
─────────────────────────────────
TAGS
  🏷 finance
    ├ banking
    └ crypto
  🏷 work
─────────────────────────────────
🗑 Archive
🗑 Recently Deleted
─────────────────────────────────
⚙ Developer (Developer experience 활성화 시)
```

**Categories 는 기본적으로 숨겨져 있으며** Settings > Appearance 에서 "Always show in sidebar" 체크로 표시. 각 카테고리 옆 항목 수 배지는 현재 기본 미표시 (커뮤니티 요청 중).

**드래그 앤 드롭 지원**:

- 항목 → 볼트: 볼트 간 이동
- 항목 → tag: tag 적용
- 항목 → Favorites: 즐겨찾기 추가
- 항목 → Archive / Recently Deleted: 해당 섹션으로 이동

---

### 4.2 Bitwarden 의 Folders + Collections

#### Folders (개인 볼트)

- 사용자가 자유롭게 생성하는 폴더
- 무제한 중첩 가능 (깊이 제한 없음, 단 UI 가독성 저하 주의)
- 좌측 네비게이션 "Filters" 메뉴에 표시
- 폴더 간 이동: 항목 편집 → 폴더 선택 (드래그 미지원)
- 항목 하나가 여러 폴더에 속할 수 없음 (1:N 불가)

#### Collections (조직 볼트)

- 조직 관리자가 생성하는 공유 컬렉션
- 멤버에게 read / edit / manage 권한 부여
- 사이드바에서 Folders 아래 표시
- 항목 이동 시 조직 내에서는 ownership 변경이 복잡 (web UI 에서만 clone 후 이동 가능)

#### Bitwarden 사이드바 구조

```
🔍 [검색창]
─────────────────
▶ All Vaults
─────────────────
FILTERS
  ▷ All Items
  ★ Favorites
  🗑 Trash
─────────────────
TYPES
  🔑 Login
  💳 Card
  🪪 Identity
  📝 Secure Note
─────────────────
FOLDERS
  📁 온라인 ID/PW
  📁 개발자
  📁 신용카드
─────────────────
COLLECTIONS (조직)
  📁 [조직명]
    └ [컬렉션명]
```

**Bitwarden 의 한계**: 사이드바에서 항목 수 배지 있음 (Mobile 기준, 데스크톱은 일부 버전에서만). 드래그 앤 드롭 미지원. Folder 간 이동 시 편집 모드 진입 필요.

---

### 4.3 비교 요약

| 기능                    | 1Password                                   | Bitwarden                      |
| :---------------------- | :------------------------------------------ | :----------------------------- |
| 사용자 정의 분류        | Tags (무제한, 중첩)                         | Folders (중첩)                 |
| 하나의 항목에 다중 분류 | 가능 (멀티 태그)                            | 불가 (폴더 1개)                |
| 드래그 적용             | 있음                                        | 없음                           |
| 기본 카테고리 종류      | 22종                                        | 4종 (Login/Card/Identity/Note) |
| 항목 수 배지            | 없음 (요청 중)                              | 일부 있음                      |
| trash/archive 구분      | 있음 (Archive 영구 + Recently Deleted 30일) | Trash (30일) + Archive (별도)  |

---

### 4.4 사용자 요구와 모델 매핑

사용자 예시 카테고리: "온라인 ID/PW / 개발자 / 신용카드 / PC passkey / Private Secrets"

| 사용자 의도     | 1P Tags 방식                               | BW Folders 방식           |
| :-------------- | :----------------------------------------- | :------------------------ |
| 온라인 ID/PW    | tag: `logins`                              | folder: `온라인 ID/PW`    |
| 개발자          | tag: `dev` (하위: `dev/aws`, `dev/github`) | folder: `개발자`          |
| 신용카드        | tag: `cards`                               | folder: `신용카드`        |
| PC passkey      | tag: `passkeys`                            | folder: `PC passkey`      |
| Private Secrets | tag: `private`                             | folder: `Private Secrets` |

**우리 모델 결정 포인트**: Tags (1P) 방식이 멀티 분류, 중첩, 드래그 적용 면에서 우월. 단, 처음 사용자에게 "태그 vs 폴더" 개념 차이 설명이 필요. **"카테고리"** 라는 이름으로 시작하고 내부 구현은 tags 방식 채택 권장.

---

### 4.5 우리 적용 가이드

```
차용할 패턴:
  - Tags 기반 무제한 생성 + 슬래시 중첩 (예: dev/aws)
  - 항목에 멀티 태그 적용
  - 사이드바 Categories 섹션: kind 별 필터 (고정 6종: logins/cards/passkeys/notes/api_creds/others)
  - 사이드바 Tags 섹션: 사용자 정의 태그 계층 표시
  - 드래그: 항목 → 태그 사이드바 항목 드롭으로 태그 적용 (dnd-kit 사용)
  - Archive (숨김 + 영구 보존) / Recently Deleted (30일) 분리

차별화로 유지할 우리 강점:
  - 태그에 색상 / 이모지 아이콘 지정 가능 (사용자 표현 강화)
  - 태그를 기준으로 blast radius 시뮬레이션 범위 설정 가능

shadcn/ui + Tailwind v4 구현 참고:
  - Sidebar 컴포넌트 (shadcn/ui sidebar primitive 활용)
  - 사이드바 Section: Accordion 또는 Collapsible 로 Categories / Tags / Vaults 섹션 접기/펼기
  - 태그 항목: 좌측 색상 dot + 태그명 + 항목 수 배지 (Badge 컴포넌트)
  - 중첩 태그: 들여쓰기 8px per level + 연결선 (CSS border-left + before pseudo)
  - 드래그 적용: dnd-kit (이미 프로젝트 내 사용 여부 확인) + useDraggable / useDroppable

DB 스키마:
  - tags 테이블: id, name (full path, 예: "dev/aws"), color, icon_emoji, created_at
  - item_tags 테이블: item_id, tag_id (M:N)

작업량 추정: 큼 (사이드바 재설계 + 드래그앤드롭 + 태그 CRUD + M:N 관계 관리)

첫 번째 implementator 사양 핵심 항목:
  - Sidebar 재설계: Categories (kind별) + Tags (사용자 정의) + Vault (기존) + Archive/Trash
  - TagBadge 컴포넌트: 색상 dot + 이름 + X (제거)
  - TagEditor 컴포넌트: 슬래시 입력 시 중첩 프리뷰 + 색상 선택
  - drag-to-tag: DragOverlay 로 항목 드래그 시 사이드바 태그 하이라이트 + 드롭 적용
  - 항목 수 배지: React Query 기반 count 쿼리 + 사이드바 실시간 갱신
```

---

## 5. 마이크로인터랙션 / 빈 상태 / 로딩 / 에러 처리

### 5.1 마이크로인터랙션

#### 1Password 의 기본 원칙

1Password 의 UX 원칙 "Iterate until it's great" 와 "Connect the dots" 에서 파생된 마이크로인터랙션 철학:

- **"Warm and informal" 톤**: 애니메이션도 딱딱하지 않고 human-centric
- **과도한 애니메이션 지양**: "Let content speak for itself" — 과도한 bounce 나 effect 없이 유의미한 피드백만
- **접근성 우선**: `prefers-reduced-motion` 존중 (이미 우리 globals.css 에 적용됨)

#### 버튼 상호작용 패턴

1Password 8 의 copy 버튼은 클릭 시:

1. 클릭 → 즉시 시각 피드백 (background opacity 변화 또는 scale down)
2. 100–150ms 후 "Copied!" 아이콘/텍스트 전환 (체크마크 아이콘)
3. 1.5–2초 후 원래 상태로 복귀

**Motion 라이브러리 권장값** (이미 프로젝트 채택):

```
버튼 press: scale(0.97), duration: 0.1s, ease: [0.4, 0, 0.6, 1]
카드 hover: scale(1.01), duration: 0.15s, ease: [0.2, 0, 0, 1]
copy 완료 아이콘: duration: 0.4s, spring { stiffness: 200, damping: 20 }
토스트 등장: y: -8 → 0, opacity: 0 → 1, duration: 0.3s, ease: easeOut
토스트 사라짐: y: 0 → -8, opacity: 1 → 0, duration: 0.2s, ease: easeIn
```

**Motion 라이브러리 spring 기본값 참고**:

- React Spring 기본: `{ mass: 1, tension: 170, friction: 26 }`
- Framer Motion 기본: `{ stiffness: 100, damping: 10, mass: 1 }`
- 카드 hover expand (우리 Bento mini-graph): `{ stiffness: 300, damping: 30 }` — snappy하되 오버슈트 없음

#### Reveal 애니메이션 패턴

마스킹 해제 (• → 텍스트 전환):

- blur filter: `filter: blur(4px) → blur(0px)`, duration: 0.2s
- 또는 CSS clip-path reveal: `inset(0 100% 0 0) → inset(0 0% 0 0)`, duration: 0.3s
- 1Password 는 단순 텍스트 교체로 즉각 reveal (애니메이션 미확인)

#### 우리 Bento hover mini-graph 와 비교

현재 Phase 1.5 에 구현된 hover mini-graph expand 는 spring 기반. 신규 카드 타입(Credit Card / Passkey / Secure Note) 도 동일한 hover 메커니즘 사용 가능. 단, CreditCardCard 는 flip 이 주요 인터랙션이므로 hover 시 flip preview(약 15도 기울임) 를 고려.

---

### 5.2 빈 상태 (Empty State)

#### 1Password 의 Empty State 패턴

1Password 은 vault 가 비어있을 때, 카테고리가 비어있을 때, 검색 결과가 없을 때 각각 다른 메시지를 표시한다.

**Vault 전체 비어있을 때 (신규 사용자)**:

- 1Password 의 일러스트 시스템 활용: 작은 아이콘 → 스팟 일러스트 → 내러티브 일러스트 계층
- 톤: "Get started by saving your first item" 형태의 CTA
- 버튼: "Add Item", "Import from..." 등
- 1Password 의 브랜드 리프레시 언어: "warm, informal, quirkiness" 의 일러스트

**검색 결과 0 건**:

- "No items match your search" + 검색어 재확인 안내
- "Try different keywords" 또는 "Clear search" 버튼
- 아이콘: 돋보기 + 물음표 계열

**카테고리 비어있을 때**:

- 카테고리별 관련 아이콘과 "No [Category] items yet. Add one to get started."
- 카테고리에 맞는 예시 제안 (Credit Cards: "Save a card for faster checkout")

#### 업계 Best Practice (2024-2025)

- Empty state 가 명확한 CTA 를 포함하면 feature adoption 이 80% 상승 (userpilot 분석)
- **Primary CTA** 1개 + 보조 안내 텍스트: "Add your first [item type]" + [아이콘] + [한 줄 설명]
- 아이콘은 Lucide 계열 사용 (우리 스택에 이미 포함)
- 검색 빈 상태는 반드시 "검색 초기화" 또는 "전체 보기" 버튼 포함

---

### 5.3 로딩 / 스켈레톤

#### 1Password 의 로딩 패턴

**Vault 잠금 해제 후 디크립트 로딩**:

- 단순 로딩 스피너 + "Decrypting vault..." 텍스트 (진행률 바 없음)
- 로딩 시간이 짧으므로 (<200ms 로컬) 복잡한 progress 불필요

**아이템 리스트 로딩 (초기 로드 또는 많은 항목)**:

- 스켈레톤 화면: 실제 리스트 행 형태를 모방한 회색 블록 + 펄스 애니메이션
- 1Password 8 은 실제로 Electron 앱이라 Webkit 스켈레톤 사용

#### 스켈레톤 디자인 Best Practice

Carbon Design System 원칙:

- 컨테이너 기반 컴포넌트(카드, 리스트 행)에만 스켈레톤 적용
- 버튼, 인풋, 체크박스에는 스켈레톤 미적용
- 첫 번째 배치: 기본 레이아웃 구조 + 텍스트 영역 플레이스홀더
- 이후 배치: 이미지, 뷰포트 바깥 콘텐츠, 인터랙티브 요소

**Tailwind v4 스켈레톤 구현**:

```css
/* globals.css 에 추가 */
@keyframes pulse-skeleton {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
.skeleton {
  background: var(--color-muted);
  border-radius: var(--radius-sm);
  animation: pulse-skeleton 1.5s ease-in-out infinite;
}
```

**우리 Bento 카드 스켈레톤**:

- 카드 크기 동일한 회색 블록 + 내부 텍스트 라인 2개 (너비 60%, 40%)
- Favicon 영역: 원형 회색 블록 (32px)
- 우상단 배지 영역: 작은 직사각형 블록

---

### 5.4 에러 처리

#### 1Password 의 에러 메시지 패턴

1Password 의 스타일 가이드에서 에러 메시지 톤:

- **구체적 액션 안내**: "Something went wrong" 만으로 끝내지 않음 → "Your vault is locked. Select [Unlock] to continue."
- **허위 위안 금지**: "Don't worry!" 같은 문구 사용 안 함
- **"just" 사용 금지**: "Just try again" 처럼 쉽다고 암시하는 표현 피함
- **감탄부호 최소화**: 에러 메시지에 `!` 없음
- **동사형 제목**: "Sign in to 1Password" (명사 나열 금지)

실제 1Password 에러 패턴 관찰:

- 네트워크 에러: "Unable to connect. Check your connection and try again." + [Retry] 버튼
- 잠금 상태: "Your vault is locked. Unlock to continue." (앱 내) / unlock 화면으로 redirect
- 권한 거부: "You don't have permission to view this item." + [Request Access] (teams 기능)
- 데이터베이스 오류: "Something went wrong — An unknown database error occurred." (일반 메시지, 내부 에러 코드는 숨김)

커뮤니티에서 지적된 단점: 일부 에러는 여전히 "Something went wrong" 에서 멈추며 구체적 안내 없음. 특히 동기화 실패 시.

#### 에러 표시 방법별 용도

| 방법                     | 용도                                                      |
| :----------------------- | :-------------------------------------------------------- |
| 인라인 에러 (필드 아래)  | 폼 유효성 검사 실패                                       |
| 토스트 알림              | 짧은 액션 결과 (복사 실패, 저장 완료, 네트워크 일시 오류) |
| 배너 (항목 상단 빨간 바) | Watchtower 보안 경고 (중요, 영구적)                       |
| 모달 / 다이얼로그        | 파괴적 액션 확인 (삭제, 볼트 비우기) — 선택이 필요한 에러 |

Bitwarden 의 에러 처리: 1Password 보다 덜 세련됨. 일반적 "An error has occurred" 메시지 빈번. UI 재설계(2024.12.0) 후 일부 개선.

---

### 5.5 우리 적용 가이드 (전체 디자인 시스템 갱신 권고)

```
마이크로인터랙션 표준화:
  - copy 버튼: 클릭 → scale(0.97) → 체크마크 아이콘(duration 0.4s spring) → 1.5s 후 복귀
  - reveal 버튼: 눈→눈+줄 아이콘 전환(duration 0.15s) + 텍스트 blur(4px→0, 0.2s)
  - 카드 hover: scale(1.01), shadow 증가, duration 0.15s ease-out
  - 신용카드 flip: rotateY(180deg), duration 0.4s, ease: cubic-bezier(0.4, 0, 0.2, 1)
  - 토스트: y(-8→0) + opacity(0→1), duration 0.3s + auto dismiss 3s + y(0→-8), 0.2s
  - 모두 prefers-reduced-motion: reduce 시 애니메이션 0ms로 단락

Empty State 표준화:
  - EmptyState 컴포넌트: icon (Lucide 64px, --color-muted-foreground) + title (h3) + description (p, muted) + CTA (Button)
  - 신규 vault: "첫 번째 항목을 추가해 보세요" + 항목 추가 버튼
  - 카테고리 빈 상태: 해당 카테고리 Lucide 아이콘 + "[카테고리명] 항목이 없습니다."
  - 검색 빈 상태: Search 아이콘 + "검색 결과가 없습니다." + "검색어를 바꾸거나" + [전체 보기] 버튼

Skeleton 표준화:
  - BentoCardSkeleton: 카드 동일 크기 + favicon 원형 + 2줄 텍스트 라인 + pulse
  - ListRowSkeleton: 아이콘(24px 원) + 2줄 텍스트(70%, 40%) + 우측 배지 블록
  - SidebarSkeleton: 섹션 제목 라인 + 4개 행 반복
  - 로딩 시간 예측: 로컬 SQLite < 100ms → 스켈레톤 표시 임계값 150ms (그 이하면 flash 방지를 위해 스켈레톤 미표시)

에러 메시지 표준화 (1P 스타일 가이드 차용):
  - 구체적 액션 필수: "연결할 수 없습니다. 네트워크를 확인하고 다시 시도하세요." + [재시도] 버튼
  - "오류가 발생했습니다" 단독 사용 금지
  - 토스트 에러: 빨간 배경 + 에러 메시지 + [닫기]. 3초 후 자동 해제 (중요 에러는 수동 닫기만)
  - 잠금 상태: "볼트가 잠겨 있습니다. 잠금 해제 후 계속하세요." + [잠금 해제] 버튼
  - 삭제 확인 모달: AlertDialog (shadcn/ui) — "이 항목을 삭제하면 30일 후 영구 삭제됩니다."

shadcn/ui + Tailwind v4 구현 참고:
  - Toast: sonner 또는 shadcn/ui Toast + 에러/성공 variant
  - AlertDialog: 삭제 확인 (이미 있을 것)
  - Skeleton 컴포넌트: shadcn/ui Skeleton (pulse animation 포함)
  - EmptyState: 커스텀 컴포넌트 (shadcn/ui primitive 미제공)
```

---

## 6. 통합 권고 — Phase 진입 순서별 최종 가이드

### Phase 3-A: 신용카드 (Credit Card)

**implementator 사양에 들어갈 핵심 spec**:

```
1. DB / Rust 레이어
   - new kind = 'credit_card'
   - 암호화 필드: card_number, security_code, pin
   - 평문 메타: brand (enum), expiry_month, expiry_year, cardholder_name, billing_address (optional)

2. BIN 감지 유틸 (frontend, src/lib/card-utils.ts)
   - detectBrand(cardNumber: string): CardBrand
   - getBrandGradient(brand: CardBrand): { from: string; to: string }
   - formatCardNumber(raw: string, brand: CardBrand): string  // 4-4-4-4 or 4-6-5

3. CreditCardVisual 컴포넌트
   - props: cardNumber, cardholder, expiryMonth, expiryYear, cvc, brand, flipped
   - front: 번호 마스킹 + 이름 + 만료 + 카드사 로고 + 칩 아이콘
   - back: CVC 마스킹 + 마그네틱 스트라이프 시뮬레이션
   - Motion: animate={{ rotateY: flipped ? 180 : 0 }}, transition spring

4. CreditCardDetail (항목 상세 뷰)
   - 상단: CreditCardVisual (클릭 가능, CVC 필드 포커스 시 flip)
   - 필드 목록: 번호 (마스킹 + reveal + copy) / 만료 / CVC (마스킹 + reveal + copy) / 이름
   - RevealToggle: 눈 아이콘 버튼 (Lucide Eye / EyeOff)
   - CopyButton: 복사 성공 시 체크마크 + 토스트

5. CreditCardForm (등록/편집 폼)
   - 필드 순서: 번호 → 만료(MM/YY 인라인) → CVC → 이름 → PIN(선택) → 청구주소(선택)
   - 번호 입력 시 실시간 BIN 감지 → 카드 미리보기 업데이트
   - 입력 마스크: react-number-format 또는 IMask

6. BentoCard 통합
   - credit_card 종류 카드: 앞면에 카드 번호 마지막 4자리 + 카드사 로고
   - 배경: 카드사별 oklch 그레이디언트
```

**ux-designer agent 가 검증할 항목**:

- 카드 flip 애니메이션 속도가 너무 빠르거나 느리지 않은지
- 마스킹 상태에서 hover 시 "reveal" 힌트가 충분히 표시되는지
- 키보드만으로 모든 필드 접근 및 복사 가능한지 (Tab + Enter)

---

### Phase 3-B: Secure Note

**implementator 사양에 들어갈 핵심 spec**:

```
1. DB / Rust 레이어
   - new kind = 'secure_note'
   - 암호화 필드: body (Markdown 평문), custom_fields (JSON array 암호화)
   - custom_field schema: { id, label, value (암호화), field_type: 'text'|'secret'|'otp', sort_order }

2. SecureNoteDetail (상세 뷰)
   - 보기 모드: react-markdown + remark-gfm 렌더링
   - 편집 모드: shadcn/ui Textarea (resizable) + MDX 도구 모음 (굵게/기울임/목록 단축키)
   - 편집/보기 토글: 우상단 Edit/Preview 버튼 또는 더블클릭

3. CustomFieldList (커스텀 필드)
   - 필드 타입별 렌더링:
     text: 라벨 + 값 텍스트 + CopyButton
     secret: 라벨 + 마스킹 값 + RevealToggle + CopyButton
     otp: 라벨 + TOTP 카운트다운 + 현재 코드 + CopyButton (기존 OTP 인프라 재사용)
   - 편집 시: drag-to-reorder (dnd-kit), 필드 추가 버튼, 필드 삭제

4. SecureNoteForm (등록/편집)
   - Title 입력 + body Textarea
   - "필드 추가" 버튼 → 타입 선택 드롭다운 → label 입력 → value 입력
   - 짧은 비밀 값 안내: "현관 코드 등 단일 비밀 값은 '비밀 필드'로 저장하세요" (인라인 힌트)

5. BentoCard 통합
   - secure_note 카드: 노트 배경색 (--color-yellow-2 oklch 토큰 추가)
   - body 앞 80자 미리보기 (Markdown 태그 제거 후 plain text)
   - custom_field 수 배지: "5개 필드"
```

**ux-designer agent 가 검증할 항목**:

- Markdown 편집 → 저장 → 렌더링 전환이 자연스러운지
- secret 타입 필드의 마스킹이 기본값으로 작동하는지
- 빈 note 의 empty state 가 적절히 안내하는지

---

### Phase 4: 카테고리 시스템

**implementator 사양에 들어갈 핵심 spec**:

```
1. DB 스키마
   - tags 테이블: id, name (full path), color_oklch, icon_emoji, created_at, updated_at
   - item_tags 테이블: item_id, tag_id (복합 PK), created_at
   - INDEX on item_tags.tag_id + item_tags.item_id

2. Sidebar 재설계
   a. Categories 섹션 (kind별 고정):
      - All Items (전체 수)
      - Logins, Credit Cards, Passkeys, Secure Notes, API Credentials, Others
      - 각 항목 우측: 항목 수 배지 (React Query count 쿼리)
   b. Tags 섹션 (사용자 정의):
      - 태그 목록 (중첩 트리)
      - 각 태그: 색상 dot + 이름 + 항목 수
      - 우클릭: rename, delete, change color
      - [+ 태그 추가] 버튼
   c. 하단: Archive, Recently Deleted

3. 태그 CRUD API (Tauri commands)
   - create_tag(name, color, icon): → tag_id
   - rename_tag(id, new_name)
   - delete_tag(id)  // item_tags 도 cascade
   - apply_tag(item_id, tag_id)
   - remove_tag(item_id, tag_id)
   - list_tags_with_count(): Vec<{ tag, count }>

4. 드래그 앤 드롭
   - dnd-kit useDraggable: BentoCard 또는 리스트 행
   - dnd-kit useDroppable: 사이드바 태그 항목
   - 드래그 시 사이드바 태그 하이라이트 (DragOverlay + active className)
   - 드롭 완료 시 apply_tag 호출 + 낙관적 UI 갱신

5. 태그 필터
   - URL/상태에 선택 태그 반영: ?tag=dev/aws
   - 태그 클릭 → 해당 태그의 항목만 표시
   - 멀티 태그 필터: Shift+클릭으로 AND 조건 누적

6. Archive / Recently Deleted
   - soft delete: items 테이블에 deleted_at, archived_at 컬럼
   - Archive: archived_at 설정, 검색·autofill 에서 제외, 복원 가능
   - Recently Deleted: deleted_at 설정, 30일 후 Rust 백그라운드 job 영구 삭제
   - UI: Archive/Recently Deleted 섹션에서 [Restore] / [Delete Permanently] 버튼
```

**ux-designer agent 가 검증할 항목**:

- 사이드바 항목 수 배지가 실시간으로 갱신되는지
- 드래그 앤 드롭의 drop zone 이 충분히 크고 시각적으로 명확한지
- 태그 삭제 시 "이 태그로 분류된 항목은 태그에서만 제거되고 삭제되지 않습니다" 경고 표시
- Archive vs Recently Deleted 의 차이가 사용자에게 명확히 전달되는지

---

### Phase 3-C: Passkey (추후)

**현재 결정 (Phase 3-C 진입 조건)**:

1. tauri-plugin-webauthn 이 macOS 지원 추가 OR tauri-plugin-macos-passkey 와 통합 방법 확인
2. Windows 11 Passkey Plugin API 와 Tauri MSIX 빌드 호환성 확인 (1Password 이미 MSIX 빌드로 지원)
3. iOS/Android (M11) 진입 전까지 모바일 passkey 는 스코프 밖

**단기 Phase 3-C (저장 전용)**:

```
1. DB: kind = 'passkey', 필드: domain, username, credential_id (암호화), note
2. UI: 메타데이터 표시 전용 카드 (실제 WebAuthn 인증 미연결)
3. 사이드바 Passkeys 카테고리 카운트 노출
4. "이 앱에서 직접 passkey 인증은 현재 미지원, 브라우저 확장 또는 OS 기본 passkey 관리자 사용" 안내
```

**장기 Phase 3-C (OS API 연결)**:

```
Windows: tauri-plugin-webauthn (v0.2.0+) + Windows Passkey Plugin API
macOS: tauri-plugin-macos-passkey (PRF 지원)
조건: 두 플러그인이 동일 Tauri 앱에서 feature flag 로 플랫폼별 분기
```

---

## 출처 (Sources)

| URL                                                                                                                  | 내용                                             | 신뢰도 |
| :------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------- | :----- |
| https://support.1password.com/item-categories/                                                                       | 1Password 22종 카테고리 목록 및 설명             | HIGH   |
| https://support.1password.com/custom-fields/                                                                         | 1Password Custom Field 11종 타입 및 UX           | HIGH   |
| https://support.1password.com/sidebar/                                                                               | 1Password 사이드바 구조, 드래그 앤 드롭 기능     | HIGH   |
| https://support.1password.com/favorites-tags/                                                                        | 1Password Tags 시스템, 중첩, 사이드바 표시       | HIGH   |
| https://support.1password.com/markdown/                                                                              | 1Password Markdown 지원 범위 및 제한             | HIGH   |
| https://support.1password.com/archive-delete-items/                                                                  | Archive vs Recently Deleted 30일 lifecycle       | HIGH   |
| https://support.1password.com/rich-icons-privacy/                                                                    | 1Password rich icon 처리 및 프라이버시           | HIGH   |
| https://1password.com/product/passkeys                                                                               | 1Password passkey 저장/사용/OS 통합 개요         | HIGH   |
| https://support.1password.com/save-use-passkeys/                                                                     | passkey 저장 및 사용 흐름 상세                   | HIGH   |
| https://1password.com/blog/how-save-manage-share-passkeys-1password                                                  | passkey vault 내 표시, 공유, 메타데이터          | HIGH   |
| https://1password.com/blog/design-values-ux-prinicples                                                               | 1Password 5가지 UX 원칙                          | HIGH   |
| https://1password.com/blog/concept-first-design                                                                      | 1Password concept-first 설계 방법론              | HIGH   |
| https://support.1password.com/style-guide/                                                                           | 1Password 문체 가이드 (에러 메시지 톤)           | HIGH   |
| https://bitwarden.com/help/storing-passkeys/                                                                         | Bitwarden passkey 저장 및 표시                   | HIGH   |
| https://bitwarden.com/help/custom-fields/                                                                            | Bitwarden Custom Field 4종 (Hidden 포함)         | HIGH   |
| https://bitwarden.com/help/folders/                                                                                  | Bitwarden Folders 구조 및 중첩                   | HIGH   |
| https://community.bitwarden.com/t/request-standardize-credit-card-number-format-across-viewing-and-editing/57741     | Bitwarden 카드 번호 포맷 요청 (커뮤니티)         | MEDIUM |
| https://community.bitwarden.com/t/credit-card-default-fields-are-not-hidden-or-no-option-for-toggle/291              | Bitwarden 카드 마스킹 부재 지적                  | MEDIUM |
| https://crates.io/crates/tauri-plugin-macos-passkey                                                                  | Tauri macOS passkey 플러그인                     | HIGH   |
| https://github.com/Profiidev/tauri-plugin-webauthn                                                                   | Tauri WebAuthn 플러그인 (Linux/Win/Android)      | HIGH   |
| https://github.com/1Password/passkey-rs                                                                              | 1Password passkey-rs Rust 크레이트               | HIGH   |
| https://windowsforum.com/threads/windows-11-native-passkeys-1password-and-bitwarden-integration.389014/              | Windows 11 Passkey Plugin API + 1P/BW 통합       | MEDIUM |
| https://bleepingcomputer.com/news/security/windows-11-now-supports-3rd-party-apps-for-native-passkey-management/     | Windows 11 KB5068861, 2025-11 제3자 passkey 지원 | HIGH   |
| https://www.1password.community/discussions/1password/how-to-get-my-custom-categories-to-appear-in-the-sidebar/56586 | 1P 사이드바 Categories 설정 방법                 | MEDIUM |
| https://alexn.org/blog/2024/08/20/1password-vs-bitwarden/                                                            | 1P vs BW 상세 UX 비교 (개인 블로그)              | MEDIUM |
| https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/                                                 | 스켈레톤 로딩 디자인 best practice               | HIGH   |
| https://carbondesignsystem.com/patterns/loading-pattern/                                                             | Carbon Design System 로딩 패턴 공식 가이드       | HIGH   |
| https://motion.dev/docs/react-transitions                                                                            | Motion 라이브러리 spring transition 문서         | HIGH   |
| https://react-spring.dev/common/configs                                                                              | React Spring 기본 spring 설정값                  | HIGH   |
| https://www.shadcn.io/components/finance/credit-card                                                                 | shadcn/ui 신용카드 컴포넌트 (flip 포함)          | HIGH   |
| https://www.passwordmanager.com/1password-vs-bitwarden/                                                              | 1P vs BW 전문 리뷰 2026                          | MEDIUM |
| https://cybernews.com/best-password-managers/bitwarden-vs-1password/                                                 | 1P vs BW 보안/기능/UX 종합 비교                  | MEDIUM |
| https://1password.com/blog/1password-brand-refresh                                                                   | 1Password 브랜드 리프레시 + 일러스트 시스템      | HIGH   |
| https://www.helpnetsecurity.com/2025/11/19/bitwarden-browser-extensions/                                             | Bitwarden 2025.11 Chromium passkey 로그인        | HIGH   |
| https://techcommunity.microsoft.com/blog/windows-itpro-blog/windows-11-expands-passkey-manager-support/4467572       | Windows 11 Passkey Manager Plugin API 공식 발표  | HIGH   |
