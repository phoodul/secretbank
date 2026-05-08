# T050 구현 선행 조사 — GitHub Advisory DB 클라이언트 (`secretbank-feeds/ghsa.rs`)

> 작성일: 2026-04-24
> 조사 범위: GitHub Security Advisories REST API, rate limits, Link 헤더 페이지네이션,
> 응답 스키마, 인증 헤더, wiremock 테스트 패턴, parse_link_header 크레이트
> 기준: 2026-04-24 현재 최신 정보 확인. 확인 불가 항목은 "확인 불가"로 명시.

---

## 1. GitHub Security Advisories REST API (전역 — Global Advisories)

### 1-1. 엔드포인트 개요

| 항목                 | 값                                                |
| :------------------- | :------------------------------------------------ |
| **List** URL         | `GET https://api.github.com/advisories`           |
| **Get single** URL   | `GET https://api.github.com/advisories/{ghsa_id}` |
| 응답 형식            | JSON (`application/vnd.github+json`)              |
| 인증 없이 사용 가능? | 가능 (단, Rate Limit 60 req/h 엄격 적용)          |
| 기본 `type` 필터     | `reviewed` (malware 제외)                         |

이 엔드포인트는 **전역 GHSA 데이터베이스 전체**를 조회하는 것으로, 특정 저장소의 advisories를
조회하는 `/repos/{owner}/{repo}/security-advisories`와 별개이다.

출처: [REST API endpoints for global security advisories - GitHub Docs](https://docs.github.com/en/rest/security-advisories/global-advisories)

---

### 1-2. API 버전 헤더 (`X-GitHub-Api-Version`)

| 버전         | 상태                 | 비고                                             |
| :----------- | :------------------- | :----------------------------------------------- |
| `2026-03-10` | **최신 (현재 권장)** | 2026-03-12 출시                                  |
| `2022-11-28` | 지원 (기본값)        | 헤더 생략 시 이 버전 사용. 최소 2028-03까지 지원 |

**2026-04-24 기준 최신 API 버전은 `2026-03-10`이다. `2022-11-28`은 여전히 유효하며 기본값이다.**
기존 코드(NvdClient)와의 일관성을 위해 코드에는 `X-GitHub-Api-Version: 2022-11-28`을 명시적으로
지정해도 무방하나, 최신 기능(EPSS, cvss_v4 등)을 활용하려면 `2026-03-10` 권장.

출처:

- [REST API version 2026-03-10 is now available - GitHub Changelog](https://github.blog/changelog/2026-03-12-rest-api-version-2026-03-10-is-now-available/)
- [API Versions - GitHub Docs](https://docs.github.com/en/rest/about-the-rest-api/api-versions)

---

### 1-3. 쿼리 파라미터 전체 목록

| 파라미터          | 타입    | 기본값      | 설명                                                                                                                           |
| :---------------- | :------ | :---------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `ghsa_id`         | string  | -           | 특정 GHSA ID 필터                                                                                                              |
| `type`            | enum    | `reviewed`  | `reviewed` / `malware` / `unreviewed`                                                                                          |
| `cve_id`          | string  | -           | CVE ID 필터                                                                                                                    |
| `ecosystem`       | enum    | -           | `rubygems` / `npm` / `pip` / `maven` / `nuget` / `composer` / `go` / `rust` / `erlang` / `actions` / `pub` / `other` / `swift` |
| `severity`        | enum    | -           | `unknown` / `low` / `medium` / `high` / `critical`                                                                             |
| `cwes`            | string  | -           | CWE ID 콤마 구분 (예: `cwes=79,284,22`)                                                                                        |
| `is_withdrawn`    | boolean | -           | 철회된 advisory만 반환                                                                                                         |
| `affects`         | string  | -           | 패키지 또는 `package@version` 필터 (최대 1000)                                                                                 |
| `published`       | string  | -           | 날짜 또는 날짜 범위 필터 (발행일 기준)                                                                                         |
| `updated`         | string  | -           | 날짜 또는 날짜 범위 필터 (업데이트일 기준)                                                                                     |
| `modified`        | string  | -           | **증분 쿼리용**: 업데이트 또는 발행된 날짜 범위 필터                                                                           |
| `epss_percentage` | string  | -           | EPSS 점수 필터                                                                                                                 |
| `epss_percentile` | string  | -           | EPSS 백분위수 필터                                                                                                             |
| `before`          | string  | -           | 커서 기반 페이지네이션: 이 커서 이전 결과                                                                                      |
| `after`           | string  | -           | 커서 기반 페이지네이션: 이 커서 이후 결과                                                                                      |
| `direction`       | enum    | `desc`      | `asc` / `desc`                                                                                                                 |
| `per_page`        | integer | `30`        | 최대 `100`                                                                                                                     |
| `sort`            | enum    | `published` | `updated` / `published` / `epss_percentage` / `epss_percentile`                                                                |

**T050 구현 핵심 파라미터:**

- `modified` — `since` 타임스탬프 이후의 변경/발행된 advisories 수집 (증분 쿼리에 적합)
- `sort=updated` + `direction=asc` — 오래된 것부터 최신 순으로 페이지네이션 안정성 향상
- `per_page=100` — 페이지당 최대 개수

출처: [REST API endpoints for global security advisories - GitHub Docs](https://docs.github.com/en/rest/security-advisories/global-advisories)

---

### 1-4. 날짜 파라미터 형식 (modified / updated / published)

GitHub 검색 구문을 따른다 (ISO 8601 기반):

| 형식      | 예시                     | 의미              |
| :-------- | :----------------------- | :---------------- |
| 단일 날짜 | `2024-01-01`             | 해당 날짜         |
| 이후      | `>2024-01-01`            | 이후              |
| 이상      | `>=2024-01-01`           | 이상              |
| 범위      | `2024-01-01..2024-12-31` | 구간              |
| 시간 포함 | `2024-01-01T00:00:00Z`   | UTC 타임스탬프    |
| 오픈 범위 | `2024-01-01..*`          | 이 날짜 이후 전체 |

**증분 쿼리 예시:**

```
GET /advisories?modified=>2026-04-01T00:00:00Z&sort=updated&direction=asc&per_page=100
```

`OffsetDateTime`을 ISO 8601 UTC로 포맷:

```rust
// time crate 사용
let s = since.format(&time::format_description::well_known::Iso8601::DEFAULT)?;
// → "2026-04-01T00:00:00Z" 형태
```

출처:

- [Understanding the search syntax - GitHub Docs](https://docs.github.com/en/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax)
- [REST API endpoints for global security advisories - GitHub Docs](https://docs.github.com/en/rest/security-advisories/global-advisories?apiVersion=2022-11-28)

---

## 2. Rate Limits (2026-04-24 기준)

### 2-1. Primary Rate Limit

| 구분                                | 한도                                                          |
| :---------------------------------- | :------------------------------------------------------------ |
| **인증 없음**                       | 60 req/h (IP 기준)                                            |
| **PAT (classic / fine-grained)**    | 5,000 req/h                                                   |
| **GitHub App (installation token)** | 5,000 req/h 기본 + 저장소·사용자당 50 추가, 최대 12,500 req/h |
| **GitHub Enterprise Cloud App**     | 15,000 req/h                                                  |

> **2025-05-08 변경**: GitHub이 미인증 요청의 Rate Limit을 하향 조정했다.
> 기존 60 req/h에서 더 낮아졌을 가능성이 있으나 정확한 수치는 공식 docs에 "60 req/h"로 여전히 표기됨.
> 자동화 클라이언트는 반드시 PAT 인증을 사용해야 한다.

출처:

- [Rate limits for the REST API - GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [Updated rate limits for unauthenticated requests - GitHub Changelog](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/)

### 2-2. Secondary Rate Limit

| 항목        | 한도                                              |
| :---------- | :------------------------------------------------ |
| 동시 요청   | 최대 100개                                        |
| 분당 포인트 | 900 points/min (GET = 1pt, POST/PUT/DELETE = 5pt) |
| CPU 시간    | 60초 실시간 당 90초 이하                          |
| 컨텐츠 생성 | 80 req/min, 500 req/h                             |

### 2-3. Rate Limit 응답 헤더

| 헤더                    | 의미                          |
| :---------------------- | :---------------------------- |
| `x-ratelimit-limit`     | 현재 창에서 최대 허용 요청 수 |
| `x-ratelimit-remaining` | 현재 창에서 남은 요청 수      |
| `x-ratelimit-used`      | 현재 창에서 소비한 요청 수    |
| `x-ratelimit-reset`     | 창이 리셋되는 UTC epoch 초    |
| `x-ratelimit-resource`  | 적용된 Rate Limit 리소스 종류 |

출처: [Rate limits for the REST API - GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

### 2-4. governor 매핑 설계

PAT 5,000 req/h 기준:

```
5000 req / 3600s = 1.388 req/s
→ 1토큰 per ~720ms
```

**권장 governor 설정 (T050):**

```rust
use std::num::NonZeroU32;
use governor::{Quota, RateLimiter};

// PAT 인증: 5000 req/h → per_hour(5000) + burst 10
// 미인증: 60 req/h → per_hour(60) + burst 3
fn build_ghsa_limiter(has_token: bool) -> Arc<DefaultDirectRateLimiter> {
    let quota = if has_token {
        Quota::per_hour(NonZeroU32::new(5_000).unwrap())
            .allow_burst(NonZeroU32::new(10).unwrap())
    } else {
        Quota::per_hour(NonZeroU32::new(60).unwrap())
            .allow_burst(NonZeroU32::new(3).unwrap())
    };
    Arc::new(RateLimiter::direct(quota))
}
```

> NvdClient의 `Quota::with_period(Duration::from_millis(...))` 방식과 달리,
> `Quota::per_hour(n)` 방식이 더 명시적이고 가독성이 높다.
> `nonzero_ext` 크레이트의 `nonzero!` 매크로 또는 `NonZeroU32::new(n).unwrap()` 사용 가능.

출처:

- [governor docs - \_guide](https://docs.rs/governor/latest/governor/_guide/index.html)
- [Quota in governor - Rust](https://docs.rs/governor/latest/governor/struct.Quota.html)

---

## 3. Link 헤더 페이지네이션

### 3-1. Link 헤더 형식

GitHub `/advisories` 엔드포인트는 **커서 기반 페이지네이션**을 사용한다
(`page=` 숫자 방식이 아님).

```
Link: <https://api.github.com/advisories?after=BASE64CURSOR&before=>; rel="next",
      <https://api.github.com/advisories?before=BASE64CURSOR&after=>; rel="prev"
```

커서 값은 **불투명한 base64 인코딩 문자열**이며 직접 구성하면 안 된다.
항상 Link 헤더에서 제공된 URL을 그대로 사용해야 한다.

| `rel` 값 | 의미               |
| :------- | :----------------- |
| `next`   | 다음 페이지 URL    |
| `prev`   | 이전 페이지 URL    |
| `first`  | 첫 번째 페이지 URL |
| `last`   | 마지막 페이지 URL  |

**종료 조건**: 응답에 `rel="next"`가 없으면 마지막 페이지.

### 3-2. 페이지네이션 구현 전략

`/advisories`는 cursor-based(`before`/`after` 파라미터)이므로:

1. 첫 번째 요청은 `after=` 없이 보냄
2. 응답 `Link` 헤더에서 `rel="next"` URL 추출
3. 해당 URL의 `after=` 파라미터 값을 다음 요청에 사용
4. `rel="next"` 없으면 종료

```rust
// Link 헤더에서 next URL 추출 패턴
fn extract_next_url(link_header: &str) -> Option<String> {
    link_header
        .split(',')
        .find(|part| part.contains(r#"rel="next""#))
        .and_then(|part| {
            let start = part.find('<')? + 1;
            let end = part.find('>')?;
            Some(part[start..end].trim().to_owned())
        })
}
```

출처:

- [Using pagination in the REST API - GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api)
- [Secret scanning's REST API endpoints now support cursor-based pagination - GitHub Changelog](https://github.blog/changelog/2022-06-22-secret-scannings-rest-api-endpoints-now-support-cursor-based-pagination/)

### 3-3. Rust 파서 선택: parse_link_header vs 직접 파싱

| 선택지                             | 장점                                                       | 단점                  |
| :--------------------------------- | :--------------------------------------------------------- | :-------------------- |
| `parse_link_header` crate (v0.4.1) | RFC 8288 완전 구현, 97K down/month, 2026-04-13 최신 릴리즈 | 추가 의존성 (~작음)   |
| 직접 파싱 (split + find)           | 의존성 zero, 코드 10줄 이하                                | 엣지 케이스 누락 가능 |

**권장: 직접 파싱 (로컬 헬퍼 함수)**

이유:

- `/advisories` Link 헤더 형식은 단순 (`rel="next"` URL 추출만 필요)
- NvdClient도 외부 링크 파서 없이 구현됨 → 같은 패턴 유지
- `parse_link_header`는 `HashMap<Option<String>, Link>` 반환 — 단순 URL 추출에 과함
- 의존성 최소화 원칙 (CLAUDE.md: "Simplicity first. No single-use abstractions.")

만약 나중에 확장이 필요하면 `parse_link_header = "0.4"` 추가 가능 (Cargo.toml에 아직 없음).

출처:

- [parse_link_header - lib.rs](https://lib.rs/crates/parse_link_header)
- [github.com/g1eny0ung/parse_link_header](https://github.com/g1eny0ung/parse_link_header)

---

## 4. 응답 스키마 (REST GET /advisories)

### 4-1. 최상위 필드

| 필드                      | 타입     | Nullable | 설명                                               |
| :------------------------ | :------- | :------- | :------------------------------------------------- | ------------------------ |
| `ghsa_id`                 | string   | No       | GHSA 고유 식별자 (예: `GHSA-xxxx-xxxx-xxxx`)       |
| `cve_id`                  | string   | **Yes**  | CVE 미할당 GHSA 존재 (null 가능)                   |
| `url`                     | string   | No       | API URL                                            |
| `html_url`                | string   | No       | 웹 URL                                             |
| `repository_advisory_url` | string   | **Yes**  | 저장소별 advisory URL                              |
| `summary`                 | string   | No       | 요약 (최대 1024자)                                 |
| `description`             | string   | **Yes**  | 상세 설명 (최대 65535자)                           |
| `type`                    | enum     | No       | `reviewed` / `unreviewed` / `malware` (read-only)  |
| `severity`                | enum     | No       | `critical` / `high` / `medium` / `low` / `unknown` |
| `source_code_location`    | string   | **Yes**  | 소스 코드 위치 URL                                 |
| `identifiers`             | array    | **Yes**  | `[{type: "CVE"                                     | "GHSA", value: string}]` |
| `references`              | array    | **Yes**  | URL 문자열 배열                                    |
| `published_at`            | datetime | No       | 발행 시각 (ISO 8601, UTC)                          |
| `updated_at`              | datetime | No       | 최종 업데이트 시각                                 |
| `github_reviewed_at`      | datetime | **Yes**  | GitHub 검토 시각 (미검토 시 null)                  |
| `nvd_published_at`        | datetime | **Yes**  | NVD 발행 시각 (null 가능)                          |
| `withdrawn_at`            | datetime | **Yes**  | 철회 시각 (null 가능)                              |
| `vulnerabilities`         | array    | **Yes**  | 취약점 패키지 정보 배열                            |
| `cvss_severities`         | object   | **Yes**  | CVSS v3 / v4 점수 (신규 필드, 2025 이후)           |
| `epss`                    | object   | **Yes**  | EPSS 점수 및 백분위                                |
| `cwes`                    | array    | **Yes**  | CWE 배열                                           |
| `credits`                 | array    | **Yes**  | 기여자 배열                                        |

> **중요 변경 (2025-04-01 REST API 적용)**: 기존 `cvss` 필드(단일 객체)가 **제거**되었고
> `cvss_severities` 객체로 교체됨. 2025-04-01부터 REST API에서 `cvss` 필드 조회 불가.

### 4-2. `vulnerabilities` 배열 원소 구조

```json
{
  "package": {
    "ecosystem": "npm", // enum: rubygems/npm/pip/maven/nuget/composer/go/rust/erlang/actions/pub/other/swift
    "name": "lodash" // nullable
  },
  "vulnerable_version_range": "< 4.17.21", // nullable
  "first_patched_version": "4.17.21", // nullable
  "vulnerable_functions": ["_.template"] // nullable string[]
}
```

### 4-3. `cvss_severities` 구조 (2025 이후 신규)

```json
{
  "cvss_v3": {
    "vector_string": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", // nullable
    "score": 9.8 // nullable, 0-10 float, read-only
  },
  "cvss_v4": {
    "vector_string": "CVSS:4.0/AV:N/...", // nullable
    "score": 9.3 // nullable, 0-10 float, read-only
  }
}
```

### 4-4. `cwes` 배열 원소 구조

```json
{
  "cwe_id": "CWE-79",
  "name": "Improper Neutralization of Input..." // read-only
}
```

### 4-5. `identifiers` 배열 원소 구조

```json
{
  "type": "CVE", // "CVE" | "GHSA"
  "value": "CVE-2024-12345"
}
```

### 4-6. datetime 포맷

모든 datetime 필드: **ISO 8601, UTC Z 포맷**

```
"2026-04-01T12:00:00Z"
```

`time` crate로 파싱:

```rust
use time::OffsetDateTime;
// serde feature로 자동 처리 가능
// 또는 수동 파싱:
OffsetDateTime::parse(s, &time::format_description::well_known::Rfc3339)?
```

출처:

- [REST API endpoints for global security advisories - GitHub Docs](https://docs.github.com/en/rest/security-advisories/global-advisories)
- [Deprecation of cvss field in security advisories API - GitHub Changelog](https://github.blog/changelog/2025-03-27-deprecation-of-cvss-field-in-security-advisories-api/)

---

## 5. 인증 헤더 (2026-04-24 기준)

### 5-1. 필수 헤더 목록

```http
Authorization: Bearer <token>
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
User-Agent: secretbank/0.1.0
```

| 헤더                   | 필수?              | 비고                                          |
| :--------------------- | :----------------- | :-------------------------------------------- |
| `Authorization`        | 권장 (필수는 아님) | `Bearer <PAT>` 형식. PAT 없으면 60 req/h 제한 |
| `Accept`               | 권장               | 미지정 시도 동작하나 명시 권장                |
| `X-GitHub-Api-Version` | 선택               | 미지정 시 `2022-11-28` 기본값                 |
| `User-Agent`           | **필수**           | 없으면 **403 Forbidden** 반환. GitHub 정책    |

### 5-2. User-Agent 필수성 (중요)

GitHub REST API는 **모든 요청에 `User-Agent` 헤더가 필수**이다.
`User-Agent`가 없거나 빈 값이면 `403 Forbidden` 반환:

```
"Request forbidden by administrative rules. Please make sure your request has a User-Agent header"
```

reqwest 0.12의 `Client::new()`는 기본적으로 `reqwest/0.12.x` User-Agent를 추가하나,
`ClientBuilder::user_agent()`로 명시적으로 설정하는 것이 권장된다:

```rust
let http = reqwest::Client::builder()
    .user_agent("secretbank/0.1.0")
    .build()?;
```

### 5-3. PAT 종류별 동작

| PAT 종류                      | 동작                                 |
| :---------------------------- | :----------------------------------- |
| Classic PAT                   | `Bearer <token>`                     |
| Fine-grained PAT              | `Bearer <token>` (동일 형식)         |
| GitHub App installation token | `Bearer <installation_access_token>` |

`/advisories` 엔드포인트는 **fine-grained PAT에 별도 permission이 불필요**하다
(공개 데이터이므로).

출처:

- [Getting started with the REST API - GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api)
- [REST API endpoints for global security advisories - GitHub Docs](https://docs.github.com/en/rest/security-advisories/global-advisories)

---

## 6. wiremock으로 Link 헤더 테스트

### 6-1. wiremock 0.6 현황

| 항목                              | 값                                         |
| :-------------------------------- | :----------------------------------------- |
| 최신 버전                         | 0.6.5 (2026-04-24 기준)                    |
| `ResponseTemplate::insert_header` | 사용 가능 (헤더 값 완전 교체)              |
| `ResponseTemplate::append_header` | 사용 가능 (기존 값에 추가)                 |
| `matchers::query_param`           | 사용 가능 — cursor 값으로 페이지 구분 가능 |

출처: [wiremock 0.6 - docs.rs](https://docs.rs/wiremock/latest/wiremock/struct.ResponseTemplate.html)

### 6-2. 2-페이지 체인 테스트 패턴

NvdClient의 `query_param("startIndex", "0")` / `query_param("startIndex", "2000")` 구분 패턴을
GHSA에 적용한 예시:

```rust
#[tokio::test]
async fn test_fetch_advisories_pagination() {
    let mock_server = MockServer::start().await;
    let base = mock_server.uri();

    // 페이지 1: after= 없는 요청 → Link: next 포함
    Mock::given(method("GET"))
        .and(path("/advisories"))
        .and(query_param_is_missing("after"))   // 첫 요청엔 after 없음
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header(
                    "Link",
                    format!(r#"<{base}/advisories?after=CURSOR1&before=>; rel="next""#),
                )
                .set_body_json(advisory_page(1)),  // 1개 advisory
        )
        .mount(&mock_server)
        .await;

    // 페이지 2: after=CURSOR1 → Link: next 없음 (종료)
    Mock::given(method("GET"))
        .and(path("/advisories"))
        .and(query_param("after", "CURSOR1"))
        .respond_with(
            ResponseTemplate::new(200)
                // Link 헤더 없음 = 마지막 페이지
                .set_body_json(advisory_page(2)),  // 1개 advisory
        )
        .mount(&mock_server)
        .await;

    let client = GhsaClient::with_base_url(base, "test-token");
    let since = OffsetDateTime::now_utc() - time::Duration::days(7);
    let result = client.fetch_advisories(since).await.unwrap();

    assert_eq!(result.len(), 2);
}
```

### 6-3. wiremock matchers 활용

| matcher                                        | 용도                        |
| :--------------------------------------------- | :-------------------------- |
| `method("GET")`                                | HTTP 메서드                 |
| `path("/advisories")`                          | 정확한 경로                 |
| `query_param("after", "CURSOR1")`              | cursor 값으로 페이지 구분   |
| `query_param_is_missing("after")`              | 첫 페이지 (after 없음) 구분 |
| `header("Authorization", "Bearer test-token")` | 인증 헤더 검증              |

`query_param_is_missing`은 wiremock 0.6의 `matchers` 모듈에서 제공된다.

출처: [wiremock::matchers - docs.rs](https://docs.rs/wiremock/latest/wiremock/matchers/index.html)

### 6-4. 권장 테스트 시나리오 (T050 DoD 기준)

| #   | 시나리오                 | 검증 내용                                |
| :-- | :----------------------- | :--------------------------------------- |
| T1  | `200` 단일 페이지        | advisory 파싱, 필드 매핑 확인            |
| T2  | `200` 2-페이지 Link 체인 | 페이지네이션 종료 후 총 advisory 수 확인 |
| T3  | `429` Rate Limited       | `GhsaError::RateLimited` 반환 확인       |
| T4  | `401` 인증 실패          | `GhsaError::Unauthorized` 반환 확인      |
| T5  | `cve_id = null`          | nullable 필드 처리 확인                  |
| T6  | `cvss_severities = null` | nullable CVSS 처리 확인                  |

---

## 7. REST `/advisories` 엔드포인트 상태 (Deprecated 여부)

### 7-1. 현재 상태 (2026-04-24 기준)

**`GET /advisories` REST 엔드포인트는 deprecated 되지 않았다.**

- 2026-04-24 기준 공식 docs에 정상 문서화됨
- GraphQL `securityAdvisories` 쿼리와 병행 지원 중
- 전환 권고나 deprecation notice 없음

### 7-2. 필드 단위 Deprecation (주의)

| 필드               | 상태                    | 비고                      |
| :----------------- | :---------------------- | :------------------------ |
| `cvss` (단일 객체) | **제거됨** (2025-04-01) | `cvss_severities`로 교체  |
| `cvss_severities`  | **신규, 현행**          | `cvss_v3`, `cvss_v4` 포함 |

**T050 구현 시 `cvss` 필드를 Rust 모델에 포함하지 말 것.** `cvss_severities`만 사용.

### 7-3. GraphQL 대안 (`securityAdvisories`)

GraphQL API는 `securityAdvisories(first, after, updatedSince, orderBy)` 쿼리를 제공하며,
`updatedSince` 파라미터로 증분 쿼리가 가능하다. 그러나:

- REST API가 현재 충분히 기능하고 더 단순함
- `reqwest` 기반 코드에서 REST가 GraphQL보다 통합하기 쉬움
- NvdClient와의 패턴 일관성

**결론: T050은 REST API 사용 권장. GraphQL 이관 불필요.**

출처:

- [REST API endpoints for global security advisories - GitHub Docs](https://docs.github.com/en/rest/security-advisories/global-advisories)
- [Deprecation of cvss field in security advisories API - GitHub Changelog](https://github.blog/changelog/2025-03-27-deprecation-of-cvss-field-in-security-advisories-api/)

---

## 8. Rust 공개 타입 설계 제안 (GhsaClient)

NvdClient (`nvd.rs`) 패턴을 최대한 따른다.

### 8-1. 공개 타입

```rust
/// GitHub Advisory DB에서 수집한 단일 GHSA 항목.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GhsaAdvisory {
    pub ghsa_id: String,
    pub cve_id: Option<String>,          // null 가능
    pub summary: String,
    pub description: Option<String>,     // null 가능
    pub severity: String,                // "critical"|"high"|"medium"|"low"|"unknown"
    pub advisory_type: String,           // "reviewed"|"unreviewed"|"malware"
    pub published_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
    pub withdrawn_at: Option<OffsetDateTime>,
    pub cvss_v3_score: Option<f32>,      // cvss_severities.cvss_v3.score
    pub cvss_v3_vector: Option<String>,  // cvss_severities.cvss_v3.vector_string
    pub cwe_ids: Vec<String>,            // cwes[].cwe_id
    pub references: Vec<String>,
    pub vulnerabilities: Vec<GhsaVulnerability>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GhsaVulnerability {
    pub ecosystem: Option<String>,
    pub package_name: Option<String>,
    pub vulnerable_version_range: Option<String>,
    pub first_patched_version: Option<String>,
}
```

### 8-2. 클라이언트 구조

```rust
pub struct GhsaClient {
    http: reqwest::Client,              // User-Agent: secretbank/0.1.0
    base_url: String,                   // "https://api.github.com"
    token: String,                      // PAT or App token
    limiter: Arc<DefaultDirectRateLimiter>,
}

impl GhsaClient {
    pub fn new(token: impl Into<String>) -> Self { ... }
    pub fn with_base_url(base_url: impl Into<String>, token: impl Into<String>) -> Self { ... }

    pub async fn fetch_advisories(
        &self,
        since: OffsetDateTime,
    ) -> Result<Vec<GhsaAdvisory>, GhsaError> { ... }
    // 내부: loop { limiter.until_ready().await; fetch_page(); Link 헤더 파싱; }
}
```

### 8-3. 에러 타입

```rust
#[derive(Debug, thiserror::Error)]
pub enum GhsaError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("GitHub rate limited")]
    RateLimited,

    #[error("Unauthorized (invalid token)")]
    Unauthorized,

    #[error("Decode error: {0}")]
    Decode(#[from] serde_json::Error),

    #[error("Server error (status {status})")]
    Server { status: u16 },

    #[error("Time parse error: {0}")]
    ParseTime(#[from] time::error::Parse),
}
```

---

## 9. user_research/ 폴더

`user_research/` 폴더 내 별도 파일 없음 (스캔 결과 해당 디렉터리 없음). 통합할 Tier 3 소스 없음.

---

## 출처 목록

| 소스                                          | URL                                                                                                               | 신뢰도                   |
| :-------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :----------------------- |
| GitHub REST API: Global Advisories            | https://docs.github.com/en/rest/security-advisories/global-advisories                                             | HIGH (공식 docs)         |
| GitHub API Versions                           | https://docs.github.com/en/rest/about-the-rest-api/api-versions                                                   | HIGH (공식 docs)         |
| GitHub REST API Rate Limits                   | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api                                   | HIGH (공식 docs)         |
| GitHub Pagination in REST API                 | https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api                               | HIGH (공식 docs)         |
| GitHub Getting Started REST API               | https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api                              | HIGH (공식 docs)         |
| GitHub Search Syntax                          | https://docs.github.com/en/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax | HIGH (공식 docs)         |
| GitHub Changelog: cvss deprecation            | https://github.blog/changelog/2025-03-27-deprecation-of-cvss-field-in-security-advisories-api/                    | HIGH (공식 changelog)    |
| GitHub Changelog: API version 2026-03-10      | https://github.blog/changelog/2026-03-12-rest-api-version-2026-03-10-is-now-available/                            | HIGH (공식 changelog)    |
| GitHub Changelog: unauthenticated rate limits | https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/                        | HIGH (공식 changelog)    |
| governor docs                                 | https://docs.rs/governor/latest/governor/_guide/index.html                                                        | HIGH (공식 docs.rs)      |
| wiremock docs                                 | https://docs.rs/wiremock/latest/wiremock/                                                                         | HIGH (공식 docs.rs)      |
| wiremock matchers                             | https://docs.rs/wiremock/latest/wiremock/matchers/index.html                                                      | HIGH (공식 docs.rs)      |
| parse_link_header - lib.rs                    | https://lib.rs/crates/parse_link_header                                                                           | MEDIUM (커뮤니티 인덱스) |
| parse_link_header - GitHub                    | https://github.com/g1eny0ung/parse_link_header                                                                    | MEDIUM (오픈소스 리포)   |
