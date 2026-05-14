pub mod entropy;
pub mod issuers;
pub mod parser;

use std::path::Path;

use entropy::shannon_entropy;
use issuers::match_issuer;
use parser::{parse_env_file, parse_generic_strings};

/// A single detected high-entropy or issuer-matched credential found during a
/// file-system scan.
///
/// `value_hint` stores only the last 4 characters of the raw value for UX
/// display. The plaintext secret is never retained.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct DetectedKey {
    /// Absolute path of the file that contains this credential.
    pub file_path: String,
    /// 1-based line number within the file.
    pub line: u32,
    /// Variable name when the file is in `.env` format; `None` for JSON/TS/JS.
    pub env_var_name: Option<String>,
    /// Slug of the matched issuer preset, or `None` when only entropy fired.
    pub issuer_slug: Option<String>,
    /// Last 4 characters of the value (UX hint). Never the full secret.
    pub value_hint: String,
    /// Confidence score in `[0.0, 1.0]`.
    /// - Issuer regex match → 0.95
    /// - Entropy-only → `clamp(0.40 + (entropy − 3.5) × 0.30, 0.0, 0.85)`
    pub confidence: f64,
}

// ─── Constants ──────────────────────────────────────────────────────────────

/// Maximum file size to scan (bytes).  Files larger than this are skipped.
const MAX_FILE_SIZE: u64 = 1_048_576; // 1 MiB

/// Minimum value length required for entropy-only detection.
const MIN_ENTROPY_VALUE_LEN: usize = 20;

/// Minimum string-literal length extracted from JSON/TS/JS files.
const MIN_GENERIC_STRING_LEN: usize = 16;

/// Shannon entropy threshold (bits/char).
const ENTROPY_THRESHOLD: f64 = 3.5;

// ─── Public API ─────────────────────────────────────────────────────────────

/// Scan `path` for high-entropy strings and issuer-matched API keys.
///
/// - If `path` is a file, exactly that one file is processed.
/// - If `path` is a directory, it is walked recursively using the `ignore`
///   crate, which respects `.gitignore` and similar ignore files.
///
/// I/O errors on individual files are logged with `tracing::warn` and skipped;
/// the function always returns a (possibly empty) `Vec`.
pub fn scan_path(path: &Path) -> Vec<DetectedKey> {
    if path.is_file() {
        return scan_file(path);
    }

    // Real `.env` files are almost always listed in `.gitignore`, so respecting
    // ignore rules would silently exclude exactly the files the user wants to
    // import. We disable all ignore-file layers and instead hand-skip well-known
    // noise directories (node_modules, .git, build outputs, language caches).
    let walker = ignore::WalkBuilder::new(path)
        .hidden(false) // include dot-files like .env
        .follow_links(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .ignore(false)
        .parents(false)
        .filter_entry(|e| {
            if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let name = e.file_name().to_str().unwrap_or("");
                !matches!(
                    name,
                    "node_modules"
                        | ".git"
                        | "target"
                        | "dist"
                        | "build"
                        | "out"
                        | ".next"
                        | ".nuxt"
                        | ".turbo"
                        | ".svelte-kit"
                        | "vendor"
                        | ".venv"
                        | "venv"
                        | "__pycache__"
                        | ".pnpm-store"
                        | ".cargo"
                        | ".cache"
                        | ".gradle"
                        | ".idea"
                        | ".vscode"
                )
            } else {
                true
            }
        })
        .build();

    let mut results = Vec::new();
    for entry in walker {
        match entry {
            Ok(e) if e.file_type().map(|t| t.is_file()).unwrap_or(false) => {
                results.extend(scan_file(e.path()));
            }
            Err(err) => {
                tracing::warn!("scan_path walk error: {err}");
            }
            _ => {}
        }
    }
    results
}

// ─── Private helpers ────────────────────────────────────────────────────────

/// Decide whether a file is a candidate for scanning based on its name/path.
fn is_scannable(path: &Path) -> bool {
    let file_name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };

    // .env, .env.local, .env.production, .env.*, .envrc
    if file_name == ".env"
        || file_name == ".envrc"
        || file_name.starts_with(".env.")
        || file_name.starts_with(".env_")
    {
        return true;
    }

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    // config.ts / config.js / config.json and their *.config.* variants
    if matches!(ext, "ts" | "js" | "json") {
        if file_name == "config.ts"
            || file_name == "config.js"
            || file_name == "config.json"
            || file_name.ends_with(".config.ts")
            || file_name.ends_with(".config.js")
            || file_name.ends_with(".config.json")
        {
            return true;
        }

        // Any .ts/.js/.json inside a `config/` path segment
        if path
            .components()
            .any(|c| c.as_os_str().to_str() == Some("config"))
        {
            return true;
        }
    }

    false
}

/// Scan a single file and return all detected keys.
fn scan_file(path: &Path) -> Vec<DetectedKey> {
    // Size guard.
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > MAX_FILE_SIZE {
            tracing::warn!("skipping large file: {}", path.display());
            return vec![];
        }
    }

    if !is_scannable(path) {
        return vec![];
    }

    let content = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(err) => {
            tracing::warn!("cannot read {}: {err}", path.display());
            return vec![];
        }
    };

    // Binary guard: null byte in the first 512 bytes.
    if content[..content.len().min(512)].contains(&0u8) {
        tracing::warn!("skipping binary file: {}", path.display());
        return vec![];
    }

    let text = match String::from_utf8(content) {
        Ok(s) => s,
        Err(_) => {
            tracing::warn!("skipping non-UTF-8 file: {}", path.display());
            return vec![];
        }
    };

    let path_str = path.to_string_lossy().into_owned();
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

    // Route to the appropriate parser.
    if file_name == ".env"
        || file_name == ".envrc"
        || file_name.starts_with(".env.")
        || file_name.starts_with(".env_")
    {
        parse_env_entries(&text, &path_str)
    } else {
        parse_generic_entries(&text, &path_str)
    }
}

/// Process `.env`-style content: extract `KEY=value` pairs, evaluate each value.
fn parse_env_entries(content: &str, path_str: &str) -> Vec<DetectedKey> {
    let mut results = Vec::new();
    for (line, key, value) in parse_env_file(content) {
        if let Some(dk) = evaluate_value(&value, path_str, line, Some(key)) {
            results.push(dk);
        }
    }
    results
}

/// Process generic text (JSON/TS/JS): extract string literals, evaluate each.
fn parse_generic_entries(content: &str, path_str: &str) -> Vec<DetectedKey> {
    let mut results = Vec::new();
    for (line, value) in parse_generic_strings(content, MIN_GENERIC_STRING_LEN) {
        if let Some(dk) = evaluate_value(&value, path_str, line, None) {
            results.push(dk);
        }
    }
    results
}

/// Evaluate a single candidate value and return a `DetectedKey` if it passes
/// issuer-regex or entropy thresholds, or `None` if it should be discarded.
fn evaluate_value(
    value: &str,
    path_str: &str,
    line: u32,
    env_var_name: Option<String>,
) -> Option<DetectedKey> {
    if value.is_empty() {
        return None;
    }

    let hint = value_hint(value);

    // 1. Issuer regex match — highest priority.
    if let Some(slug) = match_issuer(value) {
        return Some(DetectedKey {
            file_path: path_str.to_string(),
            line,
            env_var_name,
            issuer_slug: Some(slug.to_string()),
            value_hint: hint,
            confidence: 0.95,
        });
    }

    // 2. Entropy-only detection.
    let entropy = shannon_entropy(value);
    if entropy > ENTROPY_THRESHOLD && value.len() >= MIN_ENTROPY_VALUE_LEN {
        let confidence = (0.40 + (entropy - ENTROPY_THRESHOLD) * 0.30_f64).min(0.85);
        return Some(DetectedKey {
            file_path: path_str.to_string(),
            line,
            env_var_name,
            issuer_slug: None,
            value_hint: hint,
            confidence,
        });
    }

    None
}

/// Return the last 4 characters of `value` as the display hint.
/// If the value is shorter than 4 characters, the whole value is returned
/// (this should not occur in practice given the entropy/length guards).
fn value_hint(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 4 {
        value.to_string()
    } else {
        chars[chars.len() - 4..].iter().collect()
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn write_file(dir: &TempDir, rel: &str, content: &str) -> std::path::PathBuf {
        let path = dir.path().join(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        path
    }

    // ── is_scannable ────────────────────────────────────────────────────────

    #[test]
    fn scannable_dotenv() {
        assert!(is_scannable(Path::new("/project/.env")));
        assert!(is_scannable(Path::new("/project/.env.local")));
        assert!(is_scannable(Path::new("/project/.env.production")));
        assert!(is_scannable(Path::new("/project/.envrc")));
    }

    #[test]
    fn scannable_config_files() {
        assert!(is_scannable(Path::new("/project/config.ts")));
        assert!(is_scannable(Path::new("/project/config.json")));
        assert!(is_scannable(Path::new("/project/app.config.ts")));
        assert!(is_scannable(Path::new("/project/config/db.json")));
    }

    #[test]
    fn not_scannable_random_ts() {
        assert!(!is_scannable(Path::new("/project/src/App.tsx")));
        assert!(!is_scannable(Path::new("/project/src/main.rs")));
    }

    // ── value_hint ──────────────────────────────────────────────────────────

    #[test]
    fn value_hint_last_four() {
        assert_eq!(value_hint("abcdefgh"), "efgh");
    }

    #[test]
    fn value_hint_short() {
        assert_eq!(value_hint("abc"), "abc");
    }

    // ── scan_path — .env file detects openai key ─────────────────────────

    #[test]
    fn scan_dotenv_detects_openai_key() {
        let dir = TempDir::new().unwrap();
        write_file(
            &dir,
            ".env",
            "OPENAI_API_KEY=sk-proj-AAAAAAAAAAAAAAAAAAAA\nRANDOM=ham\n",
        );

        let results = scan_path(dir.path());
        assert_eq!(
            results.len(),
            1,
            "expected exactly 1 detection, got {results:?}"
        );
        assert_eq!(results[0].env_var_name.as_deref(), Some("OPENAI_API_KEY"));
        assert_eq!(results[0].issuer_slug.as_deref(), Some("openai"));
        assert!((results[0].confidence - 0.95).abs() < 0.001);
    }

    // ── scan_path — gitignored .env file is STILL scanned ────────────────
    // Real .env files are almost always listed in .gitignore — respecting
    // ignore rules would silently exclude the very files the user wants
    // to import. The scanner must walk past gitignore.

    #[test]
    fn scan_finds_gitignored_env_file() {
        let dir = TempDir::new().unwrap();
        write_file(&dir, ".gitignore", ".env\n");
        write_file(
            &dir,
            ".env",
            "OPENAI_API_KEY=sk-proj-AAAAAAAAAAAAAAAAAAAA\n",
        );

        let results = scan_path(dir.path());
        assert_eq!(
            results.len(),
            1,
            "gitignored .env should still be detected, got {results:?}"
        );
        assert_eq!(results[0].issuer_slug.as_deref(), Some("openai"));
    }

    // ── scan_path — node_modules subtree is skipped ──────────────────────

    #[test]
    fn scan_skips_node_modules() {
        let dir = TempDir::new().unwrap();
        write_file(
            &dir,
            "node_modules/some-pkg/.env",
            "AWS_ACCESS_KEY=AKIA0123456789ABCDEF\n",
        );
        write_file(
            &dir,
            ".env",
            "OPENAI_API_KEY=sk-proj-AAAAAAAAAAAAAAAAAAAA\n",
        );

        let results = scan_path(dir.path());
        assert_eq!(
            results.len(),
            1,
            "only top-level .env should match, node_modules must be pruned, got {results:?}"
        );
        assert_eq!(results[0].issuer_slug.as_deref(), Some("openai"));
    }

    // ── scan_path — subdirectory config.ts ────────────────────────────────

    #[test]
    fn scan_config_ts_in_subdir() {
        let dir = TempDir::new().unwrap();
        write_file(
            &dir,
            "src/config.ts",
            "const KEY = \"sk-proj-AAAAAAAAAAAAAAAAAAAA\";\n",
        );

        let results = scan_path(dir.path());
        assert_eq!(results.len(), 1, "expected 1 detection, got {results:?}");
        assert_eq!(results[0].issuer_slug.as_deref(), Some("openai"));
        assert!(results[0].env_var_name.is_none());
    }

    // ── scan_path — binary file is skipped ───────────────────────────────

    #[test]
    fn scan_binary_dotenv_is_skipped() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".env");
        let mut f = std::fs::File::create(&path).unwrap();
        // Write a null byte in the first 512 bytes — binary guard triggers.
        f.write_all(b"\x00OPENAI_API_KEY=sk-proj-AAAAAAAAAAAAAAAAAAAA\n")
            .unwrap();

        let results = scan_path(dir.path());
        assert!(results.is_empty(), "binary file should be skipped");
    }

    // ── scan_path — entropy-only detection ───────────────────────────────

    #[test]
    fn scan_entropy_only_detection() {
        // A 32-char random-looking string that won't match any issuer regex
        // but has entropy > 3.5.  Using mixed case + digits + underscores.
        let dir = TempDir::new().unwrap();
        write_file(
            &dir,
            ".env",
            "SOME_TOKEN=xK8mP2qR5nL7jH4wE9yU3vB6sD1aF0cG\n",
        );

        let results = scan_path(dir.path());
        // The value has high entropy so it should be detected.
        // Issuer may or may not match (cloudflare/paddle patterns are broad).
        // We just verify something is returned.
        assert!(!results.is_empty(), "high-entropy token should be detected");
    }

    // ── scan_path — directory as a single file path ───────────────────────

    #[test]
    fn scan_single_env_file_directly() {
        let dir = TempDir::new().unwrap();
        let env_path = write_file(
            &dir,
            ".env",
            "OPENAI_API_KEY=sk-proj-AAAAAAAAAAAAAAAAAAAA\n",
        );

        let results = scan_path(&env_path);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].issuer_slug.as_deref(), Some("openai"));
    }
}
