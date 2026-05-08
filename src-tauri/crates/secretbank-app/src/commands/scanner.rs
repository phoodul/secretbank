//! Tauri command for env-file scanning (T034).
//!
//! The pure logic lives in [`do_env_scan`] so tests can run without a
//! running Tauri application.

use std::path::PathBuf;

use secretbank_connectors::DetectedKey;
use tauri::AppHandle;
use tauri::Emitter;

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

    #[error("internal: {message}")]
    Internal { message: String },
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
// Pure logic (unit-testable without Tauri)
// ---------------------------------------------------------------------------

/// Validate the path and run the scan on a blocking thread.
pub async fn do_env_scan(path: String) -> Result<Vec<DetectedKey>, EnvScanError> {
    let p = PathBuf::from(&path);

    if !p.exists() {
        return Err(EnvScanError::InvalidPath);
    }

    if !p.is_file() && !p.is_dir() {
        return Err(EnvScanError::UnsupportedPath);
    }

    let p_owned = p.clone();
    tokio::task::spawn_blocking(move || secretbank_connectors::scan_path(&p_owned))
        .await
        .map_err(|e| EnvScanError::Internal {
            message: e.to_string(),
        })
}

// ---------------------------------------------------------------------------
// Tauri command
// ---------------------------------------------------------------------------

/// Scan a folder (or single file) for high-entropy strings and API keys.
///
/// Emits `scan:progress` events:
/// - `{ phase: "started", path }` before scanning begins
/// - `{ phase: "done", count }` after scanning completes
#[tauri::command]
pub async fn env_scan_folder(
    app: AppHandle,
    path: String,
) -> Result<Vec<DetectedKey>, EnvScanError> {
    let _ = app.emit(
        "scan:progress",
        ScanProgress::Started { path: path.clone() },
    );

    let result = do_env_scan(path).await?;

    let _ = app.emit(
        "scan:progress",
        ScanProgress::Done {
            count: result.len() as u32,
        },
    );

    Ok(result)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn write_env_file(dir: &TempDir, content: &str) -> PathBuf {
        let path = dir.path().join(".env");
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        path
    }

    // ── invalid path returns InvalidPath error ────────────────────────────

    #[tokio::test]
    async fn invalid_path_returns_invalid_path_error() {
        let result = do_env_scan("/this/path/absolutely/does/not/exist/xyz".to_string()).await;
        assert!(
            matches!(result, Err(EnvScanError::InvalidPath)),
            "expected InvalidPath, got {result:?}"
        );
    }

    // ── scan directory returns results ────────────────────────────────────

    #[tokio::test]
    async fn scan_directory_returns_results() {
        let dir = TempDir::new().unwrap();
        write_env_file(
            &dir,
            "OPENAI_API_KEY=sk-proj-AAAAAAAAAAAAAAAAAAAA\nRANDOM=ham\n",
        );

        let result = do_env_scan(dir.path().to_string_lossy().into_owned())
            .await
            .expect("scan_directory should succeed");

        assert!(
            !result.is_empty(),
            "expected at least 1 DetectedKey, got none"
        );
        assert_eq!(result[0].issuer_slug.as_deref(), Some("openai"));
    }

    // ── scan single file also works ───────────────────────────────────────

    #[tokio::test]
    async fn scan_single_file_also_works() {
        let dir = TempDir::new().unwrap();
        let env_path = write_env_file(&dir, "OPENAI_API_KEY=sk-proj-AAAAAAAAAAAAAAAAAAAA\n")
            .to_string_lossy()
            .into_owned();

        let result = do_env_scan(env_path)
            .await
            .expect("scan_single_file should succeed");

        assert!(
            !result.is_empty(),
            "expected at least 1 DetectedKey from a direct file scan, got none"
        );
    }
}
