//! Credential security score (T040).
//!
//! Pure function that inspects a [`Credential`] and returns a [`ScoreBreakdown`]
//! consisting of a 0–100 score, a coarse [`ScoreLevel`], and a list of
//! [`ScoreFactor`]s that explain the deductions. The front-end renders the
//! level as a colour dot and the factors as a tooltip.
//!
//! Intentionally single-shot and synchronous — does not hit the database.

use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::models::credential::{Credential, CredentialStatus};

const SAFE_THRESHOLD: u8 = 80;
const WARN_THRESHOLD: u8 = 50;

/// Coarse-grained risk level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScoreLevel {
    Safe,
    Warn,
    Danger,
}

/// Severity of a single factor (for UI colour within the tooltip).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FactorSeverity {
    Info,
    Warn,
    Danger,
}

/// Stable identifier mapped to an i18n message on the front-end.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FactorCode {
    Expired,
    ExpiringSoon,
    RotationOverdue,
    NoRotationHistory,
    NoScope,
    Revoked,
    Compromised,
}

/// A single deduction with optional context for i18n interpolation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScoreFactor {
    pub code: FactorCode,
    pub severity: FactorSeverity,
    pub penalty: u8,
    /// Relevant day count for interpolation (e.g. "expired 12 days ago").
    pub days: Option<i64>,
}

/// Full result of the scorer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScoreBreakdown {
    pub total: u8,
    pub level: ScoreLevel,
    pub factors: Vec<ScoreFactor>,
}

/// Score using the current wall-clock time.
pub fn score(cred: &Credential) -> ScoreBreakdown {
    score_at(cred, OffsetDateTime::now_utc())
}

/// Score with injectable `now` — testable.
pub fn score_at(cred: &Credential, now: OffsetDateTime) -> ScoreBreakdown {
    let mut factors: Vec<ScoreFactor> = Vec::new();
    let mut total: i32 = 100;

    // --- Hard fail: revoked / compromised collapses the score to 0 --------
    match cred.status {
        CredentialStatus::Revoked => {
            factors.push(ScoreFactor {
                code: FactorCode::Revoked,
                severity: FactorSeverity::Danger,
                penalty: 100,
                days: None,
            });
            return ScoreBreakdown {
                total: 0,
                level: ScoreLevel::Danger,
                factors,
            };
        }
        CredentialStatus::Compromised => {
            factors.push(ScoreFactor {
                code: FactorCode::Compromised,
                severity: FactorSeverity::Danger,
                penalty: 100,
                days: None,
            });
            return ScoreBreakdown {
                total: 0,
                level: ScoreLevel::Danger,
                factors,
            };
        }
        CredentialStatus::Active => {}
    }

    // --- Expiry ----------------------------------------------------------
    if let Some(exp) = cred.expires_at {
        if exp <= now {
            let days = (now - exp).whole_days();
            let penalty: u8 = 50;
            factors.push(ScoreFactor {
                code: FactorCode::Expired,
                severity: FactorSeverity::Danger,
                penalty,
                days: Some(days),
            });
            total -= i32::from(penalty);
        } else {
            let diff = (exp - now).whole_days();
            if diff <= 30 {
                let penalty: u8 = 20;
                factors.push(ScoreFactor {
                    code: FactorCode::ExpiringSoon,
                    severity: FactorSeverity::Warn,
                    penalty,
                    days: Some(diff),
                });
                total -= i32::from(penalty);
            }
        }
    }

    // --- Rotation --------------------------------------------------------
    if let (Some(last), Some(policy_days)) = (cred.last_rotated_at, cred.rotation_policy_days) {
        let age = (now - last).whole_days();
        if age > i64::from(policy_days) {
            let over = age - i64::from(policy_days);
            let penalty: u8 = 15;
            factors.push(ScoreFactor {
                code: FactorCode::RotationOverdue,
                severity: FactorSeverity::Warn,
                penalty,
                days: Some(over),
            });
            total -= i32::from(penalty);
        }
    } else if cred.last_rotated_at.is_none() {
        let age = (now - cred.created_at).whole_days();
        if age >= 90 {
            let penalty: u8 = 10;
            factors.push(ScoreFactor {
                code: FactorCode::NoRotationHistory,
                severity: FactorSeverity::Warn,
                penalty,
                days: Some(age),
            });
            total -= i32::from(penalty);
        }
    }

    // --- Scope -----------------------------------------------------------
    if cred.scope.is_none() {
        let penalty: u8 = 5;
        factors.push(ScoreFactor {
            code: FactorCode::NoScope,
            severity: FactorSeverity::Info,
            penalty,
            days: None,
        });
        total -= i32::from(penalty);
    }

    let total_u8 = total.clamp(0, 100) as u8;
    let level = if total_u8 >= SAFE_THRESHOLD {
        ScoreLevel::Safe
    } else if total_u8 >= WARN_THRESHOLD {
        ScoreLevel::Warn
    } else {
        ScoreLevel::Danger
    };

    ScoreBreakdown {
        total: total_u8,
        level,
        factors,
    }
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::id::{CredentialId, IssuerId};
    use crate::models::credential::Env;
    use time::Duration;

    fn t(offset_days: i64) -> OffsetDateTime {
        // Fixed base time so results are deterministic.
        let base = OffsetDateTime::from_unix_timestamp(1_700_000_000).unwrap();
        base + Duration::days(offset_days)
    }

    fn cred(status: CredentialStatus) -> Credential {
        Credential {
            id: CredentialId::new(),
            issuer_id: IssuerId::new(),
            name: "test".into(),
            env: Env::Prod,
            scope: Some("read".into()),
            vault_ref: "credentials/x".into(),
            created_at: t(0),
            last_rotated_at: Some(t(0)),
            expires_at: Some(t(365)),
            owner: None,
            rotation_policy_days: Some(90),
            rotation_runbook_id: None,
            status,
            hash_hint: Some("abcd".into()),
        }
    }

    #[test]
    fn healthy_credential_scores_100_safe() {
        let c = cred(CredentialStatus::Active);
        let s = score_at(&c, t(1));
        assert_eq!(s.total, 100);
        assert_eq!(s.level, ScoreLevel::Safe);
        assert!(s.factors.is_empty());
    }

    #[test]
    fn revoked_collapses_to_zero_danger() {
        let c = cred(CredentialStatus::Revoked);
        let s = score_at(&c, t(1));
        assert_eq!(s.total, 0);
        assert_eq!(s.level, ScoreLevel::Danger);
        assert_eq!(s.factors.len(), 1);
        assert_eq!(s.factors[0].code, FactorCode::Revoked);
    }

    #[test]
    fn compromised_collapses_to_zero_danger() {
        let c = cred(CredentialStatus::Compromised);
        let s = score_at(&c, t(1));
        assert_eq!(s.total, 0);
        assert_eq!(s.level, ScoreLevel::Danger);
        assert_eq!(s.factors[0].code, FactorCode::Compromised);
    }

    #[test]
    fn expired_deducts_50_danger() {
        let mut c = cred(CredentialStatus::Active);
        c.expires_at = Some(t(-10)); // expired 10 days ago
        let s = score_at(&c, t(0));
        assert_eq!(s.total, 50);
        assert_eq!(s.level, ScoreLevel::Warn);
        let f = s.factors.iter().find(|f| f.code == FactorCode::Expired).unwrap();
        assert_eq!(f.penalty, 50);
        assert_eq!(f.severity, FactorSeverity::Danger);
        assert_eq!(f.days, Some(10));
    }

    #[test]
    fn expiring_soon_deducts_20_warn() {
        let mut c = cred(CredentialStatus::Active);
        c.expires_at = Some(t(10)); // expires in 10 days
        let s = score_at(&c, t(0));
        assert_eq!(s.total, 80);
        assert_eq!(s.level, ScoreLevel::Safe);
        let f = s
            .factors
            .iter()
            .find(|f| f.code == FactorCode::ExpiringSoon)
            .unwrap();
        assert_eq!(f.penalty, 20);
        assert_eq!(f.days, Some(10));
    }

    #[test]
    fn rotation_overdue_deducts_15_warn() {
        let mut c = cred(CredentialStatus::Active);
        c.rotation_policy_days = Some(90);
        c.last_rotated_at = Some(t(0));
        let s = score_at(&c, t(120)); // 30 days over the policy
        let f = s
            .factors
            .iter()
            .find(|f| f.code == FactorCode::RotationOverdue)
            .unwrap();
        assert_eq!(f.penalty, 15);
        assert_eq!(f.days, Some(30));
    }

    #[test]
    fn no_rotation_history_old_key_deducts_10() {
        let mut c = cred(CredentialStatus::Active);
        c.last_rotated_at = None;
        c.rotation_policy_days = None;
        c.created_at = t(0);
        let s = score_at(&c, t(120));
        let f = s
            .factors
            .iter()
            .find(|f| f.code == FactorCode::NoRotationHistory)
            .unwrap();
        assert_eq!(f.penalty, 10);
    }

    #[test]
    fn no_scope_deducts_5_info() {
        let mut c = cred(CredentialStatus::Active);
        c.scope = None;
        let s = score_at(&c, t(1));
        let f = s.factors.iter().find(|f| f.code == FactorCode::NoScope).unwrap();
        assert_eq!(f.penalty, 5);
        assert_eq!(f.severity, FactorSeverity::Info);
    }

    #[test]
    fn multiple_factors_compound_and_clamp() {
        // Expired (-50) + NoScope (-5) = 45 → Danger
        let mut c = cred(CredentialStatus::Active);
        c.scope = None;
        c.expires_at = Some(t(-5));
        let s = score_at(&c, t(0));
        assert_eq!(s.total, 45);
        assert_eq!(s.level, ScoreLevel::Danger);
        assert_eq!(s.factors.len(), 2);
    }
}
