# Phase 2-3-a Google CSV Import — Research (2026-05-07)

조사 방법: Chromium 소스 직접 decode + Google / Microsoft / Brave 공식 문서 + KeePass / Bitwarden / 1Password 지원 문서 + Rust crate 이슈 트래커. 추측 없음, 1차 출처 위주.

---

## 1. Chrome / Edge / Brave CSV 정확 사양

### 1-1. 컬럼 헤더 — 정확한 이름과 순서

Chromium 소스 `components/password_manager/core/browser/export/password_csv_writer.cc` (refs/heads/main) 를 base64 디코딩해 직접 확인:

```
name,url,username,password,note
```

- 5개 컬럼, 정확히 이 순서, 모두 **소문자**
- 소스 내 상수 이름: `kTitleColumnName`, `kUrlColumnName`, `kUsernameColumnName`, `kPasswordColumnName`, `kNoteColumnName`
- `SerializePasswords()` 함수가 이 헤더 벡터를 먼저 기록한 뒤 레코드를 추가

**Import 측 인식 레이블** (`csv_password.h` `Label` enum):

```cpp
enum class Label { kOrigin, kUsername, kPassword, KNote };
```

- kOrigin = "url" (혹은 "origin_url" 도 허용 가능 — import parser 는 header 를 이름으로 매핑)
- 컬럼 이름 대소문자 구분: import 파서가 header row 를 column map 으로 변환, 정확히 어떤 대소문자 변환을 하는지는 `csv_password_iterator.cc` 에 있으나 현재 소스 기준 소문자 헤더가 기준

**출처**: Chromium 소스 직접 decode

- https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/password_manager/core/browser/export/password_csv_writer.cc (base64 format)
- https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/password_manager/core/browser/import/csv_password.h
- 신뢰도: HIGH (Chromium main branch 1차 소스)

### 1-2. note 컬럼 — 버전 이력

- Chrome 101 (2022-04 Stable): 비밀번호에 메모 추가 UI 기능 플래그로 도입
- Chrome 114 (2023-06 Stable): 메모 편집/저장 기능 정식 출시
- **CSV export 에 note 컬럼 포함 여부**: 2025년 5월 기준 Chromium main branch 소스에 `kNoteColumnName` 이 포함돼 있고, `PasswordFormToRecord()` 가 note 필드를 UTF-16 → UTF-8 변환 후 기록. 그러나 `aboutchromebooks.com` (2024 기사) 는 "아직 notes 는 export 안 된다, 추가 예정" 이라고 보고. **두 정보의 차이**: 소스에는 이미 반영됐으나 실제 stable 빌드에서 feature flag 로 제어 중일 수 있음.
- **구현 권고**: `note` 컬럼이 있으면 파싱, 없으면 무시하는 방어적 파싱을 사용할 것. Chrome 구버전 내보내기 파일에는 4컬럼(note 없음)이 올 수 있음.

**출처**:

- https://www.aboutchromebooks.com/chrome-password-manager-will-add-notes-to-password-exports/
- https://9to5google.com/2023/06/30/add-notes-to-passwords-chrome/
- 신뢰도: MEDIUM (공식 소스 미확인, 소스코드와 불일치 존재)

### 1-3. 인코딩

- **UTF-8** (BOM 없음)
- Chromium 소스: `PasswordFormToRecord()` 에서 `base::UTF16ToUTF8()` 호출 후 기록 — Windows 내부 문자 인코딩(UTF-16)을 UTF-8 로 변환
- **BOM**: Chrome 은 BOM 없이 UTF-8 출력. Windows 플랫폼이라도 동일. (Edge 도 동일 Chromium 기반)
- **실무 주의**: 사용자가 Excel 로 열거나 다른 도구로 변환한 경우 BOM 이 추가될 수 있음 → 파서에서 BOM 방어 코드 필요

**출처**:

- Chromium 소스 decode 결과 (위 동일)
- 신뢰도: HIGH

### 1-4. 줄바꿈

- **플랫폼별 차이 가능성**: RFC 4180 은 CRLF 권장. Chromium 의 `WriteCSV()` 가 플랫폼 네이티브를 쓰는지 명시된 테스트 보고는 찾지 못함.
- 현실적으로 Windows Chrome → CRLF, macOS/Linux Chrome → LF 가능성이 높음
- **구현 권고**: 파서를 LF/CRLF 무관하게 처리할 것 (Rust `csv` crate 는 자동으로 양쪽 처리)

### 1-5. escape 규칙

Chromium `csv_field_parser.cc` 분석:

- **RFC 4180** 표준 준수
- 쌍따옴표(`"`)를 포함하는 필드 → 필드 전체를 `"..."` 로 감싸고, 내부 `"` 를 `""` (두 개)로 이스케이프
- 쉼표(`,`)나 줄바꿈을 포함하는 필드 → 동일하게 쌍따옴표로 감쌈
- 백슬래시 이스케이프(`\"`) 는 RFC 4180 기준 아님, Chromium 도 사용 안 함
- `kMaxFields` 제한 있음 (몇 개인지 소스에서 직접 확인 필요하나 일반 패스워드 파일에서는 무관)

파서 상태 머신: `kInit → kPlain` (일반 텍스트) 또는 `kInit → kQuoted` (따옴표 시작) → `kAfter` (닫는 따옴표 후)

**출처**:

- https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/password_manager/core/browser/import/csv_field_parser.cc
- 신뢰도: HIGH

### 1-6. 빈 필드

- RFC 4180 기준: 빈 필드 = `,` 사이에 아무것도 없거나 `,"",` 형태
- Chrome export: `note` 미입력 시 빈 문자열(`""`) 또는 그냥 빈 컬럼으로 출력
- 구현: `Option<String>` 으로 처리, 빈 문자열이면 `None` 으로 정규화

### 1-7. 컬럼 순서 허용 여부

- Chromium import parser 는 header row 를 읽어 `ColumnMap` (`flat_map<size_t, Label>`) 으로 변환 → **컬럼 순서에 무관하게 이름으로 매핑**
- 즉 export 파일은 `name,url,username,password,note` 순이지만, import 시 순서가 달라도 됨
- API Vault 파서도 이름 기반 매핑 사용 권장

---

## 2. Edge / Brave 차이

### 2-1. Microsoft Edge

**공식 문서 확인** (learn.microsoft.com Q&A, 2023-01):

- Edge 는 Chromium 기반이지만 export 컬럼이 **3개만**: `url`, `username`, `password`
- `name` 컬럼이 없음 (닉네임/이름 export 미지원)
- `note` 컬럼도 없음
- import 시에도 동일하게 url / username / password 3컬럼만 인식
- **Microsoft 계정 비밀번호**: 검색 결과로는 별도 처리 여부 불명확. Edge 에 저장된 모든 웹사이트 비밀번호를 export 하는 것으로 보임. Microsoft 계정 자체 로그인 자격증명이 포함되는지는 미확인.

**참고**: 사용자가 Edge 에서 내보낸 파일을 API Vault 에 import 할 때 `name` 컬럼이 없으므로, 파서가 `name` 없어도 정상 처리해야 함.

**출처**:

- https://learn.microsoft.com/en-us/answers/questions/2373961/when-importing-or-exporting-ms-edge-saved-password
- https://support.microsoft.com/en-us/topic/export-passwords-in-microsoft-edge-15c0b4f5-e490-4034-b699-1063bad0cc2d
- 신뢰도: HIGH (Microsoft 공식)

### 2-2. Brave Browser

- Brave = Chromium 기반, 동일한 password 엔진 사용
- **컬럼 구조**: `name,url,username,password` (note 포함 여부는 Brave 버전에 따라 다를 수 있음)
- Brave 공식 import 문서에서 "Chrome CSV format 과 호환" 명시
- Chrome/Brave 간 파일 직접 교환 가능 (동일 포맷)

**출처**:

- https://brave.com/whats-new/import-passwords-csv/
- https://community.brave.app/t/import-chrome-passwords-csv-format/562793
- 신뢰도: MEDIUM (공식 페이지이나 정확한 컬럼 명세 미기재)

---

## 3. 다른 브라우저 비교 (Safari / Firefox) — 참고용

### 3-1. Apple Passwords (macOS Sequoia / iCloud Keychain)

**컬럼**: `Title,URL,Username,Password,Notes,OTPAuth`

- 6개 컬럼, **이 순서는 필수가 아님** (Apple Passwords app 은 이름으로 매핑)
- `OTPAuth` = TOTP URI (`otpauth://totp/...`), 대부분 비어 있음
- `Notes` 에 주의: Chrome 은 소문자 `note`, Apple 은 대문자 `Notes`
- BOM 없는 UTF-8, 줄바꿈 LF (macOS 기본)
- macOS Sequoia (15.x) 에서 Passwords.app 이 공식 제공 (Safari 15 + macOS Monterey 이후)

**구버전 Keychain 스크립트 포맷** (참고용):

```
server,account,password
```

(rmondello gist 기준, 현재는 사용 안 함)

**출처**:

- https://discussions.apple.com/thread/255770425 (Apple Community)
- https://support.apple.com/guide/passwords/export-mchl35b12625/mac
- https://github.com/AnyISalIn/1password-to-apple-passwords
- 신뢰도: MEDIUM (Apple 공식 문서는 컬럼 명세 없음, Community 다수 보고로 확인)

### 3-2. Firefox

**컬럼** (about:logins → 3점 메뉴 → "로그인 내보내기"):

```
"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"
```

- 9개 컬럼, `url` / `username` / `password` 외 메타데이터 다수 포함
- `httpRealm`: HTTP Basic Auth 영역 (일반 폼 로그인 시 비어 있음)
- `formActionOrigin`: 폼 제출 URL
- `guid`: Firefox 내부 GUID
- 타임스탬프: Unix epoch milliseconds
- Firefox 79+ 에서 CSV export 기능 활성화 (about:logins)
- Lockwise 는 Firefox 기반이었으나 2021년 서비스 종료, 이후 Firefox 내장 about:logins 가 대체

**구현 참고**: API Vault 가 Firefox CSV 를 지원할 경우 9컬럼 중 3개(`url`, `username`, `password`)만 필요. 나머지는 무시.

**출처**:

- https://winaero.com/export-saved-logins-and-passwords-to-csv-file-in-firefox/
- 신뢰도: MEDIUM (비공식 가이드이나 실제 export 파일 확인 기반)

### 3-3. 브라우저별 포맷 비교표

| 브라우저        | 필수 컬럼                   | 추가 컬럼                        | note/Notes   | BOM  | 줄바꿈            |
| --------------- | --------------------------- | -------------------------------- | ------------ | ---- | ----------------- |
| Chrome 114+     | name,url,username,password  | note (조건부)                    | 소문자 note  | 없음 | CRLF(Win)/LF(Mac) |
| Edge (Chromium) | url,username,password       | 없음                             | 없음         | 없음 | CRLF(Win)         |
| Brave           | name,url,username,password  | note (버전별)                    | 소문자 note  | 없음 | 플랫폼 의존       |
| Firefox         | url,username,password       | httpRealm,guid,타임스탬프 등 6개 | 없음         | 없음 | 플랫폼 의존       |
| Apple Passwords | Title,URL,Username,Password | Notes,OTPAuth                    | 대문자 Notes | 없음 | LF(macOS)         |

---

## 4. 보안 고려사항

### 4-1. import 후 CSV 파일 삭제 권고

**업계 관행 (1Password, Bitwarden, Google, Dashlane 모두 동일)**:

- import 완료 후 **즉시 삭제** 권고
- 단순 삭제가 아닌 **휴지통 비우기까지** 권고 (일부 문서)
- Bitwarden 공식: "After your data is imported, delete the exported data file from your computer."
- 1Password 공식: "delete the unencrypted CSV file" (import 후 삭제 명시)
- Google 공식: "Delete the .CSV password file you downloaded. If you don't delete your password file, anyone with access to the device can open the file and access your passwords."

**API Vault 구현 권고**:

- import 완료 모달/토스트에 **파일 경로 + "삭제 권고" 경고** 포함
- 가능하면 "파일 삭제" 버튼을 UI 에 직접 제공 (Tauri `fs::remove_file` API 사용 가능)
- 삭제 거부 시 "나중에 직접 삭제하세요" 안내

### 4-2. 메모리 내 평문 처리 위험

- import 시 CSV 파일 전체를 Rust 메모리에 읽으면 패스워드가 `String` 으로 일정 시간 평문 유지
- **실질 위험**: process memory dump, cold boot attack, swap file 유출
- **Rust 방어책 (현재 워크스페이스 이미 보유)**:
  - `secrecy` crate: `SecretBox<String>` 래퍼 → drop 시 자동 zeroize
  - `zeroize` crate: `core::ptr::write_volatile` 기반 메모리 덮어쓰기
  - `secrecy` 는 `Serialize` impl 을 의도적으로 생략 → serde 를 통한 평문 유출 방지
- **구현 패턴 권고**:
  ```rust
  // CSV row 파싱 후 즉시 SecretBox 로 감싸기
  let password = SecretBox::new(Box::new(row.password));
  // vault 암호화 후 SecretBox drop → zeroize 자동 실행
  ```
- 파싱 중 중간 `String` 이 여러 번 복사되는 것을 최소화 → `Cow<str>` 또는 직접 참조 사용

**출처**:

- https://docs.rs/secrecy (HIGH)
- https://docs.rs/zeroize/latest/zeroize/ (HIGH)
- https://dev.to/riccio8/zeroize-the-tiny-and-memory-safe-rust-crate-1kff (MEDIUM)
- 최근 연구 (ETH Zurich, 2026-02): 주요 패스워드 매니저들의 ZK 취약점 다수 발견 — 메모리 내 평문이 쟁점 중 하나 (https://ethz.ch/en/news-and-events/eth-news/news/2026/02/password-managers-less-secure-than-promised.html)

### 4-3. 중복 import 방지

- Bitwarden: 중복 감지 없음, 다중 import 시 중복 항목 생성됨
- **API Vault 차별화 기회**: URL + username 조합으로 기존 credential 과 대조 → import preview 에서 "이미 존재" 플래그 표시

---

## 5. 기존 Rust crate 후보

### 5-1. `csv` crate (BurntSushi)

- 현재 워크스페이스에 **미포함** (Cargo.toml 전체 검토 완료 — csv 없음)
- crates.io 에서 가장 많이 쓰이는 CSV 파서, RFC 4180 호환
- 특징:
  - `StringRecord` (UTF-8 보장) / `ByteRecord` (바이트 기반) 양쪽 지원
  - Serde 통합: `#[derive(Deserialize)]` 로 struct 에 직접 매핑
  - 기본 quote char = `"`, escape = RFC 4180 (double-quote)
  - `ReaderBuilder` 로 구분자, quote, trim 등 설정 가능
  - CRLF/LF 자동 처리
- **BOM 문제**: 자동 처리 안 함 (알려진 이슈 #81, #163)
  - workaround: 파일 읽기 후 `content.trim_start_matches('\u{feff}')` 적용 후 파서 투입

### 5-2. BOM 처리 옵션

| 방법                             | 장단점            |
| -------------------------------- | ----------------- |
| `trim_start_matches('\u{feff}')` | 의존성 없음, 간단 |
| `strip_bom` crate                | 경량 전용 crate   |
| `unicode-bom` crate              | BOM 감지 후 처리  |

Chrome export 는 BOM 없음이 기본이지만, 사용자가 Excel 로 한 번 열었다 저장하면 BOM 이 추가될 수 있으므로 방어적으로 strip 필요.

### 5-3. `encoding_rs` 필요 여부

- Chrome export = UTF-8 (BOM 없음) → **불필요**
- Firefox export = 동일 UTF-8
- Safari export = macOS UTF-8
- Edge export = UTF-8
- 결론: encoding_rs 추가 불필요, BOM strip 로직만으로 충분

### 5-4. 워크스페이스 추가 방법

`csv` 를 workspace dependency 로 추가:

```toml
# src-tauri/Cargo.toml [workspace.dependencies]
csv = "1"

# src-tauri/crates/api-vault-core/Cargo.toml (또는 별도 api-vault-import crate)
csv = { workspace = true }
```

---

## 6. UX 벤치마크

### 6-1. 1Password (Chrome CSV import)

**UX 흐름**:

1. 앱에서 import 진입
2. "Add File" 로 CSV 선택
3. 계정(vault) 선택
4. "Import" 버튼 클릭
5. 완료: "Chrome passwords will be converted into 1Password Login items"
6. **후속 안내**: "delete the unencrypted CSV file" 명시적 권고

**특이점**:

- preview 단계 없음 (행 수, 충돌 표시 없이 바로 import)
- 크레딧카드/주소는 import 안 되고 비밀번호만
- import 후 Chrome 비번 관리자 비활성화 + 1Password 확장 설치 안내

**출처**: https://support.1password.com/import-chrome/ (HIGH)

### 6-2. Bitwarden (Chrome CSV import)

**UX 흐름**:

1. Tools > Import Data 진입
2. 포맷 드롭다운에서 "Comma-separated values (CSV)" 또는 "Chrome" 선택
3. 파일 업로드 또는 CSV 텍스트 직접 붙여넣기
4. "Import Data" 버튼 클릭
5. 성공 또는 "Import error" 메시지 표시
6. **후속 안내**: "delete the exported data file from your computer" 명시적 권고

**특이점**:

- **preview 없음** — 행 수, 충돌 감지 전혀 없음
- **중복 감지 없음** — 같은 파일 두 번 import 시 중복 항목 생성 (공식 경고)
- 데이터를 로컬에서 암호화 후 서버 전송
- 파일 대신 텍스트 붙여넣기 옵션 독특

**출처**:

- https://bitwarden.com/help/import-from-chrome/ (HIGH)
- https://bitwarden.com/help/import-data/ (HIGH)

### 6-3. Dashlane (범용 CSV import)

- preview 단계에서 항목 타입(Login / Secure Note) 변경 가능
- 403 에러로 전체 흐름 확인 불가

**출처**: https://support.dashlane.com/hc/en-us/articles/33050358427666 (접근 불가)

### 6-4. Apple iCloud Passwords (import)

- CSV 첫 줄 컬럼 이름이 정확히 `Title,URL,Username,Password,Notes,OTPAuth` 여야 import 성공
- 컬럼 이름 오타 시 전체 실패 (Apple Community 다수 보고)
- **preview 없음** — 즉시 import

### 6-5. 업계 공통 패턴 요약

| 기능              | 1Password | Bitwarden         | Dashlane | Apple     |
| ----------------- | --------- | ----------------- | -------- | --------- |
| import 전 preview | 없음      | 없음              | 일부     | 없음      |
| 행 수 표시        | 없음      | 없음              | 미확인   | 없음      |
| 충돌/중복 감지    | 없음      | 없음 (경고만)     | 미확인   | 없음      |
| 잘못된 행 표시    | 없음      | 오류 시 전체 실패 | 미확인   | 전체 실패 |
| CSV 삭제 권고     | 명시적    | 명시적            | 미확인   | 미확인    |
| 진행률 표시       | 없음      | 없음              | 미확인   | 없음      |

---

## 7. 권고 — Implementation 진입 시

### 7-1. 파싱 컬럼 정책

**지원할 컬럼 (이름 기반 매핑, 순서 무관)**:

| CSV 컬럼 이름                 | 매핑 대상                                 | 필수 여부 |
| ----------------------------- | ----------------------------------------- | --------- |
| `name`                        | `CredentialInput.name` (또는 issuer hint) | 선택      |
| `url` 또는 `origin_url`       | `CredentialInput.url`                     | 필수      |
| `username`                    | `CredentialInput.username`                | 필수      |
| `password`                    | `CredentialInput.secret` (→ SecretBox)    | 필수      |
| `note` 또는 `Notes`           | `CredentialInput.note` (향후 확장)        | 선택      |
| `Title`                       | `name` fallback (Apple 호환)              | 선택      |
| `URL`, `Username`, `Password` | 대문자 variant 도 허용 (Apple 호환)       | -         |

**오류 정책**:

- `url` + `username` + `password` 중 하나라도 없으면 해당 행 skip + 오류 행 목록에 추가
- 빈 `url` 행도 skip
- 전체 파일이 헤더 없으면 import 거부

### 7-2. 인코딩 / escape 처리

```rust
// BOM strip (Chrome 은 없으나 방어 코드)
let content = raw_bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(raw_bytes);
let content = std::str::from_utf8(content)?;

// csv crate 사용
let mut rdr = csv::ReaderBuilder::new()
    .flexible(true)          // 컬럼 수 다른 행 허용
    .trim(csv::Trim::All)    // 헤더/필드 앞뒤 공백 제거
    .from_reader(content.as_bytes());
```

- RFC 4180 자동 처리: `csv` crate 기본 설정으로 충분
- `flexible(true)`: Edge 처럼 컬럼 수 다른 파일 허용
- CRLF/LF 양쪽 자동 처리: `csv` crate 기본 동작

### 7-3. 보안 처리 패턴

```rust
use secrecy::SecretBox;

struct ImportedCredential {
    name: Option<String>,
    url: String,
    username: String,
    password: SecretBox<String>,  // 즉시 SecretBox 로 감싸기
    note: Option<String>,
}

// 파싱 직후 zeroize 될 임시 row struct
#[derive(serde::Deserialize, zeroize::Zeroize, zeroize::ZeroizeOnDrop)]
struct CsvRow {
    name: Option<String>,
    url: Option<String>,
    username: Option<String>,
    password: Option<String>,     // 여기서는 잠깐 평문, 즉시 SecretBox 로 이동
    note: Option<String>,
}
```

### 7-4. preview 단계 UI 권고 (차별화)

업계 현황: **모두 preview 없음** → API Vault 의 Bento Card preview 가 차별화 포인트.

**권고 흐름**:

1. 파일 선택 → 즉시 파싱 (메모리만, DB 미기록)
2. **Preview 모달**:
   - 총 행 수 / 유효 행 수 / 오류 행 수
   - 유효 행: 작은 BentoCard 미리보기 (site icon + name + url 마스킹, password 는 `••••••`)
   - 오류 행: 이유와 함께 목록 (예: "url 없음", "password 없음")
   - 기존 vault 에 동일 URL + username 이 있으면 "중복 가능성" 뱃지 표시
   - "Import XX개 + Skip YY개" 버튼
3. import 실행 → per-row 결과를 progress 로 표시 (행이 많을 경우)
4. 완료 후: 결과 요약 모달
   - "XX개 추가됨, YY개 건너뜀, ZZ개 오류"
   - **"원본 CSV 파일 삭제 권고"** (파일 경로 + 삭제 버튼 또는 경고 텍스트)
5. 삭제 거부 시: 15분 후 리마인더 토스트 (선택적)

### 7-5. 보안 토스트 권고

**필수**: import 완료 직후 **지속형 경고** (자동으로 사라지지 않는 토스트 또는 배너):

```
"비밀번호 CSV 파일이 디스크에 평문으로 저장됩니다.
보안을 위해 즉시 삭제하세요.
[파일 열기] [지금 삭제] [나중에]"
```

- Bitwarden / 1Password / Google 모두 삭제 권고하나 UI 가 텍스트만 → API Vault 는 **삭제 버튼 직접 제공**이 차별화
- Tauri `tauri::api::path` + `std::fs::remove_file` 또는 tauri-plugin-fs 로 구현 가능

### 7-6. 새 Issuer 자동 감지

- import 행의 `url` 에서 domain 추출 → 기존 issuer preset `domains[]` 와 `matchIssuerByUrl()` 비교
- 매칭되면 자동으로 issuer 지정 (Phase 2-1 구현 재사용)
- 매칭 안 되면 `url` 의 eTLD+1 으로 신규 issuer 후보 제안 → "이 도메인을 새 Issuer 로 추가하시겠습니까?" 옵션

---

## 8. 참고 소스 목록

| 소스                                         | URL                                                                                                                                     | 신뢰도 | 관련성 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| Chromium password_csv_writer.cc              | https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/password_manager/core/browser/export/password_csv_writer.cc | HIGH   | 9/10   |
| Chromium csv_password.h                      | https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/password_manager/core/browser/import/csv_password.h         | HIGH   | 9/10   |
| Chromium csv_field_parser.cc                 | https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/password_manager/core/browser/import/csv_field_parser.cc    | HIGH   | 8/10   |
| Google Chrome Help - Import/Export           | https://support.google.com/chrome/answer/13068232                                                                                       | HIGH   | 7/10   |
| Microsoft Edge Export Help                   | https://support.microsoft.com/en-us/topic/export-passwords-in-microsoft-edge-15c0b4f5-e490-4034-b699-1063bad0cc2d                       | HIGH   | 7/10   |
| Edge Q&A - column limitation                 | https://learn.microsoft.com/en-us/answers/questions/2373961/when-importing-or-exporting-ms-edge-saved-password                          | HIGH   | 8/10   |
| Brave CSV import                             | https://brave.com/whats-new/import-passwords-csv/                                                                                       | MEDIUM | 5/10   |
| Firefox CSV export columns                   | https://winaero.com/export-saved-logins-and-passwords-to-csv-file-in-firefox/                                                           | MEDIUM | 6/10   |
| Apple Passwords export                       | https://support.apple.com/guide/passwords/export-mchl35b12625/mac                                                                       | HIGH   | 6/10   |
| Apple Passwords CSV format (Community)       | https://discussions.apple.com/thread/255770425                                                                                          | MEDIUM | 7/10   |
| 1Password import Chrome                      | https://support.1password.com/import-chrome/                                                                                            | HIGH   | 8/10   |
| Bitwarden import Chrome                      | https://bitwarden.com/help/import-from-chrome/                                                                                          | HIGH   | 8/10   |
| Bitwarden import data                        | https://bitwarden.com/help/import-data/                                                                                                 | HIGH   | 7/10   |
| Bitwarden duplicate issue                    | https://community.bitwarden.com/t/prevent-duplication-when-import/53992                                                                 | MEDIUM | 6/10   |
| Chrome password notes (aboutchromebooks)     | https://www.aboutchromebooks.com/chrome-password-manager-will-add-notes-to-password-exports/                                            | MEDIUM | 7/10   |
| rust-csv BOM issue #81                       | https://github.com/BurntSushi/rust-csv/issues/81                                                                                        | HIGH   | 8/10   |
| secrecy crate docs                           | https://docs.rs/secrecy                                                                                                                 | HIGH   | 9/10   |
| zeroize crate docs                           | https://docs.rs/zeroize/latest/zeroize/                                                                                                 | HIGH   | 9/10   |
| ETH Zurich password manager research         | https://ethz.ch/en/news-and-events/eth-news/news/2026/02/password-managers-less-secure-than-promised.html                               | HIGH   | 5/10   |
| KeePass Chrome import thread (format change) | https://sourceforge.net/p/keepass/discussion/329220/thread/d6be5205f2/                                                                  | MEDIUM | 6/10   |
| RFC 4180                                     | https://www.rfc-editor.org/rfc/rfc4180.html                                                                                             | HIGH   | 7/10   |
