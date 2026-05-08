//! Tauri commands for CSV import (M24 Phase 2-3-a).
//!
//! # prepare / commit 분리 정책
//!
//! `DetectedFromCsv.value` 는 `SecretBox<String>` 평문 — **절대 frontend 로 직렬화 금지**.
//!
//! - `import_csv_prepare`: 파일 읽기 → parse_csv → rows_to_detected → ImportSessionStore 보관.
//!   Frontend 에는 값 없는 preview DTO (`CsvImportPreview`) 만 반환.
//! - `import_csv_commit` (2-3-a-4): session_id + 선택 row 인덱스 → vault 저장.
//!   세션에서 평문을 꺼내 vault + SQLite 에 기록한 후 세션을 소멸시킨다.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use secrecy::ExposeSecret;
use secretbank_audit::AuditActor;
use secretbank_connectors::import::csv_google::{parse_csv, CsvFormat, ImportError};
use secretbank_connectors::import::to_detected::{rows_to_detected, ToDetectedOptions};
use secretbank_core::{CredentialId, CredentialInput, CredentialKind, Env, IssuerId};
use secretbank_storage::sqlite::repositories::{credential::CredentialRepo, issuer::IssuerRepo};
use secretbank_storage::vault::SecretBytes;
use serde::Serialize;
use tauri::State;
use thiserror::Error;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ImportCommandError {
    #[error("file not found or unreadable: {message}")]
    FileIo { message: String },

    #[error("CSV parse error: {message}")]
    CsvParse { message: String },

    #[error("storage error: {message}")]
    Storage { message: String },

    #[error("internal: {message}")]
    Internal { message: String },

    /// `session_id` 로 세션을 찾을 수 없음 (만료되었거나 잘못된 ID).
    #[error("import session not found or expired: {session_id}")]
    SessionNotFound { session_id: String },

    /// vault 잠겨 있음.
    #[error("vault locked — unlock before import")]
    VaultLocked,

    /// 선택된 row index 가 session 범위를 벗어남.
    #[error("row index {index} out of bounds (session has {total} rows)")]
    RowIndexOutOfBounds { index: usize, total: usize },
}

impl From<ImportError> for ImportCommandError {
    fn from(e: ImportError) -> Self {
        match e {
            ImportError::InvalidHeader => Self::CsvParse {
                message: "invalid CSV header — required columns missing".to_owned(),
            },
            ImportError::Csv(inner) => Self::CsvParse {
                message: inner.to_string(),
            },
            ImportError::Io(inner) => Self::FileIo {
                message: inner.to_string(),
            },
        }
    }
}

impl From<secretbank_storage::sqlite::StorageError> for ImportCommandError {
    fn from(e: secretbank_storage::sqlite::StorageError) -> Self {
        Self::Storage {
            message: e.to_string(),
        }
    }
}

impl From<secretbank_storage::vault::VaultError> for ImportCommandError {
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
// Response DTOs — 평문 값 절대 포함 금지
// ---------------------------------------------------------------------------

/// `import_csv_prepare` 의 frontend 응답.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportPreview {
    /// commit 단계에서 사용할 세션 식별자 (16바이트 random hex).
    pub session_id: String,
    /// 감지된 CSV 포맷.
    pub format: String,
    /// password 가 있는 행 수 (empty_password 제외).
    pub total_rows: usize,
    /// password 빈 행으로 인해 스킵된 수.
    pub skipped_empty_password: usize,
    /// url 이 빈 행 수 (스킵되지는 않음).
    pub skipped_empty_url: usize,
    /// 세션 만료 절대 시각 (Unix ms, frontend 카운트다운용).
    pub expires_at_unix_ms: i64,
    /// 행별 preview (값 없는 메타데이터만).
    pub rows: Vec<CsvImportPreviewRow>,
}

/// CSV 1행의 preview DTO.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportPreviewRow {
    /// 0-based 인덱스 — commit 시 `selected_row_indices` 로 사용.
    pub row_index: usize,
    pub name: String,
    pub url: String,
    pub host: Option<String>,
    pub username: Option<String>,
    pub note: Option<String>,
    pub matched_issuer_slug: Option<String>,
    /// 마지막 4자 hint (DetectedFromCsv.value_hint).
    pub value_hint: String,
    pub env: String,
    /// vault 에 같은 hash_hint 를 가진 credential 이 이미 있으면 `true`.
    pub already_exists: bool,
}

// ---------------------------------------------------------------------------
// Tauri command
// ---------------------------------------------------------------------------

/// CSV 파일을 파싱하고 preview DTO 를 반환한다 (내부 로직).
///
/// `AppContext` 를 직접 받아 테스트 가능하게 분리.
pub async fn do_import_csv_prepare(
    file_path: &str,
    ctx: &AppContext,
) -> Result<CsvImportPreview, ImportCommandError> {
    // 1. 파일 읽기
    let bytes = std::fs::read(file_path).map_err(|e| ImportCommandError::FileIo {
        message: e.to_string(),
    })?;

    // 2. CSV 파싱
    let parsed = parse_csv(&bytes)?;

    let skipped_empty_password = parsed.warnings.empty_password;
    let skipped_empty_url = parsed.warnings.empty_url;
    let format_str = match parsed.format {
        CsvFormat::ChromeBrave => "ChromeBrave",
        CsvFormat::Edge => "Edge",
    };
    let format = parsed.format;
    let warnings = secretbank_connectors::import::csv_google::ImportWarnings {
        empty_password: skipped_empty_password,
        empty_url: skipped_empty_url,
    };

    // 3. issuer domains 로드 (IssuerRepo::list)
    let issuers = IssuerRepo::new(&ctx.pool).list().await?;
    let issuer_domains: Vec<(String, Vec<String>)> = issuers
        .iter()
        .map(|i| (i.slug.clone(), i.domains.clone()))
        .collect();

    // 4. rows_to_detected
    let detected = rows_to_detected(
        parsed,
        &ToDetectedOptions {
            default_env: "prod",
            issuer_domains: &issuer_domains,
        },
    );

    let total_rows = detected.len();

    // 5. already_exists 계산 — vault 에서 모든 hash_hint 를 한 번 로드 → HashSet
    let cred_repo = CredentialRepo::new(&ctx.pool);
    let all_creds = cred_repo
        .list(&secretbank_core::CredentialFilter::default())
        .await?;
    let existing_hints: HashSet<String> = all_creds
        .iter()
        .filter_map(|c| c.hash_hint.clone())
        .filter(|h| !h.is_empty())
        .collect();

    // 6. preview rows 구성 (평문 value 절대 포함 금지)
    let preview_rows: Vec<CsvImportPreviewRow> = detected
        .iter()
        .enumerate()
        .map(|(i, row)| CsvImportPreviewRow {
            row_index: i,
            name: row.name.clone(),
            url: row.url.clone(),
            host: row.host.clone(),
            username: row.username.clone(),
            note: row.note.clone(),
            matched_issuer_slug: row.matched_issuer_slug.clone(),
            value_hint: row.value_hint.clone(),
            env: row.env.clone(),
            already_exists: existing_hints.contains(&row.value_hint),
        })
        .collect();

    // 7. ImportSessionStore 에 평문 보관
    let session_id = ctx.import_sessions.insert(detected, format, warnings);

    // 8. 만료 절대 시각 계산 (Unix ms)
    let expires_at_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as i64
        + (5 * 60 * 1000); // DEFAULT_SESSION_TTL = 5분

    // 9. Audit best-effort
    ctx.audit
        .record(
            AuditActor::LocalUser,
            "import.csv.prepare",
            "import",
            &session_id,
            Some(
                serde_json::json!({
                    "format": format_str,
                    "total_rows": total_rows,
                    "session_id": session_id,
                })
                .to_string(),
            ),
        )
        .await;

    Ok(CsvImportPreview {
        session_id,
        format: format_str.to_owned(),
        total_rows,
        skipped_empty_password,
        skipped_empty_url,
        expires_at_unix_ms,
        rows: preview_rows,
    })
}

// ---------------------------------------------------------------------------
// Commit DTOs
// ---------------------------------------------------------------------------

/// 단일 행의 commit 결과.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRowResult {
    /// 0-based row index.
    pub row_index: usize,
    /// 저장 성공 시 `Some(credential_id)`.
    pub credential_id: Option<String>,
    /// 저장 실패 시 오류 메시지.
    pub error: Option<String>,
}

/// `import_csv_commit` 의 응답 DTO.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommitResult {
    /// 성공한 행 수.
    pub imported: usize,
    /// 실패한 행 수.
    pub failed: usize,
    /// 행별 결과 (선택된 행만 포함).
    pub rows: Vec<ImportRowResult>,
}

// ---------------------------------------------------------------------------
// Commit inner function
// ---------------------------------------------------------------------------

/// `import_csv_commit` 핵심 로직 (테스트 가능하도록 `AppContext` 직접 수신).
///
/// ## 동작
///
/// 1. `ImportSessionStore::take(session_id)` — 없으면 `SessionNotFound`.
/// 2. `selected_row_indices` 유효성 확인.
/// 3. Issuer `list()` → slug → `IssuerId` HashMap 구성.
/// 4. vault write lock 획득.
/// 5. 선택된 각 행에 대해 vault `put_secret` + SQLite `insert` (best-effort 트랜잭션).
///    실패한 행은 `ImportRowResult::error` 에 기록하고 이후 행 계속 처리.
/// 6. audit 기록 (best-effort).
pub async fn do_import_csv_commit(
    session_id: &str,
    selected_row_indices: &[usize],
    ctx: &AppContext,
) -> Result<ImportCommitResult, ImportCommandError> {
    // 1. 세션 꺼내기 (one-shot)
    let session = ctx.import_sessions.take(session_id).ok_or_else(|| {
        ImportCommandError::SessionNotFound {
            session_id: session_id.to_owned(),
        }
    })?;

    let total_rows = session.rows.len();

    // 2. 인덱스 유효성 검사
    for &idx in selected_row_indices {
        if idx >= total_rows {
            return Err(ImportCommandError::RowIndexOutOfBounds {
                index: idx,
                total: total_rows,
            });
        }
    }

    // 3. Issuer slug → IssuerId 매핑 (list 한 번만 호출)
    let issuers = IssuerRepo::new(&ctx.pool).list().await?;
    let slug_to_id: HashMap<String, IssuerId> = issuers
        .into_iter()
        .map(|i| (i.slug.clone(), i.id))
        .collect();

    // "unknown" issuer fallback: list 에서 첫 번째 issuer 또는 None
    // credential insert 는 issuer_id 가 NOT NULL 이므로 없으면 Internal 에러.
    let fallback_issuer_id: Option<IssuerId> = {
        let all = IssuerRepo::new(&ctx.pool).list().await?;
        all.into_iter().next().map(|i| i.id)
    };

    // 4. vault write lock 획득 (루프 전에 한 번만)
    let mut vault = ctx.vault.write().await;

    let cred_repo = CredentialRepo::new(&ctx.pool);

    let mut row_results: Vec<ImportRowResult> = Vec::with_capacity(selected_row_indices.len());

    // 5. 선택된 행만 처리
    for &idx in selected_row_indices {
        let row = &session.rows[idx];

        // issuer_id 결정
        let issuer_id = match &row.matched_issuer_slug {
            Some(slug) => slug_to_id.get(slug).copied(),
            None => None,
        }
        .or(fallback_issuer_id);

        let issuer_id = match issuer_id {
            Some(id) => id,
            None => {
                row_results.push(ImportRowResult {
                    row_index: idx,
                    credential_id: None,
                    error: Some("no issuer available — seed at least one issuer".to_owned()),
                });
                continue;
            }
        };

        // env 파싱 (기본 "prod")
        let env = match row.env.as_str() {
            "dev" => Env::Dev,
            "staging" => Env::Staging,
            _ => Env::Prod,
        };

        let cred_id = CredentialId::new();
        let vault_ref = format!("credentials/{cred_id}");

        // CredentialInput 구성
        let input = CredentialInput {
            issuer_id,
            name: row.name.clone(),
            env,
            scope: None,
            hash_hint: Some(row.value_hint.clone()),
            owner: None,
            rotation_policy_days: None,
            rotation_runbook_id: None,
            expires_at: None,
            kind: CredentialKind::Password,
            url: if row.url.is_empty() {
                None
            } else {
                Some(row.url.clone())
            },
            username: row.username.clone(),
            primary_label: None,
            secondary_label: None,
        };

        // SQLite insert
        if let Err(e) = cred_repo
            .insert_with_id(Some(cred_id), &input, vault_ref.clone())
            .await
        {
            row_results.push(ImportRowResult {
                row_index: idx,
                credential_id: None,
                error: Some(format!("db insert failed: {e}")),
            });
            continue;
        }

        // vault put_secret — 실패 시 DB row 롤백
        let secret_bytes = SecretBytes::new(row.value.expose_secret().as_bytes().to_vec());
        if let Err(e) = vault.put_secret(&vault_ref, secret_bytes).await {
            // best-effort rollback
            let _ = cred_repo.delete(cred_id).await;
            row_results.push(ImportRowResult {
                row_index: idx,
                credential_id: None,
                error: Some(format!("vault write failed: {e}")),
            });
            continue;
        }

        row_results.push(ImportRowResult {
            row_index: idx,
            credential_id: Some(cred_id.to_string()),
            error: None,
        });
    }

    // 5b. vault flush (AgeVaultStorage 는 flush 에서 파일에 씀)
    if let Err(e) = vault.flush().await {
        // flush 실패는 치명적 — 하지만 이미 저장된 행을 되돌리기 어려우므로 로그만
        tracing::error!("vault flush failed after CSV import commit: {e}");
    }
    drop(vault); // write lock 해제

    let imported = row_results.iter().filter(|r| r.error.is_none()).count();
    let failed = row_results.iter().filter(|r| r.error.is_some()).count();

    // 6. audit (best-effort)
    ctx.audit
        .record(
            AuditActor::LocalUser,
            "import.csv.commit",
            "import",
            session_id,
            Some(
                serde_json::json!({
                    "session_id": session_id,
                    "imported": imported,
                    "failed": failed,
                })
                .to_string(),
            ),
        )
        .await;

    Ok(ImportCommitResult {
        imported,
        failed,
        rows: row_results,
    })
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Tauri command — CSV 파일을 파싱하고 preview DTO 를 반환한다.
///
/// 평문 비밀번호는 `ImportSessionStore` 에 보관 (5분 TTL). Frontend 에는 값 없는 메타데이터만.
#[tauri::command]
pub async fn import_csv_prepare(
    file_path: String,
    state: State<'_, AppContext>,
) -> Result<CsvImportPreview, ImportCommandError> {
    do_import_csv_prepare(&file_path, &state).await
}

/// Tauri command — session_id + 선택된 row index 로 vault 에 credential 을 저장한다.
///
/// 세션을 one-shot 으로 소비하므로 같은 session_id 로 재호출하면 `SessionNotFound`.
#[tauri::command]
pub async fn import_csv_commit(
    session_id: String,
    selected_row_indices: Vec<usize>,
    state: State<'_, AppContext>,
) -> Result<ImportCommitResult, ImportCommandError> {
    do_import_csv_commit(&session_id, &selected_row_indices, &state).await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use secrecy::SecretString;
    use secretbank_core::{CredentialInput, Env, IssuerInput};
    use secretbank_storage::sqlite::repositories::{
        credential::CredentialRepo, issuer::IssuerRepo,
    };
    use secretbank_storage::vault::mock::MockVaultStorage;
    use secretbank_storage::vault::{ExposeSecret, SecretBytes, VaultStorage as _};
    use tempfile::NamedTempFile;
    use tokio::sync::{Mutex, RwLock};

    use crate::audit_ctx::AuditCtx;
    use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
    use crate::context::AppContext;
    use crate::import::ImportSessionStore;
    use crate::services::device_identity::DeviceIdentity;

    use super::*;

    // -----------------------------------------------------------------------
    // 헬퍼
    // -----------------------------------------------------------------------

    async fn make_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = secretbank_storage::sqlite::init_pool(&db_path)
            .await
            .expect("init_pool");
        (dir, pool)
    }

    async fn make_unlocked_vault() -> MockVaultStorage {
        let mut v = MockVaultStorage::new("pw");
        v.unlock(SecretString::from("pw".to_owned())).await.unwrap();
        v
    }

    fn make_ctx(pool: Arc<sqlx::SqlitePool>, vault: MockVaultStorage) -> AppContext {
        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> = Arc::new(RwLock::new(None));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));
        AppContext {
            vault: vault_arc,
            pool,
            data_dir: std::path::PathBuf::from("/tmp/test"),
            user_id: "test".to_string(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
            import_sessions: Arc::new(ImportSessionStore::new()),
            relay_client: Arc::new(
                crate::services::relay_client::RelayClient::new(
                    url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap(),
            ),
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter: crate::services::sync_emit::noop_emitter(),
            pairing_session: Arc::new(RwLock::new(None)),
        }
    }

    async fn seed_issuer(
        pool: &sqlx::SqlitePool,
        slug: &str,
        domains: Vec<String>,
    ) -> secretbank_core::IssuerId {
        IssuerRepo::new(pool)
            .insert(&IssuerInput {
                slug: slug.to_owned(),
                display_name: slug.to_owned(),
                domains,
                ..Default::default()
            })
            .await
            .expect("issuer insert")
    }

    async fn seed_credential_with_hint(
        pool: &sqlx::SqlitePool,
        vault: &mut MockVaultStorage,
        issuer_id: secretbank_core::IssuerId,
        hash_hint: &str,
    ) -> secretbank_core::CredentialId {
        let repo = CredentialRepo::new(pool);
        let id = secretbank_core::CredentialId::new();
        let input = CredentialInput {
            issuer_id,
            name: "existing".to_owned(),
            env: Env::Prod,
            hash_hint: Some(hash_hint.to_owned()),
            scope: None,
            owner: None,
            rotation_policy_days: None,
            rotation_runbook_id: None,
            expires_at: None,
            kind: Default::default(),
            url: None,
            username: None,
            primary_label: None,
            secondary_label: None,
        };
        let vault_ref = format!("credentials/{id}");
        repo.insert_with_id(Some(id), &input, vault_ref.clone())
            .await
            .expect("credential insert");
        vault
            .put_secret(&vault_ref, SecretBytes::new(b"dummy".to_vec()))
            .await
            .unwrap();
        id
    }

    // -----------------------------------------------------------------------
    // T_prepare_1: 유효한 CSV + github issuer → matched_issuer_slug == "github"
    //              + session_id non-empty + preview rows 수 일치
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn prepare_command_success_matched_issuer() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;

        // github issuer 시드
        seed_issuer(&pool, "github", vec!["github.com".to_owned()]).await;

        let ctx = make_ctx(pool.clone(), vault);

        let mut tmp = NamedTempFile::new().expect("tempfile");
        std::io::Write::write_all(
            &mut tmp,
            b"name,url,username,password,note\nGitHub,https://github.com/settings/tokens,alice,ghp_secret,dev",
        )
        .unwrap();

        let preview = do_import_csv_prepare(tmp.path().to_str().unwrap(), &ctx)
            .await
            .expect("prepare must succeed");

        assert!(
            !preview.session_id.is_empty(),
            "session_id must not be empty"
        );
        assert_eq!(
            preview.session_id.len(),
            32,
            "session_id must be 32 hex chars"
        );
        assert_eq!(preview.total_rows, 1);
        assert_eq!(preview.format, "ChromeBrave");
        assert_eq!(preview.rows.len(), 1);
        assert_eq!(
            preview.rows[0].matched_issuer_slug.as_deref(),
            Some("github"),
            "github.com should match github issuer"
        );
        assert_eq!(preview.rows[0].row_index, 0);
        assert!(
            !preview.rows[0].already_exists,
            "no existing credentials yet"
        );
    }

    // -----------------------------------------------------------------------
    // T_prepare_2: 존재하지 않는 파일 → ImportCommandError::FileIo
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn prepare_command_invalid_file() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx(pool, vault);

        let result = do_import_csv_prepare("/nonexistent/path/to/file.csv", &ctx).await;

        assert!(result.is_err(), "nonexistent file must return Err");
        assert!(
            matches!(result.unwrap_err(), ImportCommandError::FileIo { .. }),
            "must be FileIo variant"
        );
    }

    // -----------------------------------------------------------------------
    // T_prepare_3: already_exists — vault 에 동일 hint 가 있으면 true
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn prepare_command_already_exists_flag() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        let issuer_id = seed_issuer(&pool, "github", vec!["github.com".to_owned()]).await;
        // "ghp_secret" 의 마지막 4자 = "cret"
        seed_credential_with_hint(&pool, &mut vault, issuer_id, "cret").await;

        let ctx = make_ctx(pool.clone(), vault);

        let mut tmp = NamedTempFile::new().expect("tempfile");
        std::io::Write::write_all(
            &mut tmp,
            b"name,url,username,password,note\nGitHub,https://github.com,alice,ghp_secret,",
        )
        .unwrap();

        let preview = do_import_csv_prepare(tmp.path().to_str().unwrap(), &ctx)
            .await
            .expect("prepare must succeed");

        assert_eq!(preview.rows.len(), 1);
        assert!(
            preview.rows[0].already_exists,
            "already_exists must be true when vault has same hint"
        );
    }

    // -----------------------------------------------------------------------
    // T_prepare_4: session 이 store 에 저장되고 take 가능
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn prepare_stores_session_takeable() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx(pool.clone(), vault);

        let mut tmp = NamedTempFile::new().expect("tempfile");
        std::io::Write::write_all(
            &mut tmp,
            b"name,url,username,password\nSite,https://example.com,user,mypassword123",
        )
        .unwrap();

        let preview = do_import_csv_prepare(tmp.path().to_str().unwrap(), &ctx)
            .await
            .expect("prepare must succeed");

        // session 이 store 에 들어있어야 함
        let session = ctx.import_sessions.take(&preview.session_id);
        assert!(session.is_some(), "session must be takeable after prepare");
        let s = session.unwrap();
        assert_eq!(s.rows.len(), 1);

        // 두 번째 take → None (one-shot)
        assert!(ctx.import_sessions.take(&preview.session_id).is_none());
    }

    // -----------------------------------------------------------------------
    // T_prepare_5: invalid CSV header → CsvParse 오류
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn prepare_command_invalid_csv_header() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx(pool, vault);

        let mut tmp = NamedTempFile::new().expect("tempfile");
        std::io::Write::write_all(&mut tmp, b"foo,bar,baz\n1,2,3").unwrap();

        let result = do_import_csv_prepare(tmp.path().to_str().unwrap(), &ctx).await;
        assert!(result.is_err());
        assert!(
            matches!(result.unwrap_err(), ImportCommandError::CsvParse { .. }),
            "must be CsvParse variant for missing password column"
        );
    }

    // -----------------------------------------------------------------------
    // T_commit_1: prepare → commit(all rows) → credential 저장 확인
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn commit_stores_credentials_in_vault_and_db() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;

        seed_issuer(&pool, "github", vec!["github.com".to_owned()]).await;

        let ctx = make_ctx(pool.clone(), vault);

        // prepare
        let mut tmp = NamedTempFile::new().expect("tempfile");
        std::io::Write::write_all(
            &mut tmp,
            b"name,url,username,password,note\n\
              GitHub,https://github.com/settings/tokens,alice,ghp_secret123,\n\
              Other,https://other.example.com,bob,otherpass456,",
        )
        .unwrap();

        let preview = do_import_csv_prepare(tmp.path().to_str().unwrap(), &ctx)
            .await
            .expect("prepare must succeed");
        assert_eq!(preview.total_rows, 2);

        // commit all rows
        let result = do_import_csv_commit(&preview.session_id, &[0, 1], &ctx)
            .await
            .expect("commit must succeed");

        assert_eq!(result.imported, 2, "both rows must be imported");
        assert_eq!(result.failed, 0, "no failures");
        assert_eq!(result.rows.len(), 2);

        // DB 에 credential 이 생성되었는지 확인
        let cred_repo = CredentialRepo::new(&pool);
        let all = cred_repo
            .list(&secretbank_core::CredentialFilter::default())
            .await
            .expect("list");
        assert_eq!(all.len(), 2, "two credentials must be in DB");

        // vault 에 secret 이 저장되었는지 확인
        let cred_id_str = result.rows[0].credential_id.as_ref().unwrap();
        let vault_ref = format!("credentials/{cred_id_str}");
        let vault_guard = ctx.vault.read().await;
        let secret = vault_guard
            .get_secret(&vault_ref)
            .await
            .expect("vault must have the secret");
        let value = String::from_utf8(secret.expose_secret().clone()).unwrap();
        assert_eq!(value, "ghp_secret123");
    }

    // -----------------------------------------------------------------------
    // T_commit_2: 잘못된 session_id → SessionNotFound
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn commit_invalid_session_returns_not_found() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx(pool, vault);

        let result = do_import_csv_commit("nonexistent-session-id", &[0], &ctx).await;
        assert!(
            matches!(result, Err(ImportCommandError::SessionNotFound { .. })),
            "must return SessionNotFound"
        );
    }

    // -----------------------------------------------------------------------
    // T_commit_3: out-of-bounds row index → RowIndexOutOfBounds
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn commit_out_of_bounds_index_returns_error() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx(pool, vault);

        // prepare 1행짜리 CSV
        let mut tmp = NamedTempFile::new().expect("tempfile");
        std::io::Write::write_all(
            &mut tmp,
            b"name,url,username,password\nSite,https://example.com,user,pass1234",
        )
        .unwrap();
        let preview = do_import_csv_prepare(tmp.path().to_str().unwrap(), &ctx)
            .await
            .expect("prepare");

        // index 5 는 존재하지 않음
        let result = do_import_csv_commit(&preview.session_id, &[5], &ctx).await;
        assert!(
            matches!(result, Err(ImportCommandError::RowIndexOutOfBounds { .. })),
            "must return RowIndexOutOfBounds"
        );
    }

    // -----------------------------------------------------------------------
    // T_commit_4: partial selection — 선택된 행만 저장됨
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn commit_partial_selection_saves_only_selected() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;

        seed_issuer(&pool, "stripe", vec!["stripe.com".to_owned()]).await;

        let ctx = make_ctx(pool.clone(), vault);

        let mut tmp = NamedTempFile::new().expect("tempfile");
        std::io::Write::write_all(
            &mut tmp,
            b"name,url,username,password\n\
              Stripe,https://stripe.com,alice,sk_live_abc,\n\
              Other,https://other.example.com,bob,other_pass,",
        )
        .unwrap();

        let preview = do_import_csv_prepare(tmp.path().to_str().unwrap(), &ctx)
            .await
            .expect("prepare");

        // row 0 만 선택
        let result = do_import_csv_commit(&preview.session_id, &[0], &ctx)
            .await
            .expect("commit");

        assert_eq!(result.imported, 1, "only one row selected");
        assert_eq!(result.rows.len(), 1);
        assert_eq!(result.rows[0].row_index, 0);

        let cred_repo = CredentialRepo::new(&pool);
        let all = cred_repo
            .list(&secretbank_core::CredentialFilter::default())
            .await
            .unwrap();
        assert_eq!(all.len(), 1, "only the selected row must be in DB");
    }

    // -----------------------------------------------------------------------
    // T_commit_5: same session_id 두 번째 commit → SessionNotFound (one-shot)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn commit_session_consumed_on_second_call() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;

        seed_issuer(&pool, "github", vec!["github.com".to_owned()]).await;

        let ctx = make_ctx(pool, vault);

        let mut tmp = NamedTempFile::new().expect("tempfile");
        std::io::Write::write_all(
            &mut tmp,
            b"name,url,username,password\nGitHub,https://github.com,alice,ghp_tok123",
        )
        .unwrap();

        let preview = do_import_csv_prepare(tmp.path().to_str().unwrap(), &ctx)
            .await
            .expect("prepare");

        // 첫 번째 commit — 성공
        do_import_csv_commit(&preview.session_id, &[0], &ctx)
            .await
            .expect("first commit must succeed");

        // 두 번째 commit — 세션 소진됨
        let second = do_import_csv_commit(&preview.session_id, &[0], &ctx).await;
        assert!(
            matches!(second, Err(ImportCommandError::SessionNotFound { .. })),
            "second commit must return SessionNotFound"
        );
    }
}
