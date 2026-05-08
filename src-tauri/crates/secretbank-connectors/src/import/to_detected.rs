//! CSV 파싱 결과 → `DetectedFromCsv` 변환 + URL → issuer 자동 매핑.
//!
//! # 설계 원칙
//!
//! - `IssuerRepo` 호출이 crate 의존성 사이클을 일으킬 수 있으므로, 호출자가 domains 매핑
//!   (`issuer_domains`) 을 준비해서 넘기는 방식을 사용한다.
//! - URL → host 추출은 `url::Url::parse` 를 사용한다. scheme 이 없으면 `https://` 를 보정한다.
//! - issuer 매칭은 subdomain-safe: `host == domain || host.ends_with(".{domain}")`.
//!   (Phase 2-2A-3b MatchReason::Domain / Phase 2-1 matchIssuerByUrl 와 동일 정책)
//! - `SecretBox` 는 파싱 단계 (`csv_google`) 에서 이미 래핑되어 있으므로 그대로 전달한다.

use secrecy::SecretBox;
use url::Url;

use crate::import::csv_google::{ImportedRow, ParseResult};

// ── 공개 타입 ─────────────────────────────────────────────────────────────────

/// CSV 1행에서 변환된 감지 자격증명 레코드.
///
/// Tauri command (2-3-a-3) 가 이 구조체를 직렬화해서 frontend 에 보낸다.
#[derive(Debug)]
pub struct DetectedFromCsv {
    /// 원본 URL (빈 문자열 허용).
    pub url: String,
    /// `url::Url::parse` 로 추출한 host. scheme 이 없으면 `https://` 보정 후 재시도.
    pub host: Option<String>,
    /// issuer_domains 매핑에서 host 와 일치하는 issuer slug.
    pub matched_issuer_slug: Option<String>,
    /// 표시 이름 — CSV name > host > `"Imported credential"` 우선순위.
    pub name: String,
    /// CSV username 컬럼 (Edge / Chrome 공통).
    pub username: Option<String>,
    /// Chrome 전용 note 컬럼.
    pub note: Option<String>,
    /// 항상 `Password` (CSV import 는 password 전용).
    pub kind: CredentialKind,
    /// 환경 티어 — `ToDetectedOptions::default_env` (기본 "prod").
    pub env: String,
    /// 평문 비밀번호를 `SecretBox` 로 래핑 유지 (csv_google 에서 넘어온 그대로).
    pub value: SecretBox<String>,
    /// UX 힌트 — 마지막 4자 (env_scan 의 `value_hint` 와 동일 알고리즘).
    pub value_hint: String,
}

/// Credential kind — env_scan 과 공유하지 않기 위해 import 전용으로 재선언.
///
/// 직렬화 시 `"password"` 고정 (CSV import 는 password 전용).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CredentialKind {
    Password,
}

/// `rows_to_detected` 에 전달하는 옵션.
pub struct ToDetectedOptions<'a> {
    /// 환경 티어 기본값 (e.g. `"prod"`).
    pub default_env: &'a str,
    /// 백엔드 `IssuerRepo` 에서 로드한 `(issuer_slug, domains)` 매핑.
    /// `Vec<String>` 의 각 원소는 "github.com", "stripe.com" 형태.
    pub issuer_domains: &'a [(String, Vec<String>)],
}

// ── 공개 API ───────────────────────────────────────────────────────────────────

/// `ParseResult` 의 모든 행을 `DetectedFromCsv` 로 변환한다.
///
/// 빈 password 행은 이미 [`crate::import::csv_google::parse_csv`] 에서 제거됐으므로
/// 여기서는 모든 행을 변환한다.
pub fn rows_to_detected(parsed: ParseResult, opts: &ToDetectedOptions<'_>) -> Vec<DetectedFromCsv> {
    parsed
        .rows
        .into_iter()
        .map(|row| convert_row(row, opts))
        .collect()
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

/// `ImportedRow` 1개를 `DetectedFromCsv` 로 변환.
fn convert_row(row: ImportedRow, opts: &ToDetectedOptions<'_>) -> DetectedFromCsv {
    let (host, matched_issuer_slug) = resolve_host_and_issuer(&row.url, opts.issuer_domains);

    // name 우선순위: CSV name > host > fallback
    let name = row
        .name
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .or_else(|| host.clone())
        .unwrap_or_else(|| "Imported credential".to_owned());

    let value_hint = compute_value_hint_from_secret(&row.password);

    DetectedFromCsv {
        url: row.url,
        host,
        matched_issuer_slug,
        name,
        username: row.username,
        note: row.note,
        kind: CredentialKind::Password,
        env: opts.default_env.to_owned(),
        value: row.password,
        value_hint,
    }
}

/// URL 문자열에서 host 를 추출하고, issuer_domains 매핑과 대조하여 slug 를 반환한다.
///
/// scheme 이 없는 경우 `https://` 를 prepend 해서 재시도한다.
fn resolve_host_and_issuer(
    raw_url: &str,
    issuer_domains: &[(String, Vec<String>)],
) -> (Option<String>, Option<String>) {
    if raw_url.is_empty() {
        return (None, None);
    }

    let host = extract_host(raw_url);
    let slug = host
        .as_deref()
        .and_then(|h| match_issuer_by_host(h, issuer_domains))
        .map(str::to_owned);

    (host, slug)
}

/// URL 문자열에서 host 를 추출한다.
/// `url::Url::parse` 실패 시 `https://` 를 prepend 해서 재시도.
fn extract_host(raw_url: &str) -> Option<String> {
    // 1차 시도: 그대로 파싱
    if let Ok(parsed) = Url::parse(raw_url) {
        if let Some(host) = parsed.host_str() {
            return Some(host.to_owned());
        }
    }

    // 2차 시도: https:// 보정
    let with_scheme = format!("https://{raw_url}");
    if let Ok(parsed) = Url::parse(&with_scheme) {
        if let Some(host) = parsed.host_str() {
            return Some(host.to_owned());
        }
    }

    None
}

/// host 가 issuer_domains 의 어떤 domain 과 일치하는지 확인해서 slug 를 반환한다.
///
/// subdomain-safe 매칭: `host == domain || host.ends_with(".{domain}")`.
/// evil-stripe.com 같은 가짜 도메인은 `ends_with("stripe.com")` 만으로는
/// `.stripe.com` suffix 체크이므로 "evilstripe.com" 은 걸리지 않는다.
fn match_issuer_by_host<'a>(
    host: &str,
    issuer_domains: &'a [(String, Vec<String>)],
) -> Option<&'a str> {
    for (slug, domains) in issuer_domains {
        for domain in domains {
            if is_subdomain_safe_match(host, domain) {
                return Some(slug.as_str());
            }
        }
    }
    None
}

/// `host == domain || host.ends_with(".{domain}")` 판정.
fn is_subdomain_safe_match(host: &str, domain: &str) -> bool {
    if host == domain {
        return true;
    }
    // subdomain: ends_with(".domain") — e.g. "app.supabase.com" vs "supabase.com"
    let with_dot = format!(".{domain}");
    host.ends_with(&with_dot)
}

/// `SecretBox<String>` 내부 값의 마지막 4자를 반환한다 (env_scan `value_hint` 와 동일 알고리즘).
///
/// `secrecy::ExposeSecret` 을 사용해서 평문에 잠깐 접근하고 즉시 드랍한다.
fn compute_value_hint_from_secret(secret: &SecretBox<String>) -> String {
    use secrecy::ExposeSecret;
    let s = secret.expose_secret();
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= 4 {
        chars.iter().collect()
    } else {
        chars[chars.len() - 4..].iter().collect()
    }
}

// ── 단위 테스트 ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::csv_google::{CsvFormat, ImportWarnings};
    use secrecy::ExposeSecret;

    // ── 헬퍼 ────────────────────────────────────────────────────────────────

    fn make_row(
        name: Option<&str>,
        url: &str,
        username: Option<&str>,
        password: &str,
        note: Option<&str>,
    ) -> ImportedRow {
        ImportedRow {
            name: name.map(str::to_owned),
            url: url.to_owned(),
            username: username.map(str::to_owned),
            password: SecretBox::new(Box::new(password.to_owned())),
            note: note.map(str::to_owned),
        }
    }

    fn make_parsed(rows: Vec<ImportedRow>) -> ParseResult {
        ParseResult {
            format: CsvFormat::ChromeBrave,
            rows,
            warnings: ImportWarnings::default(),
        }
    }

    fn default_domains() -> Vec<(String, Vec<String>)> {
        vec![
            ("github".to_owned(), vec!["github.com".to_owned()]),
            ("stripe".to_owned(), vec!["stripe.com".to_owned()]),
            ("supabase".to_owned(), vec!["supabase.com".to_owned()]),
        ]
    }

    fn opts_with_domains(domains: &[(String, Vec<String>)]) -> ToDetectedOptions<'_> {
        ToDetectedOptions {
            default_env: "prod",
            issuer_domains: domains,
        }
    }

    // ── 테스트 1: Chrome row + 알려진 issuer ────────────────────────────────

    #[test]
    fn chrome_row_with_known_issuer() {
        let domains = default_domains();
        let parsed = make_parsed(vec![make_row(
            Some("GitHub"),
            "https://github.com/settings/tokens",
            Some("alice"),
            "gh_secret_pass",
            None,
        )]);

        let results = rows_to_detected(parsed, &opts_with_domains(&domains));
        assert_eq!(results.len(), 1);
        let r = &results[0];
        assert_eq!(r.matched_issuer_slug.as_deref(), Some("github"));
        assert_eq!(r.host.as_deref(), Some("github.com"));
        assert_eq!(r.name, "GitHub");
        assert_eq!(r.username.as_deref(), Some("alice"));
        assert_eq!(r.env, "prod");
        assert_eq!(r.value_hint, "pass"); // 마지막 4자
    }

    // ── 테스트 2: subdomain 매칭 OK + evil domain 차단 ───────────────────────

    #[test]
    fn subdomain_safe_match() {
        let domains = default_domains();

        // OK: app.supabase.com → "supabase"
        let parsed_ok = make_parsed(vec![make_row(
            Some("Supabase"),
            "https://app.supabase.com/project/foo",
            None,
            "mysecret",
            None,
        )]);
        let results_ok = rows_to_detected(parsed_ok, &opts_with_domains(&domains));
        assert_eq!(
            results_ok[0].matched_issuer_slug.as_deref(),
            Some("supabase"),
            "app.supabase.com 은 supabase 와 매칭되어야 함"
        );

        // FAIL: evil-supabase.com → None
        let parsed_evil = make_parsed(vec![make_row(
            Some("Evil"),
            "https://evil-supabase.com/",
            None,
            "evilpass",
            None,
        )]);
        let results_evil = rows_to_detected(parsed_evil, &opts_with_domains(&domains));
        assert_eq!(
            results_evil[0].matched_issuer_slug, None,
            "evil-supabase.com 은 매칭되지 않아야 함"
        );
    }

    // ── 테스트 3: domains 에 없는 url → matched_issuer_slug = None ──────────

    #[test]
    fn unknown_url_no_match() {
        let domains = default_domains();
        let parsed = make_parsed(vec![make_row(
            Some("Unknown Service"),
            "https://unknownservice.example.com/login",
            None,
            "somepassword",
            None,
        )]);

        let results = rows_to_detected(parsed, &opts_with_domains(&domains));
        assert_eq!(results[0].matched_issuer_slug, None);
    }

    // ── 테스트 4: name 비어있고 url 정상 → name = host ───────────────────────

    #[test]
    fn name_fallback_to_host() {
        let domains = default_domains();
        let parsed = make_parsed(vec![make_row(
            None,
            "https://github.com/login",
            None,
            "mypassword",
            None,
        )]);

        let results = rows_to_detected(parsed, &opts_with_domains(&domains));
        assert_eq!(
            results[0].name, "github.com",
            "CSV name 없을 때 host 로 fallback 되어야 함"
        );
    }

    // ── 테스트 5: name 비어있고 url 도 빈 문자열 → "Imported credential" ──────
    //
    // `url::Url::parse` 는 대부분의 문자열에서 host 를 추출하므로,
    // 실제로 host = None 이 되는 케이스는 url 자체가 빈 문자열인 경우다.
    // (csv_google 은 빈 url 행도 warnings.empty_url 로 기록하고 통과시킨다.)

    #[test]
    fn name_fallback_to_default() {
        let domains = default_domains();
        let parsed = make_parsed(vec![make_row(
            Some(""), // name 비어있음
            "",       // url 도 비어있음 → host = None
            None,
            "somepassword",
            None,
        )]);

        let results = rows_to_detected(parsed, &opts_with_domains(&domains));
        assert_eq!(
            results[0].name, "Imported credential",
            "name 과 url 모두 비어있을 때 기본 fallback 이어야 함"
        );
    }

    // ── 테스트 6: scheme 없는 url → https:// 보정 후 host 추출 ───────────────

    #[test]
    fn protocol_added_when_missing() {
        let domains = default_domains();
        let parsed = make_parsed(vec![make_row(
            Some("GitHub no-scheme"),
            "github.com/foo/bar",
            None,
            "pass1234",
            None,
        )]);

        let results = rows_to_detected(parsed, &opts_with_domains(&domains));
        assert_eq!(
            results[0].host.as_deref(),
            Some("github.com"),
            "scheme 없는 URL 에서 host 가 추출되어야 함"
        );
        assert_eq!(
            results[0].matched_issuer_slug.as_deref(),
            Some("github"),
            "scheme 없는 URL 도 issuer 매칭되어야 함"
        );
    }

    // ── 테스트 7: Edge format (name = None) + 정상 url → name = host ─────────

    #[test]
    fn edge_format_no_name_uses_host() {
        let mut domains = default_domains();
        domains.push(("stripe".to_owned(), vec!["stripe.com".to_owned()]));

        // Edge 포맷은 name = None
        let parsed = ParseResult {
            format: CsvFormat::Edge,
            rows: vec![ImportedRow {
                name: None,
                url: "https://stripe.com/dashboard".to_owned(),
                username: Some("user@example.com".to_owned()),
                password: SecretBox::new(Box::new("pass5678".to_owned())),
                note: None,
            }],
            warnings: ImportWarnings::default(),
        };

        let results = rows_to_detected(parsed, &opts_with_domains(&domains));
        assert_eq!(
            results[0].name, "stripe.com",
            "Edge format (name=None) 일 때 host 로 fallback 되어야 함"
        );
    }

    // ── 테스트 8: note 보존 ───────────────────────────────────────────────────

    #[test]
    fn note_preserved() {
        let domains = default_domains();
        let parsed = make_parsed(vec![make_row(
            Some("GitHub"),
            "https://github.com",
            Some("dev_user"),
            "ghp_secret",
            Some("personal access token"),
        )]);

        let results = rows_to_detected(parsed, &opts_with_domains(&domains));
        assert_eq!(
            results[0].note.as_deref(),
            Some("personal access token"),
            "note 가 그대로 전달되어야 함"
        );
    }

    // ── 테스트 9: value_hint — 마지막 4자 ──────────────────────────────────

    #[test]
    fn value_hint_is_last_four_chars() {
        let domains: Vec<(String, Vec<String>)> = vec![];
        let parsed = make_parsed(vec![make_row(
            Some("Any"),
            "https://example.com",
            None,
            "abcdefgh",
            None,
        )]);

        let results = rows_to_detected(parsed, &opts_with_domains(&domains));
        assert_eq!(results[0].value_hint, "efgh");
    }

    // ── 테스트 10: value 가 SecretBox 로 유지됨 ───────────────────────────────

    #[test]
    fn value_is_secret_box() {
        let domains: Vec<(String, Vec<String>)> = vec![];
        let parsed = make_parsed(vec![make_row(
            Some("Any"),
            "https://example.com",
            None,
            "supersecret",
            None,
        )]);

        let results = rows_to_detected(parsed, &opts_with_domains(&domains));
        assert_eq!(results[0].value.expose_secret(), "supersecret");
    }
}
