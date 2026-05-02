//! Package advisory model + OSV.dev client.
//!
//! OSV.dev 는 GHSA / RUSTSEC / PyPA 등을 통합한 표준 source. JSON 스키마는
//! https://ossf.github.io/osv-schema/ 참조. 우리는 secret_leak 카테고리에
//! 가중치를 둬 — `summary` / `aliases` / `references` 에 키워드 매칭으로
//! 분류.

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::ecosystem::Ecosystem;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AdvisorySeverity {
    Low,
    Medium,
    High,
    Critical,
}

impl AdvisorySeverity {
    /// CVSS v3 score → 우리 카테고리.
    pub fn from_cvss(score: f32) -> Self {
        if score >= 9.0 {
            Self::Critical
        } else if score >= 7.0 {
            Self::High
        } else if score >= 4.0 {
            Self::Medium
        } else {
            Self::Low
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AdvisoryCategory {
    /// 패키지가 .env / process.env / 키체인 / 토큰 자료를 외부로 송신.
    /// 우리 도메인의 1차 관심.
    SecretLeak,
    /// 약한 KDF / MAC / 자체 구현 crypto.
    CryptoWeak,
    /// Typosquat / dependency confusion / hijack.
    SupplyChain,
    /// 위 셋에 안 들어가는 일반 보안 이슈.
    Other,
}

impl AdvisoryCategory {
    /// 텍스트 시그널 (summary + details + aliases) 에서 카테고리 추론.
    /// 매우 보수적 키워드 — false positive 보다 false negative 우선.
    pub fn from_text_signals(text: &str) -> Self {
        let lc = text.to_ascii_lowercase();
        // secret leak 신호 — env / token / credential 외부 송신
        // 보수적 — "leak" 단독은 false-positive (memory leak 등) 너무 많아
        // 빼고 secret/credential 도메인에 한정.
        const SECRET_KEYWORDS: &[&str] = &[
            "credential",
            "credentials",
            "secret",
            "exfiltrat",
            "exfil",
            "stealer",
            "credential theft",
            "token theft",
            "process.env",
            ".env file",
            "env variables",
            "api key leak",
            "api-key leak",
            "token leak",
            "credential leak",
            "secret leak",
        ];
        const SUPPLY_KEYWORDS: &[&str] = &[
            "typosquat",
            "supply chain",
            "supply-chain",
            "hijack",
            "compromise",
            "malicious package",
            "backdoor",
            "dependency confusion",
        ];
        const CRYPTO_KEYWORDS: &[&str] = &[
            "weak crypto",
            "weak hash",
            "md5",
            "sha1",
            "rc4",
            "ecb mode",
            "predictable",
            "static iv",
            "non-constant time",
        ];

        if SECRET_KEYWORDS.iter().any(|k| lc.contains(k)) {
            Self::SecretLeak
        } else if SUPPLY_KEYWORDS.iter().any(|k| lc.contains(k)) {
            Self::SupplyChain
        } else if CRYPTO_KEYWORDS.iter().any(|k| lc.contains(k)) {
            Self::CryptoWeak
        } else {
            Self::Other
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageAdvisory {
    pub source: String,    // "osv" / "ghsa" / "manual"
    pub source_id: String, // e.g. "GHSA-abcd-1234-5678"
    pub package_name: String,
    pub ecosystem: Ecosystem,
    pub severity: AdvisorySeverity,
    pub category: AdvisoryCategory,
    pub summary: String,
    pub detail: Option<String>,
    pub affected_range: Option<String>,
    pub published_at_ms: i64,
    pub modified_at_ms: i64,
    pub references: Vec<String>,
}

// ---------------------------------------------------------------------------
// OSV.dev client
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum OsvClientError {
    #[error("osv http: {0}")]
    Http(String),
    #[error("osv decode: {0}")]
    Decode(String),
}

/// 가벼운 OSV.dev v1 query 클라이언트.
/// 엔드포인트: POST https://api.osv.dev/v1/query
pub struct OsvClient {
    base_url: String,
    http: reqwest::Client,
}

impl OsvClient {
    pub fn new() -> Self {
        Self::with_base_url("https://api.osv.dev")
    }
    pub fn with_base_url(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            http: reqwest::Client::new(),
        }
    }

    /// 단일 (ecosystem, package, version) 에 대한 OSV.dev advisory 조회.
    /// 빈 리스트면 advisory 0개.
    pub async fn query(
        &self,
        ecosystem: Ecosystem,
        package_name: &str,
        version: &str,
    ) -> Result<Vec<PackageAdvisory>, OsvClientError> {
        let req = serde_json::json!({
            "package": { "name": package_name, "ecosystem": ecosystem.osv_name() },
            "version": version,
        });
        let url = format!("{}/v1/query", self.base_url);
        let resp = self
            .http
            .post(&url)
            .json(&req)
            .send()
            .await
            .map_err(|e| OsvClientError::Http(e.to_string()))?;
        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| OsvClientError::Http(e.to_string()))?;
        if !status.is_success() {
            return Err(OsvClientError::Http(format!("HTTP {status}: {text}")));
        }
        let parsed: OsvQueryResponse = serde_json::from_str(&text)
            .map_err(|e| OsvClientError::Decode(format!("{e} (body: {text})")))?;
        Ok(parsed
            .vulns
            .unwrap_or_default()
            .into_iter()
            .map(|v| osv_to_advisory(v, ecosystem, package_name))
            .collect())
    }
}

impl Default for OsvClient {
    fn default() -> Self {
        Self::new()
    }
}

// OSV.dev wire format (subset).
#[derive(Debug, Deserialize)]
struct OsvQueryResponse {
    vulns: Option<Vec<OsvVuln>>,
}

#[derive(Debug, Deserialize)]
struct OsvVuln {
    id: String,
    summary: Option<String>,
    details: Option<String>,
    #[serde(default)]
    severity: Vec<OsvSeverity>,
    #[serde(default)]
    references: Vec<OsvReference>,
    #[serde(default)]
    affected: Vec<OsvAffected>,
    published: Option<String>,
    modified: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OsvSeverity {
    #[serde(rename = "type")]
    severity_type: String, // CVSS_V3 / CVSS_V2
    score: String,
}

#[derive(Debug, Deserialize)]
struct OsvReference {
    url: String,
}

#[derive(Debug, Deserialize)]
struct OsvAffected {
    #[serde(default)]
    ranges: Vec<OsvRange>,
}

#[derive(Debug, Deserialize)]
struct OsvRange {
    #[serde(default)]
    events: Vec<OsvEvent>,
}

#[derive(Debug, Deserialize)]
struct OsvEvent {
    introduced: Option<String>,
    fixed: Option<String>,
}

fn osv_to_advisory(v: OsvVuln, ecosystem: Ecosystem, package_name: &str) -> PackageAdvisory {
    let summary = v.summary.unwrap_or_else(|| v.id.clone());
    let detail = v.details;
    let combined = format!("{summary} {}", detail.clone().unwrap_or_default());
    let category = AdvisoryCategory::from_text_signals(&combined);

    let severity = v
        .severity
        .iter()
        .find(|s| s.severity_type.starts_with("CVSS"))
        .and_then(|s| extract_cvss_score(&s.score))
        .map(AdvisorySeverity::from_cvss)
        .unwrap_or(AdvisorySeverity::Medium);

    let affected_range = first_range_label(&v.affected);

    PackageAdvisory {
        source: "osv".into(),
        source_id: v.id,
        package_name: package_name.to_owned(),
        ecosystem,
        severity,
        category,
        summary,
        detail,
        affected_range,
        published_at_ms: parse_iso_to_ms(v.published.as_deref()).unwrap_or(0),
        modified_at_ms: parse_iso_to_ms(v.modified.as_deref()).unwrap_or(0),
        references: v.references.into_iter().map(|r| r.url).collect(),
    }
}

fn extract_cvss_score(vector: &str) -> Option<f32> {
    // CVSS vector strings: "CVSS:3.1/AV:N/AC:L/.../I:H/A:N" — base score 가
    // 별도 필드로 안 옴. 단순 파서: vector 끝에 "/B:7.5" 같은 포맷이 가끔
    // 있는 경우만. 실제로 OSV 는 vector string 만 주는 경우가 많아 fallback
    // 으로 medium 처리.
    vector
        .split('/')
        .filter_map(|p| p.strip_prefix("score=").or_else(|| p.strip_prefix("B:")))
        .filter_map(|s| s.parse::<f32>().ok())
        .next()
}

fn first_range_label(affected: &[OsvAffected]) -> Option<String> {
    let r = affected.iter().flat_map(|a| a.ranges.iter()).next()?;
    let intro = r.events.iter().find_map(|e| e.introduced.clone());
    let fixed = r.events.iter().find_map(|e| e.fixed.clone());
    Some(format!(
        ">={} <{}",
        intro.unwrap_or_else(|| "0".into()),
        fixed.unwrap_or_else(|| "*".into())
    ))
}

fn parse_iso_to_ms(iso: Option<&str>) -> Option<i64> {
    iso.map(|s| {
        // 매우 단순한 RFC3339 → ms 변환 (full chrono dep 회피).
        // 실패 시 0 — UI 가 fallback 표시.
        time::OffsetDateTime::parse(s, &time::format_description::well_known::Rfc3339)
            .map(|d| d.unix_timestamp() * 1000)
            .unwrap_or(0)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn severity_from_cvss_thresholds() {
        assert_eq!(AdvisorySeverity::from_cvss(9.5), AdvisorySeverity::Critical);
        assert_eq!(AdvisorySeverity::from_cvss(7.0), AdvisorySeverity::High);
        assert_eq!(AdvisorySeverity::from_cvss(5.5), AdvisorySeverity::Medium);
        assert_eq!(AdvisorySeverity::from_cvss(2.0), AdvisorySeverity::Low);
    }

    #[test]
    fn category_secret_leak_detected_from_keywords() {
        let txt = "Package exfiltrates process.env credentials to a remote server";
        assert_eq!(
            AdvisoryCategory::from_text_signals(txt),
            AdvisoryCategory::SecretLeak
        );
    }

    #[test]
    fn category_supply_chain_detected() {
        let txt = "Typosquat package mimicking lodash";
        assert_eq!(
            AdvisoryCategory::from_text_signals(txt),
            AdvisoryCategory::SupplyChain
        );
    }

    #[test]
    fn category_crypto_weak_detected() {
        let txt = "Uses MD5 for password hashing";
        assert_eq!(
            AdvisoryCategory::from_text_signals(txt),
            AdvisoryCategory::CryptoWeak
        );
    }

    #[test]
    fn category_other_when_no_keywords_match() {
        let txt = "Memory leak in long-running connections";
        assert_eq!(
            AdvisoryCategory::from_text_signals(txt),
            AdvisoryCategory::Other
        );
    }

    #[tokio::test]
    async fn osv_query_parses_response() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/query"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "vulns": [{
                    "id": "GHSA-test-0001",
                    "summary": "Token exfiltration in malicious-pkg",
                    "details": "Sends process.env to external server",
                    "severity": [{ "type": "CVSS_V3", "score": "B:9.1" }],
                    "references": [{ "url": "https://github.com/test/test" }],
                    "affected": [{
                        "ranges": [{
                            "events": [
                                { "introduced": "0" },
                                { "fixed": "1.0.4" }
                            ]
                        }]
                    }],
                    "published": "2024-01-15T00:00:00Z",
                    "modified": "2024-02-01T00:00:00Z"
                }]
            })))
            .mount(&server)
            .await;
        let cli = OsvClient::with_base_url(server.uri());
        let advs = cli
            .query(Ecosystem::Npm, "malicious-pkg", "1.0.3")
            .await
            .unwrap();
        assert_eq!(advs.len(), 1);
        let a = &advs[0];
        assert_eq!(a.source_id, "GHSA-test-0001");
        assert_eq!(a.severity, AdvisorySeverity::Critical);
        assert_eq!(a.category, AdvisoryCategory::SecretLeak); // "exfiltration" + "process.env"
        assert_eq!(a.affected_range.as_deref(), Some(">=0 <1.0.4"));
    }

    #[tokio::test]
    async fn osv_query_handles_empty_vulns() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/query"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;
        let cli = OsvClient::with_base_url(server.uri());
        let advs = cli
            .query(Ecosystem::Npm, "safe-pkg", "2.0.0")
            .await
            .unwrap();
        assert!(advs.is_empty());
    }

    #[tokio::test]
    async fn osv_query_returns_http_error_on_5xx() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/query"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&server)
            .await;
        let cli = OsvClient::with_base_url(server.uri());
        let err = cli.query(Ecosystem::Npm, "x", "1.0").await.unwrap_err();
        assert!(matches!(err, OsvClientError::Http(_)));
    }
}
