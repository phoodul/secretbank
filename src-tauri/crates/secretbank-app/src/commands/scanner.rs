//! Tauri commands for env-file scanning + import (T034 + dogfooding Fix D).
//!
//! # prepare / commit 분리 정책
//!
//! `DetectedKeyWithValue.value` 는 `SecretBox<String>` 평문 — **절대 frontend
//! 로 직렬화 금지**. 따라서 폴더 드롭 흐름을 두 단계로 나눈다.
//!
//! 1. **prepare** (`env_scan_prepare`): 폴더/파일 스캔 → 평문은
//!    `EnvScanSessionStore` 에 보관, frontend 에는 값 없는 메타데이터
//!    (`EnvScanPreview { session_id, entries, expires_at_unix_ms }`) 만 반환.
//! 2. **commit** (`env_scan_commit`): session_id + 선택 인덱스 + project 이름
//!    → vault `put_secret` + SQLite `credential` + `project` + `usage` 기록.
//!    세션은 one-shot 소비.
//!
//! 기존 `env_scan_folder` 는 frontend "scanned:unknown" placeholder 값만
//! 저장하던 버그가 있어 제거됨. 대신 위 두 명령을 사용한다.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use secrecy::ExposeSecret;
use secretbank_audit::AuditActor;
use secretbank_connectors::env_scanner::DetectedKey;
use secretbank_core::{
    CredentialId, CredentialInput, CredentialKind, Env, IssuerId, ProjectId, ProjectInput,
    UsageInput, UsageWhereKind,
};
use secretbank_storage::sqlite::repositories::{
    credential::CredentialRepo, issuer::IssuerRepo, project::ProjectRepo, usage::UsageRepo,
};
use secretbank_storage::vault::SecretBytes;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, serde::Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum EnvScanError {
    #[error("path does not exist")]
    InvalidPath,

    #[error("path is not a directory or file")]
    UnsupportedPath,

    #[error("import session not found or expired: {session_id}")]
    SessionNotFound { session_id: String },

    #[error("row index {index} out of bounds (session has {total} entries)")]
    RowIndexOutOfBounds { index: usize, total: usize },

    #[error("vault locked — unlock before commit")]
    VaultLocked,

    #[error("storage error: {message}")]
    Storage { message: String },

    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<secretbank_storage::sqlite::StorageError> for EnvScanError {
    fn from(e: secretbank_storage::sqlite::StorageError) -> Self {
        Self::Storage {
            message: e.to_string(),
        }
    }
}

impl From<secretbank_storage::vault::VaultError> for EnvScanError {
    fn from(e: secretbank_storage::vault::VaultError) -> Self {
        match e {
            secretbank_storage::vault::VaultError::NotUnlocked => Self::VaultLocked,
            other => Self::Internal {
                message: other.to_string(),
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Progress event payload
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum ScanProgress {
    Started { path: String },
    Done { count: u32 },
}

// ---------------------------------------------------------------------------
// Preview / Commit DTOs
// ---------------------------------------------------------------------------

/// `env_scan_prepare` 응답 — 값 없는 메타데이터 + session_id.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvScanPreview {
    pub session_id: String,
    pub entries: Vec<DetectedKey>,
    /// 세션 만료 절대 시각 (Unix ms, frontend 카운트다운용).
    pub expires_at_unix_ms: i64,
    /// 스캔된 절대 경로 — frontend 가 project name 추론 시 참고.
    pub scanned_path: String,
}

/// 단일 entry 의 commit 결과.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvScanRowResult {
    pub entry_index: usize,
    pub credential_id: Option<String>,
    pub error: Option<String>,
}

/// `env_scan_commit` 응답 DTO.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvScanCommitResult {
    pub project_id: Option<String>,
    pub project_name: String,
    pub credentials_created: usize,
    pub usages_created: usize,
    pub failed: usize,
    pub rows: Vec<EnvScanRowResult>,
}

// ---------------------------------------------------------------------------
// Prepare — pure logic
// ---------------------------------------------------------------------------

/// Validate the path and run the scan on a blocking thread, then store
/// plaintext values in the session store.
pub async fn do_env_scan_prepare(
    path: String,
    ctx: &AppContext,
) -> Result<EnvScanPreview, EnvScanError> {
    let p = PathBuf::from(&path);

    if !p.exists() {
        return Err(EnvScanError::InvalidPath);
    }
    if !p.is_file() && !p.is_dir() {
        return Err(EnvScanError::UnsupportedPath);
    }

    let p_owned = p.clone();
    let detected = tokio::task::spawn_blocking(move || {
        secretbank_connectors::env_scanner::scan_path_with_values(&p_owned)
    })
    .await
    .map_err(|e| EnvScanError::Internal {
        message: e.to_string(),
    })?;

    let entries: Vec<DetectedKey> = detected.iter().map(|dkv| dkv.meta.clone()).collect();
    let session_id = ctx.env_scan_sessions.insert(path.clone(), detected);

    let expires_at_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as i64
        + (5 * 60 * 1000);

    Ok(EnvScanPreview {
        session_id,
        entries,
        expires_at_unix_ms,
        scanned_path: path,
    })
}

// ---------------------------------------------------------------------------
// Commit — pure logic
// ---------------------------------------------------------------------------

pub async fn do_env_scan_commit(
    session_id: &str,
    selected_indices: &[usize],
    project_name: &str,
    ctx: &AppContext,
) -> Result<EnvScanCommitResult, EnvScanError> {
    // 1. 세션 꺼내기 (one-shot)
    let session =
        ctx.env_scan_sessions
            .take(session_id)
            .ok_or_else(|| EnvScanError::SessionNotFound {
                session_id: session_id.to_owned(),
            })?;

    let total = session.entries.len();

    // 2. 인덱스 유효성
    for &idx in selected_indices {
        if idx >= total {
            return Err(EnvScanError::RowIndexOutOfBounds { index: idx, total });
        }
    }

    // 3. Issuer slug → IssuerId 매핑
    let issuers = IssuerRepo::new(&ctx.pool).list().await?;
    let slug_to_id: HashMap<String, IssuerId> =
        issuers.iter().map(|i| (i.slug.clone(), i.id)).collect();

    // issuer-regex 에 안 맞는 entry 는 "Uncategorized" 버킷으로.
    // (이전엔 "DB 첫 issuer" 로 떨어졌는데, BINARY 정렬상 첫 항목이 AWS 라
    //  무관한 키가 전부 AWS 로 오분류됐다.)
    let fallback_issuer_id: Option<IssuerId> = Some(
        IssuerRepo::new(&ctx.pool)
            .get_or_create_by_slug(crate::setup::UNCATEGORIZED_SLUG, "Uncategorized")
            .await?,
    );

    // 4. 선택된 항목 중 적어도 하나라도 있을 때만 Project 생성 (없으면 dry pass)
    let project_id: Option<ProjectId> = if !selected_indices.is_empty() {
        let input = ProjectInput {
            name: project_name.to_owned(),
            repo_url: None,
            framework: None,
            runtime: None,
            local_path: Some(session.scanned_path.clone()),
        };
        Some(ProjectRepo::new(&ctx.pool).insert(&input).await?)
    } else {
        None
    };

    // 5. vault write lock 획득
    let mut vault = ctx.vault.write().await;

    let cred_repo = CredentialRepo::new(&ctx.pool);
    let usage_repo = UsageRepo::new(&ctx.pool);

    let mut row_results: Vec<EnvScanRowResult> = Vec::with_capacity(selected_indices.len());
    let mut credentials_created: usize = 0;
    let mut usages_created: usize = 0;

    for &idx in selected_indices {
        let entry = &session.entries[idx];

        let issuer_id = match entry
            .meta
            .issuer_slug
            .as_ref()
            .and_then(|slug| slug_to_id.get(slug).copied())
        {
            Some(id) => id,
            None => match fallback_issuer_id {
                Some(id) => id,
                None => {
                    row_results.push(EnvScanRowResult {
                        entry_index: idx,
                        credential_id: None,
                        error: Some("no issuer available — seed at least one issuer".to_owned()),
                    });
                    continue;
                }
            },
        };

        let cred_name = entry.meta.env_var_name.clone().unwrap_or_else(|| {
            format!(
                "{}-{}",
                entry.meta.issuer_slug.as_deref().unwrap_or("key"),
                entry.meta.line
            )
        });

        let cred_id = CredentialId::new();
        let vault_ref = format!("credentials/{cred_id}");

        let input = CredentialInput {
            issuer_id,
            name: cred_name,
            env: Env::Prod,
            scope: None,
            hash_hint: Some(entry.meta.value_hint.clone()),
            owner: None,
            rotation_policy_days: None,
            rotation_runbook_id: None,
            expires_at: None,
            kind: CredentialKind::ApiKey,
            url: None,
            username: None,
            primary_label: None,
            secondary_label: None,
            custom_kind_label: None,
        };

        if let Err(e) = cred_repo
            .insert_with_id(Some(cred_id), &input, vault_ref.clone())
            .await
        {
            row_results.push(EnvScanRowResult {
                entry_index: idx,
                credential_id: None,
                error: Some(format!("db insert failed: {e}")),
            });
            continue;
        }

        let secret_bytes = SecretBytes::new(entry.value.expose_secret().as_bytes().to_vec());
        if let Err(e) = vault.put_secret(&vault_ref, secret_bytes).await {
            let _ = cred_repo.delete(cred_id).await;
            row_results.push(EnvScanRowResult {
                entry_index: idx,
                credential_id: None,
                error: Some(format!("vault write failed: {e}")),
            });
            continue;
        }

        credentials_created += 1;

        // usage 생성 (project 가 있고 env_var_name 또는 file_path 가 있을 때만)
        if let Some(pid) = project_id {
            let where_value = entry
                .meta
                .env_var_name
                .clone()
                .unwrap_or_else(|| entry.meta.file_path.clone());
            let usage_input = UsageInput {
                credential_id: cred_id,
                project_id: pid,
                deployment_id: None,
                where_kind: UsageWhereKind::EnvVar,
                where_value,
            };
            if let Err(e) = usage_repo.insert(&usage_input).await {
                tracing::warn!("usage insert failed for cred {cred_id}: {e}");
            } else {
                usages_created += 1;
            }
        }

        row_results.push(EnvScanRowResult {
            entry_index: idx,
            credential_id: Some(cred_id.to_string()),
            error: None,
        });
    }

    if let Err(e) = vault.flush().await {
        tracing::error!("vault flush failed after env scan commit: {e}");
    }
    drop(vault);

    let failed = row_results.iter().filter(|r| r.error.is_some()).count();

    ctx.audit
        .record(
            AuditActor::LocalUser,
            "env_scan.commit",
            "import",
            session_id,
            Some(
                serde_json::json!({
                    "session_id": session_id,
                    "credentials_created": credentials_created,
                    "usages_created": usages_created,
                    "failed": failed,
                })
                .to_string(),
            ),
        )
        .await;

    Ok(EnvScanCommitResult {
        project_id: project_id.map(|p| p.to_string()),
        project_name: project_name.to_owned(),
        credentials_created,
        usages_created,
        failed,
        rows: row_results,
    })
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// 폴더/파일을 스캔하고 평문 값을 세션에 보관한 후 preview 를 반환.
///
/// Emits `scan:progress` events:
/// - `{ phase: "started", path }` before scanning begins
/// - `{ phase: "done", count }` after scanning completes
#[tauri::command]
pub async fn env_scan_prepare(
    app: AppHandle,
    path: String,
    state: State<'_, AppContext>,
) -> Result<EnvScanPreview, EnvScanError> {
    let _ = app.emit(
        "scan:progress",
        ScanProgress::Started { path: path.clone() },
    );

    let result = do_env_scan_prepare(path, &state).await?;

    let _ = app.emit(
        "scan:progress",
        ScanProgress::Done {
            count: result.entries.len() as u32,
        },
    );

    Ok(result)
}

/// session_id + 선택된 entry 인덱스 + project 이름 → vault + credential +
/// project + usage 를 모두 기록한다. 세션은 one-shot 소비.
#[tauri::command]
pub async fn env_scan_commit(
    session_id: String,
    selected_indices: Vec<usize>,
    project_name: String,
    state: State<'_, AppContext>,
) -> Result<EnvScanCommitResult, EnvScanError> {
    do_env_scan_commit(&session_id, &selected_indices, &project_name, &state).await
}
