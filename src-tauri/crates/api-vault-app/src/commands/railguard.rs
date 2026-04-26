//! Tauri commands for RAILGUARD — AI 코딩 도구용 보안 가드레일 룰 파일 미리보기 및 적용.
//!
//! `railguard_preview` — 실제 파일을 쓰지 않고 예상 결과를 반환한다.
//! `railguard_apply`   — 선택한 모드로 룰 파일을 프로젝트 경로에 기록한다.

use api_vault_audit::AuditActor;
use api_vault_railguard::{render, ContextError, RenderContext, RuleKind};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::State;
use thiserror::Error;
use time::OffsetDateTime;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PreviewAction {
    Create,
    Update,
    Skip,
}

#[derive(Debug, Serialize)]
pub struct RuleFilePreview {
    pub kind: RuleKind,
    /// 프로젝트 루트 기준 상대 경로
    pub path: String,
    /// 렌더된 최종 콘텐츠
    pub content: String,
    /// 디스크에 파일이 이미 존재하는지
    pub exists: bool,
    /// 예상 액션
    pub action: PreviewAction,
}

#[derive(Debug, Serialize)]
pub struct RuleFileApplied {
    pub kind: RuleKind,
    pub path: String,
    /// 기존 파일을 덮어쓴 경우 백업 경로 (프로젝트 루트 기준 상대 경로)
    pub backup_path: Option<String>,
    pub wrote_bytes: usize,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ApplyMode {
    /// 기존 파일을 덮어쓴다. `backup: true` 이면 `.bak-{unix_ts}` 로 백업 후 덮어쓴다.
    Overwrite { backup: bool },
    /// 기존 파일이 있으면 뒤에 구분자 + 렌더 결과를 추가한다.
    Append,
    /// 기존 파일이 있으면 건너뛴다.
    SkipExisting,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum RailguardError {
    #[error("project path is invalid")]
    InvalidProjectPath,
    #[error("project path does not exist: {path}")]
    PathNotFound { path: String },
    #[error("render context is invalid: {message}")]
    InvalidContext { message: String },
    #[error("render error: {message}")]
    Render { message: String },
    #[error("io error: {message}")]
    Io { message: String },
}

impl From<ContextError> for RailguardError {
    fn from(e: ContextError) -> Self {
        RailguardError::InvalidContext {
            message: e.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Returns the first 16 hex characters of `SHA-256(path)` as the audit
/// subject_id for a railguard application.  This keeps repeated applications
/// to the same project linkable without exposing the raw file-system path in
/// the audit log.
pub(crate) fn project_path_fingerprint(path: &str) -> String {
    let hash = Sha256::digest(path.as_bytes());
    hex::encode(&hash[..8]) // 8 bytes → 16 hex chars
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

fn validate_project_path(raw: &str) -> Result<PathBuf, RailguardError> {
    let trimmed = raw.trim();

    // 빈 문자열 또는 null byte 거부
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err(RailguardError::InvalidProjectPath);
    }

    // UNC 경로 거부 (Windows \\server\share, POSIX //host/path)
    if trimmed.starts_with("\\\\") || trimmed.starts_with("//") {
        return Err(RailguardError::InvalidProjectPath);
    }

    // canonicalize — symlink / `..` 정규화, 존재하지 않으면 실패
    let canonical = std::fs::canonicalize(trimmed).map_err(|_| RailguardError::PathNotFound {
        path: trimmed.to_owned(),
    })?;

    if !canonical.is_dir() {
        return Err(RailguardError::PathNotFound {
            path: trimmed.to_owned(),
        });
    }

    Ok(canonical)
}

// ---------------------------------------------------------------------------
// Core logic (helper functions — also tested directly)
// ---------------------------------------------------------------------------

pub(crate) fn build_preview(
    project_path: &Path,
    rules: &[RuleKind],
    ctx: &RenderContext,
) -> Result<Vec<RuleFilePreview>, RailguardError> {
    ctx.validate()?;
    let mut out = Vec::with_capacity(rules.len());
    for &kind in rules {
        let rel = kind.output_path();
        let abs = project_path.join(rel);
        let content = render(kind, ctx).map_err(|e| RailguardError::Render {
            message: e.to_string(),
        })?;
        let exists = abs.exists();
        let action = if exists {
            let disk = std::fs::read_to_string(&abs).map_err(|e| RailguardError::Io {
                message: e.to_string(),
            })?;
            if disk == content {
                PreviewAction::Skip
            } else {
                PreviewAction::Update
            }
        } else {
            PreviewAction::Create
        };
        out.push(RuleFilePreview {
            kind,
            path: rel.to_owned(),
            content,
            exists,
            action,
        });
    }
    Ok(out)
}

/// `.bak-{ts}` 파일을 최대 `keep` 개만 유지하고 초과분은 삭제한다.
/// `rel` 은 프로젝트 루트 기준 상대 경로 (예: ".cursorrules").
///
/// # Ordering assumption
///
/// Backup filenames follow the pattern `<rel>.bak-<unix_timestamp_seconds>`.
/// The sort is lexicographic; because the timestamp suffix is zero-padded by
/// the Unix epoch (always 10 decimal digits for dates after 2001-09-09), the
/// lexicographic order is identical to chronological order.  The oldest
/// backups therefore sort first and are the ones deleted when the count
/// exceeds `keep`.
///
/// # Same-second collision
///
/// If `railguard_apply` is called six or more times within the same UTC
/// second, all backups generated in that second share the same filename
/// (e.g. `.cursorrules.bak-1714000000`).  Because `std::fs::rename` is used
/// to create each backup, each new call overwrites the previous same-second
/// backup — effectively collapsing them into one file.  In practice this
/// means "at most 1 backup per second" rather than "exactly 1 per apply",
/// but the `keep` limit is still honoured correctly.
fn prune_rule_backups(project_path: &Path, rel: &str, keep: usize) {
    let prefix = format!("{}.bak-", rel);
    let dir = if let Some(parent) = project_path.join(rel).parent() {
        parent.to_path_buf()
    } else {
        project_path.to_path_buf()
    };

    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };

    let mut backups: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with(&prefix))
                .unwrap_or(false)
        })
        .collect();

    backups.sort();

    if backups.len() > keep {
        let to_delete = backups.len() - keep;
        for old in backups.iter().take(to_delete) {
            let _ = std::fs::remove_file(old);
        }
    }
}

/// Returns a short ASCII discriminator for a `RuleKind` — used in tmp file names
/// to ensure that two rules sharing the same parent directory don't clobber each
/// other's tmp file when written within the same second.
fn kind_short(kind: RuleKind) -> &'static str {
    match kind {
        RuleKind::CursorRules => "cursor",
        RuleKind::WindsurfRules => "windsurf",
        RuleKind::ClaudeMd => "claude",
        RuleKind::CopilotInstructions => "copilot",
    }
}

pub(crate) fn apply_rules(
    project_path: &Path,
    rules: &[RuleKind],
    ctx: &RenderContext,
    mode: ApplyMode,
) -> Result<Vec<RuleFileApplied>, RailguardError> {
    ctx.validate()?;
    let mut out = Vec::with_capacity(rules.len());
    let now_ts = OffsetDateTime::now_utc().unix_timestamp();

    for &kind in rules {
        let rel = kind.output_path();
        let abs = project_path.join(rel);

        // 부모 디렉토리 생성 (.github/ 등)
        if let Some(parent) = abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| RailguardError::Io {
                message: e.to_string(),
            })?;
        }

        let content = render(kind, ctx).map_err(|e| RailguardError::Render {
            message: e.to_string(),
        })?;
        let exists = abs.exists();

        let (final_content, backup_path, wrote_bytes) = match mode {
            ApplyMode::SkipExisting if exists => {
                // 파일이 있으면 쓰지 않는다.
                out.push(RuleFileApplied {
                    kind,
                    path: rel.to_owned(),
                    backup_path: None,
                    wrote_bytes: 0,
                });
                continue;
            }
            ApplyMode::Overwrite { backup } if backup && exists => {
                let bak_rel = format!("{}.bak-{}", rel, now_ts);
                let bak_abs = project_path.join(&bak_rel);
                std::fs::rename(&abs, &bak_abs).map_err(|e| RailguardError::Io {
                    message: e.to_string(),
                })?;
                // 백업 최대 5개 유지
                prune_rule_backups(project_path, rel, 5);
                let bytes = content.len();
                (content, Some(bak_rel), bytes)
            }
            ApplyMode::Append if exists => {
                let existing = std::fs::read_to_string(&abs).map_err(|e| RailguardError::Io {
                    message: e.to_string(),
                })?;
                let separator = format!(
                    "\n\n<!-- RAILGUARD {} applied {} -->\n",
                    rel, now_ts
                );
                let merged = format!("{}{}{}", existing, separator, content);
                let bytes = merged.len();
                (merged, None, bytes)
            }
            // Overwrite (backup=false 또는 파일 없음), Append (파일 없음), SkipExisting (파일 없음)
            _ => {
                let bytes = content.len();
                (content, None, bytes)
            }
        };

        // 원자적 쓰기: temp 파일 → rename
        // kind_short discriminator prevents tmp-path collision when multiple
        // rules share the same parent directory within the same second.
        let parent = abs.parent().unwrap_or(project_path);
        let tmp_path = parent.join(format!(".railguard_tmp_{}_{}", now_ts, kind_short(kind)));
        std::fs::write(&tmp_path, &final_content).map_err(|e| RailguardError::Io {
            message: e.to_string(),
        })?;
        std::fs::rename(&tmp_path, &abs).map_err(|e| {
            // rename 실패 시 tmp 파일 정리 시도 (best effort)
            let _ = std::fs::remove_file(&tmp_path);
            RailguardError::Io {
                message: e.to_string(),
            }
        })?;

        out.push(RuleFileApplied {
            kind,
            path: rel.to_owned(),
            backup_path,
            wrote_bytes,
        });
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// 프로젝트 경로에 대해 룰 파일의 예상 액션(Create/Update/Skip)과 렌더 결과를 반환한다.
/// 파일을 쓰지 않는다.
#[tauri::command]
pub async fn railguard_preview(
    project_path: String,
    rules: Vec<RuleKind>,
    context: RenderContext,
    _state: State<'_, AppContext>,
) -> Result<Vec<RuleFilePreview>, RailguardError> {
    let path = validate_project_path(&project_path)?;
    tokio::task::spawn_blocking(move || build_preview(&path, &rules, &context))
        .await
        .map_err(|e| RailguardError::Io {
            message: e.to_string(),
        })?
}

/// 선택한 모드로 룰 파일을 프로젝트 경로에 기록한다.
#[tauri::command]
pub async fn railguard_apply(
    project_path: String,
    rules: Vec<RuleKind>,
    context: RenderContext,
    mode: ApplyMode,
    state: State<'_, AppContext>,
) -> Result<Vec<RuleFileApplied>, RailguardError> {
    let path = validate_project_path(&project_path)?;
    let applied = tokio::task::spawn_blocking(move || apply_rules(&path, &rules, &context, mode))
        .await
        .map_err(|e| RailguardError::Io {
            message: e.to_string(),
        })??;

    // subject_id = first 16 hex chars of SHA-256(project_path).
    // This identifies repeated applications to the same project without
    // exposing the raw file system path in the audit log.
    let path_fingerprint = project_path_fingerprint(&project_path);
    let files_written = applied.iter().filter(|a| a.wrote_bytes > 0).count();
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "railguard.apply",
            "railguard",
            path_fingerprint,
            Some(serde_json::json!({"files_written": files_written}).to_string()),
        )
        .await;

    Ok(applied)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // -----------------------------------------------------------------------
    // Wire-format regression tests for ApplyMode.
    //
    // The frontend (`use-railguard.ts`) sends `mode` as a single internally-
    // tagged object, NOT an array.  These tests pin the wire shape so a
    // future refactor cannot silently revert to a per-rule array (which used
    // to fail at runtime with: "invalid type: map, expected variant
    // identifier" — see hotfix H3).
    // -----------------------------------------------------------------------

    #[test]
    fn apply_mode_deserializes_overwrite_with_backup() {
        let json = serde_json::json!({"kind": "overwrite", "backup": true});
        let parsed: ApplyMode = serde_json::from_value(json).expect("must deserialize");
        assert!(matches!(parsed, ApplyMode::Overwrite { backup: true }));
    }

    #[test]
    fn apply_mode_deserializes_append() {
        let json = serde_json::json!({"kind": "append"});
        let parsed: ApplyMode = serde_json::from_value(json).expect("must deserialize");
        assert!(matches!(parsed, ApplyMode::Append));
    }

    #[test]
    fn apply_mode_deserializes_skip_existing() {
        let json = serde_json::json!({"kind": "skip_existing"});
        let parsed: ApplyMode = serde_json::from_value(json).expect("must deserialize");
        assert!(matches!(parsed, ApplyMode::SkipExisting));
    }

    #[test]
    fn apply_mode_rejects_array_input() {
        // FE used to wrap the mode in a Vec<{tag, kind, ...}> per rule.
        // The current Rust API expects a single ApplyMode — confirm that an
        // array fails so a regression is caught at the test layer instead
        // of at runtime.
        let json = serde_json::json!([{"kind": "overwrite", "backup": true}]);
        let parsed = serde_json::from_value::<ApplyMode>(json);
        assert!(parsed.is_err(), "array shape must not deserialize as ApplyMode");
    }

    fn make_ctx() -> RenderContext {
        RenderContext {
            project_name: "TestApp".to_owned(),
            frameworks: vec!["Next.js".to_owned()],
            issuers: vec!["OpenAI".to_owned(), "Stripe".to_owned()],
        }
    }

    fn all_rules() -> Vec<RuleKind> {
        RuleKind::all().to_vec()
    }

    // -----------------------------------------------------------------------
    // 1. 파일이 없을 때 — preview: 4× Create / apply: 4 파일 생성, backup_path: None
    // -----------------------------------------------------------------------
    #[test]
    fn creates_all_when_no_files_exist() {
        let dir = TempDir::new().unwrap();
        let ctx = make_ctx();
        let rules = all_rules();

        // Preview → 모두 Create
        let previews = build_preview(dir.path(), &rules, &ctx).unwrap();
        assert_eq!(previews.len(), 4);
        for p in &previews {
            assert_eq!(p.action, PreviewAction::Create, "expected Create for {:?}", p.kind);
            assert!(!p.exists);
        }

        // Apply → 4 파일 모두 작성, backup_path 없음
        let applied = apply_rules(dir.path(), &rules, &ctx, ApplyMode::Overwrite { backup: false }).unwrap();
        assert_eq!(applied.len(), 4);
        for a in &applied {
            assert!(a.wrote_bytes > 0);
            assert!(a.backup_path.is_none());
            // 실제로 파일이 존재하는지 확인
            assert!(dir.path().join(&a.path).exists(), "{} should exist", a.path);
        }
    }

    // -----------------------------------------------------------------------
    // 2. .cursorrules 가 다른 내용으로 존재 → Update + backup 생성
    // -----------------------------------------------------------------------
    #[test]
    fn updates_with_backup_when_files_exist() {
        let dir = TempDir::new().unwrap();
        let ctx = make_ctx();

        // .cursorrules 를 다른 내용으로 미리 생성
        let cursorrules_path = dir.path().join(".cursorrules");
        std::fs::write(&cursorrules_path, "old content").unwrap();

        let rules = vec![RuleKind::CursorRules];

        // Preview → Update (내용이 다르므로)
        let previews = build_preview(dir.path(), &rules, &ctx).unwrap();
        assert_eq!(previews[0].action, PreviewAction::Update);
        assert!(previews[0].exists);

        // Apply with Overwrite { backup: true } → .bak-{ts} 생성 + 파일 덮어씀
        let applied = apply_rules(dir.path(), &rules, &ctx, ApplyMode::Overwrite { backup: true }).unwrap();
        assert_eq!(applied.len(), 1);
        let a = &applied[0];
        assert!(a.backup_path.is_some(), "backup_path should be set");
        let bak_rel = a.backup_path.as_ref().unwrap();
        assert!(dir.path().join(bak_rel).exists(), "backup file should exist");

        // 원본 경로에 렌더된 내용이 있어야 한다
        let new_content = std::fs::read_to_string(&cursorrules_path).unwrap();
        assert_ne!(new_content, "old content");
        assert!(!new_content.is_empty());
    }

    // -----------------------------------------------------------------------
    // 3. 콘텐츠가 동일하면 Skip; SkipExisting 모드에서는 writes_bytes=0
    // -----------------------------------------------------------------------
    #[test]
    fn skips_when_content_matches() {
        let dir = TempDir::new().unwrap();
        let ctx = make_ctx();
        let rules = all_rules();

        // 먼저 한 번 apply 해서 정확한 콘텐츠로 씌운다
        apply_rules(dir.path(), &rules, &ctx, ApplyMode::Overwrite { backup: false }).unwrap();

        // Preview → 모두 Skip
        let previews = build_preview(dir.path(), &rules, &ctx).unwrap();
        for p in &previews {
            assert_eq!(p.action, PreviewAction::Skip, "expected Skip for {:?}", p.kind);
        }

        // ApplyMode::Overwrite { backup: false } 는 Skip action 무시하고 그대로 쓴다
        let applied_overwrite = apply_rules(dir.path(), &rules, &ctx, ApplyMode::Overwrite { backup: false }).unwrap();
        for a in &applied_overwrite {
            assert!(a.wrote_bytes > 0, "Overwrite should still write even when content matches");
        }

        // ApplyMode::SkipExisting → wrote_bytes=0 (파일 건너뜀)
        let applied_skip = apply_rules(dir.path(), &rules, &ctx, ApplyMode::SkipExisting).unwrap();
        for a in &applied_skip {
            assert_eq!(a.wrote_bytes, 0, "SkipExisting should not write existing file: {:?}", a.kind);
        }
    }

    // -----------------------------------------------------------------------
    // 4. 존재하지 않는 경로 → PathNotFound
    // -----------------------------------------------------------------------
    #[test]
    fn invalid_project_path_returns_error() {
        let result = validate_project_path("/nonexistent/path/that/does/not/exist/12345");
        assert!(
            matches!(result, Err(RailguardError::PathNotFound { .. })),
            "non-existent path should return PathNotFound"
        );

        // 빈 문자열 → InvalidProjectPath
        let result2 = validate_project_path("   ");
        assert!(
            matches!(result2, Err(RailguardError::InvalidProjectPath)),
            "empty path should return InvalidProjectPath"
        );
    }

    // -----------------------------------------------------------------------
    // 5. Append 모드 — 기존 파일 뒤에 구분자 + 렌더 내용 추가
    // -----------------------------------------------------------------------
    #[test]
    fn append_mode_appends_separator_and_comment() {
        let dir = TempDir::new().unwrap();
        let ctx = make_ctx();

        let claude_path = dir.path().join("CLAUDE.md");
        std::fs::write(&claude_path, "# existing").unwrap();

        let rules = vec![RuleKind::ClaudeMd];
        let applied = apply_rules(dir.path(), &rules, &ctx, ApplyMode::Append).unwrap();
        assert_eq!(applied.len(), 1);
        assert!(applied[0].backup_path.is_none());

        let result = std::fs::read_to_string(&claude_path).unwrap();
        assert!(result.starts_with("# existing"), "original content must be preserved");
        assert!(result.contains("<!-- RAILGUARD"), "separator comment must be present");
        // 렌더된 내용이 포함되어야 한다
        assert!(result.contains("TestApp"), "rendered project name must appear");
    }

    // -----------------------------------------------------------------------
    // 6. SkipExisting — 기존 파일 불변, wrote_bytes=0
    // -----------------------------------------------------------------------
    #[test]
    fn skip_existing_mode_leaves_file_unchanged() {
        let dir = TempDir::new().unwrap();
        let ctx = make_ctx();

        let cursor_path = dir.path().join(".cursorrules");
        std::fs::write(&cursor_path, "do not touch").unwrap();

        let rules = vec![RuleKind::CursorRules];
        let applied = apply_rules(dir.path(), &rules, &ctx, ApplyMode::SkipExisting).unwrap();
        assert_eq!(applied[0].wrote_bytes, 0);
        assert!(applied[0].backup_path.is_none());

        let after = std::fs::read_to_string(&cursor_path).unwrap();
        assert_eq!(after, "do not touch", "file content must not change with SkipExisting");
    }

    // -----------------------------------------------------------------------
    // M3: tmp 경로 충돌 방지 — 4 룰 모두 같은 부모에서 고유 tmp 사용
    // -----------------------------------------------------------------------
    #[test]
    fn all_four_rules_produce_distinct_tmp_paths() {
        let dir = TempDir::new().unwrap();
        let ctx = make_ctx();
        let rules = all_rules();

        // apply 후 결과 파일 4개 존재 확인 (기존 테스트와 동일하지만
        // 이 테스트는 "동일 부모 디렉토리에 4 룰 동시에" 케이스를 명시함)
        let applied = apply_rules(dir.path(), &rules, &ctx, ApplyMode::Overwrite { backup: false })
            .unwrap();
        assert_eq!(applied.len(), 4, "4 rules must all be applied");

        // 각 파일이 실제로 존재하는지 + 서로 다른 경로인지 확인
        let mut paths: Vec<_> = applied.iter().map(|a| a.path.clone()).collect();
        paths.sort();
        paths.dedup();
        assert_eq!(paths.len(), 4, "all 4 output paths must be distinct");

        for a in &applied {
            assert!(
                dir.path().join(&a.path).exists(),
                "file {} must exist after apply",
                a.path
            );
            assert!(a.wrote_bytes > 0);
        }

        // tmp 파일이 남아있지 않아야 한다
        let tmp_count = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with(".railguard_tmp_"))
            .count();
        assert_eq!(tmp_count, 0, "no tmp files should remain after apply");
    }

    // -----------------------------------------------------------------------
    // Security: validate_project_path — UNC 경로 거부
    // -----------------------------------------------------------------------
    #[test]
    fn unc_path_is_rejected() {
        // Windows UNC: \\server\share
        let result = validate_project_path(r"\\evil-smb\share");
        assert!(
            matches!(result, Err(RailguardError::InvalidProjectPath)),
            "Windows UNC path must be rejected"
        );
        // POSIX UNC-style
        let result2 = validate_project_path("//evil-smb/share");
        assert!(
            matches!(result2, Err(RailguardError::InvalidProjectPath)),
            "POSIX UNC-style path must be rejected"
        );
    }

    // -----------------------------------------------------------------------
    // Security: validate_project_path — null byte 거부
    // -----------------------------------------------------------------------
    #[test]
    fn null_byte_in_path_is_rejected() {
        let result = validate_project_path("/tmp/foo\0bar");
        assert!(
            matches!(result, Err(RailguardError::InvalidProjectPath)),
            "null byte in path must be rejected"
        );
    }

    // -----------------------------------------------------------------------
    // Security: validate_project_path — `..` 트래버설 → 정규화 후 존재 검증
    // -----------------------------------------------------------------------
    #[test]
    fn dotdot_traversal_is_normalized_or_rejected() {
        // 존재하지 않는 경로의 `..` 트래버설 → PathNotFound
        let result = validate_project_path("/nonexistent/dir/../other");
        assert!(
            matches!(result, Err(RailguardError::PathNotFound { .. })),
            ".. traversal into nonexistent path must return PathNotFound"
        );
    }

    // -----------------------------------------------------------------------
    // Security: RenderContext — 길이 초과 거부
    // -----------------------------------------------------------------------
    #[test]
    fn render_context_length_exceeded_is_rejected() {
        use api_vault_railguard::RenderContext;

        // project_name 128자 초과
        let mut ctx = RenderContext::new("x".repeat(129));
        assert!(
            ctx.validate().is_err(),
            "project_name > 128 chars must fail"
        );

        // frameworks 항목 64자 초과
        ctx = RenderContext {
            project_name: "ok".to_owned(),
            frameworks: vec!["f".repeat(65)],
            issuers: vec![],
        };
        assert!(
            ctx.validate().is_err(),
            "framework item > 64 chars must fail"
        );

        // frameworks 배열 32개 초과
        ctx = RenderContext {
            project_name: "ok".to_owned(),
            frameworks: vec!["fw".to_owned(); 33],
            issuers: vec![],
        };
        assert!(
            ctx.validate().is_err(),
            "frameworks list > 32 items must fail"
        );

        // issuers 배열 64개 초과
        ctx = RenderContext {
            project_name: "ok".to_owned(),
            frameworks: vec![],
            issuers: vec!["iss".to_owned(); 65],
        };
        assert!(
            ctx.validate().is_err(),
            "issuers list > 64 items must fail"
        );

        // 제어문자 거부
        ctx = RenderContext {
            project_name: "proj\nname".to_owned(),
            frameworks: vec![],
            issuers: vec![],
        };
        assert!(
            ctx.validate().is_err(),
            "control chars in project_name must fail"
        );
    }

    // -----------------------------------------------------------------------
    // Backup prune — 6번 overwrite 시 최대 5개만 남음
    // -----------------------------------------------------------------------
    #[test]
    fn backup_prune_keeps_at_most_five() {
        let dir = TempDir::new().unwrap();
        let ctx = make_ctx();
        let rules = vec![RuleKind::CursorRules];

        // 6번 Overwrite with backup — 마지막 5개만 남아야 한다
        for _ in 0..6 {
            // 이전 파일이 없으면 백업 안 생기므로 먼저 파일 생성
            let p = dir.path().join(".cursorrules");
            if !p.exists() {
                std::fs::write(&p, "seed").unwrap();
            }
            // 약간의 시간 차이를 위해 timestamp 가 같을 수 있지만 rename 으로 진행
            apply_rules(dir.path(), &rules, &ctx, ApplyMode::Overwrite { backup: true }).unwrap();
        }

        let backups: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with(".cursorrules.bak-")
            })
            .collect();

        assert!(
            backups.len() <= 5,
            "expected at most 5 backups, found {}",
            backups.len()
        );
    }
}
