# T051 구현 선행 조사 — SaaS 상태 RSS 클라이언트 (`api-vault-feeds/rss.rs`, `sources.rs`)

> 작성일: 2026-04-24
> 조사 범위: feed-rs 크레이트 API, 10개 SaaS 공급자 RSS/Atom URL 실제 접속 확인,
>            동시 fetch 패턴, 에러 모델, DTO 설계, Semaphore 패턴, wiremock 테스트 전략
> 기준: 2026-04-24 현재 최신 정보 확인. 확인 불가 항목은 "확인 불가"로 명시.

---

## 1. feed-rs 크레이트

### 1-1. 최신 버전 및 기본 의존성 선언

| 항목 | 값 |
|:-----|:---|
| **최신 버전** | `2.3.1` (2024-12-25 릴리즈) |
| **crates.io** | https://crates.io/crates/feed-rs |
| **docs.rs** | https://docs.rs/feed-rs/latest/feed_rs/ |
| **GitHub** | https://github.com/feed-rs/feed-rs |
| **라이선스** | MIT |
| **총 다운로드** | ~970,000+ |

`Cargo.toml` 선언 (default features 사용):

```toml
feed-rs = "2.3.1"
```

**기본 features:** 없음 (optional feature는 `sanitize` 하나뿐 — `ammonia` 크레이트 활성화).

**Cargo.toml 의존성 (feed-rs 자체):**

| 패키지 | 버전 | 비고 |
|:-------|:-----|:-----|
| `chrono` | 0.4.38 | `serde` feature 활성화. **time 크레이트는 사용 안 함** |
| `quick-xml` | 0.37.1 | XML 스트리밍 파서, `encoding` feature |
| `serde` | 1.0.215 | `derive` feature |
| `serde_json` | 1.0.133 | JSON Feed 파싱 |
| `url` | 2.5.4 | `serde` feature |
| `uuid` | 1.11.0 | `v4` feature |
| `ammonia` | 4.0.0 | optional (`sanitize` feature 시) |

**중요 — datetime 타입:** feed-rs 의 `Feed.updated`, `Entry.updated`, `Entry.published` 는 모두
`Option<DateTime<Utc>>` (chrono) 타입이다. 프로젝트 workspace 에서 사용하는 `time::OffsetDateTime`
과 **직접 호환되지 않는다**. 변환이 필요하다 (§5 참조).

출처:
- [feed-rs Cargo.toml (raw GitHub)](https://raw.githubusercontent.com/feed-rs/feed-rs/master/feed-rs/Cargo.toml) — 2026-04-24 직접 확인
- [crates.io feed-rs](https://crates.io/crates/feed-rs)

---

### 1-2. 지원 Feed 형식

| 형식 | FeedType 변형 |
|:-----|:------------|
| Atom 1.0 | `FeedType::Atom` |
| RSS 2.0 | `FeedType::RSS2` |
| RSS 1.0 | `FeedType::RSS1` |
| RSS 0.x | `FeedType::RSS0` |
| JSON Feed | `FeedType::JSON` |

파서는 첫 의미 있는 문자(`<` vs `{`)를 보고 XML/JSON 을 자동 감지한다.
Atlassian Statuspage (`history.rss`) 와 incident.io (`history.rss`, `feed.rss`) 포맷 모두
RSS 2.0 또는 Atom 1.0 이므로 전원 지원된다.

---

### 1-3. 핵심 API

#### parse() 함수

```rust
// feed_rs::parser 모듈의 standalone 함수
pub fn parse<R: Read>(source: R) -> ParseFeedResult<Feed>

// 타입 별칭
pub type ParseFeedResult<T> = Result<T, ParseFeedError>;
```

- `Read` 를 구현하는 모든 소스 수용 — `&[u8]`, `&bytes::Bytes[..]`, `File`, `Cursor<Vec<u8>>` 등
- **tokio async 호환:** 파서 자체는 **동기(sync)** 이다. reqwest `.bytes().await?` 로 받은
  `Bytes` 를 `&bytes[..]` 로 넘기거나, `std::io::Cursor::new(bytes)` 로 감싸서 사용한다.
- **중요 경고:** reqwest `.text().await?` 는 content-encoding 을 적용해 UTF-8 해석 충돌을
  일으킬 수 있다. **반드시 `.bytes().await?` + `&bytes[..]` 패턴을 사용해야 한다.**

실제 사용 패턴:
```rust
let bytes = client.get(url).send().await?.bytes().await?;
let feed = feed_rs::parser::parse(&bytes[..])?;
```

#### Builder (옵션)

```rust
let parser = feed_rs::parser::Builder::new()
    .sanitize_content(true)  // ammonia feature 필요
    .build();
let feed = parser.parse(&bytes[..])?;
```

상태 페이지 피드는 신뢰할 수 있는 소스이므로 `sanitize_content` 는 불필요.

---

### 1-4. Feed 구조체 핵심 필드

```rust
pub struct Feed {
    pub feed_type: FeedType,
    pub id: String,
    pub title: Option<Text>,          // .content 필드로 문자열 추출
    pub updated: Option<DateTime<Utc>>,
    pub authors: Vec<Person>,
    pub description: Option<Text>,
    pub links: Vec<Link>,
    pub categories: Vec<Category>,
    pub contributors: Vec<Person>,
    pub generator: Option<Generator>,
    pub icon: Option<Image>,
    pub language: Option<String>,
    pub logo: Option<Image>,
    pub published: Option<DateTime<Utc>>,
    pub rating: Option<MediaRating>,
    pub rights: Option<Text>,
    pub ttl: Option<u32>,
    pub entries: Vec<Entry>,          // 핵심 — 개별 인시던트
}
```

---

### 1-5. Entry 구조체 핵심 필드

```rust
pub struct Entry {
    pub id: String,                    // 항목 고유 ID (GUID)
    pub title: Option<Text>,           // text.content 로 추출
    pub updated: Option<DateTime<Utc>>,
    pub authors: Vec<Person>,
    pub content: Option<Content>,
    pub links: Vec<Link>,              // Vec<Link>.first().map(|l| l.href.clone()) 권장
    pub summary: Option<Text>,         // text.content 로 추출
    pub categories: Vec<Category>,
    pub contributors: Vec<Person>,
    pub published: Option<DateTime<Utc>>,
    pub source: Option<String>,
    pub rights: Option<Text>,
    pub media: Vec<MediaObject>,
    pub language: Option<String>,
    pub base: Option<String>,
}
```

#### Text 구조체

```rust
pub struct Text {
    pub content_type: MediaTypeBuf,
    pub src: Option<String>,
    pub content: String,               // 실제 텍스트 — 이 필드 사용
}
```

#### Link 구조체

```rust
pub struct Link {
    pub href: String,                  // URL (필수 필드)
    pub rel: Option<String>,
    pub media_type: Option<String>,
    pub href_lang: Option<String>,
    pub title: Option<String>,
    pub length: Option<u64>,
}
```

---

### 1-6. ParseFeedError 타입

```rust
#[derive(Debug)]
pub enum ParseFeedError {
    ParseError(ParseErrorKind),
    IoError(std::io::Error),
    JsonSerde(serde_json::Error),
    JsonUnsupportedVersion(String),
    XmlReader(XmlError),
}
```

- `Display` 구현: O
- `Debug` 구현: O
- `std::error::Error` 구현: O (`source()` 포함)
- `Send + Sync`: **O** (thread-safe)
- `thiserror` 와 호환: **직접 `#[from]` 가능**. 단, `RssError::Parse` 에서
  `ParseFeedError → String` 변환 (`to_string()`) 도 가능하며, 이 경우 에러 체인이 단절된다.
  `#[from]` 을 직접 사용하는 게 더 바람직하다.

출처:
- [feed_rs::parser::ParseFeedError (docs.rs)](https://docs.rs/feed-rs/latest/feed_rs/parser/enum.ParseFeedError.html) — 2026-04-24 확인

---

## 2. 10개 SaaS 공급자 RSS/Atom URL (2026-04-24 기준)

아래 모든 URL 은 2026-04-24 직접 HTTP 요청으로 응답을 확인하였다.
"유효" = HTTP 200 + 파싱 가능한 RSS 2.0 또는 Atom 1.0 응답.

### 2-1. URL 목록 (확정)

| 공급자 | slug | RSS 2.0 URL | Atom 1.0 URL | 상태 페이지 플랫폼 | 2026-04-24 확인 |
|:-------|:-----|:------------|:-------------|:-----------------|:--------------|
| **OpenAI** | `openai` | `https://status.openai.com/history.rss` | `https://status.openai.com/history.atom` | incident.io | 유효 |
| **Stripe** | `stripe` | `https://www.stripestatus.com/history.rss` | `https://www.stripestatus.com/history.atom` | Atlassian Statuspage | 유효 |
| **AWS** | `aws` | `https://status.aws.amazon.com/rss/all.rss` | 없음 (RSS 전용) | 자체 개발 | 유효 |
| **Vercel** | `vercel` | `https://www.vercel-status.com/history.rss` | `https://www.vercel-status.com/history.atom` | Atlassian Statuspage | 유효 |
| **Supabase** | `supabase` | `https://status.supabase.com/history.rss` | `https://status.supabase.com/history.atom` | Atlassian Statuspage | 유효 |
| **GitHub** | `github` | `https://www.githubstatus.com/history.rss` | `https://www.githubstatus.com/history.atom` | Atlassian Statuspage | 유효 |
| **Cloudflare** | `cloudflare` | `https://www.cloudflarestatus.com/history.rss` | `https://www.cloudflarestatus.com/history.atom` | Atlassian Statuspage | 유효 |
| **Anthropic** | `anthropic` | `https://status.claude.com/history.rss` | `https://status.claude.com/history.atom` | incident.io | 유효 |
| **Google Cloud** | `gcp` | 없음 (Atom 전용) | `https://status.cloud.google.com/en/feed.atom` | 자체 개발 (GCP) | 유효 |
| **Paddle** | `paddle` | `https://paddlestatus.com/history.rss` | `https://paddlestatus.com/history.atom` | incident.io | 유효 |

### 2-2. 리다이렉트 및 주의사항

| 공급자 | 원래 URL | 실제 리다이렉트 | 비고 |
|:-------|:---------|:---------------|:-----|
| Anthropic (상태 페이지 자체) | `https://status.anthropic.com/` | `https://status.claude.com/` (302) | Anthropic 상태 페이지가 Claude Status 로 통합됨. RSS URL 은 `status.claude.com` 직접 사용 권장 |
| Stripe (`/current/atom.xml`) | `https://status.stripe.com/current/atom.xml` | `https://www.stripestatus.com/history.atom` (301) | Stripe 가 2023-07-18 새 상태 페이지로 마이그레이션. `status.stripe.com` 은 리다이렉트 래퍼 |
| Paddle (`/history.rss`) | `https://status.paddle.com/history.rss` | `https://paddlestatus.com/` (301) | 도메인 변경됨. `paddlestatus.com` 직접 사용 |

### 2-3. 플랫폼별 특성

**Atlassian Statuspage** (Vercel, Supabase, GitHub, Cloudflare, Stripe):
- `history.rss` — RSS 2.0, Dublin Core namespace (`xmlns:dc`)
- `history.atom` — Atom 1.0
- `pubDate` 를 "변경일"로 재사용하는 알려진 quirk 존재 (예정된 유지보수의 경우 미래 날짜 가능)
- feed-rs 가 이를 그대로 파싱하므로 application 레이어에서 처리 필요

**incident.io** (OpenAI, Anthropic/Claude, Paddle):
- `history.rss` — RSS 2.0 (Dublin Core + Content 네임스페이스 포함)
- `history.atom` — Atom 1.0
- OpenAI 는 추가로 `https://status.openai.com/feed.rss` 도 유효 (동일 내용)
- 피드 generator 헤더에 incident.io 명시됨

**자체 개발** (AWS, GCP):
- AWS: RSS 2.0 전용. 다수의 서비스별 피드 존재 (`/rss/{service}-{region}.rss`). `all.rss` 는 "전체" 피드이나 실제로는 **최근 주요 인시던트 중심** (서비스별 개별 피드 합계가 아님)
- GCP: Atom 1.0 전용. 피드 내 entry 수가 적음 (최근 주요 인시던트만 포함). 매우 sparse.

### 2-4. 구현 시 권장 URL (단일 URL 선택 기준)

feed-rs 가 RSS/Atom 모두 동일하게 파싱하므로 어느 포맷이든 무관하다.
단일 URL 관리 단순성을 위해 **RSS 2.0 우선, RSS 없으면 Atom** 을 권장한다.

| 공급자 | 권장 URL |
|:-------|:---------|
| openai | `https://status.openai.com/history.rss` |
| stripe | `https://www.stripestatus.com/history.rss` |
| aws | `https://status.aws.amazon.com/rss/all.rss` |
| vercel | `https://www.vercel-status.com/history.rss` |
| supabase | `https://status.supabase.com/history.rss` |
| github | `https://www.githubstatus.com/history.rss` |
| cloudflare | `https://www.cloudflarestatus.com/history.rss` |
| anthropic | `https://status.claude.com/history.rss` |
| gcp | `https://status.cloud.google.com/en/feed.atom` |
| paddle | `https://paddlestatus.com/history.rss` |

출처:
- 직접 HTTP 요청 (2026-04-24) — 각 URL 응답 본문 확인
- [talonx/service-provider-status-links](https://github.com/talonx/service-provider-status-links) — 크로스 체크
- [OpenAI 커뮤니티 — status feed 구독 논의](https://community.openai.com/t/openai-status-page-subscribe-to-a-subset-of-feeds/1168537)

---

## 3. 동시 fetch 패턴

### 3-1. join_all vs JoinSet 비교

| 기준 | `futures::future::join_all` | `tokio::task::JoinSet` |
|:-----|:---------------------------|:----------------------|
| 실행 방식 | 동일 태스크에서 폴링 | 별도 OS 스레드(tokio 스레드 풀)에서 spawn |
| `'static` 바운드 | 불필요 (로컬 참조 가능) | 필요 |
| 결과 순서 | 입력 순서 보장 | 완료 순서 (비결정적) |
| 에러 격리 | 모든 future 대기 후 `Vec<Result>` 수집 가능 | 개별 `join_next()` 루프로 격리 가능 |
| 동시성 제한 | 별도 Semaphore 필요 | 별도 Semaphore 필요 |
| 패닉 처리 | 패닉 전파 | `JoinError::is_panic()` 으로 포착 가능 |

**T051 권장: `futures::future::join_all`**

이유:
1. 소스 목록이 10개로 고정 — JoinSet 의 "완료 순 처리" 장점이 없다
2. `'static` 바운드 없이 reqwest `Client` 의 공유 참조 캡처 가능
3. `Vec<Result<RssFeed, RssError>>` 를 그대로 수집 가능 — 실패한 소스가 전체를 중단시키지 않음
4. futures 크레이트 의존성이 필요하다면 `FuturesUnordered::collect()` 로도 대체 가능

단, **futures 크레이트가 workspace 에 없다면** `tokio::task::JoinSet` 도 동등하게 사용 가능.

### 3-2. 독립 에러 격리 패턴

각 소스의 fetch 를 `Result<RssFeed, RssError>` 로 독립 관리한다.
`join_all` 이 `Vec<Result<RssFeed, RssError>>` 를 반환하므로 실패한 소스만 필터링한다:

```rust
pub async fn fetch_all(
    &self,
    sources: &[RssSource],
) -> Vec<(String, Result<Vec<RssEntry>, RssError>)> {
    let futures = sources.iter().map(|src| {
        let slug = src.slug.clone();
        let fut = self.fetch_one(src);
        async move { (slug, fut.await) }
    });
    futures::future::join_all(futures).await
}
```

### 3-3. 동시성 제한 — tokio::sync::Semaphore

상태 페이지 RSS 는 공개 피드이므로 rate limit 이 엄격하지 않다.
그러나 네트워크 매너와 로컬 소켓 고갈 방지를 위해 최대 4 concurrent 권장.

```rust
use std::sync::Arc;
use tokio::sync::Semaphore;

let sem = Arc::new(Semaphore::new(4));

let futures = sources.iter().map(|src| {
    let sem = sem.clone();
    let slug = src.slug.clone();
    let fut = self.fetch_one(src);
    async move {
        let _permit = sem.acquire_owned().await.unwrap();
        let result = fut.await;
        (slug, result)
    }
});
futures::future::join_all(futures).await
```

`acquire_owned()` 는 permit 을 `OwnedSemaphorePermit` 로 반환하므로 async closure 경계를 넘길 수 있다.
`_permit` 이 drop 되면 자동 해제.

### 3-4. 타임아웃 및 User-Agent

```rust
let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(30))
    .user_agent("api-vault/0.1.0")
    .gzip(true)  // reqwest gzip feature 활성화됨 (workspace)
    .build()?;
```

상태 페이지들은 User-Agent 를 엄격하게 검증하지 않지만 `api-vault/0.1.0` 으로 통일한다.
gzip 압축 수락은 대역폭 절감에 유리하다.

출처:
- [tokio::sync::Semaphore (docs.rs)](https://docs.rs/tokio/latest/tokio/sync/struct.Semaphore.html)
- [tokio::task::JoinSet (docs.rs)](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html)
- [futures::future::join_all vs JoinSet 비교 논의 (tokio-rs GitHub)](https://github.com/tokio-rs/tokio/discussions/6921)

---

## 4. 에러 모델

### 4-1. 권장 에러 타입

```rust
#[derive(Debug, thiserror::Error)]
pub enum RssError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("HTTP {status} from {url}")]
    Status { status: u16, url: String },

    #[error("Feed parse failed: {0}")]
    Parse(#[from] feed_rs::parser::ParseFeedError),
}
```

**`ParseFeedError → #[from]` 직접 사용 가능 여부 확인:**

- `ParseFeedError` 는 `Display + Debug + std::error::Error + Send + Sync` 를 모두 구현한다.
- `thiserror::Error` 의 `#[from]` 어트리뷰트 요건인 `Into<RssError>` 자동 구현이 성립한다.
- 따라서 `Parse(String)` 이 아닌 `Parse(#[from] feed_rs::parser::ParseFeedError)` 를
  **직접 사용할 수 있다**. 에러 체인이 유지되어 디버깅이 용이하다.

단, `Send + Sync` 는 확인됨. `RefUnwindSafe / UnwindSafe` 는 미구현 — 패닉 경계 사용 시 주의.

### 4-2. HTTP 상태 코드 처리

```rust
if !response.status().is_success() {
    return Err(RssError::Status {
        status: response.status().as_u16(),
        url: url.to_string(),
    });
}
```

상태 페이지는 공개 RSS 이므로 401/403 은 거의 없지만, 404 (URL 변경) 와 429 (과호출 시)
는 발생 가능하다.

출처:
- [thiserror docs.rs](https://docs.rs/thiserror/latest/thiserror/)
- [feed_rs::parser::ParseFeedError (docs.rs)](https://docs.rs/feed-rs/latest/feed_rs/parser/enum.ParseFeedError.html) — Send+Sync 직접 확인

---

## 5. RssEntry DTO 설계 및 chrono → time 변환

### 5-1. feed-rs datetime → time::OffsetDateTime 변환

feed-rs 는 **chrono** 를 사용하므로 `Entry.updated` / `Entry.published` 의 타입은
`Option<chrono::DateTime<chrono::Utc>>` 이다. 프로젝트는 `time::OffsetDateTime` 을 사용하므로
변환 헬퍼가 필요하다.

**변환 방법 (unix timestamp 경유):**

```rust
fn chrono_to_offset(dt: chrono::DateTime<chrono::Utc>) -> Option<time::OffsetDateTime> {
    let secs = dt.timestamp();
    let nanos = dt.timestamp_subsec_nanos();
    time::OffsetDateTime::from_unix_timestamp(secs)
        .ok()
        .map(|odt| odt + time::Duration::nanoseconds(nanos as i64))
}
```

- `chrono::DateTime<Utc>.timestamp()` → i64 (UTC unix 초)
- `time::OffsetDateTime::from_unix_timestamp(i64)` → `Result<OffsetDateTime, ComponentRange>`
- 나노초는 `dt.timestamp_subsec_nanos()` 로 추출 후 가산

### 5-2. 권장 DTO 타입

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RssSource {
    pub slug: String,         // "openai" | "stripe" | "aws" | ...
    pub display_name: String, // "OpenAI" | "Stripe" | "AWS" | ...
    pub url: String,          // 실제 RSS/Atom URL
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RssEntry {
    pub source_slug: String,             // 어느 소스에서 왔는지 역참조
    pub id: String,                      // Entry.id (GUID)
    pub title: Option<String>,           // Entry.title.map(|t| t.content)
    pub summary: Option<String>,         // Entry.summary.map(|t| t.content)
    pub link: Option<String>,            // Entry.links.first().map(|l| l.href.clone())
    pub published_at: Option<OffsetDateTime>,  // Entry.published 변환
    pub updated_at: Option<OffsetDateTime>,    // Entry.updated 변환
}
```

### 5-3. Entry → RssEntry 매핑 요약

| RssEntry 필드 | feed-rs Entry 필드 | 변환 |
|:-------------|:------------------|:-----|
| `id` | `entry.id` | 직접 복사 |
| `title` | `entry.title` | `Option<Text> → .map(\|t\| t.content)` |
| `summary` | `entry.summary` | `Option<Text> → .map(\|t\| t.content)` |
| `link` | `entry.links` | `.first().map(\|l\| l.href.clone())` |
| `published_at` | `entry.published` | `Option<DateTime<Utc>> → chrono_to_offset()` |
| `updated_at` | `entry.updated` | `Option<DateTime<Utc>> → chrono_to_offset()` |

**content 필드 사용 여부:** `Entry.content` 는 전체 HTML 본문이다. 상태 피드에서
`summary` 가 이미 인시던트 요약을 포함하므로 `content` 는 T051 범위에서 제외.

출처:
- [OffsetDateTime::from_unix_timestamp (time-rs)](https://time-rs.github.io/api/time/struct.OffsetDateTime.html)
- [chrono::DateTime docs.rs](https://docs.rs/chrono/latest/chrono/struct.DateTime.html)
- feed-rs model 구조체 필드 직접 확인 (docs.rs, 2026-04-24)

---

## 6. Rate Limiter 전략

### 6-1. governor 미사용 권장 (T051 범위)

T049 (NvdClient), T050 (GhsaClient) 에서는 API key 기반 엔드포인트에 대한 rate limit 으로
governor 를 사용했다. 그러나 RSS 상태 피드는:

- 공개 HTTP 엔드포인트 (인증 없음)
- 요청 빈도: `fetch_all` 은 사용자 액션 또는 백그라운드 주기 폴링 시 1회 10건
- 각 공급자별 rate limit 문서 없음 (사실상 제한 없음)

→ governor 는 T051 에서 **불필요**. `tokio::sync::Semaphore` 로 동시성 상한만 제어한다.

### 6-2. 폴링 주기 권장 (application 레이어 결정 사항)

T051 클라이언트 자체는 폴링 주기를 관리하지 않는다.
호출자(application 또는 Tauri command)에서 `tokio::time::interval` 등으로 제어한다.
**권장 폴링 주기: 5~15분** (상태 페이지 피드 TTL 은 대부분 60초 ~ 5분).

출처:
- [tokio::sync::Semaphore 패턴 (docs.rs)](https://docs.rs/tokio/latest/tokio/sync/struct.Semaphore.html)
- NvdClient/GhsaClient 기존 구현 패턴 참조

---

## 7. 테스트 전략 — fixture + wiremock

### 7-1. fixture 파일 구조

```
src-tauri/crates/api-vault-feeds/tests/fixtures/rss/
  openai.xml          # status.openai.com/history.rss 에서 캡처, ~5 entries
  stripe.xml          # www.stripestatus.com/history.rss 에서 캡처
  aws.xml             # status.aws.amazon.com/rss/all.rss 에서 캡처
  vercel.xml          # www.vercel-status.com/history.rss 에서 캡처
  supabase.xml        # status.supabase.com/history.rss 에서 캡처
  github.xml          # www.githubstatus.com/history.rss 에서 캡처
  cloudflare.xml      # www.cloudflarestatus.com/history.rss 에서 캡처
  anthropic.xml       # status.claude.com/history.rss 에서 캡처
  gcp.atom            # status.cloud.google.com/en/feed.atom 에서 캡처 (Atom 형식)
  paddle.xml          # paddlestatus.com/history.rss 에서 캡처
```

**fixture 제작 기준:**
- 실제 피드에서 3~5개 entry 만 남기고 잘라냄
- 파일 크기 < 10KB
- 실제 incident id, title, pubDate 를 포함해 현실적인 파싱 검증 가능하게 유지
- `gcp.atom` 은 `.atom` 확장자 사용 (Atom 포맷 명시)

### 7-2. 단위 테스트 — 파일 기반 파싱 검증

```rust
#[test]
fn parse_openai_fixture() {
    let bytes = include_bytes!("fixtures/rss/openai.xml");
    let feed = feed_rs::parser::parse(&bytes[..]).expect("parse must succeed");
    assert!(!feed.entries.is_empty());
    let entry = &feed.entries[0];
    assert!(entry.title.is_some());
    assert!(entry.links.len() > 0);
}
```

각 fixture 마다 동일 패턴의 단위 테스트 작성. GCP 는 `.atom` 파일로 동일하게 테스트.

### 7-3. wiremock 통합 테스트 — HTTP 레이어

wiremock 최신 버전: **0.6.5** (`dev-dependencies` 에 `wiremock = "0.6"` 으로 선언됨).

```rust
use wiremock::{MockServer, Mock, ResponseTemplate};
use wiremock::matchers::{method, path};

#[tokio::test]
async fn fetch_one_returns_entries_on_200() {
    let mock_server = MockServer::start().await;
    let xml = include_str!("fixtures/rss/github.xml");

    Mock::given(method("GET"))
        .and(path("/history.rss"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", "application/rss+xml; charset=utf-8")
                .set_body_string(xml),
        )
        .mount(&mock_server)
        .await;

    let source = RssSource {
        slug: "github".into(),
        display_name: "GitHub".into(),
        url: format!("{}/history.rss", mock_server.uri()),
    };
    let client = RssClient::new();
    let entries = client.fetch_one(&source).await.expect("should succeed");
    assert!(!entries.is_empty());
    assert_eq!(entries[0].source_slug, "github");
}
```

**추가 시나리오 테스트:**
- HTTP 500 → `RssError::Status { status: 500 }`
- HTTP 404 → `RssError::Status { status: 404 }`
- 빈 응답 본문 → `RssError::Parse(...)` (feed-rs 가 ParseFeedError 반환)
- `fetch_all` 에서 1개 소스 실패 시 나머지 성공 결과 유지 확인

출처:
- [wiremock docs.rs](https://docs.rs/wiremock/latest/wiremock/) — 버전 0.6.5 확인
- [LukeMathWalker/wiremock-rs GitHub](https://github.com/LukeMathWalker/wiremock-rs)

---

## 8. feed-rs default features 주의사항 종합

### 8-1. chrono 하드코딩 문제 및 대응

feed-rs 2.3.1 은 **chrono 가 유일한 datetime 크레이트**이다. `time` feature flag 는 없다.
workspace 에서 `time` 크레이트를 사용하는 이 프로젝트는 다음 중 하나를 선택해야 한다:

| 전략 | 방법 | 장단점 |
|:-----|:-----|:-------|
| **A (권장)** | chrono → time 변환 헬퍼 (§5.1) | 코드 단순. chrono 의존성 추가 없음 (feed-rs 가 내부적으로만 사용) |
| B | Entry 날짜를 String 으로 받아 time crate 로 재파싱 | 불필요하게 복잡 |
| C | Entry 날짜 무시하고 피드 파싱 시각을 현재 시각으로 대체 | 시간 정보 손실 |

**A 전략 채택 권장.** feed-rs 의 chrono 는 `api-vault-feeds` crate 내부에서만 사용되고
외부(Tauri command 레이어)로 노출되지 않으므로 workspace 에 chrono 를 직접 추가할 필요 없다.
변환 헬퍼만 `rss.rs` 내부에 작성하면 된다.

### 8-2. `sanitize` feature

HTML sanitization (`ammonia` 크레이트) 은 신뢰할 수 없는 피드를 파싱할 때 유용하다.
공식 상태 페이지 RSS 는 신뢰 소스이므로 **`sanitize` feature 불필요**.
Cargo.toml 에 features 없이 단순히 버전만 지정한다:

```toml
# api-vault-feeds/Cargo.toml [dependencies]
feed-rs = "2.3.1"
```

### 8-3. reqwest .bytes() 사용 필수

feed-rs README 및 소스 주석에서 명시:
> "HTTP libraries provide a `text()` method which applies content-encoding, causing feed-rs to fail
> when interpreting UTF-8 as a different charset. Instead, pass raw encoded sources (e.g., `.bytes()` method)"

**`.text().await?` 사용 금지. 반드시 `.bytes().await?` 를 사용한다.**

### 8-4. 의존성 추가 시 workspace 체크

feed-rs 는 chrono 0.4.38 을 사용한다. workspace `Cargo.toml` 에 chrono 가 이미 없다면
충돌 없이 feed-rs 내부에서만 사용된다. **workspace 에 chrono 를 추가하지 않아도 된다.**

---

## 출처 목록

| URL | 신뢰도 | 관련성 | 확인일 |
|:----|:-------|:-------|:-------|
| [feed-rs crates.io](https://crates.io/crates/feed-rs) | HIGH (공식 레지스트리) | 10 | 2026-04-24 |
| [feed_rs docs.rs (Feed struct)](https://docs.rs/feed-rs/latest/feed_rs/model/struct.Feed.html) | HIGH (공식 문서) | 10 | 2026-04-24 |
| [feed_rs docs.rs (Entry struct)](https://docs.rs/feed-rs/latest/feed_rs/model/struct.Entry.html) | HIGH (공식 문서) | 10 | 2026-04-24 |
| [feed_rs docs.rs (ParseFeedError)](https://docs.rs/feed-rs/latest/feed_rs/parser/enum.ParseFeedError.html) | HIGH (공식 문서) | 10 | 2026-04-24 |
| [feed_rs docs.rs (parse fn)](https://docs.rs/feed-rs/latest/feed_rs/parser/fn.parse.html) | HIGH (공식 문서) | 10 | 2026-04-24 |
| [feed_rs docs.rs (Link struct)](https://docs.rs/feed-rs/latest/feed_rs/model/struct.Link.html) | HIGH (공식 문서) | 9 | 2026-04-24 |
| [feed_rs docs.rs (Text struct)](https://docs.rs/feed-rs/latest/feed_rs/model/struct.Text.html) | HIGH (공식 문서) | 9 | 2026-04-24 |
| [feed_rs docs.rs (FeedType enum)](https://docs.rs/feed-rs/latest/feed_rs/model/enum.FeedType.html) | HIGH (공식 문서) | 8 | 2026-04-24 |
| [feed-rs Cargo.toml (raw GitHub)](https://raw.githubusercontent.com/feed-rs/feed-rs/master/feed-rs/Cargo.toml) | HIGH (공식 소스) | 10 | 2026-04-24 |
| [feed-rs/feed-rs GitHub](https://github.com/feed-rs/feed-rs) | HIGH (공식 소스) | 9 | 2026-04-24 |
| [tokio::sync::Semaphore docs.rs](https://docs.rs/tokio/latest/tokio/sync/struct.Semaphore.html) | HIGH (공식 문서) | 8 | 2026-04-24 |
| [tokio::task::JoinSet docs.rs](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html) | HIGH (공식 문서) | 7 | 2026-04-24 |
| [wiremock docs.rs](https://docs.rs/wiremock/latest/wiremock/) | HIGH (공식 문서) | 9 | 2026-04-24 |
| [talonx/service-provider-status-links](https://github.com/talonx/service-provider-status-links) | MEDIUM (커뮤니티 큐레이션) | 8 | 2026-04-24 |
| [status.openai.com/history.rss](https://status.openai.com/history.rss) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [status.openai.com/history.atom](https://status.openai.com/history.atom) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [www.stripestatus.com/history.rss](https://www.stripestatus.com/history.rss) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [www.stripestatus.com/history.atom](https://www.stripestatus.com/history.atom) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [status.aws.amazon.com/rss/all.rss](https://status.aws.amazon.com/rss/all.rss) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [www.vercel-status.com/history.rss](https://www.vercel-status.com/history.rss) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [www.vercel-status.com/history.atom](https://www.vercel-status.com/history.atom) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [status.supabase.com/history.rss](https://status.supabase.com/history.rss) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [status.supabase.com/history.atom](https://status.supabase.com/history.atom) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [www.githubstatus.com/history.rss](https://www.githubstatus.com/history.rss) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [www.githubstatus.com/history.atom](https://www.githubstatus.com/history.atom) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [www.cloudflarestatus.com/history.rss](https://www.cloudflarestatus.com/history.rss) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [www.cloudflarestatus.com/history.atom](https://www.cloudflarestatus.com/history.atom) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [status.claude.com/history.rss](https://status.claude.com/history.rss) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [status.claude.com/history.atom](https://status.claude.com/history.atom) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [status.cloud.google.com/en/feed.atom](https://status.cloud.google.com/en/feed.atom) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [paddlestatus.com/history.rss](https://paddlestatus.com/history.rss) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [paddlestatus.com/history.atom](https://paddlestatus.com/history.atom) | HIGH (공급자 공식) | 10 | 2026-04-24 직접 확인 |
| [time-rs OffsetDateTime docs](https://time-rs.github.io/api/time/struct.OffsetDateTime.html) | HIGH (공식 문서) | 7 | 2026-04-24 |
| [chrono DateTime docs](https://docs.rs/chrono/latest/chrono/struct.DateTime.html) | HIGH (공식 문서) | 7 | 2026-04-24 |
| [Atlassian Statuspage RSS 이슈](https://community.atlassian.com/forums/Statuspage-questions/Statuspage-RSS-error-in-formatting/qaq-p/3004330) | MEDIUM (커뮤니티) | 6 | 2026-04-24 |
