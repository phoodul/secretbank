//! `apivault` — terminal CLI for API Vault.
//!
//! M18 의 핵심 차별화: dependency graph + RAILGUARD 자산을 GUI 밖으로 노출
//! 하는 **dev tool 일급 시민** 표면. Doppler / Infisical 의 핵심 무기 (CLI)
//! 를 우리도 가진다 — 다만 **dependency graph 와 RAILGUARD 까지 동시에**.
//!
//! Subcommands (M18-cli-1a~c):
//!   - `apivault list`              — credential 목록 (M18-cli-1a)
//!   - `apivault reveal <id>`       — value 출력 + clipboard (M18-cli-1b)
//!   - `apivault run -- <cmd>`      — env 자동 주입 + spawn (M18-cli-1c)
//!
//! Vault 접근:
//!   - 데이터 경로 = `directories::ProjectDirs("app", "api-vault", "api-vault")`
//!     의 data_dir. Tauri 앱과 동일 경로 사용 (단일 vault).
//!   - 매 호출마다 passphrase prompt (rpassword) → vault unlock → 작업 →
//!     drop. CLI 는 단일-호출이므로 long-running session 없음.
//!   - 향후 (M18-cli-2): keyring cache 옵션 + auto-lock.

use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::{anyhow, Context as _, Result};
use clap::{Parser, Subcommand};
use secrecy::SecretString;

use api_vault_core::{CredentialFilter, CredentialId, CredentialStatus};
use api_vault_storage::age_vault::AgeVaultStorage;
use api_vault_storage::sqlite::init_pool;
use api_vault_storage::sqlite::repositories::credential::CredentialRepo;
use api_vault_storage::sqlite::repositories::issuer::IssuerRepo;
use api_vault_storage::vault::VaultStorage;

#[derive(Debug, Parser)]
#[command(
    name = "apivault",
    version,
    about = "API Vault CLI — list / reveal / run with your secrets",
    long_about = "API Vault CLI brings the dependency graph and RAILGUARD\n\
                  intelligence of the desktop app to your terminal.\n\
                  Run `apivault list` to see your credentials, or\n\
                  `apivault run -- npm start` to inject them into a process."
)]
struct Cli {
    /// Override data directory (default: platform-standard app data dir).
    #[arg(long, value_name = "DIR", global = true)]
    data_dir: Option<PathBuf>,

    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// List credentials (id, issuer, name, env, status).
    List {
        /// Filter by environment (dev / staging / prod).
        #[arg(long)]
        env: Option<String>,
        /// Filter by issuer slug (e.g. "openai").
        #[arg(long)]
        issuer: Option<String>,
        /// Output as JSON instead of a human-readable table.
        #[arg(long)]
        json: bool,
    },

    /// Reveal a credential's secret value (default: copy to clipboard,
    /// auto-clear after 30s). Use `--print` to write to stdout instead
    /// (handy for `$(apivault reveal ... --print)` shell expansion).
    Reveal {
        /// Credential ID (ULID, 26 chars).
        id: String,
        /// Print the value to stdout instead of copying to clipboard.
        #[arg(long)]
        print: bool,
        /// Seconds before clearing the clipboard (default 30).
        #[arg(long, default_value_t = 30)]
        clear_after: u64,
    },
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e:#}");
            ExitCode::FAILURE
        }
    }
}

async fn run(cli: Cli) -> Result<()> {
    match cli.command {
        Command::List { env, issuer, json } => {
            cmd_list(cli.data_dir.as_deref(), env.as_deref(), issuer.as_deref(), json).await
        }
        Command::Reveal { id, print, clear_after } => {
            cmd_reveal(cli.data_dir.as_deref(), &id, print, clear_after).await
        }
    }
}

// ---------------------------------------------------------------------------
// Shared bootstrap
// ---------------------------------------------------------------------------

/// Resolve the platform-standard data directory used by the desktop app.
/// Tauri uses `app_data_dir()` which on each OS maps to a platform-standard
/// location. Mirror that so a single vault is shared between GUI and CLI.
pub fn default_data_dir() -> Result<PathBuf> {
    let proj = directories::ProjectDirs::from("app", "api-vault", "api-vault")
        .ok_or_else(|| anyhow!("could not resolve platform data directory"))?;
    Ok(proj.data_dir().to_path_buf())
}

/// Open the local age vault, prompt for the passphrase via rpassword, and
/// return an unlocked instance. Matches the Tauri app's vault location.
async fn open_vault(data_dir: &std::path::Path) -> Result<Box<dyn VaultStorage + Send + Sync>> {
    let vault_path = data_dir.join("vault.age");
    let mut age = AgeVaultStorage::open(&vault_path)
        .await
        .with_context(|| format!("opening vault at {}", vault_path.display()))?;
    let pw = rpassword::prompt_password("Vault passphrase: ")
        .context("reading passphrase from terminal")?;
    age.unlock(SecretString::from(pw))
        .await
        .context("vault unlock — wrong passphrase or corrupted vault")?;
    Ok(Box::new(age) as Box<dyn VaultStorage + Send + Sync>)
}

// ---------------------------------------------------------------------------
// `apivault list`
// ---------------------------------------------------------------------------

async fn cmd_list(
    data_dir_override: Option<&std::path::Path>,
    env: Option<&str>,
    issuer_slug: Option<&str>,
    json: bool,
) -> Result<()> {
    let data_dir = match data_dir_override {
        Some(d) => d.to_path_buf(),
        None => default_data_dir()?,
    };

    // List does not require unlocking the secret values themselves — we read
    // metadata from SQLite. We still verify the vault is initialised so the
    // CLI fails clearly when run on a fresh machine before the GUI has set up
    // a vault.
    let vault_path = data_dir.join("vault.age");
    if !vault_path.exists() {
        return Err(anyhow!(
            "no vault at {} — initialise via the desktop app or `apivault pair` first",
            vault_path.display()
        ));
    }

    let db_path = data_dir.join("vault.db");
    if !db_path.exists() {
        return Err(anyhow!(
            "no SQLite store at {} — has the desktop app booted yet?",
            db_path.display()
        ));
    }
    let pool = init_pool(&db_path).await.context("opening SQLite pool")?;

    let cred_repo = CredentialRepo::new(&pool);
    let issuer_repo = IssuerRepo::new(&pool);

    let env_filter = match env {
        Some("dev") => Some(api_vault_core::Env::Dev),
        Some("staging") => Some(api_vault_core::Env::Staging),
        Some("prod") => Some(api_vault_core::Env::Prod),
        Some(other) => {
            return Err(anyhow!(
                "unknown env {other:?} — expected dev / staging / prod"
            ))
        }
        None => None,
    };
    let issuer_id = if let Some(slug) = issuer_slug {
        let issuers = issuer_repo.list().await.context("listing issuers")?;
        Some(
            issuers
                .into_iter()
                .find(|i| i.slug == slug)
                .ok_or_else(|| anyhow!("no issuer with slug {slug:?}"))?
                .id,
        )
    } else {
        None
    };

    let filter = CredentialFilter {
        issuer_id,
        env: env_filter,
        status: None,
        expiring_within_days: None,
    };
    let creds = cred_repo
        .list(&filter)
        .await
        .context("listing credentials")?;
    let issuers = issuer_repo.list().await.context("listing issuers")?;

    if json {
        let mut rows: Vec<serde_json::Value> = Vec::with_capacity(creds.len());
        for c in &creds {
            let issuer_slug = issuers
                .iter()
                .find(|i| i.id == c.issuer_id)
                .map(|i| i.slug.clone())
                .unwrap_or_default();
            rows.push(serde_json::json!({
                "id": c.id.to_string(),
                "issuer": issuer_slug,
                "name": c.name,
                "env": format!("{:?}", c.env).to_lowercase(),
                "status": status_label(c.status),
            }));
        }
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({ "credentials": rows }))?
        );
        return Ok(());
    }

    // Human-readable table.
    if creds.is_empty() {
        println!("(no credentials)");
        return Ok(());
    }
    let header = format!("{:<28} {:<12} {:<24} {:<8} {}", "ID", "ISSUER", "NAME", "ENV", "STATUS");
    println!("{header}");
    println!("{}", "-".repeat(header.len()));
    for c in &creds {
        let issuer_slug = issuers
            .iter()
            .find(|i| i.id == c.issuer_id)
            .map(|i| i.slug.as_str())
            .unwrap_or("-");
        println!(
            "{:<28} {:<12} {:<24} {:<8} {}",
            truncate(&c.id.to_string(), 28),
            truncate(issuer_slug, 12),
            truncate(&c.name, 24),
            format!("{:?}", c.env).to_lowercase(),
            status_label(c.status),
        );
    }
    Ok(())
}

fn status_label(s: CredentialStatus) -> &'static str {
    match s {
        CredentialStatus::Active => "active",
        CredentialStatus::Revoked => "revoked",
        CredentialStatus::Compromised => "compromised",
    }
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_owned()
    } else {
        let mut out: String = s.chars().take(n.saturating_sub(1)).collect();
        out.push('…');
        out
    }
}

// ---------------------------------------------------------------------------
// `apivault reveal <id>`
// ---------------------------------------------------------------------------

async fn cmd_reveal(
    data_dir_override: Option<&std::path::Path>,
    id_str: &str,
    print: bool,
    clear_after_secs: u64,
) -> Result<()> {
    use secrecy::ExposeSecret as _;

    let data_dir = match data_dir_override {
        Some(d) => d.to_path_buf(),
        None => default_data_dir()?,
    };

    let cred_id: CredentialId = id_str
        .parse()
        .map_err(|e| anyhow!("invalid credential id {id_str:?}: {e}"))?;

    // SQLite 에서 vault_ref 조회 — secret 자체는 vault 에 있음.
    let db_path = data_dir.join("vault.db");
    if !db_path.exists() {
        return Err(anyhow!("no SQLite store at {}", db_path.display()));
    }
    let pool = init_pool(&db_path).await.context("opening SQLite pool")?;
    let cred_repo = CredentialRepo::new(&pool);
    let credential = cred_repo
        .get_by_id(cred_id)
        .await
        .context("looking up credential")?
        .ok_or_else(|| anyhow!("no credential with id {id_str}"))?;

    // Vault unlock + reveal.
    let vault = open_vault(&data_dir).await?;
    let secret = vault
        .get_secret(&credential.vault_ref)
        .await
        .context("vault.get_secret — vault may be corrupted")?;
    let plaintext = std::str::from_utf8(secret.expose_secret())
        .context("credential value is not UTF-8")?
        .to_owned();

    if print {
        // 줄바꿈 없이 출력 — `$(apivault reveal ... --print)` 호환.
        print!("{plaintext}");
        return Ok(());
    }

    // Clipboard + auto-clear.
    copy_to_clipboard_with_clear(&plaintext, clear_after_secs).await?;
    println!(
        "value copied to clipboard — clearing in {clear_after_secs}s",
    );
    Ok(())
}

/// Set clipboard, then sleep `clear_after_secs` and overwrite with empty
/// string. Returns once the clear is done so the binary's exit guarantees
/// the clipboard no longer holds the secret.
async fn copy_to_clipboard_with_clear(plaintext: &str, clear_after_secs: u64) -> Result<()> {
    let mut cb = arboard::Clipboard::new()
        .context("clipboard unavailable — try `--print` instead")?;
    cb.set_text(plaintext.to_owned())
        .context("setting clipboard contents")?;
    if clear_after_secs == 0 {
        return Ok(());
    }
    tokio::time::sleep(std::time::Duration::from_secs(clear_after_secs)).await;
    // Best-effort — if the user has copied something else in the meantime
    // we don't want to clobber it. Read current contents first.
    if let Ok(current) = cb.get_text() {
        if current == plaintext {
            let _ = cb.set_text(String::new());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_short_string_unchanged() {
        assert_eq!(truncate("abc", 10), "abc");
    }

    #[test]
    fn truncate_long_string_appends_ellipsis() {
        assert_eq!(truncate("abcdefghij", 5), "abcd…");
    }

    #[test]
    fn status_label_matches_known_variants() {
        assert_eq!(status_label(CredentialStatus::Active), "active");
        assert_eq!(status_label(CredentialStatus::Revoked), "revoked");
        assert_eq!(status_label(CredentialStatus::Compromised), "compromised");
    }
}
