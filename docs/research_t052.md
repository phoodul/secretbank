# T052 구현 선행 조사 — HIBP 클라이언트 (`secretbank-feeds/hibp.rs`)

> 작성일: 2026-04-24
> 조사 범위: HIBP API v3 공식 문서, 엔드포인트/인증/Rate Limit/응답 스키마, governor 매핑,
> Rust 생태계 기존 crate, wiremock 테스트 전략
> 기준: 2026-04-24 현재 최신 정보 확인. 확인 불가 항목은 "확인 불가"로 명시.

---

## 1. HIBP API 버전 현황

### 1-1. 현재 최신 버전

| 항목               | 값                                                             |
| :----------------- | :------------------------------------------------------------- |
| **현재 최신 버전** | **v3**                                                         |
| **공식 문서 URL**  | `https://haveibeenpwned.com/API/v3` (대소문자 무관)            |
| **Base URL**       | `https://haveibeenpwned.com/api/v3`                            |
| **v4 존재 여부**   | **없음** (2026-04-24 기준, 공식 사이트 검색 결과 v4 언급 없음) |

v3 는 v2 대비 이메일 주소 / 도메인 검색 엔드포인트에 **브레이킹 체인지**를 포함한다.
인증 방식이 `Authorization: Bearer` 에서 `hibp-api-key` 커스텀 헤더로 변경됐다.

출처:

- [HIBP API v3 공식 문서](https://haveibeenpwned.com/API/v3) — 2026-04-24 직접 확인
- [HIBP API v3 공식 문서 (대문자 alias)](https://haveibeenpwned.com/api/v3) — 동일 페이지

---

## 2. 사용할 엔드포인트 — breachedaccount

### 2-1. 기본 정보

| 항목          | 값                                                                    |
| :------------ | :-------------------------------------------------------------------- |
| 메서드        | `GET`                                                                 |
| 경로          | `/api/v3/breachedaccount/{email}`                                     |
| 전체 URL 예시 | `https://haveibeenpwned.com/api/v3/breachedaccount/foo%40example.com` |
| 대소문자 구분 | 없음 (email 은 소문자 정규화됨)                                       |

### 2-2. URL 인코딩

공식 문서 명시: **"The email address should always be URL encoded."**

- `@` → `%40`, `+` → `%2B`, `.` 은 그대로 허용.
- Rust 에서 `urlencoding::encode(&email)` 또는 `percent_encoding` 크레이트를 사용한다.
- reqwest 의 `query()` 파라미터로 전달하면 자동 인코딩되지 **않는다**. 경로(path) 세그먼트로 사용하므로
  **반드시 수동으로 URL-encode** 후 경로에 삽입해야 한다.

```rust
// 권장 패턴 (percent_encoding 또는 urlencoding crate 사용)
use urlencoding::encode;
let url = format!(
    "https://haveibeenpwned.com/api/v3/breachedaccount/{}",
    encode(&email)
);
```

### 2-3. 쿼리 파라미터

| 파라미터            | 기본값 | 설명                                                                      |
| :------------------ | :----- | :------------------------------------------------------------------------ |
| `truncateResponse`  | `true` | `true` 이면 `Name` 필드만 반환. `false` 로 설정 시 전체 Breach 객체 반환. |
| `IncludeUnverified` | `true` | `false` 로 설정 시 미검증 breach 제외.                                    |
| `Domain`            | (없음) | 특정 도메인으로 필터링. 예: `Domain=adobe.com`                            |

**중요**: full breach 데이터를 원하면 반드시 `truncateResponse=false` 를 명시해야 한다.
기본(truncated) 응답은 `[{"Name":"Adobe"},{"Name":"Gawker"}]` 형태로, Name 만 담긴 배열이다.

출처:

- [HIBP API v3 breachedAccount 섹션](https://haveibeenpwned.com/api/v3#BreachedAccount) — 2026-04-24 직접 확인

---

## 3. 인증

### 3-1. 헤더

| 항목            | 값                                                                                      |
| :-------------- | :-------------------------------------------------------------------------------------- |
| **헤더 이름**   | `hibp-api-key` (소문자, HTTP/1.1 헤더 이름은 case-insensitive 이나 공식 문서 표기 기준) |
| **값 형식**     | 32자 16진수 문자열                                                                      |
| **테스트용 키** | `00000000000000000000000000000000` (`hibp-integration-tests.com` 도메인 이메일 전용)    |

```rust
// reqwest header 설정
req = req.header("hibp-api-key", api_key.as_str());
```

API key 가 없거나 잘못된 경우 → **HTTP 401** 반환.
User-Agent 가 없는 경우 → **HTTP 403** 반환.

### 3-2. 가격 (2026-04-24 기준)

새 구독 플랜 체계가 2026년 초 도입됐다. 기존 "Pwned 1/2/3/4/5" 명칭은 **2026-08-02 이후 롤오버** 시
새 플랜으로 전환된다.

**Core 플랜 (개인/소규모)**

| 플랜   | RPM   | 월 요금 (연간 기준) |
| :----- | :---- | :------------------ |
| Core 1 | 10    | $4.39               |
| Core 2 | 50    | $21.59              |
| Core 3 | 100   | $36.99              |
| Core 4 | 500   | $159                |
| Core 5 | 1,000 | $319                |

**Pro 플랜 (MSP/다중 도메인 모니터링)**

| 플랜  | RPM    | 월 요금 (연간 기준) |
| :---- | :----- | :------------------ |
| Pro 1 | 1,000  | $379                |
| Pro 2 | 2,000  | $699                |
| Pro 3 | 4,000  | $1,299              |
| Pro 4 | 8,000  | $2,499              |
| Pro 5 | 16,000 | $4,599              |

**High RPM 플랜 (대용량 API 처리)**

| 플랜           | RPM    | 월 요금 (연간 기준) |
| :------------- | :----- | :------------------ |
| High RPM 4000  | 4,000  | $1,150              |
| High RPM 8000  | 8,000  | $2,299              |
| High RPM 12000 | 12,000 | $3,449              |
| High RPM 24000 | 24,000 | $5,833              |

연간 결제 시 약 19% 할인.

출처:

- [HIBP 구독 페이지](https://haveibeenpwned.com/Subscription) — 2026-04-24 직접 확인
- [Troy Hunt 블로그 — Rate Limit and Annual Billing 발표](https://www.troyhunt.com/the-have-i-been-pwned-api-now-has-different-rate-limits-and-annual-billing/) — 과금 체계 배경 설명

---

## 4. Rate Limits (2026-04-24 기준)

### 4-1. RPM 기반 제한

HIBP API 는 **Requests Per Minute (RPM)** 단위로 rate limit 을 명시한다.
가장 저렴한 Core 1 가 **10 RPM** 이다.

| 등급                 | RPM                 |
| :------------------- | :------------------ |
| **키 없음 (public)** | **불가 (HTTP 401)** |
| Core 1 (최저)        | 10                  |
| Core 5               | 1,000               |
| Pro 5                | 16,000              |
| High RPM 24000       | 24,000              |

- 키 없이 `/api/v3/breachedaccount/` 를 호출하면 **HTTP 401** 즉시 반환.
- 가장 보수적인 전제: 프리 플랜은 없으므로 API key 는 반드시 필요.

### 4-2. 429 Rate Limit 응답

```
HTTP/1.1 429 Too Many Requests
retry-after: 2
```

- `retry-after` 헤더값: **남은 대기 초(정수, 올림 처리)**.
- 클라이언트는 이 값을 읽어 대기 후 재시도해야 한다.
- Rate limit 경계 근처에서 정확히 RPM 한도로 요청하면 네트워크 지연으로 429 가 발생할 수 있으므로
  실제 요청은 한도보다 **약간 낮게(~5%)** 유지하는 것이 권장된다.

### 4-3. governor 매핑

`governor 0.10.x` 의 `Quota::per_minute()` 로 RPM 을 직접 표현한다.

```rust
use std::num::NonZeroU32;
use governor::{DefaultDirectRateLimiter, Quota, RateLimiter};

fn build_limiter(rpm: u32) -> Arc<DefaultDirectRateLimiter> {
    let burst = NonZeroU32::new(rpm).expect("rpm > 0");
    let quota = Quota::per_minute(burst);
    Arc::new(RateLimiter::direct(quota))
}
```

**티어별 권장 RPM 설정:**

| HIBP 플랜 | API RPM | governor 설정                          |
| :-------- | :------ | :------------------------------------- |
| Core 1    | 10      | `Quota::per_minute(nonzero!(10u32))`   |
| Core 2    | 50      | `Quota::per_minute(nonzero!(50u32))`   |
| Core 3    | 100     | `Quota::per_minute(nonzero!(100u32))`  |
| Core 5    | 1,000   | `Quota::per_minute(nonzero!(1000u32))` |

**기본값 권장**: 구현에서는 `api_key` 가 제공되면 **Core 1 기준 10 RPM** 으로 초기화하되,
호출자가 `rpm` 을 오버라이드할 수 있도록 생성자 파라미터를 열어두는 것이 바람직하다.

```rust
// HibpClient::new(api_key, rpm_override)
// rpm_override = None → 기본값 10 RPM (Core 1)
fn build_limiter(rpm: Option<u32>) -> Arc<DefaultDirectRateLimiter> {
    let rpm = rpm.unwrap_or(10);
    let burst = NonZeroU32::new(rpm).expect("rpm > 0");
    Arc::new(RateLimiter::direct(Quota::per_minute(burst)))
}
```

`per_minute(10)` 은 내부적으로 6초마다 1 토큰을 보충(`replenish_interval = 6s`)하며
버스트 최대 10 토큰을 허용한다.

출처:

- [governor Quota docs.rs](https://docs.rs/governor/latest/governor/struct.Quota.html) — 2026-04-24 확인
- [HIBP 구독 페이지 Rate Limit 표](https://haveibeenpwned.com/Subscription) — 2026-04-24 확인
- [Troy Hunt 429 support FAQ](https://support.haveibeenpwned.com/hc/en-au/articles/5744766972431) — retry-after 형식 확인

---

## 5. User-Agent 필수 요건

### 5-1. 공식 명시

공식 API 문서에 명시:

> "Requests without a user agent are forbidden and will return HTTP 403."

User-Agent 헤더가 **누락되면 HTTP 403 Forbidden** 을 즉시 반환한다.

### 5-2. 권장 형식

공식 가이드라인:

> "The user agent should accurately describe the nature of the API consumer."

권장 패턴:

- `secretbank/0.1.0` (앱 이름/버전)
- `secretbank/0.1.0 (contact: phoodul@gmail.com)` (연락처 포함)

T049~T051 과 동일하게 `secretbank/0.1.0` 으로 통일한다.

```rust
let client = reqwest::Client::builder()
    .user_agent("secretbank/0.1.0")
    .build()?;
```

출처:

- [HIBP API v3 공식 문서 — User Agent 섹션](https://haveibeenpwned.com/API/v3) — 2026-04-24 확인

---

## 6. 응답 스키마 — Breach 객체

### 6-1. 전체 필드 목록

2026-04-24 공식 API 엔드포인트 직접 호출
(`GET /api/v3/breach/TelegramStealerLogs`) 로 확인한 실제 응답 기준.

| 필드명               | 타입             | 설명                                                          | Nullable            |
| :------------------- | :--------------- | :------------------------------------------------------------ | :------------------ |
| `Name`               | `String`         | URL-friendly slug (고유 식별자)                               | No                  |
| `Title`              | `String`         | 화면 표시용 이름                                              | No                  |
| `Domain`             | `String`         | 유출 발생 사이트 도메인 (빈 문자열 가능)                      | No                  |
| `BreachDate`         | `String`         | 날짜만 (`YYYY-MM-DD`, ISO 8601)                               | No                  |
| `AddedDate`          | `String`         | HIBP 에 추가된 일시 (ISO 8601, 예: `2024-08-01T05:38:53Z`)    | No                  |
| `ModifiedDate`       | `String`         | HIBP 레코드 수정 일시 (ISO 8601)                              | No                  |
| `PwnCount`           | `u64`            | 유출된 이메일 계정 수                                         | No                  |
| `Description`        | `String`         | HTML 포함 가능 설명                                           | No                  |
| `DataClasses`        | `Vec<String>`    | 알파벳 순 유출 데이터 유형 배열                               | No                  |
| `IsVerified`         | `bool`           | 검증된 breach 여부                                            | No                  |
| `IsFabricated`       | `bool`           | 조작된 breach 여부                                            | No                  |
| `IsSensitive`        | `bool`           | 민감 breach (공개 API 에서 이메일 주소 미반환)                | No                  |
| `IsRetired`          | `bool`           | 데이터 영구 삭제 여부                                         | No                  |
| `IsSpamList`         | `bool`           | 스팸 리스트 분류 여부                                         | No                  |
| `IsMalware`          | `bool`           | 말웨어 캠페인 기원 여부                                       | No                  |
| `IsSubscriptionFree` | `bool`           | 도메인 검색 시 구독 부족 표시용 (이메일 검색 시는 항상 false) | No                  |
| `IsStealerLog`       | `bool`           | 스틸러 로그(info-stealer) 기원 여부                           | No                  |
| `LogoPath`           | `String`         | 로고 이미지 URI                                               | No                  |
| `Attribution`        | `Option<String>` | 데이터 제공자 요청 귀속 정보                                  | **Yes** (null 가능) |
| `DisclosureUrl`      | `Option<String>` | 공개 URL (일부 breach 에 존재)                                | **Yes** (null 가능) |

**실제 응답 예시 (TelegramStealerLogs):**

```json
{
  "Name": "TelegramStealerLogs",
  "Title": "Stealer Logs Posted to Telegram",
  "Domain": "",
  "BreachDate": "2024-07-18",
  "AddedDate": "2024-08-01T05:38:53Z",
  "ModifiedDate": "2025-03-04T02:06:27Z",
  "PwnCount": 26105473,
  "Description": "...(HTML)...",
  "LogoPath": "https://logos.haveibeenpwned.com/List.png",
  "Attribution": null,
  "DisclosureUrl": null,
  "DataClasses": ["Email addresses", "Passwords"],
  "IsVerified": true,
  "IsFabricated": false,
  "IsSensitive": false,
  "IsRetired": false,
  "IsSpamList": false,
  "IsMalware": false,
  "IsSubscriptionFree": false,
  "IsStealerLog": true
}
```

### 6-2. 필드명 대소문자 — `PascalCase`

**모든 필드명은 PascalCase** 이다. Rust struct 에서 역직렬화 시:

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct HibpBreach {
    pub name: String,
    pub title: String,
    pub domain: String,
    pub breach_date: String,    // "YYYY-MM-DD"
    pub added_date: String,     // ISO 8601 datetime
    pub modified_date: String,  // ISO 8601 datetime
    pub pwn_count: u64,
    pub description: String,
    pub data_classes: Vec<String>,
    pub is_verified: bool,
    pub is_fabricated: bool,
    pub is_sensitive: bool,
    pub is_retired: bool,
    pub is_spam_list: bool,
    pub is_malware: bool,
    pub is_subscription_free: bool,
    pub is_stealer_log: bool,
    pub logo_path: String,
    pub attribution: Option<String>,
    pub disclosure_url: Option<String>,
}
```

**주의**: `#[serde(rename_all = "PascalCase")]` 가 정확히 적용되는지 확인이 필요하다.
Rust 의 snake_case 필드 `breach_date` → serde PascalCase 변환 → `BreachDate` (정상 변환 확인).
단, `pwn_count` → `PwnCount` 변환 여부를 테스트로 검증해야 한다.

### 6-3. 날짜 파싱 전략

| 필드           | 포맷                     | 파싱 방법                                          |
| :------------- | :----------------------- | :------------------------------------------------- |
| `BreachDate`   | `"YYYY-MM-DD"`           | `time::Date::parse()` + `time::format_description` |
| `AddedDate`    | `"2024-08-01T05:38:53Z"` | `time::OffsetDateTime::parse()` + Rfc3339          |
| `ModifiedDate` | `"2025-03-04T02:06:27Z"` | 동일                                               |

**AddedDate / ModifiedDate 는 Z suffix(UTC) 를 포함한 ISO 8601**. `time` 크레이트의
`time::format_description::well_known::Rfc3339` 로 직접 파싱 가능.

```rust
use time::format_description::well_known::Rfc3339;

fn parse_hibp_time(s: &str) -> Result<time::OffsetDateTime, time::error::Parse> {
    time::OffsetDateTime::parse(s, &Rfc3339)
}
```

**BreachDate** (날짜만):

```rust
use time::macros::format_description;

fn parse_breach_date(s: &str) -> Result<time::Date, time::error::Parse> {
    const FMT: &[time::format_description::BorrowedFormatItem<'_>] =
        format_description!("[year]-[month]-[day]");
    time::Date::parse(s, FMT)
}
```

출처:

- [HIBP API v3 공식 문서](https://haveibeenpwned.com/API/v3) — 2026-04-24 확인
- 직접 API 호출: `GET https://haveibeenpwned.com/api/v3/breach/TelegramStealerLogs` — 2026-04-24 확인

---

## 7. HTTP 상태 코드 Semantics

| 상태 코드 | 의미                                                       | HibpClient 처리                               |
| :-------- | :--------------------------------------------------------- | :-------------------------------------------- |
| **200**   | 1개 이상 breach 발견 → body: `Vec<HibpBreach>` (JSON 배열) | `Ok(Vec<HibpBreach>)`                         |
| **400**   | 잘못된 요청 (이메일 포맷 오류 등)                          | `Err(HibpError::BadRequest)`                  |
| **401**   | API key 누락 또는 잘못됨                                   | `Err(HibpError::Unauthorized)`                |
| **403**   | User-Agent 누락 또는 접근 금지                             | `Err(HibpError::Forbidden)`                   |
| **404**   | **breach 없음 — 정상 케이스**                              | **`Ok(Vec::new())`**                          |
| **429**   | Rate limit 초과, `retry-after` 헤더 확인                   | `Err(HibpError::RateLimited { retry_after })` |
| **503**   | 서비스 일시 중단 (CDN 또는 upstream)                       | `Err(HibpError::Server { status: 503 })`      |

**핵심 설계 결정 — 404 → Ok(empty)**:
공식 문서: "If the email address is not found in a breach, an HTTP 404 response will be returned."
404 는 에러가 아니라 **"해당 이메일은 유출 이력이 없다"** 는 정상 응답이다.
따라서 404 → `Ok(Vec::new())` 로 변환해야 한다. `Err` 처리 시 호출자가 불필요한 에러 처리를 해야 하므로 지양.

```rust
match resp.status().as_u16() {
    200 => {
        let body = resp.text().await?;
        let breaches: Vec<HibpBreach> = serde_json::from_str(&body)?;
        Ok(breaches)
    }
    404 => Ok(Vec::new()),  // breach 없음 — 정상
    429 => {
        let retry_after = resp
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .map(std::time::Duration::from_secs)
            .unwrap_or(std::time::Duration::from_secs(60));
        Err(HibpError::RateLimited { retry_after })
    }
    400 => Err(HibpError::BadRequest),
    401 => Err(HibpError::Unauthorized),
    403 => Err(HibpError::Forbidden),
    s @ 500..=599 => Err(HibpError::Server { status: s }),
    s => Err(HibpError::Client { status: s }),
}
```

출처:

- [HIBP API v3 공식 문서 — Response Codes](https://haveibeenpwned.com/API/v3) — 2026-04-24 확인

---

## 8. truncateResponse 정책 상세

### 8-1. 기본값 및 동작

| 설정                                 | 응답 크기   | 응답 예시                              |
| :----------------------------------- | :---------- | :------------------------------------- |
| `truncateResponse=true` (기본값)     | 약 98% 절감 | `[{"Name":"Adobe"},{"Name":"Gawker"}]` |
| `truncateResponse=false` (명시 필요) | 전체        | 위 §6의 전체 필드 포함 JSON 배열       |

T052 의 목적은 full breach 데이터를 파싱해 UI 에 표시하는 것이므로
**반드시 `truncateResponse=false` 를 쿼리 파라미터에 포함해야 한다**.

```rust
let resp = self.http
    .get(&url)
    .header("hibp-api-key", &self.api_key)
    .query(&[
        ("truncateResponse", "false"),
        ("includeUnverified", "true"),
    ])
    .send()
    .await?;
```

### 8-2. truncated 응답의 Name-only 처리

만약 truncated 응답만 필요한 경우(빠른 "breach 존재 여부 확인")를 위해 별도 메서드를 만들 수도 있다:

```rust
/// breach 이름만 확인 (존재 여부 확인 전용)
pub async fn has_breach(&self, email: &str) -> Result<bool, HibpError> {
    // truncateResponse 기본값(true) 사용 — Name 만 반환
    // 응답 여부(200 vs 404)만 체크
}
```

그러나 **T052 범위에서는 `get_breaches(email)` 단일 메서드만 구현**한다.

출처:

- [HIBP API v3 공식 문서 — Truncating the response body](https://haveibeenpwned.com/API/v3) — 2026-04-24 확인

---

## 9. ModifiedDate 필드 재확인

### 9-1. 존재 여부 — 확인됨

공식 문서 스키마 표 및 실제 API 응답 모두에서 `ModifiedDate` 필드 존재 확인.

- 공식 문서 설명: "Date and time the breach was modified in ISO 8601 format"
- 실제 응답 예시: `"ModifiedDate": "2025-03-04T02:06:27Z"`

### 9-2. AddedDate vs ModifiedDate

| 필드           | 의미                                 | 사용 시나리오                 |
| :------------- | :----------------------------------- | :---------------------------- |
| `AddedDate`    | HIBP 데이터베이스에 처음 추가된 시각 | "이 breach 가 언제 등록됐나?" |
| `ModifiedDate` | HIBP 레코드가 마지막으로 수정된 시각 | "최근 업데이트 여부 확인"     |

T052 의 `HibpBreach` DTO 에는 두 필드 모두 포함한다.
증분 fetch 시 "X 시각 이후 ModifiedDate 를 가진 breach 만 가져오기" 는
`/api/v3/breachedaccount/{email}` 엔드포인트에서 **지원되지 않는다**.
(날짜 필터는 없음 — 항상 전체 breach 목록을 반환)

출처:

- [HIBP API v3 공식 문서 — Breach model](https://haveibeenpwned.com/API/v3) — 2026-04-24 확인
- 직접 API 응답 확인: `GET /api/v3/breach/TelegramStealerLogs` — 2026-04-24

---

## 10. Rust 생태계 기존 crate 분석

### 10-1. 주요 crate 목록

| crate 이름         | 최신 버전 | API v3 지원                 | breachedaccount 엔드포인트 | 마지막 활동     | 권장 여부       |
| :----------------- | :-------- | :-------------------------- | :------------------------- | :-------------- | :-------------- |
| `hibp`             | 0.1.0     | 부분 (Pwned Passwords 전용) | 없음                       | ~5년 전         | **사용 불가**   |
| `pwnage`           | 0.0.1     | v3 명시                     | 확인 불가                  | ~6년 전         | **사용 불가**   |
| `pwned` (pwned-rs) | ~0.1.x    | v3 (README 명시)            | 일부 (이메일 breach 포함)  | ~2021 (24 커밋) | **사용 비권장** |
| `haveibeenpwned`   | 불명      | 불명                        | 불명                       | 불명            | **사용 불가**   |
| `haveibeenpwnd`    | 불명      | 불명                        | 불명                       | ~2017           | **사용 불가**   |

**결론: 직접 구현이 유일한 현실적 옵션.**

### 10-2. 직접 구현 vs crate 사용 트레이드오프

| 기준               | 기존 crate 사용                         | 직접 구현                         |
| :----------------- | :-------------------------------------- | :-------------------------------- |
| 개발 속도          | 빠름 (crate 활발할 경우)                | 추가 공수 필요                    |
| 활발한 crate 존재  | **없음** (모두 방치 상태)               | —                                 |
| reqwest 버전 호환  | 불명 (대부분 구버전 reqwest)            | reqwest 0.12 직접 사용            |
| governor 통합      | 없음                                    | 직접 추가                         |
| 프로젝트 패턴 통일 | 불가 (NvdClient/GhsaClient 패턴과 상이) | NvdClient/GhsaClient 와 동일 패턴 |
| tokio 0.1 vs 1.x   | 구버전 의존 위험                        | tokio 최신 직접 사용              |

**직접 구현 권장.** T049 (`NvdClient`)와 T050 (`GhsaClient`) 의 패턴을 그대로 따라
`HibpClient` 를 구현한다.

### 10-3. 직접 구현 시 권장 구조

```rust
// src-tauri/crates/secretbank-feeds/src/hibp.rs

pub struct HibpClient {
    http: reqwest::Client,
    base_url: String,
    api_key: String,
    limiter: Arc<DefaultDirectRateLimiter>,
}

impl HibpClient {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self::with_base_url("https://haveibeenpwned.com/api/v3", api_key, None)
    }

    pub fn with_base_url(
        base_url: impl Into<String>,
        api_key: impl Into<String>,
        rpm: Option<u32>,
    ) -> Self {
        let limiter = build_limiter(rpm);
        Self {
            http: reqwest::Client::builder()
                .user_agent("secretbank/0.1.0")
                .build()
                .expect("static config"),
            base_url: base_url.into(),
            api_key: api_key.into(),
            limiter,
        }
    }

    pub async fn get_breaches(
        &self,
        email: &str,
    ) -> Result<Vec<HibpBreach>, HibpError> {
        self.limiter.until_ready().await;
        // URL-encode email, build request, handle 200/404/4xx/5xx
    }
}
```

출처:

- [hibp docs.rs](https://docs.rs/hibp/0.1.0/hibp/) — 2026-04-24 확인
- [pwned-rs GitHub](https://github.com/wisespace-io/pwned-rs) — 2026-04-24 확인
- [crates.io hibp 키워드](https://crates.io/keywords/hibp) — 2026-04-24 확인

---

## 11. 에러 모델 권장 설계

### 11-1. HibpError 타입

```rust
#[derive(Debug, thiserror::Error)]
pub enum HibpError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("HIBP rate limited, retry after {retry_after:?}")]
    RateLimited { retry_after: std::time::Duration },

    #[error("HIBP unauthorized — check API key")]
    Unauthorized,

    #[error("HIBP forbidden — User-Agent missing or access denied")]
    Forbidden,

    #[error("HIBP bad request — invalid email format")]
    BadRequest,

    #[error("Failed to decode HIBP response: {0}")]
    Decode(#[from] serde_json::Error),

    #[error("HIBP server error (status {status})")]
    Server { status: u16 },

    #[error("HIBP client error (status {status})")]
    Client { status: u16 },

    #[error("Failed to parse HIBP timestamp: {0}")]
    ParseTime(#[from] time::error::Parse),
}
```

NvdError / GhsaError 와 동일한 패턴. HIBP-specific 케이스로 `Unauthorized`, `Forbidden`, `BadRequest` 를 추가.

---

## 12. 테스트 전략 — wiremock

### 12-1. 테스트 케이스 목록

| ID  | 시나리오                                           | 기대 결과                                         |
| :-- | :------------------------------------------------- | :------------------------------------------------ |
| T1  | HTTP 200, `truncateResponse=false`, breach 2개     | `Ok(vec![breach1, breach2])`                      |
| T2  | HTTP 404                                           | `Ok(Vec::new())`                                  |
| T3  | HTTP 401                                           | `Err(HibpError::Unauthorized)`                    |
| T4  | HTTP 403                                           | `Err(HibpError::Forbidden)`                       |
| T5  | HTTP 429 + `retry-after: 5`                        | `Err(HibpError::RateLimited { retry_after: 5s })` |
| T6  | HTTP 503                                           | `Err(HibpError::Server { status: 503 })`          |
| T7  | 응답 JSON 에 `ModifiedDate` null                   | `ParseTime` 에러 발생 안 하고 `Option` 처리       |
| T8  | email 에 `+` 특수문자 포함 (`foo+bar@example.com`) | URL 인코딩 후 정상 요청                           |

### 12-2. wiremock 패턴 (NvdClient 동일)

```rust
use wiremock::{MockServer, Mock, ResponseTemplate};
use wiremock::matchers::{method, path, query_param, header};

#[tokio::test]
async fn get_breaches_200_returns_breach_list() {
    let mock_server = MockServer::start().await;

    let body = serde_json::json!([
        {
            "Name": "Adobe",
            "Title": "Adobe",
            "Domain": "adobe.com",
            "BreachDate": "2013-10-04",
            "AddedDate": "2013-12-04T00:00:00Z",
            "ModifiedDate": "2022-05-15T23:52:49Z",
            "PwnCount": 152445165,
            "Description": "...",
            "DataClasses": ["Email addresses", "Password hints", "Passwords", "Usernames"],
            "IsVerified": true,
            "IsFabricated": false,
            "IsSensitive": false,
            "IsRetired": false,
            "IsSpamList": false,
            "IsMalware": false,
            "IsSubscriptionFree": false,
            "IsStealerLog": false,
            "LogoPath": "https://logos.haveibeenpwned.com/Adobe.png",
            "Attribution": null,
            "DisclosureUrl": null
        }
    ]);

    Mock::given(method("GET"))
        .and(path("/api/v3/breachedaccount/foo%40example.com"))
        .and(query_param("truncateResponse", "false"))
        .and(header("hibp-api-key", "test-key"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(body),
        )
        .mount(&mock_server)
        .await;

    let client = HibpClient::with_base_url(mock_server.uri(), "test-key", None);
    let result = client.get_breaches("foo@example.com").await.unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].name, "Adobe");
}

#[tokio::test]
async fn get_breaches_404_returns_empty_vec() {
    let mock_server = MockServer::start().await;

    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&mock_server)
        .await;

    let client = HibpClient::with_base_url(mock_server.uri(), "test-key", None);
    let result = client.get_breaches("clean@example.com").await.unwrap();
    assert!(result.is_empty());
}
```

출처:

- [wiremock docs.rs 0.6.x](https://docs.rs/wiremock/latest/wiremock/) — 2026-04-24 확인
- NvdClient 테스트 패턴 (`src-tauri/crates/secretbank-feeds/src/nvd.rs`) 참조

---

## 출처 목록

| URL                                                                                                                                                | 신뢰도                  | 관련성 | 확인일               |
| :------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :----- | :------------------- |
| [HIBP API v3 공식 문서](https://haveibeenpwned.com/API/v3)                                                                                         | HIGH (공식)             | 10     | 2026-04-24           |
| [HIBP 구독 페이지](https://haveibeenpwned.com/Subscription)                                                                                        | HIGH (공식)             | 9      | 2026-04-24           |
| [HIBP breach/TelegramStealerLogs 실제 응답](https://haveibeenpwned.com/api/v3/breach/TelegramStealerLogs)                                          | HIGH (공식 API)         | 10     | 2026-04-24 직접 확인 |
| [Troy Hunt — Rate Limits and Annual Billing](https://www.troyhunt.com/the-have-i-been-pwned-api-now-has-different-rate-limits-and-annual-billing/) | HIGH (저자 공식 블로그) | 8      | 2026-04-24           |
| [governor Quota docs.rs](https://docs.rs/governor/latest/governor/struct.Quota.html)                                                               | HIGH (공식 문서)        | 9      | 2026-04-24           |
| [hibp crate docs.rs](https://docs.rs/hibp/0.1.0/hibp/)                                                                                             | MEDIUM (비활성 crate)   | 5      | 2026-04-24           |
| [pwned-rs GitHub](https://github.com/wisespace-io/pwned-rs)                                                                                        | MEDIUM (비활성 crate)   | 5      | 2026-04-24           |
| [crates.io hibp 키워드](https://crates.io/keywords/hibp)                                                                                           | MEDIUM (레지스트리)     | 6      | 2026-04-24           |
| [wiremock docs.rs](https://docs.rs/wiremock/latest/wiremock/)                                                                                      | HIGH (공식 문서)        | 8      | 2026-04-24           |
| [HIBP 구독 FAQ — 플랜 안내](https://support.haveibeenpwned.com/hc/en-au/articles/13868920521103)                                                   | HIGH (공식 서포트)      | 8      | 2026-04-24           |
| [HIBP 구 플랜 FAQ — Pwned → Core 전환](https://support.haveibeenpwned.com/hc/en-au/articles/15617510034063)                                        | HIGH (공식 서포트)      | 7      | 2026-04-24           |
