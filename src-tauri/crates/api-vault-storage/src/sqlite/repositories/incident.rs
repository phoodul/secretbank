use api_vault_core::{
    CredentialId, Incident, IncidentFilter, IncidentId, IncidentMatch, IncidentMatchId,
    IncidentSeverity, IncidentSource, IssuerId, MatchReason,
};
use serde::Serialize;
use sqlx::{Row, SqlitePool};
use time::OffsetDateTime;

use crate::sqlite::{dt_to_ms, ms_to_dt, ms_to_dt_opt, StorageError};

// ---------------------------------------------------------------------------
// Rich list entry (used by incident_list Tauri command)
// ---------------------------------------------------------------------------

/// Enriched match detail returned by `list_with_matches`.
#[derive(Debug, Clone, Serialize)]
pub struct IncidentMatchDetail {
    pub id: IncidentMatchId,
    pub credential_id: CredentialId,
    /// The `label` field stored in the `credential` table.
    pub credential_label: String,
    /// `issuers.display_name` joined from the credential's issuer.
    pub issuer_display_name: Option<String>,
    pub reason: MatchReason,
    #[serde(with = "time::serde::timestamp::milliseconds")]
    pub matched_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339::option")]
    pub dismissed_at: Option<OffsetDateTime>,
}

/// Incident bundled with its match details. Returned by `incident_list`.
#[derive(Debug, Clone, Serialize)]
pub struct IncidentListEntry {
    pub incident: Incident,
    pub matches: Vec<IncidentMatchDetail>,
}

pub struct IncidentRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> IncidentRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    /// Insert an incident, ignoring duplicates on `(source, source_id)`.
    ///
    /// Returns the canonical [`IncidentId`] — either the freshly-inserted row's
    /// id or the pre-existing row's id when the row was already present.
    /// Callers should use the returned id when inserting `incident_match` rows
    /// so that matches are always associated with the canonical incident record.
    pub async fn insert(&self, incident: &Incident) -> Result<IncidentId, StorageError> {
        let id_str = incident.id.to_string();
        let issuer_id_str = incident.issuer_id.map(|i| i.to_string());
        let source_str = source_to_str(incident.source);
        let severity_str = severity_to_str(incident.severity);
        let detected_ms = dt_to_ms(incident.detected_at);
        let published_ms = incident.published_at.map(dt_to_ms);

        sqlx::query(
            r#"INSERT OR IGNORE INTO incident
               (id, source, source_id, issuer_id, severity, title, body, url, detected_at, published_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&id_str)
        .bind(source_str)
        .bind(&incident.source_id)
        .bind(&issuer_id_str)
        .bind(severity_str)
        .bind(&incident.title)
        .bind(&incident.body)
        .bind(&incident.url)
        .bind(detected_ms)
        .bind(published_ms)
        .execute(self.pool)
        .await?;

        // Fetch the canonical id (new insert or pre-existing duplicate).
        let row = sqlx::query("SELECT id FROM incident WHERE source = ? AND source_id = ?")
            .bind(source_str)
            .bind(&incident.source_id)
            .fetch_one(self.pool)
            .await?;

        let canonical_id_str: String = row.try_get("id")?;
        canonical_id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))
    }

    pub async fn get_by_id(&self, id: IncidentId) -> Result<Option<Incident>, StorageError> {
        let id_str = id.to_string();
        let row = sqlx::query(
            r#"SELECT id, source, source_id, issuer_id, severity, title, body, url,
                      detected_at, published_at
               FROM incident WHERE id = ?"#,
        )
        .bind(&id_str)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_incident(&r)).transpose()
    }

    pub async fn delete(&self, id: IncidentId) -> Result<(), StorageError> {
        let id_str = id.to_string();
        sqlx::query("DELETE FROM incident WHERE id = ?")
            .bind(&id_str)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    // --- incident_match ---

    /// Idempotent match insert keyed by `(incident_id, credential_id, reason)`.
    ///
    /// Migration 0004 added a UNIQUE INDEX on that triple, so this function
    /// uses `INSERT OR IGNORE` and returns the canonical row id — either the
    /// freshly-inserted ULID or the pre-existing one when the row was already
    /// present.  Callers can therefore re-run the matcher on every feed
    /// refresh without inflating the table (hotfix H1).
    pub async fn insert_match(
        &self,
        incident_id: IncidentId,
        credential_id: CredentialId,
        reason: MatchReason,
    ) -> Result<IncidentMatchId, StorageError> {
        let new_id = IncidentMatchId::new();
        let new_id_str = new_id.to_string();
        let inc_id_str = incident_id.to_string();
        let cred_id_str = credential_id.to_string();
        let reason_str = reason_to_str(reason);
        let matched_ms = dt_to_ms(OffsetDateTime::now_utc());

        sqlx::query(
            r#"INSERT OR IGNORE INTO incident_match
                   (id, incident_id, credential_id, reason, matched_at)
               VALUES (?, ?, ?, ?, ?)"#,
        )
        .bind(&new_id_str)
        .bind(&inc_id_str)
        .bind(&cred_id_str)
        .bind(reason_str)
        .bind(matched_ms)
        .execute(self.pool)
        .await?;

        // Either the new row exists (we just inserted it) or an older row with
        // the same key is still present.  Return whichever id is canonical.
        let canonical_id_str: String = sqlx::query_scalar(
            r#"SELECT id FROM incident_match
               WHERE incident_id = ? AND credential_id = ? AND reason = ?"#,
        )
        .bind(&inc_id_str)
        .bind(&cred_id_str)
        .bind(reason_str)
        .fetch_one(self.pool)
        .await?;

        canonical_id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))
    }

    pub async fn get_match_by_id(
        &self,
        id: IncidentMatchId,
    ) -> Result<Option<IncidentMatch>, StorageError> {
        let id_str = id.to_string();
        let row = sqlx::query(
            r#"SELECT id, incident_id, credential_id, reason, matched_at, dismissed_at
               FROM incident_match WHERE id = ?"#,
        )
        .bind(&id_str)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_match(&r)).transpose()
    }

    pub async fn dismiss_match(&self, id: IncidentMatchId) -> Result<(), StorageError> {
        let id_str = id.to_string();
        let now = OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .map_err(|e| StorageError::Parse(e.to_string()))?;

        sqlx::query("UPDATE incident_match SET dismissed_at = ? WHERE id = ?")
            .bind(&now)
            .bind(&id_str)
            .execute(self.pool)
            .await?;

        Ok(())
    }

    pub async fn list_matches_for_credential(
        &self,
        credential_id: CredentialId,
    ) -> Result<Vec<IncidentMatch>, StorageError> {
        let cid_str = credential_id.to_string();
        let rows = sqlx::query(
            r#"SELECT id, incident_id, credential_id, reason, matched_at, dismissed_at
               FROM incident_match WHERE credential_id = ? ORDER BY matched_at DESC"#,
        )
        .bind(&cid_str)
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_match).collect()
    }

    /// List incidents matching the given filter, ordered by `detected_at DESC`.
    ///
    /// When `filter.include_dismissed` is false, incidents whose *every*
    /// `incident_match` row has `dismissed_at IS NOT NULL` are excluded.
    /// An incident with zero matches is always included.
    pub async fn list(&self, filter: &IncidentFilter) -> Result<Vec<Incident>, StorageError> {
        let source_str = filter.source.map(source_to_str);
        let severity_str = filter.severity.map(severity_to_str);
        let issuer_id_str = filter.issuer_id.map(|i| i.to_string());
        let include_dismissed: i64 = if filter.include_dismissed { 1 } else { 0 };

        let rows = sqlx::query(
            r#"SELECT id, source, source_id, issuer_id, severity, title, body, url,
                      detected_at, published_at
               FROM incident
               WHERE
                 (?1 IS NULL OR source = ?1)
                 AND (?2 IS NULL OR severity = ?2)
                 AND (?3 IS NULL OR issuer_id = ?3)
                 AND (
                   ?4 = 1
                   OR id NOT IN (
                     SELECT im.incident_id
                     FROM incident_match im
                     GROUP BY im.incident_id
                     HAVING SUM(CASE WHEN im.dismissed_at IS NULL THEN 0 ELSE 1 END) = COUNT(*)
                     AND COUNT(*) > 0
                   )
                 )
               ORDER BY detected_at DESC"#,
        )
        .bind(source_str)
        .bind(severity_str)
        .bind(&issuer_id_str)
        .bind(include_dismissed)
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_incident).collect()
    }

    /// Return all incidents that have at least one active (non-dismissed) match
    /// to `credential_id`. Used by the Credential Detail panel.
    pub async fn list_incidents_for_credential(
        &self,
        credential_id: CredentialId,
    ) -> Result<Vec<Incident>, StorageError> {
        let cid_str = credential_id.to_string();
        let rows = sqlx::query(
            r#"SELECT DISTINCT i.id, i.source, i.source_id, i.issuer_id, i.severity,
                      i.title, i.body, i.url, i.detected_at, i.published_at
               FROM incident i
               INNER JOIN incident_match m ON m.incident_id = i.id
               WHERE m.credential_id = ? AND m.dismissed_at IS NULL
               ORDER BY i.detected_at DESC"#,
        )
        .bind(&cid_str)
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_incident).collect()
    }

    /// Return incidents with their match details in a single query.
    ///
    /// Applies the same filter axes as `list`. Uses a LEFT JOIN so that
    /// incidents with zero matches are still included (matches will be empty).
    /// Rows are grouped in Rust after the flat SQL result.
    pub async fn list_with_matches(
        &self,
        filter: &IncidentFilter,
    ) -> Result<Vec<IncidentListEntry>, StorageError> {
        let source_str = filter.source.map(source_to_str);
        let severity_str = filter.severity.map(severity_to_str);
        let issuer_id_str = filter.issuer_id.map(|i| i.to_string());
        let include_dismissed: i64 = if filter.include_dismissed { 1 } else { 0 };

        // One query: incident LEFT JOIN incident_match LEFT JOIN credential LEFT JOIN issuer.
        // The dismissed-filter sub-select is the same as in `list`.
        let rows = sqlx::query(
            r#"SELECT
                 i.id          AS inc_id,
                 i.source      AS inc_source,
                 i.source_id   AS inc_source_id,
                 i.issuer_id   AS inc_issuer_id,
                 i.severity    AS inc_severity,
                 i.title       AS inc_title,
                 i.body        AS inc_body,
                 i.url         AS inc_url,
                 i.detected_at AS inc_detected_at,
                 i.published_at AS inc_published_at,
                 im.id          AS match_id,
                 im.credential_id AS match_cred_id,
                 im.reason     AS match_reason,
                 im.matched_at AS match_matched_at,
                 im.dismissed_at AS match_dismissed_at,
                 c.name        AS cred_label,
                 iss.display_name AS issuer_display_name
               FROM incident i
               LEFT JOIN incident_match im ON im.incident_id = i.id
               LEFT JOIN credential c ON c.id = im.credential_id
               LEFT JOIN issuer iss ON iss.id = c.issuer_id
               WHERE
                 (?1 IS NULL OR i.source = ?1)
                 AND (?2 IS NULL OR i.severity = ?2)
                 AND (?3 IS NULL OR i.issuer_id = ?3)
                 AND (
                   ?4 = 1
                   OR i.id NOT IN (
                     SELECT im2.incident_id
                     FROM incident_match im2
                     GROUP BY im2.incident_id
                     HAVING SUM(CASE WHEN im2.dismissed_at IS NULL THEN 0 ELSE 1 END) = COUNT(*)
                     AND COUNT(*) > 0
                   )
                 )
               ORDER BY i.detected_at DESC, im.matched_at ASC"#,
        )
        .bind(source_str)
        .bind(severity_str)
        .bind(&issuer_id_str)
        .bind(include_dismissed)
        .fetch_all(self.pool)
        .await?;

        // Group flat rows by incident id (preserving order).
        let mut entries: Vec<IncidentListEntry> = Vec::new();

        for row in &rows {
            let inc_id_str: String = row.try_get("inc_id")?;
            let inc_id: IncidentId = inc_id_str
                .parse()
                .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?;

            // Find or create the entry for this incident.
            if entries.last().map(|e| e.incident.id) != Some(inc_id) {
                let source_str: String = row.try_get("inc_source")?;
                let severity_str_val: String = row.try_get("inc_severity")?;
                let issuer_id_s: Option<String> = row.try_get("inc_issuer_id")?;
                let detected_ms: i64 = row.try_get("inc_detected_at")?;
                let published_ms: Option<i64> = row.try_get("inc_published_at")?;

                let incident = Incident {
                    id: inc_id,
                    source: str_to_source(&source_str)?,
                    source_id: row.try_get("inc_source_id")?,
                    issuer_id: issuer_id_s
                        .map(|s| {
                            s.parse::<IssuerId>()
                                .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))
                        })
                        .transpose()?,
                    severity: str_to_severity(&severity_str_val)?,
                    title: row.try_get("inc_title")?,
                    body: row.try_get("inc_body")?,
                    url: row.try_get("inc_url")?,
                    detected_at: ms_to_dt(detected_ms)?,
                    published_at: ms_to_dt_opt(published_ms)?,
                };
                entries.push(IncidentListEntry {
                    incident,
                    matches: Vec::new(),
                });
            }

            // Append match detail if a match row exists (LEFT JOIN may produce NULL).
            let match_id_str: Option<String> = row.try_get("match_id")?;
            if let Some(mid_str) = match_id_str {
                let cred_id_str: String = row.try_get("match_cred_id")?;
                let reason_str: String = row.try_get("match_reason")?;
                let matched_ms: i64 = row.try_get("match_matched_at")?;
                let dismissed_at_str: Option<String> = row.try_get("match_dismissed_at")?;

                let dismissed_at = dismissed_at_str
                    .map(|s| {
                        OffsetDateTime::parse(&s, &time::format_description::well_known::Rfc3339)
                            .map_err(|e| StorageError::Parse(e.to_string()))
                    })
                    .transpose()?;

                let detail = IncidentMatchDetail {
                    id: mid_str
                        .parse()
                        .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
                    credential_id: cred_id_str
                        .parse()
                        .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
                    credential_label: row.try_get("cred_label")?,
                    issuer_display_name: row.try_get("issuer_display_name")?,
                    reason: str_to_reason(&reason_str)?,
                    matched_at: ms_to_dt(matched_ms)?,
                    dismissed_at,
                };

                if let Some(entry) = entries.last_mut() {
                    entry.matches.push(detail);
                }
            }
        }

        Ok(entries)
    }

    /// Return incidents (with match details) that have at least one match
    /// to `credential_id`.  The `matches` array contains **only** the match
    /// rows for this credential, not all matches of the incident.
    ///
    /// Both active and dismissed matches are returned; the UI decides what
    /// to show. Results are ordered by `detected_at DESC`.
    pub async fn list_incidents_with_matches_for_credential(
        &self,
        credential_id: &CredentialId,
    ) -> Result<Vec<IncidentListEntry>, StorageError> {
        let cid_str = credential_id.to_string();

        // INNER JOIN ensures only incidents that have at least one match for
        // this credential are included. We still get the issuer / label via
        // the same LEFT JOINs used by list_with_matches.
        let rows = sqlx::query(
            r#"SELECT
                 i.id           AS inc_id,
                 i.source       AS inc_source,
                 i.source_id    AS inc_source_id,
                 i.issuer_id    AS inc_issuer_id,
                 i.severity     AS inc_severity,
                 i.title        AS inc_title,
                 i.body         AS inc_body,
                 i.url          AS inc_url,
                 i.detected_at  AS inc_detected_at,
                 i.published_at AS inc_published_at,
                 im.id          AS match_id,
                 im.credential_id AS match_cred_id,
                 im.reason      AS match_reason,
                 im.matched_at  AS match_matched_at,
                 im.dismissed_at AS match_dismissed_at,
                 c.name         AS cred_label,
                 iss.display_name AS issuer_display_name
               FROM incident i
               INNER JOIN incident_match im ON im.incident_id = i.id
                                           AND im.credential_id = ?1
               LEFT JOIN credential c ON c.id = im.credential_id
               LEFT JOIN issuer iss ON iss.id = c.issuer_id
               ORDER BY i.detected_at DESC, im.matched_at ASC"#,
        )
        .bind(&cid_str)
        .fetch_all(self.pool)
        .await?;

        // Group flat rows by incident id (preserving DESC order).
        let mut entries: Vec<IncidentListEntry> = Vec::new();

        for row in &rows {
            let inc_id_str: String = row.try_get("inc_id")?;
            let inc_id: IncidentId = inc_id_str
                .parse()
                .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?;

            if entries.last().map(|e| e.incident.id) != Some(inc_id) {
                let source_str: String = row.try_get("inc_source")?;
                let severity_str_val: String = row.try_get("inc_severity")?;
                let issuer_id_s: Option<String> = row.try_get("inc_issuer_id")?;
                let detected_ms: i64 = row.try_get("inc_detected_at")?;
                let published_ms: Option<i64> = row.try_get("inc_published_at")?;

                let incident = Incident {
                    id: inc_id,
                    source: str_to_source(&source_str)?,
                    source_id: row.try_get("inc_source_id")?,
                    issuer_id: issuer_id_s
                        .map(|s| {
                            s.parse::<IssuerId>()
                                .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))
                        })
                        .transpose()?,
                    severity: str_to_severity(&severity_str_val)?,
                    title: row.try_get("inc_title")?,
                    body: row.try_get("inc_body")?,
                    url: row.try_get("inc_url")?,
                    detected_at: ms_to_dt(detected_ms)?,
                    published_at: ms_to_dt_opt(published_ms)?,
                };
                entries.push(IncidentListEntry {
                    incident,
                    matches: Vec::new(),
                });
            }

            let match_id_str: Option<String> = row.try_get("match_id")?;
            if let Some(mid_str) = match_id_str {
                let cred_id_str: String = row.try_get("match_cred_id")?;
                let reason_str: String = row.try_get("match_reason")?;
                let matched_ms: i64 = row.try_get("match_matched_at")?;
                let dismissed_at_str: Option<String> = row.try_get("match_dismissed_at")?;

                let dismissed_at = dismissed_at_str
                    .map(|s| {
                        OffsetDateTime::parse(&s, &time::format_description::well_known::Rfc3339)
                            .map_err(|e| StorageError::Parse(e.to_string()))
                    })
                    .transpose()?;

                let detail = IncidentMatchDetail {
                    id: mid_str
                        .parse()
                        .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
                    credential_id: cred_id_str
                        .parse()
                        .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
                    credential_label: row.try_get("cred_label")?,
                    issuer_display_name: row.try_get("issuer_display_name")?,
                    reason: str_to_reason(&reason_str)?,
                    matched_at: ms_to_dt(matched_ms)?,
                    dismissed_at,
                };

                if let Some(entry) = entries.last_mut() {
                    entry.matches.push(detail);
                }
            }
        }

        Ok(entries)
    }

    /// Dismiss every active (non-dismissed) match of `incident_id`.
    /// Returns the number of rows updated.
    pub async fn dismiss_matches_for_incident(
        &self,
        incident_id: IncidentId,
    ) -> Result<u64, StorageError> {
        let id_str = incident_id.to_string();
        let now = OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .map_err(|e| StorageError::Parse(e.to_string()))?;

        let result =
            sqlx::query("UPDATE incident_match SET dismissed_at = ? WHERE incident_id = ? AND dismissed_at IS NULL")
                .bind(&now)
                .bind(&id_str)
                .execute(self.pool)
                .await?;

        Ok(result.rows_affected())
    }
}

fn row_to_incident(r: &sqlx::sqlite::SqliteRow) -> Result<Incident, StorageError> {
    let id_str: String = r.try_get("id")?;
    let source_str: String = r.try_get("source")?;
    let severity_str: String = r.try_get("severity")?;
    let issuer_id_str: Option<String> = r.try_get("issuer_id")?;
    let detected_ms: i64 = r.try_get("detected_at")?;
    let published_ms: Option<i64> = r.try_get("published_at")?;

    Ok(Incident {
        id: id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        source: str_to_source(&source_str)?,
        source_id: r.try_get("source_id")?,
        issuer_id: issuer_id_str
            .map(|s| {
                s.parse::<IssuerId>()
                    .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))
            })
            .transpose()?,
        severity: str_to_severity(&severity_str)?,
        title: r.try_get("title")?,
        body: r.try_get("body")?,
        url: r.try_get("url")?,
        detected_at: ms_to_dt(detected_ms)?,
        published_at: ms_to_dt_opt(published_ms)?,
    })
}

fn row_to_match(r: &sqlx::sqlite::SqliteRow) -> Result<IncidentMatch, StorageError> {
    let id_str: String = r.try_get("id")?;
    let incident_id_str: String = r.try_get("incident_id")?;
    let credential_id_str: String = r.try_get("credential_id")?;
    let reason_str: String = r.try_get("reason")?;
    let matched_ms: i64 = r.try_get("matched_at")?;
    let dismissed_at_str: Option<String> = r.try_get("dismissed_at")?;

    let dismissed_at = dismissed_at_str
        .map(|s| {
            OffsetDateTime::parse(&s, &time::format_description::well_known::Rfc3339)
                .map_err(|e| StorageError::Parse(e.to_string()))
        })
        .transpose()?;

    Ok(IncidentMatch {
        id: id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        incident_id: incident_id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        credential_id: credential_id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        reason: str_to_reason(&reason_str)?,
        matched_at: ms_to_dt(matched_ms)?,
        dismissed_at,
    })
}

fn source_to_str(s: IncidentSource) -> &'static str {
    match s {
        IncidentSource::Nvd => "nvd",
        IncidentSource::Ghsa => "ghsa",
        IncidentSource::Rss => "rss",
        IncidentSource::Hibp => "hibp",
    }
}

fn str_to_source(s: &str) -> Result<IncidentSource, StorageError> {
    match s {
        "nvd" => Ok(IncidentSource::Nvd),
        "ghsa" => Ok(IncidentSource::Ghsa),
        "rss" => Ok(IncidentSource::Rss),
        "hibp" => Ok(IncidentSource::Hibp),
        other => Err(StorageError::Parse(format!("unknown source: {other}"))),
    }
}

fn severity_to_str(s: IncidentSeverity) -> &'static str {
    match s {
        IncidentSeverity::Info => "info",
        IncidentSeverity::Low => "low",
        IncidentSeverity::Medium => "medium",
        IncidentSeverity::High => "high",
        IncidentSeverity::Critical => "critical",
    }
}

fn str_to_severity(s: &str) -> Result<IncidentSeverity, StorageError> {
    match s {
        "info" => Ok(IncidentSeverity::Info),
        "low" => Ok(IncidentSeverity::Low),
        "medium" => Ok(IncidentSeverity::Medium),
        "high" => Ok(IncidentSeverity::High),
        "critical" => Ok(IncidentSeverity::Critical),
        other => Err(StorageError::Parse(format!("unknown severity: {other}"))),
    }
}

fn reason_to_str(r: MatchReason) -> &'static str {
    match r {
        MatchReason::IssuerMatch => "issuer_match",
        MatchReason::Keyword => "keyword",
        MatchReason::Explicit => "explicit",
    }
}

fn str_to_reason(s: &str) -> Result<MatchReason, StorageError> {
    match s {
        "issuer_match" => Ok(MatchReason::IssuerMatch),
        "keyword" => Ok(MatchReason::Keyword),
        "explicit" => Ok(MatchReason::Explicit),
        other => Err(StorageError::Parse(format!("unknown reason: {other}"))),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sqlite::init_pool;
    use crate::sqlite::repositories::credential::CredentialRepo;
    use crate::sqlite::repositories::issuer::IssuerRepo;
    use api_vault_core::{CredentialId, IncidentId, IssuerId};
    use api_vault_core::{CredentialInput, Env, IssuerInput};
    use tempfile::tempdir;
    use time::OffsetDateTime;

    /// 테스트용 SQLite pool 생성 헬퍼 (tempfile + init_pool).
    async fn make_pool() -> (tempfile::TempDir, SqlitePool) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.unwrap();
        (dir, pool)
    }

    /// 기본 Issuer 를 DB 에 삽입하고 ID 를 반환한다.
    async fn insert_issuer(pool: &SqlitePool, slug: &str) -> IssuerId {
        let repo = IssuerRepo::new(pool);
        repo.insert(&IssuerInput {
            slug: slug.to_owned(),
            display_name: slug.to_owned(),
            docs_url: None,
            issue_url: None,
            status_url: None,
            security_feed_url: None,
            connector_id: None,
            icon_key: None,
        })
        .await
        .unwrap()
    }

    /// 기본 Credential 을 DB 에 삽입하고 ID 를 반환한다.
    async fn insert_credential(pool: &SqlitePool, issuer_id: IssuerId, name: &str) -> CredentialId {
        let repo = CredentialRepo::new(pool);
        repo.insert(
            &CredentialInput {
                issuer_id,
                name: name.to_owned(),
                env: Env::Prod,
                scope: None,
                owner: None,
                rotation_policy_days: None,
                rotation_runbook_id: None,
                expires_at: None,
                hash_hint: None,
                kind: Default::default(),
                url: None,
                username: None,
                primary_label: None,
                secondary_label: None,
            },
            format!("vault/credentials/{name}"),
        )
        .await
        .unwrap()
    }

    /// 기본 Incident 를 구성하는 빌더 (source/severity/issuer_id 커스터마이즈 가능).
    fn make_incident(
        source: IncidentSource,
        severity: IncidentSeverity,
        issuer_id: Option<IssuerId>,
        suffix: &str,
    ) -> Incident {
        let now = OffsetDateTime::now_utc();
        Incident {
            id: IncidentId::new(),
            source,
            source_id: format!("CVE-TEST-{suffix}"),
            issuer_id,
            severity,
            title: format!("Test incident {suffix}"),
            body: None,
            url: None,
            detected_at: now,
            published_at: None,
        }
    }

    // -----------------------------------------------------------------------
    // T1: list — 기본 필터 없이 3개 모두 반환, detected_at DESC 정렬
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_all_no_filter() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        // 순서를 다르게 삽입해 정렬 확인
        let base = OffsetDateTime::from_unix_timestamp(1_700_000_000).unwrap();
        let mut i1 = make_incident(IncidentSource::Nvd, IncidentSeverity::High, None, "1");
        i1.detected_at = base;
        let mut i2 = make_incident(IncidentSource::Rss, IncidentSeverity::Low, None, "2");
        i2.detected_at = base + time::Duration::seconds(10);
        let mut i3 = make_incident(IncidentSource::Ghsa, IncidentSeverity::Critical, None, "3");
        i3.detected_at = base + time::Duration::seconds(20);

        repo.insert(&i1).await.unwrap();
        repo.insert(&i2).await.unwrap();
        repo.insert(&i3).await.unwrap();

        let filter = IncidentFilter::default();
        let results = repo.list(&filter).await.unwrap();

        assert_eq!(results.len(), 3);
        // DESC 정렬: i3 → i2 → i1
        assert_eq!(results[0].source_id, "CVE-TEST-3");
        assert_eq!(results[1].source_id, "CVE-TEST-2");
        assert_eq!(results[2].source_id, "CVE-TEST-1");
    }

    // -----------------------------------------------------------------------
    // T2: list — source 필터 (nvd 1개)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_filter_by_source() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        repo.insert(&make_incident(
            IncidentSource::Nvd,
            IncidentSeverity::High,
            None,
            "nvd",
        ))
        .await
        .unwrap();
        repo.insert(&make_incident(
            IncidentSource::Rss,
            IncidentSeverity::Low,
            None,
            "rss1",
        ))
        .await
        .unwrap();
        repo.insert(&make_incident(
            IncidentSource::Rss,
            IncidentSeverity::Low,
            None,
            "rss2",
        ))
        .await
        .unwrap();

        let filter = IncidentFilter {
            source: Some(IncidentSource::Nvd),
            ..Default::default()
        };
        let results = repo.list(&filter).await.unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_id, "CVE-TEST-nvd");
    }

    // -----------------------------------------------------------------------
    // T3: list — severity 필터
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_filter_by_severity() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        repo.insert(&make_incident(
            IncidentSource::Nvd,
            IncidentSeverity::Critical,
            None,
            "crit",
        ))
        .await
        .unwrap();
        repo.insert(&make_incident(
            IncidentSource::Rss,
            IncidentSeverity::Low,
            None,
            "low",
        ))
        .await
        .unwrap();

        let filter = IncidentFilter {
            severity: Some(IncidentSeverity::Critical),
            ..Default::default()
        };
        let results = repo.list(&filter).await.unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_id, "CVE-TEST-crit");
    }

    // -----------------------------------------------------------------------
    // T4: list — issuer_id 필터
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_filter_by_issuer_id() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let issuer_a = insert_issuer(&pool, "stripe").await;
        let issuer_b = insert_issuer(&pool, "openai").await;

        repo.insert(&make_incident(
            IncidentSource::Rss,
            IncidentSeverity::High,
            Some(issuer_a),
            "a1",
        ))
        .await
        .unwrap();
        repo.insert(&make_incident(
            IncidentSource::Rss,
            IncidentSeverity::High,
            Some(issuer_a),
            "a2",
        ))
        .await
        .unwrap();
        repo.insert(&make_incident(
            IncidentSource::Rss,
            IncidentSeverity::High,
            Some(issuer_b),
            "b1",
        ))
        .await
        .unwrap();
        repo.insert(&make_incident(
            IncidentSource::Rss,
            IncidentSeverity::Low,
            None,
            "none",
        ))
        .await
        .unwrap();

        let filter = IncidentFilter {
            issuer_id: Some(issuer_a),
            ..Default::default()
        };
        let results = repo.list(&filter).await.unwrap();

        assert_eq!(results.len(), 2);
        for r in &results {
            assert_eq!(r.issuer_id, Some(issuer_a));
        }
    }

    // -----------------------------------------------------------------------
    // T5: list — 모든 match 가 dismissed 인 incident 는 기본 제외,
    //           include_dismissed = true 이면 포함
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_excludes_all_dismissed_incidents_by_default() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let issuer_id = insert_issuer(&pool, "github").await;
        let cred_id = insert_credential(&pool, issuer_id, "gh-token").await;

        // Incident A: match 2개 모두 dismissed
        let inc_a = make_incident(IncidentSource::Rss, IncidentSeverity::High, None, "A");
        repo.insert(&inc_a).await.unwrap();
        let m1 = repo
            .insert_match(inc_a.id, cred_id, MatchReason::IssuerMatch)
            .await
            .unwrap();
        let m2 = repo
            .insert_match(inc_a.id, cred_id, MatchReason::Keyword)
            .await
            .unwrap();
        repo.dismiss_match(m1).await.unwrap();
        repo.dismiss_match(m2).await.unwrap();

        // Incident B: match 1개 활성
        let inc_b = make_incident(IncidentSource::Rss, IncidentSeverity::Low, None, "B");
        repo.insert(&inc_b).await.unwrap();
        repo.insert_match(inc_b.id, cred_id, MatchReason::Keyword)
            .await
            .unwrap();

        // include_dismissed = false (default) → B 만
        let filter_default = IncidentFilter::default();
        let results = repo.list(&filter_default).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_id, "CVE-TEST-B");

        // include_dismissed = true → A, B 모두
        let filter_all = IncidentFilter {
            include_dismissed: true,
            ..Default::default()
        };
        let results_all = repo.list(&filter_all).await.unwrap();
        assert_eq!(results_all.len(), 2);
    }

    // -----------------------------------------------------------------------
    // T6: list — match 없는 incident 는 항상 포함 (default filter)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_includes_incident_without_matches() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        // match 없는 incident
        let inc = make_incident(IncidentSource::Nvd, IncidentSeverity::Info, None, "nomatch");
        repo.insert(&inc).await.unwrap();

        let filter = IncidentFilter::default();
        let results = repo.list(&filter).await.unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_id, "CVE-TEST-nomatch");
    }

    // -----------------------------------------------------------------------
    // T7: list_incidents_for_credential — 기본
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_incidents_for_credential_basic() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let issuer_id = insert_issuer(&pool, "aws").await;
        let cred_x = insert_credential(&pool, issuer_id, "aws-key").await;
        let cred_y = insert_credential(&pool, issuer_id, "aws-key-2").await;

        let inc1 = make_incident(IncidentSource::Nvd, IncidentSeverity::High, None, "I1");
        let inc2 = make_incident(IncidentSource::Nvd, IncidentSeverity::Low, None, "I2");
        let inc3 = make_incident(IncidentSource::Rss, IncidentSeverity::Critical, None, "I3");
        repo.insert(&inc1).await.unwrap();
        repo.insert(&inc2).await.unwrap();
        repo.insert(&inc3).await.unwrap();

        repo.insert_match(inc1.id, cred_x, MatchReason::IssuerMatch)
            .await
            .unwrap();
        repo.insert_match(inc2.id, cred_x, MatchReason::Keyword)
            .await
            .unwrap();
        repo.insert_match(inc3.id, cred_y, MatchReason::IssuerMatch)
            .await
            .unwrap();

        let results = repo.list_incidents_for_credential(cred_x).await.unwrap();
        assert_eq!(results.len(), 2);

        let results_y = repo.list_incidents_for_credential(cred_y).await.unwrap();
        assert_eq!(results_y.len(), 1);
    }

    // -----------------------------------------------------------------------
    // T8: list_incidents_for_credential — dismissed match 는 무시
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_incidents_for_credential_ignores_dismissed() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let issuer_id = insert_issuer(&pool, "google").await;
        let cred_x = insert_credential(&pool, issuer_id, "gcp-key").await;

        let inc1 = make_incident(IncidentSource::Rss, IncidentSeverity::High, None, "D1");
        let inc2 = make_incident(IncidentSource::Rss, IncidentSeverity::High, None, "D2");
        repo.insert(&inc1).await.unwrap();
        repo.insert(&inc2).await.unwrap();

        // inc1 의 match: dismissed
        let m = repo
            .insert_match(inc1.id, cred_x, MatchReason::Keyword)
            .await
            .unwrap();
        repo.dismiss_match(m).await.unwrap();
        // inc2 의 match: active
        repo.insert_match(inc2.id, cred_x, MatchReason::Keyword)
            .await
            .unwrap();

        let results = repo.list_incidents_for_credential(cred_x).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_id, "CVE-TEST-D2");
    }

    // -----------------------------------------------------------------------
    // T9: dismiss_matches_for_incident — active 만 업데이트
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_dismiss_matches_for_incident_updates_active_only() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let issuer_id = insert_issuer(&pool, "vercel").await;
        let cred_a = insert_credential(&pool, issuer_id, "vercel-a").await;
        let cred_b = insert_credential(&pool, issuer_id, "vercel-b").await;
        let cred_c = insert_credential(&pool, issuer_id, "vercel-c").await;

        let inc = make_incident(IncidentSource::Rss, IncidentSeverity::Medium, None, "I");
        repo.insert(&inc).await.unwrap();

        // match 3개: cred_a 이미 dismissed, cred_b/cred_c active
        let m_a = repo
            .insert_match(inc.id, cred_a, MatchReason::Keyword)
            .await
            .unwrap();
        repo.dismiss_match(m_a).await.unwrap();
        repo.insert_match(inc.id, cred_b, MatchReason::Keyword)
            .await
            .unwrap();
        repo.insert_match(inc.id, cred_c, MatchReason::Keyword)
            .await
            .unwrap();

        let updated = repo.dismiss_matches_for_incident(inc.id).await.unwrap();
        assert_eq!(updated, 2, "활성 2개만 업데이트되어야 함");

        // 이후 모든 match 가 dismissed 상태여야 함
        let matches = repo.list_matches_for_credential(cred_a).await.unwrap();
        assert!(matches[0].dismissed_at.is_some());
        let matches_b = repo.list_matches_for_credential(cred_b).await.unwrap();
        assert!(matches_b[0].dismissed_at.is_some());
        let matches_c = repo.list_matches_for_credential(cred_c).await.unwrap();
        assert!(matches_c[0].dismissed_at.is_some());

        // list (include_dismissed=false) 는 이 incident 를 제외해야 함
        let filter = IncidentFilter::default();
        let remaining = repo.list(&filter).await.unwrap();
        assert!(remaining.is_empty());
    }

    // -----------------------------------------------------------------------
    // T10: list_with_matches — match 없는 incident: matches 배열이 비어있어야 함
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_with_matches_empty_matches() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let inc = make_incident(IncidentSource::Nvd, IncidentSeverity::Info, None, "nomatch");
        repo.insert(&inc).await.unwrap();

        let filter = IncidentFilter::default();
        let entries = repo.list_with_matches(&filter).await.unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].incident.source_id, "CVE-TEST-nomatch");
        assert!(
            entries[0].matches.is_empty(),
            "match 없는 incident 의 matches 는 빈 배열이어야 함"
        );
    }

    // -----------------------------------------------------------------------
    // T11: list_with_matches — match 여러 개: credential label / issuer name 포함
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_with_matches_multiple_matches() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let issuer_id = insert_issuer(&pool, "stripe").await;
        let cred_a = insert_credential(&pool, issuer_id, "stripe-live").await;
        let cred_b = insert_credential(&pool, issuer_id, "stripe-test").await;

        let inc = make_incident(IncidentSource::Rss, IncidentSeverity::High, None, "multi");
        repo.insert(&inc).await.unwrap();
        repo.insert_match(inc.id, cred_a, MatchReason::IssuerMatch)
            .await
            .unwrap();
        repo.insert_match(inc.id, cred_b, MatchReason::Keyword)
            .await
            .unwrap();

        let filter = IncidentFilter::default();
        let entries = repo.list_with_matches(&filter).await.unwrap();

        assert_eq!(entries.len(), 1);
        let entry = &entries[0];
        assert_eq!(entry.incident.source_id, "CVE-TEST-multi");
        assert_eq!(entry.matches.len(), 2);

        let labels: Vec<&str> = entry
            .matches
            .iter()
            .map(|m| m.credential_label.as_str())
            .collect();
        assert!(labels.contains(&"stripe-live"));
        assert!(labels.contains(&"stripe-test"));

        // issuer_display_name 이 채워져 있어야 함
        for m in &entry.matches {
            assert_eq!(
                m.issuer_display_name.as_deref(),
                Some("stripe"),
                "issuer display_name 은 'stripe' 이어야 함"
            );
        }
    }

    // -----------------------------------------------------------------------
    // T13: list_incidents_with_matches_for_credential
    //      — credential 2개 incident, 하나 active 하나 dismissed 모두 반환
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_incidents_with_matches_for_credential_basic() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let issuer_id = insert_issuer(&pool, "aws-t13").await;
        let cred_x = insert_credential(&pool, issuer_id, "aws-t13-key").await;
        let cred_y = insert_credential(&pool, issuer_id, "aws-t13-other").await;

        let inc1 = make_incident(IncidentSource::Nvd, IncidentSeverity::High, None, "T13-A");
        let inc2 = make_incident(IncidentSource::Rss, IncidentSeverity::Low, None, "T13-B");
        // inc3 matches only cred_y — must NOT appear for cred_x
        let inc3 = make_incident(
            IncidentSource::Rss,
            IncidentSeverity::Critical,
            None,
            "T13-C",
        );
        repo.insert(&inc1).await.unwrap();
        repo.insert(&inc2).await.unwrap();
        repo.insert(&inc3).await.unwrap();

        // inc1 → cred_x (active)
        repo.insert_match(inc1.id, cred_x, MatchReason::IssuerMatch)
            .await
            .unwrap();
        // inc2 → cred_x (dismissed)
        let m2 = repo
            .insert_match(inc2.id, cred_x, MatchReason::Keyword)
            .await
            .unwrap();
        repo.dismiss_match(m2).await.unwrap();
        // inc3 → cred_y only
        repo.insert_match(inc3.id, cred_y, MatchReason::IssuerMatch)
            .await
            .unwrap();

        let entries = repo
            .list_incidents_with_matches_for_credential(&cred_x)
            .await
            .unwrap();

        // Both inc1 (active) and inc2 (dismissed) are returned
        assert_eq!(entries.len(), 2, "cred_x の incidents は2件であるべき");

        let ids: Vec<&str> = entries
            .iter()
            .map(|e| e.incident.source_id.as_str())
            .collect();
        assert!(ids.contains(&"CVE-TEST-T13-A"), "inc1 が含まれること");
        assert!(ids.contains(&"CVE-TEST-T13-B"), "inc2 が含まれること");

        // Each entry's matches array must contain only the match for cred_x
        for entry in &entries {
            assert_eq!(entry.matches.len(), 1);
            assert_eq!(entry.matches[0].credential_id, cred_x);
        }

        // Check dismissed_at semantics
        let inc1_entry = entries
            .iter()
            .find(|e| e.incident.source_id == "CVE-TEST-T13-A")
            .unwrap();
        assert!(
            inc1_entry.matches[0].dismissed_at.is_none(),
            "active match은 dismissed_at이 None"
        );

        let inc2_entry = entries
            .iter()
            .find(|e| e.incident.source_id == "CVE-TEST-T13-B")
            .unwrap();
        assert!(
            inc2_entry.matches[0].dismissed_at.is_some(),
            "dismissed match은 dismissed_at이 Some"
        );

        // cred_y should have 1 entry (inc3 only)
        let entries_y = repo
            .list_incidents_with_matches_for_credential(&cred_y)
            .await
            .unwrap();
        assert_eq!(entries_y.len(), 1);
        assert_eq!(entries_y[0].incident.source_id, "CVE-TEST-T13-C");
    }

    // -----------------------------------------------------------------------
    // T14: list_incidents_with_matches_for_credential — no matches → empty vec
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_incidents_with_matches_for_credential_empty() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let issuer_id = insert_issuer(&pool, "empty-t14").await;
        let cred_no_match = insert_credential(&pool, issuer_id, "unused-key").await;

        // Insert an incident with a match for a different credential
        let cred_other = insert_credential(&pool, issuer_id, "other-key").await;
        let inc = make_incident(IncidentSource::Nvd, IncidentSeverity::High, None, "T14");
        repo.insert(&inc).await.unwrap();
        repo.insert_match(inc.id, cred_other, MatchReason::Explicit)
            .await
            .unwrap();

        let entries = repo
            .list_incidents_with_matches_for_credential(&cred_no_match)
            .await
            .unwrap();

        assert!(entries.is_empty(), "매치 없는 credential은 빈 배열 반환");
    }

    // -----------------------------------------------------------------------
    // T15: insert — 동일 (source, source_id) 두 번 삽입 시 canonical id 반환,
    //       행은 1개만 존재해야 함
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_insert_returns_canonical_id_on_duplicate() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let mut inc = make_incident(IncidentSource::Nvd, IncidentSeverity::High, None, "DUP");
        // First insert — returns the row's own id.
        let id1 = repo.insert(&inc).await.unwrap();
        assert_eq!(id1, inc.id, "첫 번째 삽입은 자신의 id를 반환해야 함");

        // Second insert: same (source, source_id) but a fresh IncidentId.
        let original_id = inc.id;
        inc.id = IncidentId::new();
        let id2 = repo.insert(&inc).await.unwrap();
        assert_eq!(
            id2, original_id,
            "두 번째 삽입은 기존 canonical id를 반환해야 함"
        );

        // The table must contain exactly one row for this (source, source_id).
        let filter = IncidentFilter {
            source: Some(IncidentSource::Nvd),
            ..Default::default()
        };
        let rows = repo.list(&filter).await.unwrap();
        let dup_rows: Vec<_> = rows
            .iter()
            .filter(|r| r.source_id == "CVE-TEST-DUP")
            .collect();
        assert_eq!(dup_rows.len(), 1, "중복 삽입 후에도 행은 1개여야 함");
    }

    // -----------------------------------------------------------------------
    // T12: list_with_matches — dismissed match 포함/제외 동작 확인
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_list_with_matches_dismissed_handling() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let issuer_id = insert_issuer(&pool, "github").await;
        let cred_a = insert_credential(&pool, issuer_id, "gh-active").await;
        let cred_b = insert_credential(&pool, issuer_id, "gh-dismissed").await;

        // Incident A: match 하나 active, 하나 dismissed → default filter 에 포함됨
        let inc_a = make_incident(IncidentSource::Rss, IncidentSeverity::Medium, None, "DA");
        repo.insert(&inc_a).await.unwrap();
        repo.insert_match(inc_a.id, cred_a, MatchReason::IssuerMatch)
            .await
            .unwrap();
        let m_b = repo
            .insert_match(inc_a.id, cred_b, MatchReason::Keyword)
            .await
            .unwrap();
        repo.dismiss_match(m_b).await.unwrap();

        // Incident B: match 모두 dismissed → default filter 에서 제외됨
        let inc_b = make_incident(IncidentSource::Rss, IncidentSeverity::Low, None, "DB");
        repo.insert(&inc_b).await.unwrap();
        let m_c = repo
            .insert_match(inc_b.id, cred_b, MatchReason::Keyword)
            .await
            .unwrap();
        repo.dismiss_match(m_c).await.unwrap();

        // default filter: inc_A 만 포함, inc_B 제외
        let filter = IncidentFilter::default();
        let entries = repo.list_with_matches(&filter).await.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].incident.source_id, "CVE-TEST-DA");
        // 두 match 모두 포함 (active + dismissed)
        assert_eq!(entries[0].matches.len(), 2);

        // include_dismissed = true: 둘 다 포함
        let filter_all = IncidentFilter {
            include_dismissed: true,
            ..Default::default()
        };
        let entries_all = repo.list_with_matches(&filter_all).await.unwrap();
        assert_eq!(entries_all.len(), 2);
    }

    // -----------------------------------------------------------------------
    // H1 regression: insert_match is idempotent on (incident, cred, reason).
    //
    // Before migration 0004 + INSERT OR IGNORE, every feed refresh appended
    // a fresh row with a new ULID for the same triple.  The 27× duplicated
    // badge that surfaced in manual verification is exactly this drift.
    // These tests pin the new contract: same triple → same row, no growth.
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn insert_match_same_triple_returns_existing_id() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let issuer_id = insert_issuer(&pool, "openai").await;
        let cred_id = insert_credential(&pool, issuer_id, "key-1").await;
        let inc = make_incident(
            IncidentSource::Rss,
            IncidentSeverity::High,
            Some(issuer_id),
            "H1",
        );
        repo.insert(&inc).await.unwrap();

        let id1 = repo
            .insert_match(inc.id, cred_id, MatchReason::IssuerMatch)
            .await
            .unwrap();
        let id2 = repo
            .insert_match(inc.id, cred_id, MatchReason::IssuerMatch)
            .await
            .unwrap();
        let id3 = repo
            .insert_match(inc.id, cred_id, MatchReason::IssuerMatch)
            .await
            .unwrap();

        assert_eq!(id1, id2, "second insert must reuse the existing id");
        assert_eq!(
            id1, id3,
            "subsequent inserts must keep returning the same id"
        );

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM incident_match WHERE incident_id = ? AND credential_id = ?",
        )
        .bind(inc.id.to_string())
        .bind(cred_id.to_string())
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            count, 1,
            "exactly one row must survive after repeated inserts"
        );
    }

    #[tokio::test]
    async fn insert_match_different_reasons_remain_distinct() {
        let (_dir, pool) = make_pool().await;
        let repo = IncidentRepo::new(&pool);

        let issuer_id = insert_issuer(&pool, "openai").await;
        let cred_id = insert_credential(&pool, issuer_id, "key-1").await;
        let inc = make_incident(
            IncidentSource::Rss,
            IncidentSeverity::High,
            Some(issuer_id),
            "H1b",
        );
        repo.insert(&inc).await.unwrap();

        // The matcher in api-vault-feeds dedupes by credential, but the
        // storage layer must still allow distinct reasons for the same pair
        // — older tests rely on this shape and a future Explicit-reason
        // workflow will too.
        let id_issuer = repo
            .insert_match(inc.id, cred_id, MatchReason::IssuerMatch)
            .await
            .unwrap();
        let id_keyword = repo
            .insert_match(inc.id, cred_id, MatchReason::Keyword)
            .await
            .unwrap();

        assert_ne!(
            id_issuer, id_keyword,
            "different reason must allocate a new row"
        );

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM incident_match WHERE incident_id = ? AND credential_id = ?",
        )
        .bind(inc.id.to_string())
        .bind(cred_id.to_string())
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 2, "both reason rows must coexist");
    }
}
