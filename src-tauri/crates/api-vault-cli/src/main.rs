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

use api_vault_core::graph::{DependencyGraph, EdgeKind, NodeRef};
use api_vault_core::{CredentialFilter, CredentialId, CredentialStatus, ProjectId, UsageWhereKind};
use api_vault_storage::age_vault::AgeVaultStorage;
use api_vault_storage::sqlite::init_pool;
use api_vault_storage::sqlite::repositories::credential::CredentialRepo;
use api_vault_storage::sqlite::repositories::issuer::IssuerRepo;
use api_vault_storage::sqlite::repositories::usage::UsageRepo;
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

    /// Run a command with the given project's credentials injected as env
    /// vars. Resembles `doppler run -- npm start` but uses our dependency
    /// graph (Project → Usage(env_var) → Credential) so each var maps to
    /// exactly one secret — no manual config file.
    Run {
        /// Project ID (ULID). All env-var usages of that project are
        /// injected.
        #[arg(long)]
        project: String,
        /// Command + arguments (everything after `--`).
        #[arg(trailing_var_arg = true, allow_hyphen_values = true, required = true)]
        cmd: Vec<String>,
    },

    /// Run a supply-chain scan against the manifest + lockfile of a project
    /// directory. Uses the same engine as the desktop app. JSON output is
    /// stable and consumed by the VS Code / JetBrains plugins.
    Scan {
        #[command(subcommand)]
        kind: ScanKind,
    },

    /// Emit the dependency graph (Issuer → Credential → Project → Deployment)
    /// as JSON. Read by the JetBrains plugin's Graph view (M22 v3) and any
    /// external visualization tool. Reads SQLite directly — no vault unlock.
    Graph {
        /// Output as JSON (default true; reserved for future text formats).
        #[arg(long, default_value_t = true)]
        json: bool,
    },

    /// Emit the blast radius of a credential as JSON: which nodes break
    /// when this credential is revoked, bucketed by BFS depth.
    /// Used by the JetBrains Graph view's "Show blast radius" action (v5).
    BlastRadius {
        /// Credential ULID.
        id: String,
    },
}

#[derive(Debug, Subcommand)]
enum ScanKind {
    /// Scan npm / Cargo dependencies for known OSV.dev advisories.
    SupplyChain {
        /// Project root. Defaults to the current working directory.
        #[arg(long, value_name = "DIR")]
        project: Option<PathBuf>,
        /// Always emit JSON (text mode is implicit when omitted).
        #[arg(long)]
        json: bool,
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
            cmd_list(
                cli.data_dir.as_deref(),
                env.as_deref(),
                issuer.as_deref(),
                json,
            )
            .await
        }
        Command::Reveal {
            id,
            print,
            clear_after,
        } => cmd_reveal(cli.data_dir.as_deref(), &id, print, clear_after).await,
        Command::Run { project, cmd } => cmd_run(cli.data_dir.as_deref(), &project, cmd).await,
        Command::Scan { kind } => match kind {
            ScanKind::SupplyChain { project, json } => {
                cmd_scan_supply_chain(project.as_deref(), json).await
            }
        },
        Command::Graph { json: _ } => cmd_graph(cli.data_dir.as_deref()).await,
        Command::BlastRadius { id } => cmd_blast_radius(cli.data_dir.as_deref(), &id).await,
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
    let header = format!(
        "{:<28} {:<12} {:<24} {:<8} {}",
        "ID", "ISSUER", "NAME", "ENV", "STATUS"
    );
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
    println!("value copied to clipboard — clearing in {clear_after_secs}s",);
    Ok(())
}

// ---------------------------------------------------------------------------
// `apivault run --project=<id> -- <cmd>`
// ---------------------------------------------------------------------------

async fn cmd_run(
    data_dir_override: Option<&std::path::Path>,
    project_id_str: &str,
    cmd: Vec<String>,
) -> Result<()> {
    use secrecy::ExposeSecret as _;

    if cmd.is_empty() {
        return Err(anyhow!("missing command after `--`"));
    }

    let data_dir = match data_dir_override {
        Some(d) => d.to_path_buf(),
        None => default_data_dir()?,
    };

    let project_id: ProjectId = project_id_str
        .parse()
        .map_err(|e| anyhow!("invalid project id {project_id_str:?}: {e}"))?;

    let db_path = data_dir.join("vault.db");
    if !db_path.exists() {
        return Err(anyhow!("no SQLite store at {}", db_path.display()));
    }
    let pool = init_pool(&db_path).await.context("opening SQLite pool")?;
    let usage_repo = UsageRepo::new(&pool);
    let cred_repo = CredentialRepo::new(&pool);

    let usages = usage_repo
        .list_for_project(project_id)
        .await
        .context("listing usages")?;
    let env_var_usages: Vec<_> = usages
        .into_iter()
        .filter(|u| matches!(u.where_kind, UsageWhereKind::EnvVar))
        .collect();

    if env_var_usages.is_empty() {
        eprintln!(
            "warning: project {project_id_str} has no env-var usages — \
             running command with the unmodified environment",
        );
    }

    // Resolve credential vault_refs first (without unlocking yet) so the
    // user only sees one passphrase prompt for many secrets.
    let mut to_reveal: Vec<(String, String)> = Vec::with_capacity(env_var_usages.len()); // (env_name, vault_ref)
    for u in &env_var_usages {
        let cred = cred_repo
            .get_by_id(u.credential_id)
            .await
            .context("looking up credential for usage")?
            .ok_or_else(|| {
                anyhow!(
                    "usage {} references missing credential {}",
                    u.id,
                    u.credential_id
                )
            })?;
        // Skip revoked / compromised — refuse to inject a known-bad secret
        // into a child process. User must explicitly rotate first.
        if !matches!(cred.status, CredentialStatus::Active) {
            return Err(anyhow!(
                "credential {} (env {}) is {} — rotate it before running",
                cred.id,
                u.where_value,
                status_label(cred.status),
            ));
        }
        to_reveal.push((u.where_value.clone(), cred.vault_ref.clone()));
    }

    // Single unlock for the whole run.
    let vault = open_vault(&data_dir).await?;
    let mut envs: Vec<(String, String)> = Vec::with_capacity(to_reveal.len());
    for (name, vault_ref) in &to_reveal {
        let secret = vault
            .get_secret(vault_ref)
            .await
            .with_context(|| format!("reading secret for env {name}"))?;
        let value = std::str::from_utf8(secret.expose_secret())
            .with_context(|| format!("env {name}: secret is not UTF-8"))?
            .to_owned();
        envs.push((name.clone(), value));
    }
    drop(vault); // wipe age identity asap.

    // Spawn child. Use std (sync) — Tokio child is overkill; we just wait.
    let program = &cmd[0];
    let args = &cmd[1..];
    let mut command = std::process::Command::new(program);
    command.args(args);
    for (name, value) in &envs {
        command.env(name, value);
    }

    eprintln!(
        "apivault: running `{} {}` with {} injected env var(s)",
        program,
        args.join(" "),
        envs.len()
    );

    let status = command
        .status()
        .with_context(|| format!("spawning {program:?}"))?;

    // Forward exit code. On Unix, use the underlying signal/code; on Windows
    // just the code.
    if !status.success() {
        match status.code() {
            Some(c) => std::process::exit(c),
            None => std::process::exit(1),
        }
    }
    Ok(())
}

/// Set clipboard, then sleep `clear_after_secs` and overwrite with empty
/// string. Returns once the clear is done so the binary's exit guarantees
/// the clipboard no longer holds the secret.
async fn copy_to_clipboard_with_clear(plaintext: &str, clear_after_secs: u64) -> Result<()> {
    let mut cb =
        arboard::Clipboard::new().context("clipboard unavailable — try `--print` instead")?;
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

// ---------------------------------------------------------------------------
// `apivault scan supply-chain --project <path> [--json]`
// ---------------------------------------------------------------------------

async fn cmd_scan_supply_chain(
    project_path_override: Option<&std::path::Path>,
    json: bool,
) -> Result<()> {
    use api_vault_supply::lockfile::{
        apply_resolved, parse_cargo_lock, parse_package_lock_json, parse_pnpm_lock_yaml,
        ResolvedVersions,
    };
    use api_vault_supply::manifest::{parse_cargo_toml, parse_package_json};
    use api_vault_supply::matcher::match_advisories;
    use api_vault_supply::{DependencyDeclaration, OsvClient, PackageAdvisory};

    let root = match project_path_override {
        Some(p) => p.to_path_buf(),
        None => std::env::current_dir().context("getting current dir")?,
    };
    if !root.exists() {
        return Err(anyhow!("project path does not exist: {}", root.display()));
    }

    // 1. Discover manifests + parse.
    let mut deps: Vec<DependencyDeclaration> = Vec::new();
    let pkg_json = root.join("package.json");
    if pkg_json.exists() {
        match parse_package_json(&pkg_json) {
            Ok(d) => deps.extend(d),
            Err(e) => eprintln!("warning: package.json: {e}"),
        }
    }
    let cargo_toml = root.join("Cargo.toml");
    if cargo_toml.exists() {
        match parse_cargo_toml(&cargo_toml) {
            Ok(d) => deps.extend(d),
            Err(e) => eprintln!("warning: Cargo.toml: {e}"),
        }
    }

    // 2. Lockfile resolve.
    let mut resolved = ResolvedVersions::new();
    if root.join("package-lock.json").exists() {
        if let Ok(r) = parse_package_lock_json(&root.join("package-lock.json")) {
            resolved.extend(r);
        }
    }
    if root.join("pnpm-lock.yaml").exists() {
        if let Ok(r) = parse_pnpm_lock_yaml(&root.join("pnpm-lock.yaml")) {
            for (k, v) in r {
                resolved.entry(k).or_insert(v);
            }
        }
    }
    if root.join("Cargo.lock").exists() {
        if let Ok(r) = parse_cargo_lock(&root.join("Cargo.lock")) {
            resolved.extend(r);
        }
    }
    if !resolved.is_empty() {
        apply_resolved(&mut deps, &resolved);
    }

    // 3. OSV query.
    let osv = OsvClient::new();
    let mut advisories: Vec<PackageAdvisory> = Vec::new();
    let mut osv_failures: u32 = 0;
    for d in &deps {
        if matches!(d.version.as_str(), "workspace" | "path" | "git" | "*") {
            continue;
        }
        match osv.query(d.ecosystem, &d.name, &d.version).await {
            Ok(list) => advisories.extend(list),
            Err(_) => osv_failures += 1,
        }
    }

    // 4. Match.
    let matches = match_advisories(&deps, &advisories);

    if json {
        let matched: Vec<serde_json::Value> = matches
            .iter()
            .map(|m| {
                let d = &deps[m.dep_index];
                let a = &advisories[m.advisory_index];
                serde_json::json!({
                    "packageName": d.name,
                    "ecosystem": d.ecosystem.db_name(),
                    "version": d.version,
                    "manifestPath": d.manifest_path,
                    "sourceId": a.source_id,
                    "severity": severity_label_supply(a.severity),
                    "category": category_label_supply(a.category),
                    "summary": a.summary,
                })
            })
            .collect();
        let report = serde_json::json!({
            "manifestsFound": (pkg_json.exists() as u32 + cargo_toml.exists() as u32),
            "packagesSeen": deps.len() as u32,
            "advisoriesMatched": matched.len() as u32,
            "osvQueryFailures": osv_failures,
            "matched": matched,
        });
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    // Human-readable.
    println!(
        "scanned {}: {} dep(s), {} advisor(ies) matched ({} OSV failures)",
        root.display(),
        deps.len(),
        matches.len(),
        osv_failures,
    );
    for m in &matches {
        let d = &deps[m.dep_index];
        let a = &advisories[m.advisory_index];
        println!(
            "  [{}] {} {} {} — {} ({})",
            severity_label_supply(a.severity),
            d.ecosystem.db_name(),
            d.name,
            d.version,
            a.summary,
            a.source_id,
        );
    }
    Ok(())
}

fn severity_label_supply(s: api_vault_supply::AdvisorySeverity) -> &'static str {
    use api_vault_supply::AdvisorySeverity as S;
    match s {
        S::Low => "low",
        S::Medium => "medium",
        S::High => "high",
        S::Critical => "critical",
    }
}

fn category_label_supply(c: api_vault_supply::AdvisoryCategory) -> &'static str {
    use api_vault_supply::AdvisoryCategory as C;
    match c {
        C::SecretLeak => "secret_leak",
        C::CryptoWeak => "crypto_weak",
        C::SupplyChain => "supply_chain",
        C::Other => "other",
    }
}

// ---------------------------------------------------------------------------
// `apivault graph` — JSON dump of dependency graph
// ---------------------------------------------------------------------------

async fn cmd_graph(data_dir_override: Option<&std::path::Path>) -> Result<()> {
    use api_vault_storage::sqlite::repositories::{
        deployment::DeploymentRepo, project::ProjectRepo,
    };

    let data_dir = match data_dir_override {
        Some(d) => d.to_path_buf(),
        None => default_data_dir()?,
    };
    let db_path = data_dir.join("vault.db");
    if !db_path.exists() {
        return Err(anyhow!(
            "no SQLite store at {} — has the desktop app booted yet?",
            db_path.display()
        ));
    }
    let pool = init_pool(&db_path).await.context("opening SQLite pool")?;

    let issuers = IssuerRepo::new(&pool)
        .list()
        .await
        .context("listing issuers")?;
    let credentials = CredentialRepo::new(&pool)
        .list_all()
        .await
        .context("listing credentials")?;
    let usages = UsageRepo::new(&pool)
        .list_all()
        .await
        .context("listing usages")?;
    let projects = ProjectRepo::new(&pool)
        .list()
        .await
        .context("listing projects")?;
    let deployments = DeploymentRepo::new(&pool)
        .list_all()
        .await
        .context("listing deployments")?;

    let graph = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &deployments);

    let issuer_map: std::collections::HashMap<String, &api_vault_core::Issuer> =
        issuers.iter().map(|i| (i.id.to_string(), i)).collect();
    let cred_map: std::collections::HashMap<String, &api_vault_core::Credential> =
        credentials.iter().map(|c| (c.id.to_string(), c)).collect();
    let project_map: std::collections::HashMap<String, &api_vault_core::Project> =
        projects.iter().map(|p| (p.id.to_string(), p)).collect();
    let dep_map: std::collections::HashMap<String, &api_vault_core::Deployment> =
        deployments.iter().map(|d| (d.id.to_string(), d)).collect();

    let nodes: Vec<serde_json::Value> = graph
        .nodes()
        .map(|nr| {
            let id = node_id_string(nr);
            let (kind, label, meta) = match nr {
                NodeRef::Issuer(_) => issuer_map
                    .get(&id)
                    .map(|i| {
                        (
                            "issuer",
                            i.display_name.clone(),
                            serde_json::json!({
                                "slug": i.slug,
                                "docs_url": i.docs_url,
                                "icon_key": i.icon_key,
                            }),
                        )
                    })
                    .unwrap_or(("issuer", "<missing>".into(), serde_json::json!({}))),
                NodeRef::Credential(_) => cred_map
                    .get(&id)
                    .map(|c| {
                        (
                            "credential",
                            c.name.clone(),
                            serde_json::json!({
                                "env": format!("{:?}", c.env).to_lowercase(),
                                "status": format!("{:?}", c.status).to_lowercase(),
                                "issuer_id": c.issuer_id.to_string(),
                            }),
                        )
                    })
                    .unwrap_or(("credential", "<missing>".into(), serde_json::json!({}))),
                NodeRef::Project(_) => project_map
                    .get(&id)
                    .map(|p| {
                        (
                            "project",
                            p.name.clone(),
                            serde_json::json!({
                                "repo_url": p.repo_url,
                                "framework": p.framework,
                            }),
                        )
                    })
                    .unwrap_or(("project", "<missing>".into(), serde_json::json!({}))),
                NodeRef::Deployment(_) => dep_map
                    .get(&id)
                    .map(|d| {
                        (
                            "deployment",
                            format!("{} @ {:?}", d.url, d.env).to_lowercase(),
                            serde_json::json!({
                                "url": d.url,
                                "env": format!("{:?}", d.env).to_lowercase(),
                                "platform": format!("{:?}", d.platform).to_lowercase(),
                                "project_id": d.project_id.to_string(),
                            }),
                        )
                    })
                    .unwrap_or(("deployment", "<missing>".into(), serde_json::json!({}))),
            };
            serde_json::json!({
                "id": id,
                "kind": kind,
                "label": label,
                "meta": meta,
            })
        })
        .collect();

    let edges: Vec<serde_json::Value> = graph
        .edges()
        .map(|(src, dst, kind)| {
            let src_id = node_id_string(src);
            let dst_id = node_id_string(dst);
            let kind_str = match kind {
                EdgeKind::Issues => "issues",
                EdgeKind::UsedBy => "used_by",
                EdgeKind::DeployedAs => "deployed_as",
            };
            serde_json::json!({
                "id": format!("{src_id}->{dst_id}:{kind_str}"),
                "source": src_id,
                "target": dst_id,
                "kind": kind_str,
            })
        })
        .collect();

    let payload = serde_json::json!({
        "nodes": nodes,
        "edges": edges,
    });
    println!("{}", serde_json::to_string_pretty(&payload)?);
    Ok(())
}

// ---------------------------------------------------------------------------
// `apivault blast-radius <credential-id>`
// ---------------------------------------------------------------------------

async fn cmd_blast_radius(data_dir_override: Option<&std::path::Path>, id_str: &str) -> Result<()> {
    use api_vault_core::blast_radius::blast_radius;
    use api_vault_storage::sqlite::repositories::{
        deployment::DeploymentRepo, project::ProjectRepo,
    };

    let data_dir = match data_dir_override {
        Some(d) => d.to_path_buf(),
        None => default_data_dir()?,
    };
    let db_path = data_dir.join("vault.db");
    if !db_path.exists() {
        return Err(anyhow!("no SQLite store at {}", db_path.display()));
    }

    let cred_id: CredentialId = id_str
        .parse()
        .map_err(|e| anyhow!("invalid credential id {id_str:?}: {e}"))?;

    let pool = init_pool(&db_path).await.context("opening SQLite pool")?;
    let issuers = IssuerRepo::new(&pool).list().await?;
    let credentials = CredentialRepo::new(&pool).list_all().await?;
    let usages = UsageRepo::new(&pool).list_all().await?;
    let projects = ProjectRepo::new(&pool).list().await?;
    let deployments = DeploymentRepo::new(&pool).list_all().await?;

    let graph = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &deployments);
    let radius = blast_radius(&graph, cred_id);

    let to_id = |nr: &NodeRef| -> String {
        match nr {
            NodeRef::Issuer(id) => id.to_string(),
            NodeRef::Credential(id) => id.to_string(),
            NodeRef::Project(id) => id.to_string(),
            NodeRef::Deployment(id) => id.to_string(),
        }
    };
    let payload = serde_json::json!({
        "credentialId": cred_id.to_string(),
        "primary":   radius.primary.iter().map(to_id).collect::<Vec<_>>(),
        "secondary": radius.secondary.iter().map(to_id).collect::<Vec<_>>(),
        "tertiary":  radius.tertiary.iter().map(to_id).collect::<Vec<_>>(),
    });
    println!("{}", serde_json::to_string_pretty(&payload)?);
    Ok(())
}

fn node_id_string(nr: NodeRef) -> String {
    match nr {
        NodeRef::Issuer(id) => id.to_string(),
        NodeRef::Credential(id) => id.to_string(),
        NodeRef::Project(id) => id.to_string(),
        NodeRef::Deployment(id) => id.to_string(),
    }
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
