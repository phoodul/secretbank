# T049 구현 선행 조사 — NVD Feed 크레이트 (`api-vault-feeds/nvd.rs`)

> 작성일: 2026-04-24
> 조사 범위: NVD CVE API 2.0, governor 0.10.x, wiremock 0.6.x, time 0.3 직렬화, thiserror 에러 모델
> 기준: 2026-04-24 현재 최신 정보 확인. 확인 불가 항목은 "확인 불가"로 명시.

---

## 1. NVD CVE API 2.0

### 1-1. 엔드포인트

| 항목 | 값 |
|:-----|:---|
| Base URL | `https://services.nvd.nist.gov/rest/json/cves/2.0` |
| HTTP 메서드 | GET |
| 응답 형식 | JSON |

출처: [Vulnerability APIs - NVD](https://nvd.nist.gov/developers/vulnerabilities)

### 1-2. Rate Limit 정책 (2026-04-24 기준)

| 구분 | Rate Limit |
|:-----|:-----------|
| API 키 없음 (public) | **5 requests / rolling 30-second window** |
| API 키 있음 | **50 requests / rolling 30-second window** |

- 공식 "Start Here" 페이지에 명시된 수치 ([Developers - Start Here - NVD](https://nvd.nist.gov/developers/start-here))
- 참고: 예전 문서에서 언급된 "50 req/30s without key" 수치는 더 이상 유효하지 않음. 현재 공개(무인증) 한도는 5 req/30s
- NIST 방화벽이 DoS 방지 목적으로 추가 차단을 걸 수 있음. 따라서 요청 사이에 최소 6초 지연(또는 `governor` 토큰버킷) 권장
- 자동화 요청은 2시간에 1회 이하로 권장

### 1-3. API 키 헤더 사용법

```
apiKey: <key-value>
```

- 헤더 이름: `apiKey` (대소문자: 파라미터 이름은 대소문자 무관, **키 값 자체는 대소문자 구별**)
- URL 쿼리 파라미터로도 전달 가능 (`?apiKey=<value>`)
- 헤더 방식이 권장됨

출처: [Developers - Start Here - NVD](https://nvd.nist.gov/developers/start-here)

### 1-4. 증분 쿼리 파라미터 — 날짜 형식

| 파라미터 | 설명 |
|:---------|:-----|
| `lastModStartDate` | 수정 시작 날짜/시간 (포함) |
| `lastModEndDate` | 수정 종료 날짜/시간 (포함) |

**필수 형식**: ISO-8601 확장 포맷, UTC 오프셋 포함

```
2021-08-04T13:00:00.000+00:00
```

- `+00:00` (UTC) 또는 다른 오프셋 모두 허용
- URL 인코딩 시 `+` → `%2B` 로 percent-encode 해야 함
- **오프셋 시간만 `-05` 처럼 분 없이 쓰면 404 "Invalid ISO 8601 date/time format" 반환** ([DependencyCheck Issue #7228](https://github.com/dependency-check/DependencyCheck/issues/7228))
- 반드시 `-05:00` 형식으로 시/분을 함께 포함해야 함
- 두 파라미터는 반드시 세트로 사용 (하나만 쓰면 400 에러)
- 최대 범위: **120일** (이를 초과하면 에러)
- 권장 업데이트 빈도: 2시간에 1회 이하

출처: [Vulnerability APIs - NVD](https://nvd.nist.gov/developers/vulnerabilities), [DependencyCheck Issue #7228](https://github.com/dependency-check/DependencyCheck/issues/7228)

### 1-5. 페이지네이션

| 파라미터/필드 | 설명 |
|:--------------|:-----|
| `startIndex` | 0-based 시작 인덱스 (기본값: 0) |
| `resultsPerPage` | 페이지당 결과 수, **최대 2,000** (기본값: API 내부 최적화값) |
| `totalResults` | 응답 JSON 최상위에 반환되는 전체 결과 수 |

페이지 순회 패턴:
```
startIndex = 0
loop:
  fetch(startIndex, resultsPerPage=2000)
  startIndex += resultsPerPage
  if startIndex >= totalResults: break
```

출처: [Vulnerability APIs - NVD](https://nvd.nist.gov/developers/vulnerabilities)

### 1-6. 응답 JSON 구조 — 핵심 필드

```jsonc
{
  "resultsPerPage": 2000,
  "startIndex": 0,
  "totalResults": 12345,
  "format": "NVD_CVE",
  "version": "2.0",
  "timestamp": "2026-04-24T00:00:00.000",
  "vulnerabilities": [
    {
      "cve": {
        "id": "CVE-2026-12345",
        "sourceIdentifier": "cve@mitre.org",
        "published": "2026-01-15T10:00:00.000",
        "lastModified": "2026-04-01T12:00:00.000",
        "vulnStatus": "Analyzed",          // "Not Scheduled" 가능 (2026-04-15 이후)
        "descriptions": [
          { "lang": "en", "value": "..." }
        ],
        "metrics": {
          "cvssMetricV31": [               // 없을 수 있음 (2026-04-15 정책 변경 후)
            {
              "source": "...",
              "type": "Primary",
              "cvssData": {
                "version": "3.1",
                "vectorString": "CVSS:3.1/...",
                "baseScore": 9.8,
                "baseSeverity": "CRITICAL"
              }
            }
          ],
          "cvssMetricV30": [...],
          "cvssMetricV2": [...]
        },
        "weaknesses": [
          {
            "source": "...",
            "type": "Primary",
            "description": [
              { "lang": "en", "value": "CWE-79" }
            ]
          }
        ],
        "references": [
          { "url": "https://...", "source": "...", "tags": ["Vendor Advisory"] }
        ]
      }
    }
  ]
}
```

출처: [Vulnerability APIs - NVD](https://nvd.nist.gov/developers/vulnerabilities), [NVD JSON schema](https://csrc.nist.gov/schema/nvd/api/2.0/cve_api_json_2.0.schema)

### 1-7. 에러 응답 포맷

| HTTP 상태 | 의미 | 응답 |
|:----------|:-----|:-----|
| 400 | 잘못된 파라미터 (날짜 형식 오류 등) | 응답 헤더 `message` 필드에 디버그 메시지 포함 |
| 403/404 | 잘못된 API 키 또는 리소스 없음 | `message` 헤더 |
| 429 | Rate limit 초과 | `Retry-After` 헤더 (초 단위 정수 또는 HTTP-date) |
| 503 | 서버 일시 불가 | `Retry-After` 헤더 (있을 수 있음) |

- NVD 공식 문서는 에러 응답 body 포맷을 명시하지 않음. `message`는 헤더에 포함됨
- 실제 구현체들(DependencyCheck 등)은 HTTP 상태 코드만 보고 재시도 로직 구현
- 503이 간헐적으로 발생하는 것으로 알려짐 ([DependencyCheck Issue #6107](https://github.com/jeremylong/DependencyCheck/issues/6107))

출처: [Developers - Start Here - NVD](https://nvd.nist.gov/developers/start-here), [DependencyCheck issues](https://github.com/jeremylong/DependencyCheck/issues/6107)

### 1-8. 2026년 NVD 정책 변경 (중요 — Breaking Change)

**2026년 4월 15일 발효**

NIST는 CVE 제출 급증(2020~2025년 263% 증가, 2025년 42,000건 처리)에 대응하여 **리스크 기반 우선순위 모델**로 전환했다.

**우선 처리 대상 CVE (CVSS 스코어링 + 상세 분석 제공):**
1. CISA KEV(Known Exploited Vulnerabilities) 카탈로그 수록 CVE
2. 미국 연방정부 사용 소프트웨어 CVE
3. Executive Order 14028 기준 핵심 소프트웨어 CVE

**"Not Scheduled" 상태:**
- 위 기준 미달 CVE는 `vulnStatus: "Not Scheduled"` 로 반환
- API에 존재하지만 NIST 독자 분석/CVSS 스코어링 미제공
- 2026-03-01 이전 미처리 백로그도 "Not Scheduled" 전환

**API 소비자 영향:**
- `metrics.cvssMetricV31` 필드가 **없거나 비어있을 수 있음** (CVE 제출자가 스코어를 제공한 경우 그 값 사용, 아니면 누락)
- `baseSeverity` 파싱 시 `Option<>` 또는 기본값 처리 필수
- 단독 NVD 의존 시 false negative 발생 가능성 증가

출처:
- [NIST Updates NVD Operations (2026-04-15)](https://www.nist.gov/news-events/news/2026/04/nist-updates-nvd-operations-address-record-cve-growth)
- [Aikido: NIST NVD changes 2026](https://www.aikido.dev/blog/nist-nvd-changes-2026)
- [NIST Drops NVD Enrichment for Pre-March 2026 Vulnerabilities - Infosecurity Magazine](https://www.infosecurity-magazine.com/news/nvd-enrichment-premarch-2026/)

---

## 2. governor 크레이트 (Rust 토큰버킷 Rate Limiter)

### 2-1. 최신 버전

- **버전: 0.10.4** (2025-12 기준 최신, docs.rs 확인)
- Cargo.toml: `governor = "0.10"`

출처: [governor - docs.rs](https://docs.rs/governor/latest/governor/)

### 2-2. 비동기 사용 패턴 (tokio)

`until_ready()` 는 `std` feature 필요 (기본 활성화). tokio 환경에서 바로 사용 가능.

```rust
use governor::{Quota, RateLimiter};
use std::num::NonZeroU32;
use std::sync::Arc;

// NVD public: 5 req / 30s
let quota = Quota::with_period(Duration::from_secs(30))
    .unwrap()
    .allow_burst(NonZeroU32::new(5).unwrap());

let limiter = Arc::new(RateLimiter::direct(quota));

// 비동기 대기: 허용될 때까지 sleep
limiter.until_ready().await;

// 동기 체크: 즉시 성공/실패 반환
match limiter.check() {
    Ok(_) => { /* 요청 가능 */ }
    Err(not_until) => {
        let wait = not_until.wait_time_from(clock.now());
        // wait 후 재시도
    }
}
```

### 2-3. Quota 설정

| 메서드 | 설명 |
|:-------|:-----|
| `Quota::per_second(n: NonZeroU32)` | 초당 n개 허용, 버스트 = n |
| `Quota::per_minute(n: NonZeroU32)` | 분당 n개 허용, 버스트 = n |
| `Quota::with_period(d: Duration) -> Option<Quota>` | 주기 d마다 1개 보충. d=0이면 None |
| `.allow_burst(n: NonZeroU32)` | 최대 버스트 크기 설정 (기본: 1) |

NVD rate limit 매핑:
```rust
// API 키 없음: 5 req / 30s
let quota_public = Quota::with_period(Duration::from_secs(6))
    .unwrap()                                      // 6초마다 1토큰 = 10 req/min ≈ 5/30s
    .allow_burst(NonZeroU32::new(5).unwrap());     // 초기 버스트 5

// API 키 있음: 50 req / 30s
let quota_with_key = Quota::with_period(Duration::from_millis(600))
    .unwrap()
    .allow_burst(NonZeroU32::new(50).unwrap());
```

### 2-4. `until_ready()` vs `check()` 차이

| 메서드 | 시그니처 | 동작 |
|:-------|:---------|:-----|
| `until_ready()` | `async fn until_ready(&self) -> MW::PositiveOutcome` | 허용될 때까지 비동기 대기. Rate limit 소진 시 자동 sleep 후 재시도. |
| `check()` | `fn check(&self) -> Result<MW::PositiveOutcome, MW::NegativeOutcome>` | 즉시 성공/실패 반환. 실패 시 `NotUntil` 정보(다음 허용 시각) 포함. |
| `until_ready_with_jitter()` | async | 다수 concurrent 요청 시 thundering herd 방지용 jitter 추가 |

**권장**: HTTP 클라이언트 루프에서는 `until_ready().await` 사용. 직접 재시도 로직 구현 시 `check()`.

출처: [RateLimiter in governor - Rust](https://docs.rs/governor/latest/governor/struct.RateLimiter.html)

### 2-5. 테스트 환경 — FakeRelativeClock

```rust
use governor::clock::FakeRelativeClock;
use governor::{Quota, RateLimiter};
use std::num::NonZeroU32;

let clock = FakeRelativeClock::default();
let quota = Quota::per_second(NonZeroU32::new(5).unwrap());
let limiter = RateLimiter::direct_with_clock(quota, &clock);

// 시간 수동 진행
clock.advance_by(Duration::from_secs(1));

// check()로 상태 확인
assert!(limiter.check().is_ok());
```

- import path: `governor::clock::FakeRelativeClock`
- `advance_by(Duration)` 로 시간 수동 진행
- 실제 시간에 의존하지 않으므로 단위 테스트에 적합
- `direct_with_clock(quota, clock)` 에 레퍼런스로 전달

출처: [governor::clock - Rust](https://docs.rs/governor/latest/governor/clock/index.html), [governor::_guide - Rust](https://docs.rs/governor/latest/governor/_guide/index.html)

---

## 3. wiremock 0.6 크레이트

### 3-1. 최신 버전

- **버전: 0.6.5** (2025-12 기준 최신, 약 4개월 전 릴리즈)
- Cargo.toml (dev-dep): `wiremock = "0.6"`

출처: [wiremock - crates.io](https://crates.io/crates/wiremock)

### 3-2. 기본 패턴 — MockServer 시작 및 Mock 설정

```rust
use wiremock::{MockServer, Mock, ResponseTemplate};
use wiremock::matchers::{method, path, query_param};

#[tokio::test]
async fn test_nvd_fetch() {
    // 랜덤 포트에서 백그라운드 HTTP 서버 시작
    let mock_server = MockServer::start().await;

    // 200 OK + JSON body
    Mock::given(method("GET"))
        .and(path("/rest/json/cves/2.0"))
        .and(query_param("lastModStartDate", "2026-04-01T00:00:00.000+00:00"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({
                    "resultsPerPage": 1,
                    "startIndex": 0,
                    "totalResults": 1,
                    "vulnerabilities": []
                }))
        )
        .mount(&mock_server)
        .await;

    // 테스트 코드에서 mock_server.uri() 를 base URL로 사용
    let base_url = mock_server.uri();
    // ...
}
```

### 3-3. 쿼리 파라미터 매칭

| 함수 | 설명 |
|:-----|:-----|
| `query_param("key", "exact_value")` | 정확히 일치 (`QueryParamExactMatcher`) |
| `query_param_contains("key", "partial")` | 값이 부분 문자열 포함 (`QueryParamContainsMatcher`) |
| `query_param_is_missing("key")` | 파라미터가 없어야 함 (`QueryParamIsMissingMatcher`) |

### 3-4. 에러 시나리오 Mock

```rust
// 429 Too Many Requests + Retry-After
ResponseTemplate::new(429)
    .insert_header("Retry-After", "30")

// 503 Service Unavailable
ResponseTemplate::new(503)
    .insert_header("Retry-After", "60")

// 404 Not Found (날짜 형식 오류 등)
ResponseTemplate::new(404)
```

### 3-5. `mount()` vs `mount_as_scoped()`

| 메서드 | 수명 | 용도 |
|:-------|:-----|:-----|
| `.mount(&mock_server).await` | `MockServer` 전체 수명 | 일반 테스트 |
| `.mount_as_scoped(&mock_server).await` | 반환된 `MockGuard` 수명 | 특정 코드 블록에서만 활성 |

`mount_as_scoped` 는 `MockGuard` 가 drop되면 자동 해제됨. 조건부 mock 또는 일부 요청만 가로챌 때 유용.

```rust
{
    let _guard = Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(503))
        .mount_as_scoped(&mock_server)
        .await;
    // 이 블록 안에서만 503 반환
}
// 블록 이후 mock 해제
```

출처: [wiremock - docs.rs](https://docs.rs/wiremock/latest/wiremock/), [wiremock::ResponseTemplate](https://docs.rs/wiremock/latest/wiremock/struct.ResponseTemplate.html)

---

## 4. time 크레이트 직렬화

### 4-1. NVD API 요구 형식

NVD API가 `lastModStartDate`/`lastModEndDate` 에 기대하는 포맷:

```
2026-04-24T00:00:00.000+00:00
```

- ISO-8601 확장
- T 구분자
- 밀리초 3자리 (`digits:3`)
- UTC 오프셋 부호 mandatory (`+00:00`)

### 4-2. `format_description!` 매크로

```rust
use time::macros::format_description;
use time::OffsetDateTime;

// 컴파일 타임 검증, static slice 반환 (alloc 불필요)
let fmt = format_description!(
    "[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3][offset_hour sign:mandatory]:[offset_minute]"
);

let dt = OffsetDateTime::now_utc();
let s = dt.format(&fmt).unwrap();
// 예: "2026-04-24T13:30:00.000+00:00"
```

**주요 컴포넌트:**

| 컴포넌트 | 설명 |
|:---------|:-----|
| `[year]` | 4자리 연도 |
| `[month]` | 2자리 월 (01~12) |
| `[day]` | 2자리 일 |
| `[hour]` | 2자리 시 (00~23) |
| `[minute]` | 2자리 분 |
| `[second]` | 2자리 초 |
| `[subsecond digits:3]` | 소수점 이하 정확히 3자리 (밀리초) |
| `[offset_hour sign:mandatory]` | UTC 오프셋 시간부, 항상 부호 포함 (`+00`, `-05`) |
| `[offset_minute]` | UTC 오프셋 분부 (`00`, `30`) |

### 4-3. Cargo features 요구사항

```toml
[dependencies]
time = { version = "0.3", features = ["formatting", "macros"] }
# 파싱도 필요하면:
# time = { version = "0.3", features = ["formatting", "parsing", "macros", "serde"] }
```

### 4-4. URL 인코딩 주의

`+00:00` 의 `+` 는 URL 쿼리 파라미터에서 공백으로 해석될 수 있으므로 `reqwest` 사용 시:

```rust
// reqwest의 .query() 메서드는 자동으로 percent-encode 처리
client.get(url)
    .query(&[("lastModStartDate", &formatted_date)])  // reqwest가 %2B 인코딩 처리
    .send()
    .await?;
```

`reqwest::RequestBuilder::query()` 는 내부적으로 `form_urlencoded` 를 사용하므로 `+` → `%2B` 인코딩 자동 처리됨.

출처: [format_description in time::macros - Rust](https://docs.rs/time/latest/time/macros/macro.format_description.html), [Format description - Time book](https://time-rs.github.io/book/api/format-description.html)

---

## 5. 에러 모델 권장안 (thiserror)

### 5-1. 권장 설계

```rust
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum NvdError {
    /// HTTP 통신 실패 (연결 오류, TLS 오류 등)
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    /// Rate limit 초과 (HTTP 429)
    /// retry_after: Retry-After 헤더 파싱 결과 (없으면 기본값 30s)
    #[error("NVD rate limited, retry after {retry_after:?}")]
    RateLimited { retry_after: Duration },

    /// JSON 디코딩 실패
    #[error("Failed to decode NVD response: {0}")]
    Decode(#[from] serde_json::Error),

    /// 서버 에러 (HTTP 5xx)
    #[error("NVD server error (status {status}): {message}")]
    Server { status: u16, message: String },

    /// 잘못된 파라미터 / 리소스 없음 (HTTP 4xx, 429 제외)
    #[error("NVD client error (status {status}): {message}")]
    Client { status: u16, message: String },
}
```

### 5-2. 응답 처리 패턴

```rust
pub async fn fetch_page(/* ... */) -> Result<NvdResponse, NvdError> {
    let resp = client.get(&url)
        .query(&params)
        .send()
        .await?;  // reqwest::Error → NvdError::Http (via #[from])

    match resp.status().as_u16() {
        200 => {
            let body = resp.json::<NvdResponse>().await?;  // → NvdError::Decode
            Ok(body)
        }
        429 => {
            let retry_after = resp
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .map(Duration::from_secs)
                .unwrap_or(Duration::from_secs(30));
            Err(NvdError::RateLimited { retry_after })
        }
        500..=599 => {
            let message = resp.headers()
                .get("message")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("unknown server error")
                .to_string();
            Err(NvdError::Server { status: resp.status().as_u16(), message })
        }
        s => {
            let message = resp.headers()
                .get("message")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("client error")
                .to_string();
            Err(NvdError::Client { status: s, message })
        }
    }
}
```

### 5-3. thiserror 버전

- workspace deps 에 `thiserror = "2"` 이미 포함 (thiserror 2.x 기준)
- thiserror 2.x 에서는 `#[from]` 어트리뷰트 동작 방식 동일

---

## 6. 구현 시 주의사항 요약

| 항목 | 주의사항 |
|:-----|:---------|
| Rate limit | API 키 없음 = 5/30s. governor `Quota::with_period(6s).allow_burst(5)` 패턴 권장 |
| 날짜 형식 | 오프셋은 반드시 `±HH:MM` (분 포함). `-05` 단독 사용 시 404 |
| `+` URL 인코딩 | reqwest `.query()` 사용 시 자동 처리됨 |
| `cvssMetricV31` 누락 | 2026-04-15 이후 많은 CVE에서 CVSS 없을 수 있음. `Option<Vec<...>>` 로 모델링 |
| `vulnStatus` | `"Not Scheduled"` 값 추가됨. 파싱 enum에 포함 필요 |
| 120일 제한 | `lastModStartDate` ~ `lastModEndDate` 범위 최대 120일. 초과 시 에러 |
| reqwest gzip | workspace dep에 gzip feature 포함 → NVD 응답 자동 압축 해제 |

---

## 출처 목록

- [Developers - Start Here - NVD](https://nvd.nist.gov/developers/start-here)
- [Vulnerability APIs - NVD](https://nvd.nist.gov/developers/vulnerabilities)
- [NVD API Key Announcement](https://nvd.nist.gov/general/news/API-Key-Announcement)
- [NIST Updates NVD Operations 2026-04-15](https://www.nist.gov/news-events/news/2026/04/nist-updates-nvd-operations-address-record-cve-growth)
- [Aikido: NIST NVD changes 2026](https://www.aikido.dev/blog/nist-nvd-changes-2026)
- [Infosecurity Magazine: NIST Drops Enrichment](https://www.infosecurity-magazine.com/news/nvd-enrichment-premarch-2026/)
- [governor - docs.rs](https://docs.rs/governor/latest/governor/)
- [governor::_guide - Rust](https://docs.rs/governor/latest/governor/_guide/index.html)
- [governor::Quota - Rust](https://docs.rs/governor/latest/governor/struct.Quota.html)
- [governor::RateLimiter - Rust](https://docs.rs/governor/latest/governor/struct.RateLimiter.html)
- [governor::clock - Rust](https://docs.rs/governor/latest/governor/clock/index.html)
- [wiremock - crates.io](https://crates.io/crates/wiremock)
- [wiremock - docs.rs](https://docs.rs/wiremock/latest/wiremock/)
- [wiremock::ResponseTemplate - Rust](https://docs.rs/wiremock/latest/wiremock/struct.ResponseTemplate.html)
- [wiremock matchers - docs.rs](https://docs.rs/wiremock/latest/wiremock/matchers/index.html)
- [format_description in time::macros - Rust](https://docs.rs/time/latest/time/macros/macro.format_description.html)
- [time::serde::iso8601 - Rust](https://docs.rs/time/latest/time/serde/iso8601/)
- [Format description - Time book](https://time-rs.github.io/book/api/format-description.html)
- [DependencyCheck Issue #7228 (날짜 형식 오류)](https://github.com/dependency-check/DependencyCheck/issues/7228)
