use std::collections::HashMap;

use api_vault_core::id::{CredentialId, IncidentMatchId};
use api_vault_core::models::credential::Credential;
use api_vault_core::models::incident::{Incident, IncidentMatch, MatchReason};
use api_vault_core::models::issuer::Issuer;
use time::OffsetDateTime;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIDENCE_THRESHOLD: f32 = 0.3;
const CONFIDENCE_ISSUER_MATCH: f32 = 1.0;
const CONFIDENCE_DOMAIN: f32 = 0.9;
const CONFIDENCE_KEYWORD: f32 = 0.6;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Matches an incident against credentials using issuer_id + domain + keyword heuristics.
///
/// Rules:
/// 1. If `incident.issuer_id` is Some(id), every credential with
///    `credential.issuer_id == id` produces an `IncidentMatch` with
///    `reason = IssuerMatch` and confidence 1.0.
/// 2. If `incident.domain` is Some, match against:
///    (a) `issuer.domains[]` — subdomain-safe host matching
///    (b) `credential.url` host — subdomain-safe host matching
///    Produces `reason = Domain` and confidence 0.9.
/// 3. For every issuer whose `display_name` or `slug` appears
///    (case-insensitive substring) in `incident.title` or `incident.body`,
///    credentials belonging to that issuer produce an `IncidentMatch` with
///    `reason = Keyword` and confidence 0.6.
///    `slug` must be >= 3 chars to avoid false positives.
/// 4. Per-credential dedupe: higher-confidence rule wins (IssuerMatch > Domain > Keyword).
/// 5. Matches with confidence < CONFIDENCE_THRESHOLD are dropped.
///
/// Returns results ordered by (reason discriminant, credential_id string).
pub fn match_incident(
    incident: &Incident,
    credentials: &[Credential],
    issuers: &[Issuer],
) -> Vec<IncidentMatch> {
    match_incident_at(incident, credentials, issuers, OffsetDateTime::now_utc())
}

/// Same as `match_incident` but accepts an explicit `now` timestamp for
/// deterministic tests.
pub fn match_incident_at(
    incident: &Incident,
    credentials: &[Credential],
    issuers: &[Issuer],
    now: OffsetDateTime,
) -> Vec<IncidentMatch> {
    // (credential_id) -> (reason, confidence)
    let mut selections: HashMap<CredentialId, (MatchReason, f32)> = HashMap::new();

    // Rule 1: exact issuer_id match
    if let Some(iid) = incident.issuer_id {
        for cred in credentials.iter().filter(|c| c.issuer_id == iid) {
            selections.insert(cred.id, (MatchReason::IssuerMatch, CONFIDENCE_ISSUER_MATCH));
        }
    }

    // Rule 2: domain match (incident.domain ↔ issuer.domains[] OR credential.url host)
    if let Some(inc_domain) = incident.domain.as_deref() {
        let inc_domain_lower = inc_domain.to_lowercase();
        let inc_domain_norm = inc_domain_lower
            .strip_prefix("www.")
            .unwrap_or(&inc_domain_lower);

        // (a) issuer.domains[] matching
        for issuer in issuers {
            let issuer_match = issuer.domains.iter().any(|d| {
                host_matches_domain(inc_domain_norm, d) || host_matches_domain(d, inc_domain_norm)
            });
            if issuer_match {
                for cred in credentials.iter().filter(|c| c.issuer_id == issuer.id) {
                    selections
                        .entry(cred.id)
                        .or_insert((MatchReason::Domain, CONFIDENCE_DOMAIN));
                }
            }
        }

        // (b) credential.url host matching
        for cred in credentials {
            if let Some(url) = cred.url.as_deref() {
                if let Some(host) = extract_host(url) {
                    if host_matches_domain(&host, inc_domain_norm) {
                        selections
                            .entry(cred.id)
                            .or_insert((MatchReason::Domain, CONFIDENCE_DOMAIN));
                    }
                }
            }
        }
    }

    // Rule 3: keyword match on title + body
    let haystack = {
        let body_part = incident.body.as_deref().unwrap_or("");
        format!("{} {}", incident.title, body_part).to_lowercase()
    };

    for issuer in issuers {
        let slug_lower = issuer.slug.to_lowercase();
        let display_lower = issuer.display_name.to_lowercase();

        let matches_slug = slug_lower.len() >= 3 && haystack.contains(slug_lower.as_str());
        let matches_display =
            !display_lower.is_empty() && haystack.contains(display_lower.as_str());

        if matches_slug || matches_display {
            for cred in credentials.iter().filter(|c| c.issuer_id == issuer.id) {
                // IssuerMatch (1.0) beats Keyword (0.6) — do not overwrite
                selections
                    .entry(cred.id)
                    .or_insert((MatchReason::Keyword, CONFIDENCE_KEYWORD));
            }
        }
    }

    // Filter by threshold, build IncidentMatch, sort deterministically
    let mut results: Vec<IncidentMatch> = selections
        .into_iter()
        .filter(|(_, (_, conf))| *conf >= CONFIDENCE_THRESHOLD)
        .map(|(cred_id, (reason, _conf))| IncidentMatch {
            id: IncidentMatchId::new(),
            incident_id: incident.id,
            credential_id: cred_id,
            reason,
            matched_at: now,
            dismissed_at: None,
        })
        .collect();

    // Deterministic sort: IssuerMatch (0) before Keyword (1), then credential_id string
    results.sort_by_key(|m| (reason_ord(m.reason), m.credential_id.to_string()));
    results
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn reason_ord(r: MatchReason) -> u8 {
    match r {
        MatchReason::IssuerMatch => 0,
        MatchReason::Domain => 1,
        MatchReason::Keyword => 2,
        MatchReason::Explicit => 3,
    }
}

/// Extract the bare hostname from a raw URL string, stripping the `www.` prefix.
///
/// Handles both full URLs ("https://www.stripe.com/path") and protocol-less
/// strings ("vercel.com/foo") by prepending `https://` if parsing fails.
fn extract_host(raw_url: &str) -> Option<String> {
    let parsed = url::Url::parse(raw_url)
        .or_else(|_| url::Url::parse(&format!("https://{raw_url}")))
        .ok()?;
    parsed.host_str().map(|h| {
        let lower = h.to_lowercase();
        lower
            .strip_prefix("www.")
            .map(str::to_owned)
            .unwrap_or(lower)
    })
}

/// Returns true when `host` equals `domain` or is a proper subdomain of `domain`.
///
/// Both sides are lowercased before comparison. The `www.` prefix is **not**
/// stripped here — callers are expected to normalize both arguments first.
///
/// Examples that return `true`:
///   - `("openai.com", "openai.com")`
///   - `("platform.openai.com", "openai.com")`
///
/// Examples that return `false` (attack vectors blocked):
///   - `("evil-openai.com", "openai.com")`
///   - `("openai.com.attacker.io", "openai.com")`
fn host_matches_domain(host: &str, domain: &str) -> bool {
    let host = host.to_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host);
    let domain = domain.to_lowercase();
    host == domain || host.ends_with(&format!(".{domain}"))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use api_vault_core::id::{CredentialId, IncidentId, IssuerId};
    use api_vault_core::models::credential::{Credential, CredentialStatus, Env};
    use api_vault_core::models::incident::{
        Incident, IncidentSeverity, IncidentSource, MatchReason,
    };
    use api_vault_core::models::issuer::Issuer;
    use time::OffsetDateTime;

    // -----------------------------------------------------------------------
    // Fixture helpers
    // -----------------------------------------------------------------------

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

    fn make_credential(issuer: &Issuer, name: &str) -> Credential {
        make_credential_with_url(issuer, name, None)
    }

    fn make_credential_with_url(issuer: &Issuer, name: &str, url: Option<&str>) -> Credential {
        let now = fixed_now();
        Credential {
            id: CredentialId::new(),
            issuer_id: issuer.id,
            name: name.to_string(),
            env: Env::Prod,
            scope: None,
            vault_ref: format!("credentials/{}", CredentialId::new()),
            created_at: now,
            last_rotated_at: None,
            expires_at: None,
            owner: None,
            rotation_policy_days: None,
            rotation_runbook_id: None,
            status: CredentialStatus::Active,
            hash_hint: None,
            kind: api_vault_core::CredentialKind::ApiKey,
            url: url.map(|s| s.to_string()),
            username: None,
            secondary_value_ref: None,
            primary_label: None,
            secondary_label: None,
        }
    }

    fn make_issuer_with_domains(slug: &str, display: &str, domains: Vec<&str>) -> Issuer {
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
            domains: domains.into_iter().map(|s| s.to_string()).collect(),
            created_at: now,
            updated_at: now,
        }
    }

    fn make_incident(
        issuer_id: Option<IssuerId>,
        title: &str,
        body: Option<&str>,
        source: IncidentSource,
    ) -> Incident {
        make_incident_with_domain(issuer_id, title, body, source, None)
    }

    fn make_incident_with_domain(
        issuer_id: Option<IssuerId>,
        title: &str,
        body: Option<&str>,
        source: IncidentSource,
        domain: Option<&str>,
    ) -> Incident {
        let now = fixed_now();
        Incident {
            id: IncidentId::new(),
            source,
            source_id: "TEST-001".to_string(),
            issuer_id,
            severity: IncidentSeverity::High,
            title: title.to_string(),
            body: body.map(|s| s.to_string()),
            url: None,
            domain: domain.map(|s| s.to_string()),
            detected_at: now,
            published_at: None,
        }
    }

    // -----------------------------------------------------------------------
    // Test 1: issuer_id exact match returns all credentials of that issuer
    // -----------------------------------------------------------------------
    #[test]
    fn test_issuer_id_match_returns_all_credentials_of_that_issuer() {
        let openai = make_issuer("openai", "OpenAI");
        let stripe = make_issuer("stripe", "Stripe");

        let cred1 = make_credential(&openai, "OpenAI Prod Key");
        let cred2 = make_credential(&openai, "OpenAI Staging Key");
        let cred3 = make_credential(&stripe, "Stripe Key");

        let incident = make_incident(
            Some(openai.id),
            "OpenAI data breach",
            None,
            IncidentSource::Nvd,
        );
        let issuers = vec![openai.clone(), stripe.clone()];
        let credentials = vec![cred1.clone(), cred2.clone(), cred3.clone()];

        let matches = match_incident_at(&incident, &credentials, &issuers, fixed_now());

        assert_eq!(matches.len(), 2, "openai 의 credential 2개만 매칭돼야 한다");
        for m in &matches {
            assert_eq!(m.reason, MatchReason::IssuerMatch);
            assert_eq!(m.incident_id, incident.id);
        }
        let matched_cred_ids: Vec<_> = matches.iter().map(|m| m.credential_id).collect();
        assert!(matched_cred_ids.contains(&cred1.id));
        assert!(matched_cred_ids.contains(&cred2.id));
        assert!(!matched_cred_ids.contains(&cred3.id));
    }

    // -----------------------------------------------------------------------
    // Test 2: issuer_id=None + no keyword → empty
    // -----------------------------------------------------------------------
    #[test]
    fn test_issuer_id_none_no_keyword_match_returns_empty() {
        let openai = make_issuer("openai", "OpenAI");
        let cred = make_credential(&openai, "OpenAI Key");
        let incident = make_incident(
            None,
            "random vulnerability report",
            None,
            IncidentSource::Rss,
        );

        let matches = match_incident_at(&incident, &[cred], &[openai], fixed_now());
        assert!(matches.is_empty());
    }

    // -----------------------------------------------------------------------
    // Test 3: keyword match via display_name substring
    // -----------------------------------------------------------------------
    #[test]
    fn test_keyword_display_name_substring_matches() {
        let github = make_issuer("github", "GitHub");
        let cred = make_credential(&github, "GitHub Token");
        let incident = make_incident(None, "GitHub API outage", None, IncidentSource::Rss);

        let matches = match_incident_at(
            &incident,
            std::slice::from_ref(&cred),
            &[github],
            fixed_now(),
        );
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].credential_id, cred.id);
        assert_eq!(matches[0].reason, MatchReason::Keyword);
    }

    // -----------------------------------------------------------------------
    // Test 4: keyword match via slug substring
    // -----------------------------------------------------------------------
    #[test]
    fn test_keyword_slug_substring_matches() {
        let stripe = make_issuer("stripe", "Stripe Payments");
        let cred = make_credential(&stripe, "Stripe Live Key");
        let incident = make_incident(
            None,
            "stripe billing issue reported",
            None,
            IncidentSource::Ghsa,
        );

        let matches = match_incident_at(
            &incident,
            std::slice::from_ref(&cred),
            &[stripe],
            fixed_now(),
        );
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].credential_id, cred.id);
        assert_eq!(matches[0].reason, MatchReason::Keyword);
    }

    // -----------------------------------------------------------------------
    // Test 5: keyword match is case-insensitive
    // -----------------------------------------------------------------------
    #[test]
    fn test_keyword_case_insensitive() {
        let openai = make_issuer("openai", "OpenAI");
        let cred = make_credential(&openai, "OpenAI Key");
        let incident = make_incident(None, "OPENAI DOWN", None, IncidentSource::Rss);

        let matches = match_incident_at(
            &incident,
            std::slice::from_ref(&cred),
            &[openai],
            fixed_now(),
        );
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].reason, MatchReason::Keyword);
    }

    // -----------------------------------------------------------------------
    // Test 6: IssuerMatch takes precedence over Keyword (no duplication)
    // -----------------------------------------------------------------------
    #[test]
    fn test_issuer_match_takes_precedence_over_keyword() {
        let github = make_issuer("github", "GitHub");
        let cred = make_credential(&github, "GitHub Token");
        // issuer_id set AND title contains "GitHub" → only IssuerMatch
        let incident = make_incident(
            Some(github.id),
            "GitHub breach detected",
            None,
            IncidentSource::Ghsa,
        );

        let matches = match_incident_at(
            &incident,
            std::slice::from_ref(&cred),
            &[github],
            fixed_now(),
        );
        assert_eq!(matches.len(), 1, "credential 이 중복 없이 1개여야 한다");
        assert_eq!(
            matches[0].reason,
            MatchReason::IssuerMatch,
            "IssuerMatch 가 우선해야 한다"
        );
    }

    // -----------------------------------------------------------------------
    // Test 7: body substring matches when title misses
    // -----------------------------------------------------------------------
    #[test]
    fn test_body_substring_matches_when_title_misses() {
        let vercel = make_issuer("vercel", "Vercel");
        let cred = make_credential(&vercel, "Vercel Deploy Token");
        let incident = make_incident(
            None,
            "Service incident report",
            Some("Affected: Vercel edge functions down"),
            IncidentSource::Rss,
        );

        let matches = match_incident_at(
            &incident,
            std::slice::from_ref(&cred),
            &[vercel],
            fixed_now(),
        );
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].credential_id, cred.id);
        assert_eq!(matches[0].reason, MatchReason::Keyword);
    }

    // -----------------------------------------------------------------------
    // Test 8: no match for unregistered issuer in keyword
    // -----------------------------------------------------------------------
    #[test]
    fn test_no_match_for_unregistered_issuer_in_keyword() {
        let stripe = make_issuer("stripe", "Stripe");
        let cred = make_credential(&stripe, "Stripe Key");
        // "twilio" 는 issuers 목록에 없음
        let incident = make_incident(
            None,
            "Twilio security advisory 2025",
            None,
            IncidentSource::Ghsa,
        );

        let matches = match_incident_at(&incident, &[cred], &[stripe], fixed_now());
        assert!(matches.is_empty());
    }

    // -----------------------------------------------------------------------
    // Test 9: multiple issuers matched simultaneously via keyword
    // -----------------------------------------------------------------------
    #[test]
    fn test_multiple_issuers_keyword_matched_simultaneously() {
        let github = make_issuer("github", "GitHub");
        let stripe = make_issuer("stripe", "Stripe");

        let cred_gh = make_credential(&github, "GitHub Token");
        let cred_st = make_credential(&stripe, "Stripe Key");

        let incident = make_incident(
            None,
            "GitHub and Stripe both pwned in supply chain attack",
            None,
            IncidentSource::Nvd,
        );
        let issuers = vec![github.clone(), stripe.clone()];
        let credentials = vec![cred_gh.clone(), cred_st.clone()];

        let matches = match_incident_at(&incident, &credentials, &issuers, fixed_now());
        assert_eq!(matches.len(), 2);
        let reasons: Vec<_> = matches.iter().map(|m| m.reason).collect();
        assert!(reasons.iter().all(|r| *r == MatchReason::Keyword));
        let cred_ids: Vec<_> = matches.iter().map(|m| m.credential_id).collect();
        assert!(cred_ids.contains(&cred_gh.id));
        assert!(cred_ids.contains(&cred_st.id));
    }

    // -----------------------------------------------------------------------
    // Test 10: empty credentials returns empty
    // -----------------------------------------------------------------------
    #[test]
    fn test_empty_credentials_returns_empty() {
        let openai = make_issuer("openai", "OpenAI");
        let incident = make_incident(
            Some(openai.id),
            "OpenAI critical breach",
            None,
            IncidentSource::Nvd,
        );

        let matches = match_incident_at(&incident, &[], &[openai], fixed_now());
        assert!(matches.is_empty());
    }

    // -----------------------------------------------------------------------
    // Test 11 (bonus): short slug (< 3 chars) is NOT matched
    // -----------------------------------------------------------------------
    #[test]
    fn test_short_slug_not_matched_to_avoid_false_positive() {
        // slug "ai" 는 2자 → 필터로 제외
        let ai_issuer = make_issuer("ai", "AI Service");
        let cred = make_credential(&ai_issuer, "AI Key");
        let incident = make_incident(None, "Quick AI news today", None, IncidentSource::Rss);

        let matches = match_incident_at(&incident, &[cred], &[ai_issuer], fixed_now());
        assert!(matches.is_empty(), "2자 슬러그는 매칭되지 않아야 한다");
    }

    // -----------------------------------------------------------------------
    // F-1: Domain match via issuer.domains[]
    // -----------------------------------------------------------------------
    #[test]
    fn test_match_incident_domain_via_issuer_domains() {
        let supabase = make_issuer_with_domains("supabase", "Supabase", vec!["supabase.com"]);
        let cred = make_credential(&supabase, "Supabase Key");
        let incident = make_incident_with_domain(
            None,
            "Data breach at a major database provider",
            None,
            IncidentSource::Hibp,
            Some("supabase.com"),
        );

        let matches = match_incident_at(
            &incident,
            std::slice::from_ref(&cred),
            &[supabase],
            fixed_now(),
        );

        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].credential_id, cred.id);
        assert_eq!(matches[0].reason, MatchReason::Domain);
    }

    // -----------------------------------------------------------------------
    // F-2: Domain match via credential.url host
    // -----------------------------------------------------------------------
    #[test]
    fn test_match_incident_domain_via_credential_url() {
        // issuer has no matching domain entry
        let other_issuer = make_issuer("acme", "Acme Corp");
        let cred = make_credential_with_url(
            &other_issuer,
            "Vercel Deploy Key",
            Some("https://vercel.com/dashboard"),
        );
        let incident = make_incident_with_domain(
            None,
            "Service disruption",
            None,
            IncidentSource::Hibp,
            Some("vercel.com"),
        );

        let matches = match_incident_at(
            &incident,
            std::slice::from_ref(&cred),
            &[other_issuer],
            fixed_now(),
        );

        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].credential_id, cred.id);
        assert_eq!(matches[0].reason, MatchReason::Domain);
    }

    // -----------------------------------------------------------------------
    // F-3: Subdomain match (platform.openai.com → openai.com)
    // -----------------------------------------------------------------------
    #[test]
    fn test_match_incident_domain_subdomain_match() {
        let openai = make_issuer("openai", "OpenAI");
        let cred = make_credential_with_url(
            &openai,
            "OpenAI API Key",
            Some("https://platform.openai.com/account"),
        );
        let incident = make_incident_with_domain(
            None,
            "OpenAI incident",
            None,
            IncidentSource::Hibp,
            Some("openai.com"),
        );

        let matches = match_incident_at(
            &incident,
            std::slice::from_ref(&cred),
            &[openai],
            fixed_now(),
        );

        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].credential_id, cred.id);
        assert_eq!(matches[0].reason, MatchReason::Domain);
    }

    // -----------------------------------------------------------------------
    // F-4: Subdomain attack blocked (evil-supabase.com / supabase.com.attacker.io)
    // -----------------------------------------------------------------------
    #[test]
    fn test_match_incident_domain_subdomain_attack_blocked() {
        // Use an issuer whose slug/name do NOT appear in the incident title,
        // so that keyword Rule 3 does not fire — only domain Rule 2 is tested.
        let db_issuer = make_issuer("database-xyz", "DatabaseXYZ Corp");

        // evil-supabase.com — partial-string attack: "supabase.com" is suffix of host? No.
        let cred_evil =
            make_credential_with_url(&db_issuer, "Evil Key", Some("https://evil-supabase.com"));
        // supabase.com.attacker.io — suffix attack
        let cred_suffix = make_credential_with_url(
            &db_issuer,
            "Suffix Key",
            Some("https://supabase.com.attacker.io"),
        );

        // incident domain = "supabase.com"; title has no slug/display keywords
        let incident = make_incident_with_domain(
            None,
            "A breach occurred",
            None,
            IncidentSource::Hibp,
            Some("supabase.com"),
        );

        let matches = match_incident_at(
            &incident,
            &[cred_evil, cred_suffix],
            &[db_issuer],
            fixed_now(),
        );

        assert!(matches.is_empty(), "공격 도메인은 매칭되지 않아야 한다");
    }

    // -----------------------------------------------------------------------
    // F-5: IssuerMatch wins over Domain (or_insert semantics)
    // -----------------------------------------------------------------------
    #[test]
    fn test_match_incident_domain_loses_to_issuer_match() {
        let supabase = make_issuer_with_domains("supabase", "Supabase", vec!["supabase.com"]);
        let cred = make_credential(&supabase, "Supabase Key");
        // issuer_id set (Rule 1 fires) AND domain matches (Rule 2 would fire)
        let incident = make_incident_with_domain(
            Some(supabase.id),
            "Supabase breach",
            None,
            IncidentSource::Hibp,
            Some("supabase.com"),
        );

        let matches = match_incident_at(
            &incident,
            std::slice::from_ref(&cred),
            &[supabase],
            fixed_now(),
        );

        assert_eq!(matches.len(), 1);
        assert_eq!(
            matches[0].reason,
            MatchReason::IssuerMatch,
            "IssuerMatch (1.0) 가 Domain (0.9) 보다 우선해야 한다"
        );
    }

    // -----------------------------------------------------------------------
    // F-6: Domain beats Keyword
    // -----------------------------------------------------------------------
    #[test]
    fn test_match_incident_domain_beats_keyword() {
        let stripe = make_issuer_with_domains("stripe", "Stripe Payments", vec!["stripe.com"]);
        let cred = make_credential(&stripe, "Stripe Key");
        // Domain match would fire (supabase.com) AND keyword match ("stripe" in title)
        let incident = make_incident_with_domain(
            None,
            "Stripe payments disruption",
            None,
            IncidentSource::Hibp,
            Some("stripe.com"),
        );

        let matches = match_incident_at(
            &incident,
            std::slice::from_ref(&cred),
            &[stripe],
            fixed_now(),
        );

        assert_eq!(matches.len(), 1);
        assert_eq!(
            matches[0].reason,
            MatchReason::Domain,
            "Domain (0.9) 이 Keyword (0.6) 보다 우선해야 한다"
        );
    }

    // -----------------------------------------------------------------------
    // F-7: domain=None → Rule 2 skipped entirely
    // -----------------------------------------------------------------------
    #[test]
    fn test_match_incident_domain_none_skips_rule() {
        let supabase = make_issuer_with_domains("supabase", "Supabase", vec!["supabase.com"]);
        let cred = make_credential(&supabase, "Supabase Key");
        // domain = None → only keyword rule applies
        let incident = make_incident(None, "random incident", None, IncidentSource::Nvd);

        let matches = match_incident_at(
            &incident,
            std::slice::from_ref(&cred),
            &[supabase],
            fixed_now(),
        );

        // no keyword match, no domain match → empty
        assert!(
            matches.is_empty(),
            "domain=None 이면 도메인 매칭이 동작하지 않아야 한다"
        );
    }

    // -----------------------------------------------------------------------
    // F-8: extract_host helper
    // -----------------------------------------------------------------------
    #[test]
    fn test_extract_host_handles_protocol_less() {
        assert_eq!(
            extract_host("vercel.com/foo"),
            Some("vercel.com".to_string())
        );
        assert_eq!(
            extract_host("https://www.stripe.com"),
            Some("stripe.com".to_string())
        );
        assert_eq!(extract_host("not a url !!"), None);
        assert_eq!(extract_host(""), None);
    }

    // -----------------------------------------------------------------------
    // F-9: host_matches_domain subdomain-safe
    // -----------------------------------------------------------------------
    #[test]
    fn test_host_matches_domain_subdomain_safe() {
        assert!(host_matches_domain("openai.com", "openai.com"));
        assert!(host_matches_domain("platform.openai.com", "openai.com"));
        assert!(!host_matches_domain("evil-openai.com", "openai.com"));
        assert!(!host_matches_domain("openai.com.attacker.io", "openai.com"));
    }

    // -----------------------------------------------------------------------
    // Test 12 (bonus): matched_at uses the provided now timestamp
    // -----------------------------------------------------------------------
    #[test]
    fn test_matched_at_uses_provided_now() {
        let openai = make_issuer("openai", "OpenAI");
        let cred = make_credential(&openai, "OpenAI Key");
        let incident = make_incident(Some(openai.id), "OpenAI breach", None, IncidentSource::Nvd);
        let custom_now = OffsetDateTime::from_unix_timestamp(1_700_000_000).unwrap();

        let matches = match_incident_at(&incident, &[cred], &[openai], custom_now);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].matched_at, custom_now);
    }

    // -----------------------------------------------------------------------
    // Test 13 (bonus): display_name match — multi-word display_name
    // -----------------------------------------------------------------------
    #[test]
    fn test_multi_word_display_name_keyword_match() {
        let aws = make_issuer("aws", "Amazon Web Services");
        let cred = make_credential(&aws, "AWS Access Key");
        let incident = make_incident(
            None,
            "Amazon Web Services S3 misconfiguration exposes data",
            None,
            IncidentSource::Nvd,
        );

        let matches =
            match_incident_at(&incident, std::slice::from_ref(&cred), &[aws], fixed_now());
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].reason, MatchReason::Keyword);
    }

    // -----------------------------------------------------------------------
    // Test 14 (bonus): result order is deterministic
    //   IssuerMatch before Keyword, then sorted by credential_id
    // -----------------------------------------------------------------------
    #[test]
    fn test_result_order_is_deterministic() {
        let openai = make_issuer("openai", "OpenAI");
        let stripe = make_issuer("stripe", "Stripe");

        // openai cred 는 IssuerMatch (issuer_id 설정), stripe 는 Keyword
        let cred_openai = make_credential(&openai, "OpenAI Key");
        let cred_stripe = make_credential(&stripe, "Stripe Key");

        let incident = make_incident(
            Some(openai.id),
            "OpenAI and Stripe security advisory",
            None,
            IncidentSource::Nvd,
        );
        let issuers = vec![openai, stripe];
        let credentials = vec![cred_openai.clone(), cred_stripe.clone()];

        let matches = match_incident_at(&incident, &credentials, &issuers, fixed_now());
        assert_eq!(matches.len(), 2);
        // IssuerMatch 가 먼저
        assert_eq!(matches[0].reason, MatchReason::IssuerMatch);
        assert_eq!(matches[1].reason, MatchReason::Keyword);
    }
}
