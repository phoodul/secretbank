use api_vault_core::{
    CredentialId, Incident, IncidentId, IncidentMatch, IncidentMatchId, IncidentSeverity,
    IncidentSource, IssuerId, MatchReason,
};
use sqlx::{Row, SqlitePool};
use time::OffsetDateTime;

use crate::sqlite::{dt_to_ms, ms_to_dt, ms_to_dt_opt, StorageError};

pub struct IncidentRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> IncidentRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(&self, incident: &Incident) -> Result<(), StorageError> {
        let id_str = incident.id.to_string();
        let issuer_id_str = incident.issuer_id.map(|i| i.to_string());
        let source_str = source_to_str(incident.source);
        let severity_str = severity_to_str(incident.severity);
        let detected_ms = dt_to_ms(incident.detected_at);
        let published_ms = incident.published_at.map(dt_to_ms);

        sqlx::query(
            r#"INSERT INTO incident
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

        Ok(())
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

    pub async fn insert_match(
        &self,
        incident_id: IncidentId,
        credential_id: CredentialId,
        reason: MatchReason,
    ) -> Result<IncidentMatchId, StorageError> {
        let id = IncidentMatchId::new();
        let id_str = id.to_string();
        let inc_id_str = incident_id.to_string();
        let cred_id_str = credential_id.to_string();
        let reason_str = reason_to_str(reason);
        let matched_ms = dt_to_ms(OffsetDateTime::now_utc());

        sqlx::query(
            r#"INSERT INTO incident_match (id, incident_id, credential_id, reason, matched_at)
               VALUES (?, ?, ?, ?, ?)"#,
        )
        .bind(&id_str)
        .bind(&inc_id_str)
        .bind(&cred_id_str)
        .bind(reason_str)
        .bind(matched_ms)
        .execute(self.pool)
        .await?;

        Ok(id)
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
