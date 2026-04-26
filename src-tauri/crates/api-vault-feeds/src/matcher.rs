use std::collections::HashMap;

use api_vault_core::models::credential::Credential;
use api_vault_core::models::incident::{Incident, IncidentMatch, MatchReason};
use api_vault_core::models::issuer::Issuer;
use api_vault_core::id::{CredentialId, IncidentMatchId};
use time::OffsetDateTime;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIDENCE_THRESHOLD: f32 = 0.3;
const CONFIDENCE_ISSUER_MATCH: f32 = 1.0;
const CONFIDENCE_KEYWORD: f32 = 0.6;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Matches an incident against credentials using issuer_id + keyword heuristics.
///
/// Rules:
/// 1. If `incident.issuer_id` is Some(id), every credential with
///    `credential.issuer_id == id` produces an `IncidentMatch` with
///    `reason = IssuerMatch` and confidence 1.0.
/// 2. For every issuer whose `display_name` or `slug` appears
///    (case-insensitive substring) in `incident.title` or `incident.body`,
///    credentials belonging to that issuer produce an `IncidentMatch` with
///    `reason = Keyword` and confidence 0.6.
///    `slug` must be >= 3 chars to avoid false positives.
/// 3. Per-credential dedupe: if both IssuerMatch and Keyword fire,
///    IssuerMatch wins (higher confidence).
/// 4. Matches with confidence < CONFIDENCE_THRESHOLD are dropped.
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

    // Rule 2: keyword match on title + body
    let haystack = {
        let body_part = incident.body.as_deref().unwrap_or("");
        format!("{} {}", incident.title, body_part).to_lowercase()
    };

    for issuer in issuers {
        let slug_lower = issuer.slug.to_lowercase();
        let display_lower = issuer.display_name.to_lowercase();

        let matches_slug = slug_lower.len() >= 3 && haystack.contains(slug_lower.as_str());
        let matches_display = !display_lower.is_empty() && haystack.contains(display_lower.as_str());

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
        MatchReason::Keyword => 1,
        MatchReason::Explicit => 2,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use api_vault_core::id::{CredentialId, IncidentId, IssuerId};
    use api_vault_core::models::credential::{Credential, CredentialStatus, Env};
    use api_vault_core::models::incident::{Incident, IncidentSeverity, IncidentSource, MatchReason};
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
            created_at: now,
            updated_at: now,
        }
    }

    fn make_credential(issuer: &Issuer, name: &str) -> Credential {
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
        }
    }

    fn make_incident(
        issuer_id: Option<IssuerId>,
        title: &str,
        body: Option<&str>,
        source: IncidentSource,
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

        let incident = make_incident(Some(openai.id), "OpenAI data breach", None, IncidentSource::Nvd);
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
        let incident = make_incident(
            None,
            "GitHub API outage",
            None,
            IncidentSource::Rss,
        );

        let matches = match_incident_at(&incident, std::slice::from_ref(&cred), &[github], fixed_now());
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

        let matches = match_incident_at(&incident, std::slice::from_ref(&cred), &[stripe], fixed_now());
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

        let matches = match_incident_at(&incident, std::slice::from_ref(&cred), &[openai], fixed_now());
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

        let matches = match_incident_at(&incident, std::slice::from_ref(&cred), &[github], fixed_now());
        assert_eq!(matches.len(), 1, "credential 이 중복 없이 1개여야 한다");
        assert_eq!(matches[0].reason, MatchReason::IssuerMatch, "IssuerMatch 가 우선해야 한다");
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

        let matches = match_incident_at(&incident, std::slice::from_ref(&cred), &[vercel], fixed_now());
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
    // Test 12 (bonus): matched_at uses the provided now timestamp
    // -----------------------------------------------------------------------
    #[test]
    fn test_matched_at_uses_provided_now() {
        let openai = make_issuer("openai", "OpenAI");
        let cred = make_credential(&openai, "OpenAI Key");
        let incident = make_incident(
            Some(openai.id),
            "OpenAI breach",
            None,
            IncidentSource::Nvd,
        );
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

        let matches = match_incident_at(&incident, std::slice::from_ref(&cred), &[aws], fixed_now());
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
