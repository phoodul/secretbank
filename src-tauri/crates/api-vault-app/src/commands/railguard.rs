//! Tauri commands for RAILGUARD — AI 코딩 도구용 보안 가드레일 룰 파일 미리보기 및 적용.
//!
//! `railguard_preview` — 실제 파일을 쓰지 않고 예상 결과를 반환한다.
//! `railguard_apply`   — 선택한 모드로 룰 파일을 프로젝트 경로에 기록한다.

use api_vault_railguard::{render, RenderContext, RuleKind};
use serde::{Deserialize, Serialize};
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
    #[error("render error: {message}")]
    Render { message: String },
    #[error("io error: {message}")]
    Io { message: String },
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

fn validate_project_path(raw: &str) -> Result<PathBuf, RailguardError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err(RailguardError::InvalidProjectPath);
    }
    let p = PathBuf::from(trimmed);
    if !p.exists() || !p.is_dir() {
        return Err(RailguardError::PathNotFound {
            path: trimmed.to_owned(),
        });
    }
    Ok(p)
}

// ---------------------------------------------------------------------------
// Core logic (helper functions — also tested directly)
// ---------------------------------------------------------------------------

pub(crate) fn build_preview(
    project_path: &Path,
    rules: &[RuleKind],
    ctx: &RenderContext,
) -> Result<Vec<RuleFilePreview>, RailguardError> {
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

pub(crate) fn apply_rules(
    project_path: &Path,
    rules: &[RuleKind],
    ctx: &RenderContext,
    mode: ApplyMode,
) -> Result<Vec<RuleFileApplied>, RailguardError> {
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
        let parent = abs.parent().unwrap_or(project_path);
        let tmp_path = parent.join(format!(".railguard_tmp_{}", now_ts));
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
    _state: State<'_, AppContext>,
) -> Result<Vec<RuleFileApplied>, RailguardError> {
    let path = validate_project_path(&project_path)?;
    tokio::task::spawn_blocking(move || apply_rules(&path, &rules, &context, mode))
        .await
        .map_err(|e| RailguardError::Io {
            message: e.to_string(),
        })?
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

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
}
