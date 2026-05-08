//! DTO → `Incident` 변환 헬퍼.
//!
//! NVD / GHSA / RSS 세 소스의 DTO를 공통 `Incident` 도메인 모델로 정규화한다.
//! 이 모듈은 I/O 없이 순수 변환만 수행하므로 단위 테스트가 용이하다.

use std::collections::HashMap;

use secretbank_core::id::{IncidentId, IssuerId};
use secretbank_core::models::incident::{Incident, IncidentSeverity, IncidentSource};
use secretbank_core::models::issuer::Issuer;
use secretbank_feeds::{GhsaAdvisory, HibpBreach, NvdCve, RssEntry};
use time::OffsetDateTime;

// ---------------------------------------------------------------------------
// Issuer 인덱스 빌더
// ---------------------------------------------------------------------------

/// `slug(lowercase) → IssuerId` 해시맵을 생성한다.
///
/// RSS 소스 슬러그를 Issuer 테이블의 IssuerId 로 resolve 할 때 사용한다.
pub fn build_issuer_index(issuers: &[Issuer]) -> HashMap<String, IssuerId> {
    let mut map = HashMap::with_capacity(issuers.len());
    for iss in issuers {
        map.insert(iss.slug.to_lowercase(), iss.id);
    }
    map
}

// ---------------------------------------------------------------------------
// Canonical slug 매핑
// ---------------------------------------------------------------------------

/// RSS 소스 슬러그를 Issuer 테이블 슬러그로 정규화한다.
///
/// RSS 프리셋의 슬러그가 DB 에 저장된 Issuer 슬러그와 다를 때만 여기에 추가한다.
/// 대부분은 동일하므로 패스스루 arm(`s => s`)로 처리한다.
pub fn canonical_source_slug(src: &str) -> &str {
    match src {
        "gcp" => "google",
        s => s,
    }
}

// ---------------------------------------------------------------------------
// CVSS severity 문자열 → IncidentSeverity
// ---------------------------------------------------------------------------

fn map_cvss_severity(s: Option<&str>) -> IncidentSeverity {
    match s.map(|v| v.to_uppercase()).as_deref() {
        Some("CRITICAL") => IncidentSeverity::Critical,
        Some("HIGH") => IncidentSeverity::High,
        Some("MEDIUM") => IncidentSeverity::Medium,
        Some("LOW") => IncidentSeverity::Low,
        _ => IncidentSeverity::Info,
    }
}

fn map_severity_string(s: &str) -> IncidentSeverity {
    match s.to_lowercase().as_str() {
        "critical" => IncidentSeverity::Critical,
        "high" => IncidentSeverity::High,
        "medium" => IncidentSeverity::Medium,
        "low" => IncidentSeverity::Low,
        _ => IncidentSeverity::Info,
    }
}

// ---------------------------------------------------------------------------
// NVD → Incident
// ---------------------------------------------------------------------------

/// `NvdCve` DTO 를 `Incident` 도메인 모델로 변환한다.
///
/// - `issuer_id` = None (NVD 는 issuer 를 직접 파악 불가 — matcher 가 사후 연결)
/// - `source_id` = cve.id (e.g. "CVE-2026-12345")
/// - `severity` = baseSeverity 문자열 매핑
pub fn normalize_nvd(cve: &NvdCve, now: OffsetDateTime) -> Incident {
    Incident {
        id: IncidentId::new(),
        source: IncidentSource::Nvd,
        source_id: cve.id.clone(),
        issuer_id: None,
        severity: map_cvss_severity(cve.base_severity.as_deref()),
        title: cve.id.clone(),
        body: cve.description_en.clone(),
        url: cve.references.first().cloned(),
        domain: None,
        detected_at: now,
        published_at: Some(cve.published),
    }
}

// ---------------------------------------------------------------------------
// GHSA → Incident
// ---------------------------------------------------------------------------

/// `GhsaAdvisory` DTO 를 `Incident` 도메인 모델로 변환한다.
///
/// - `issuer_id` = None (matcher 가 사후 연결)
/// - `source_id` = ghsa_id
pub fn normalize_ghsa(adv: &GhsaAdvisory, now: OffsetDateTime) -> Incident {
    Incident {
        id: IncidentId::new(),
        source: IncidentSource::Ghsa,
        source_id: adv.ghsa_id.clone(),
        issuer_id: None,
        severity: map_severity_string(&adv.severity),
        title: adv.summary.clone(),
        body: adv.description.clone(),
        url: Some(adv.html_url.clone()),
        domain: None,
        detected_at: now,
        published_at: Some(adv.published_at),
    }
}

// ---------------------------------------------------------------------------
// HIBP Breach → Incident
// ---------------------------------------------------------------------------

/// `HibpBreach` DTO 를 `Incident` 도메인 모델로 변환한다.
///
/// - `source_id` = `breach.name` (HIBP 카탈로그 고유키, e.g. `"Adobe"`)
/// - `issuer_id` = None (도메인 매칭은 2-2A-3 에서 추가 예정)
/// - `severity` 계층 매핑:
///   - `is_malware` → Critical
///   - `is_stealer_log == Some(true)` → Critical
///   - `is_sensitive` → High
///   - `is_spam_list` → Low
///   - 그 외 → Medium
/// - `published_at` = `breach.added_date` (HIBP catalog 추가 시점)
/// - `url` = `disclosure_url` 우선; 없으면 HIBP 카탈로그 앵커 URL
pub fn normalize_hibp_breach(breach: &HibpBreach, now: OffsetDateTime) -> Incident {
    let severity = if breach.is_malware || breach.is_stealer_log == Some(true) {
        IncidentSeverity::Critical
    } else if breach.is_sensitive {
        IncidentSeverity::High
    } else if breach.is_spam_list {
        IncidentSeverity::Low
    } else {
        IncidentSeverity::Medium
    };

    let url = breach.disclosure_url.clone().or_else(|| {
        Some(format!(
            "https://haveibeenpwned.com/PwnedWebsites#{}",
            breach.name
        ))
    });

    Incident {
        id: IncidentId::new(),
        source: IncidentSource::Hibp,
        source_id: breach.name.clone(),
        issuer_id: None,
        severity,
        title: breach.title.clone(),
        body: Some(breach.description.clone()),
        url,
        domain: if breach.domain.is_empty() {
            None
        } else {
            Some(breach.domain.clone())
        },
        detected_at: now,
        published_at: Some(breach.added_date),
    }
}

// ---------------------------------------------------------------------------
// RSS → Incident
// ---------------------------------------------------------------------------

/// `RssEntry` DTO 를 `Incident` 도메인 모델로 변환한다.
///
/// - `issuer_id` = `index.get(canonical_source_slug(&entry.source_slug))`
/// - `severity` = Info (RSS 상태 피드는 severity 정보 없음)
/// - `published_at` = published_at 우선, 없으면 updated_at
pub fn normalize_rss(
    entry: &RssEntry,
    index: &HashMap<String, IssuerId>,
    now: OffsetDateTime,
) -> Incident {
    let canonical = canonical_source_slug(&entry.source_slug);
    let issuer_id = index.get(canonical).copied();

    Incident {
        id: IncidentId::new(),
        source: IncidentSource::Rss,
        source_id: entry.id.clone(),
        issuer_id,
        severity: IncidentSeverity::Info,
        title: entry
            .title
            .clone()
            .unwrap_or_else(|| "(no title)".to_string()),
        body: entry.summary.clone(),
        url: entry.link.clone(),
        domain: None,
        detected_at: now,
        published_at: entry.published_at.or(entry.updated_at),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use secretbank_core::id::IssuerId;
    use secretbank_core::models::issuer::Issuer;
    use secretbank_feeds::HibpBreach;
    use time::OffsetDateTime;

    fn fixed_now() -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(1_735_000_000).unwrap()
    }

    fn make_issuer(slug: &str, display: &str) -> Issuer {
        let now = fixed_now();
        Issuer {
            id: IssuerId::new(),
            slug: slug.to_string(),
            display_name: display.to_string(),
            docs_url: None,
            issue_url: None,
            status_url: None,
            security_feed_url: None,
            connector_id: None,
            icon_key: None,
            default_primary_label: None,
            default_secondary_label: None,
            domains: vec![],
            created_at: now,
            updated_at: now,
        }
    }

    fn make_nvd_cve(id: &str, severity: Option<&str>) -> NvdCve {
        NvdCve {
            id: id.to_string(),
            published: fixed_now(),
            last_modified: fixed_now(),
            vuln_status: "Analyzed".to_string(),
            description_en: Some("Test vulnerability description".to_string()),
            base_severity: severity.map(|s| s.to_string()),
            base_score: severity.map(|_| 9.8),
            cwes: vec!["CWE-79".to_string()],
            references: vec!["https://example.com/advisory".to_string()],
        }
    }

    fn make_ghsa_advisory(ghsa_id: &str, severity: &str) -> GhsaAdvisory {
        GhsaAdvisory {
            ghsa_id: ghsa_id.to_string(),
            cve_id: None,
            summary: "Test GHSA advisory".to_string(),
            description: Some("Description text".to_string()),
            severity: severity.to_string(),
            html_url: format!("https://github.com/advisories/{ghsa_id}"),
            published_at: fixed_now(),
            updated_at: fixed_now(),
            withdrawn_at: None,
            cvss_v3_score: None,
            cvss_v3_vector: None,
            cwe_ids: vec![],
            references: vec![],
            advisory_type: "reviewed".to_string(),
        }
    }

    fn make_rss_entry(source_slug: &str, id: &str) -> RssEntry {
        RssEntry {
            source_slug: source_slug.to_string(),
            id: id.to_string(),
            title: Some("Service disruption".to_string()),
            summary: Some("Some services are experiencing issues".to_string()),
            link: Some(format!("https://{source_slug}.com/incident/1")),
            published_at: Some(fixed_now()),
            updated_at: None,
        }
    }

    // -----------------------------------------------------------------------
    // Test 5: normalize_nvd 기본 매핑
    // -----------------------------------------------------------------------
    #[test]
    fn test_normalize_nvd_basic() {
        let cve = make_nvd_cve("CVE-2026-12345", Some("CRITICAL"));
        let now = fixed_now();
        let incident = normalize_nvd(&cve, now);

        assert_eq!(incident.source, IncidentSource::Nvd);
        assert_eq!(incident.source_id, "CVE-2026-12345");
        assert_eq!(incident.title, "CVE-2026-12345");
        assert!(incident.issuer_id.is_none());
        assert_eq!(incident.severity, IncidentSeverity::Critical);
        assert_eq!(incident.detected_at, now);
        assert_eq!(incident.published_at, Some(cve.published));
        assert_eq!(
            incident.url.as_deref(),
            Some("https://example.com/advisory")
        );
        assert!(incident.domain.is_none());
    }

    // -----------------------------------------------------------------------
    // Test 6: base_severity = None → Info
    // -----------------------------------------------------------------------
    #[test]
    fn test_normalize_nvd_severity_unknown_maps_to_info() {
        let cve = make_nvd_cve("CVE-2026-00000", None);
        let incident = normalize_nvd(&cve, fixed_now());
        assert_eq!(incident.severity, IncidentSeverity::Info);
    }

    // -----------------------------------------------------------------------
    // Test 7: normalize_ghsa 기본 매핑
    // -----------------------------------------------------------------------
    #[test]
    fn test_normalize_ghsa_basic() {
        let adv = make_ghsa_advisory("GHSA-1234-5678-abcd", "high");
        let now = fixed_now();
        let incident = normalize_ghsa(&adv, now);

        assert_eq!(incident.source, IncidentSource::Ghsa);
        assert_eq!(incident.source_id, "GHSA-1234-5678-abcd");
        assert!(incident.issuer_id.is_none());
        assert_eq!(incident.severity, IncidentSeverity::High);
        assert_eq!(incident.title, "Test GHSA advisory");
        assert_eq!(
            incident.url.as_deref(),
            Some("https://github.com/advisories/GHSA-1234-5678-abcd")
        );
        assert_eq!(incident.detected_at, now);
        assert_eq!(incident.published_at, Some(adv.published_at));
        assert!(incident.domain.is_none());
    }

    // -----------------------------------------------------------------------
    // Test 8: RSS - index 에 있는 slug → issuer_id resolved
    // -----------------------------------------------------------------------
    #[test]
    fn test_normalize_rss_resolves_issuer_via_index() {
        let openai = make_issuer("openai", "OpenAI");
        let index = build_issuer_index(std::slice::from_ref(&openai));

        let entry = make_rss_entry("openai", "entry-001");
        let incident = normalize_rss(&entry, &index, fixed_now());

        assert_eq!(incident.source, IncidentSource::Rss);
        assert_eq!(incident.issuer_id, Some(openai.id));
        assert!(incident.domain.is_none());
    }

    // -----------------------------------------------------------------------
    // Test 9: RSS - gcp 슬러그 → google issuer 로 resolve
    // -----------------------------------------------------------------------
    #[test]
    fn test_normalize_rss_canonical_slug_gcp_to_google() {
        let google = make_issuer("google", "Google Cloud");
        let index = build_issuer_index(std::slice::from_ref(&google));

        let entry = make_rss_entry("gcp", "gcp-entry-001");
        let incident = normalize_rss(&entry, &index, fixed_now());

        assert_eq!(incident.issuer_id, Some(google.id));
    }

    // -----------------------------------------------------------------------
    // Test 10: RSS - index 에 없는 slug → issuer_id = None
    // -----------------------------------------------------------------------
    #[test]
    fn test_normalize_rss_unknown_slug_leaves_issuer_id_none() {
        let openai = make_issuer("openai", "OpenAI");
        let index = build_issuer_index(&[openai]);

        let entry = make_rss_entry("unknown-service", "entry-002");
        let incident = normalize_rss(&entry, &index, fixed_now());

        assert!(incident.issuer_id.is_none());
    }

    // -----------------------------------------------------------------------
    // Test 11: canonical_source_slug("gcp") → "google"
    // -----------------------------------------------------------------------
    #[test]
    fn test_canonical_source_slug_gcp_to_google() {
        assert_eq!(canonical_source_slug("gcp"), "google");
    }

    // -----------------------------------------------------------------------
    // Test 12: canonical_source_slug 패스스루 ("stripe" → "stripe")
    // -----------------------------------------------------------------------
    #[test]
    fn test_canonical_source_slug_passthrough() {
        assert_eq!(canonical_source_slug("stripe"), "stripe");
        assert_eq!(canonical_source_slug("github"), "github");
        assert_eq!(canonical_source_slug("openai"), "openai");
    }

    // -----------------------------------------------------------------------
    // Test 13: build_issuer_index 는 slug 를 lowercase 로 저장한다
    // -----------------------------------------------------------------------
    #[test]
    fn test_build_issuer_index_lowercases_slug() {
        let issuer = Issuer {
            id: IssuerId::new(),
            slug: "OpenAI".to_string(),
            display_name: "OpenAI".to_string(),
            docs_url: None,
            issue_url: None,
            status_url: None,
            security_feed_url: None,
            connector_id: None,
            icon_key: None,
            default_primary_label: None,
            default_secondary_label: None,
            domains: vec![],
            created_at: fixed_now(),
            updated_at: fixed_now(),
        };
        let index = build_issuer_index(std::slice::from_ref(&issuer));

        // lowercase 키로 조회 가능
        assert!(index.contains_key("openai"));
        // 원본 대소문자 키는 없음
        assert!(!index.contains_key("OpenAI"));
        assert_eq!(index["openai"], issuer.id);
    }

    // -----------------------------------------------------------------------
    // RSS title absent → "(no title)"
    // -----------------------------------------------------------------------
    #[test]
    fn test_normalize_rss_no_title_uses_fallback() {
        let entry = RssEntry {
            source_slug: "stripe".to_string(),
            id: "entry-no-title".to_string(),
            title: None,
            summary: None,
            link: None,
            published_at: None,
            updated_at: Some(fixed_now()),
        };
        let index = HashMap::new();
        let incident = normalize_rss(&entry, &index, fixed_now());
        assert_eq!(incident.title, "(no title)");
        // published_at 없으면 updated_at fallback
        assert_eq!(incident.published_at, Some(fixed_now()));
    }

    // -----------------------------------------------------------------------
    // HIBP helpers + tests
    // -----------------------------------------------------------------------

    fn make_hibp_breach(
        name: &str,
        is_malware: bool,
        is_sensitive: bool,
        is_stealer_log: Option<bool>,
        is_spam_list: bool,
        disclosure_url: Option<&str>,
    ) -> HibpBreach {
        HibpBreach {
            name: name.to_string(),
            title: format!("{name} Breach"),
            domain: format!("{}.com", name.to_lowercase()),
            breach_date: "2023-01-01".to_string(),
            added_date: fixed_now(),
            modified_date: fixed_now(),
            pwn_count: 100_000,
            description: "Test breach description.".to_string(),
            data_classes: vec!["Email addresses".to_string(), "Passwords".to_string()],
            is_verified: true,
            is_fabricated: false,
            is_sensitive,
            is_retired: false,
            is_spam_list,
            is_malware,
            is_subscription_free: false,
            is_stealer_log,
            logo_path: None,
            attribution: None,
            disclosure_url: disclosure_url.map(|s| s.to_string()),
        }
    }

    #[test]
    fn test_normalize_hibp_breach_basic() {
        let breach = make_hibp_breach("Adobe", false, false, Some(false), false, None);
        let now = fixed_now();
        let incident = normalize_hibp_breach(&breach, now);

        assert_eq!(incident.source, IncidentSource::Hibp);
        assert_eq!(incident.source_id, "Adobe");
        assert_eq!(incident.title, "Adobe Breach");
        assert_eq!(incident.severity, IncidentSeverity::Medium);
        assert!(incident.issuer_id.is_none());
        assert_eq!(incident.detected_at, now);
        assert_eq!(incident.published_at, Some(breach.added_date));
        assert_eq!(
            incident.url.as_deref(),
            Some("https://haveibeenpwned.com/PwnedWebsites#Adobe")
        );
        // domain = "adobe.com" (fixture의 format!("{}.com", name.to_lowercase()))
        assert_eq!(incident.domain.as_deref(), Some("adobe.com"));
    }

    #[test]
    fn test_normalize_hibp_breach_malware_critical() {
        let breach = make_hibp_breach("MalwareTest", true, false, None, false, None);
        let incident = normalize_hibp_breach(&breach, fixed_now());
        assert_eq!(incident.severity, IncidentSeverity::Critical);
    }

    #[test]
    fn test_normalize_hibp_breach_stealer_log_critical() {
        let breach = make_hibp_breach("StealerTest", false, false, Some(true), false, None);
        let incident = normalize_hibp_breach(&breach, fixed_now());
        assert_eq!(incident.severity, IncidentSeverity::Critical);
    }

    #[test]
    fn test_normalize_hibp_breach_sensitive_high() {
        let breach = make_hibp_breach("SensitiveData", false, true, Some(false), false, None);
        let incident = normalize_hibp_breach(&breach, fixed_now());
        assert_eq!(incident.severity, IncidentSeverity::High);
    }

    #[test]
    fn test_normalize_hibp_breach_spam_low() {
        let breach = make_hibp_breach("SpamList", false, false, Some(false), true, None);
        let incident = normalize_hibp_breach(&breach, fixed_now());
        assert_eq!(incident.severity, IncidentSeverity::Low);
    }

    #[test]
    fn test_normalize_hibp_breach_disclosure_url_preferred() {
        let breach = make_hibp_breach(
            "Vercel",
            false,
            false,
            None,
            false,
            Some("https://disclosure.example/vercel"),
        );
        let incident = normalize_hibp_breach(&breach, fixed_now());
        assert_eq!(
            incident.url.as_deref(),
            Some("https://disclosure.example/vercel")
        );
    }

    #[test]
    fn test_normalize_hibp_breach_default_url_fallback() {
        let breach = make_hibp_breach("LinkedIn", false, false, None, false, None);
        let incident = normalize_hibp_breach(&breach, fixed_now());
        assert_eq!(
            incident.url.as_deref(),
            Some("https://haveibeenpwned.com/PwnedWebsites#LinkedIn")
        );
    }

    // GHSA severity 매핑 추가 케이스
    #[test]
    fn test_normalize_ghsa_severity_unknown_maps_to_info() {
        let adv = make_ghsa_advisory("GHSA-0000-0000-0000", "unknown");
        let incident = normalize_ghsa(&adv, fixed_now());
        assert_eq!(incident.severity, IncidentSeverity::Info);
    }

    #[test]
    fn test_normalize_ghsa_severity_critical() {
        let adv = make_ghsa_advisory("GHSA-0000-0000-0001", "critical");
        let incident = normalize_ghsa(&adv, fixed_now());
        assert_eq!(incident.severity, IncidentSeverity::Critical);
    }
}
