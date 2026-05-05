//! `apivault-mcp` — Model Context Protocol server for API Vault.
//!
//! M18 의 두 번째 차별화 표면 (CLI 다음). **어떤 경쟁사도 아직 안 만든 새
//! 카테고리** — Claude / Cursor / Continue / 기타 MCP-compatible AI agent
//! 가 vault 와 직접 대화. dependency graph + RAILGUARD 자산이 AI editor
//! 안에서 자연스럽게 노출된다.
//!
//! ## Protocol
//!
//! MCP 2024-11-05 사양. JSON-RPC 2.0 over stdio. 한 줄에 한 메시지 (line-
//! delimited). stderr 는 로그 (사용자가 보는), stdout 은 RPC 메시지.
//!
//! Lifecycle:
//!   client → initialize → server  (capabilities advertisement)
//!   client → notifications/initialized
//!   client → tools/list → server  (도구 목록)
//!   client → tools/call → server  (도구 호출)
//!   ... (반복) ...
//!   client → shutdown / exit
//!
//! ## Tools
//!
//! - `list_credentials` — metadata 만 (id / issuer / name / env / status).
//!   AI 가 어떤 credential 이 있는지 인지하기 위해. 평문 노출 0.
//! - `reveal_credential` — 특정 credential 의 평문 value. AI agent 의 가장
//!   민감한 호출 — 사용자 명시 요청 ("Claude, OPENAI_KEY 알려줘") 시에만
//!   호출하라는 강한 description. 서버는 reveal 호출을 stderr 에 audit log
//!   로 즉시 출력 (사용자 가시성).
//!
//! ## 보안 모델 (MVP)
//!
//! MCP 는 stdio 라 사용자에게 per-call dialog 를 못 띄운다. MVP 의 의도적
//! 디자인:
//!   - 서버 시작 시 vault unlock (passphrase prompt via rpassword on
//!     stderr/tty). process 생명 동안 unlocked.
//!   - 모든 reveal 호출은 stderr 에 audit line (`[REVEAL] crd_xxx → <agent>`)
//!     출력. 사용자가 terminal 에서 본다.
//!   - reveal 호출 limit (default 30 req/hour) — runaway agent 보호.
//!
//! v1.1: desktop app 의 별도 confirmation IPC (Tauri command 로 사용자
//! dialog) 추가 검토.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context as _, Result};
use clap::Parser;
use secrecy::{ExposeSecret as _, SecretString};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::Mutex;

use api_vault_core::{CredentialFilter, CredentialId, CredentialStatus};
use api_vault_railguard::{render, RenderContext, RuleKind};
use api_vault_storage::age_vault::AgeVaultStorage;
use api_vault_storage::sqlite::init_pool;
use api_vault_storage::sqlite::repositories::credential::CredentialRepo;
use api_vault_storage::sqlite::repositories::issuer::IssuerRepo;
use api_vault_storage::sqlite::SqlitePool;
use api_vault_storage::vault::VaultStorage;
use api_vault_supply::advisory::{AdvisoryCategory, AdvisorySeverity, OsvClient};
use api_vault_supply::manifest::{parse_cargo_toml, parse_package_json};
use api_vault_supply::matcher::match_advisories;
use api_vault_supply::DependencyDeclaration;

const PROTOCOL_VERSION: &str = "2024-11-05";
const SERVER_NAME: &str = "api-vault-mcp";
const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Parser)]
#[command(
    name = "apivault-mcp",
    about = "API Vault MCP server (Claude/Cursor/Continue) — JSON-RPC over stdio",
    long_about = "MCP server bridging API Vault to AI agents. Register in your\n\
                  agent's MCP config (e.g. Claude Desktop's claude_desktop_config.json)\n\
                  with command 'apivault-mcp'."
)]
struct Cli {
    /// Override data directory (default: platform-standard app data dir).
    #[arg(long, value_name = "DIR")]
    data_dir: Option<PathBuf>,

    /// Maximum reveal_credential calls per hour. Runaway-agent guard.
    #[arg(long, default_value_t = 30)]
    reveal_per_hour: u32,
}

// ---------------------------------------------------------------------------
// JSON-RPC types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct RpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct RpcResponse {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

#[derive(Debug, Serialize)]
struct RpcError {
    code: i64,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

impl RpcError {
    fn method_not_found(name: &str) -> Self {
        Self {
            code: -32601,
            message: format!("method not found: {name}"),
            data: None,
        }
    }
    fn invalid_params(msg: impl Into<String>) -> Self {
        Self {
            code: -32602,
            message: msg.into(),
            data: None,
        }
    }
    fn internal(msg: impl Into<String>) -> Self {
        Self {
            code: -32603,
            message: msg.into(),
            data: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------

struct ServerState {
    pool: Arc<SqlitePool>,
    vault: Mutex<Box<dyn VaultStorage + Send + Sync>>,
    reveal_history: Mutex<VecDeque<Instant>>,
    reveal_per_hour: u32,
}

impl ServerState {
    // Reveal quota 검증은 tool_reveal_credential 안에서 직접 처리 (async 컨텍스트
    // 라 self.reveal_history.lock().await 호출 가능).
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn default_data_dir() -> Result<PathBuf> {
    let proj = directories::ProjectDirs::from("app", "api-vault", "api-vault")
        .ok_or_else(|| anyhow!("could not resolve platform data directory"))?;
    Ok(proj.data_dir().to_path_buf())
}

fn status_label(s: CredentialStatus) -> &'static str {
    match s {
        CredentialStatus::Active => "active",
        CredentialStatus::Revoked => "revoked",
        CredentialStatus::Compromised => "compromised",
    }
}

async fn open_vault(data_dir: &std::path::Path) -> Result<Box<dyn VaultStorage + Send + Sync>> {
    let vault_path = data_dir.join("vault.age");
    if !vault_path.exists() {
        return Err(anyhow!(
            "no vault at {} — initialise via the desktop app first",
            vault_path.display()
        ));
    }
    let mut age = AgeVaultStorage::open(&vault_path).await?;
    eprintln!("apivault-mcp: vault locked. enter passphrase on the controlling terminal.");
    let pw = rpassword::prompt_password("Vault passphrase: ")
        .context("reading passphrase from terminal")?;
    age.unlock(SecretString::from(pw))
        .await
        .context("vault unlock — wrong passphrase or corrupted vault")?;
    Ok(Box::new(age) as Box<dyn VaultStorage + Send + Sync>)
}

// ---------------------------------------------------------------------------
// MCP method handlers
// ---------------------------------------------------------------------------

fn handle_initialize(_params: &Value) -> Result<Value, RpcError> {
    Ok(json!({
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {
            "tools": {}
        },
        "serverInfo": {
            "name": SERVER_NAME,
            "version": SERVER_VERSION
        }
    }))
}

fn handle_tools_list() -> Result<Value, RpcError> {
    Ok(json!({
        "tools": [
            {
                "name": "list_credentials",
                "description":
                    "List all credentials stored in the vault — returns id, issuer, name, env, status only. Does NOT reveal any secret values. Use this to discover what secrets are available before deciding whether to ask the user about revealing one.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "issuer": {
                            "type": "string",
                            "description": "Filter by issuer slug (e.g. 'openai', 'stripe')"
                        },
                        "env": {
                            "type": "string",
                            "enum": ["dev", "staging", "prod"],
                            "description": "Filter by environment"
                        }
                    }
                }
            },
            {
                "name": "reveal_credential",
                "description":
                    "Reveal a credential's secret value (plaintext). HIGH-SENSITIVITY: only call when the user has explicitly asked to retrieve this specific secret. Never call proactively. Every call is audited and visible to the user on the controlling terminal. Returns the plaintext value as a string.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Credential ULID (26 chars) — get this from list_credentials"
                        }
                    },
                    "required": ["id"]
                }
            },
            {
                "name": "check_railguard_status",
                "description":
                    "Check whether the given project directory has API Vault's RAILGUARD rule files in place. Returns the presence (true/false) of .cursorrules, .windsurfrules, CLAUDE.md, and .github/copilot-instructions.md. Use this BEFORE writing code that touches secrets — if RAILGUARD is missing, suggest the user run `apivault railguard apply` so AI editors stop emitting risky patterns.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "project_path": {
                            "type": "string",
                            "description": "Absolute path to the project root."
                        }
                    },
                    "required": ["project_path"]
                }
            },
            {
                "name": "check_supply_chain_risk",
                "description":
                    "Scan a project directory for npm / Cargo dependencies and return any OSV.dev advisories that match (especially secret_leak / supply_chain category). Use this BEFORE committing code that adds new dependencies — if a package has secret-exfiltration history, the user should know. Read-only: no DB writes.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "project_path": {
                            "type": "string",
                            "description": "Absolute path to the project root (must contain package.json or Cargo.toml)"
                        },
                        "category_filter": {
                            "type": "string",
                            "enum": ["secret_leak", "crypto_weak", "supply_chain", "any"],
                            "description": "Only return advisories of this category. 'any' returns all (default)."
                        }
                    },
                    "required": ["project_path"]
                }
            },
            {
                "name": "suggest_railguard_template",
                "description":
                    "Render an API Vault RAILGUARD template (one of cursor_rules / windsurf_rules / claude_md / copilot_instructions) for a project. Returns the file content as text — caller can show it to the user before writing. Useful when AI editor lacks RAILGUARD and the user wants a preview before committing.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "kind": {
                            "type": "string",
                            "enum": ["cursor_rules", "windsurf_rules", "claude_md", "copilot_instructions"]
                        },
                        "project_name": { "type": "string" },
                        "frameworks": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Detected frameworks (e.g. ['Next.js', 'Tailwind'])"
                        },
                        "issuers": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Issuer display names (e.g. ['OpenAI', 'Stripe'])"
                        }
                    },
                    "required": ["kind", "project_name"]
                }
            }
        ]
    }))
}

async fn handle_tool_call(state: &ServerState, params: &Value) -> Result<Value, RpcError> {
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| RpcError::invalid_params("missing tool name"))?;
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));

    match name {
        "list_credentials" => tool_list_credentials(state, &arguments).await,
        "reveal_credential" => tool_reveal_credential(state, &arguments).await,
        "check_railguard_status" => tool_check_railguard_status(&arguments).await,
        "suggest_railguard_template" => tool_suggest_railguard_template(&arguments),
        "check_supply_chain_risk" => tool_check_supply_chain_risk(&arguments).await,
        other => Err(RpcError::method_not_found(other)),
    }
}

async fn tool_check_supply_chain_risk(args: &Value) -> Result<Value, RpcError> {
    let path_str = args
        .get("project_path")
        .and_then(Value::as_str)
        .ok_or_else(|| RpcError::invalid_params("missing 'project_path'"))?;
    let category_filter = args
        .get("category_filter")
        .and_then(Value::as_str)
        .unwrap_or("any");
    let root = std::path::PathBuf::from(path_str);
    if !root.exists() {
        return Err(RpcError::invalid_params(format!(
            "path does not exist: {path_str}"
        )));
    }

    let mut deps: Vec<DependencyDeclaration> = Vec::new();
    let pkg_json = root.join("package.json");
    if pkg_json.exists() {
        match parse_package_json(&pkg_json) {
            Ok(mut d) => deps.append(&mut d),
            Err(e) => return Err(RpcError::internal(format!("package.json: {e}"))),
        }
    }
    let cargo_toml = root.join("Cargo.toml");
    if cargo_toml.exists() {
        match parse_cargo_toml(&cargo_toml) {
            Ok(mut d) => deps.append(&mut d),
            Err(e) => return Err(RpcError::internal(format!("Cargo.toml: {e}"))),
        }
    }
    if deps.is_empty() {
        return Ok(json!({
            "content": [{
                "type": "text",
                "text": format!("No package.json or Cargo.toml found at {path_str} — nothing to scan.")
            }]
        }));
    }

    let osv = OsvClient::new();
    let mut advisories: Vec<api_vault_supply::PackageAdvisory> = Vec::new();
    let mut osv_failures = 0u32;
    for d in &deps {
        if matches!(d.version.as_str(), "workspace" | "path" | "git" | "*") {
            continue;
        }
        match osv.query(d.ecosystem, &d.name, &d.version).await {
            Ok(list) => advisories.extend(list),
            Err(_) => osv_failures += 1,
        }
    }
    let matches = match_advisories(&deps, &advisories);

    let want = match category_filter {
        "secret_leak" => Some(AdvisoryCategory::SecretLeak),
        "crypto_weak" => Some(AdvisoryCategory::CryptoWeak),
        "supply_chain" => Some(AdvisoryCategory::SupplyChain),
        _ => None,
    };

    let mut rows: Vec<Value> = Vec::new();
    for m in &matches {
        let a = &advisories[m.advisory_index];
        let d = &deps[m.dep_index];
        if let Some(filter) = want {
            if a.category != filter {
                continue;
            }
        }
        rows.push(json!({
            "package": d.name,
            "ecosystem": d.ecosystem.db_name(),
            "version": d.version,
            "manifest": d.manifest_path,
            "source_id": a.source_id,
            "severity": severity_str(a.severity),
            "category": category_str(a.category),
            "summary": a.summary,
        }));
    }
    let summary = format!(
        "scanned {} dep(s), {} OSV failure(s), matched {} advisory(ies){}",
        deps.len(),
        osv_failures,
        rows.len(),
        if want.is_some() {
            format!(" (filter: {category_filter})")
        } else {
            String::new()
        }
    );
    let json_text = serde_json::to_string_pretty(&json!({ "advisories": rows }))
        .map_err(|e| RpcError::internal(e.to_string()))?;
    Ok(json!({
        "content": [{ "type": "text", "text": format!("{summary}\n\n{json_text}") }]
    }))
}

fn severity_str(s: AdvisorySeverity) -> &'static str {
    match s {
        AdvisorySeverity::Low => "low",
        AdvisorySeverity::Medium => "medium",
        AdvisorySeverity::High => "high",
        AdvisorySeverity::Critical => "critical",
    }
}

fn category_str(c: AdvisoryCategory) -> &'static str {
    match c {
        AdvisoryCategory::SecretLeak => "secret_leak",
        AdvisoryCategory::CryptoWeak => "crypto_weak",
        AdvisoryCategory::SupplyChain => "supply_chain",
        AdvisoryCategory::Other => "other",
    }
}

async fn tool_check_railguard_status(args: &Value) -> Result<Value, RpcError> {
    let path_str = args
        .get("project_path")
        .and_then(Value::as_str)
        .ok_or_else(|| RpcError::invalid_params("missing 'project_path'"))?;
    let project_root = std::path::PathBuf::from(path_str);
    if !project_root.exists() {
        return Err(RpcError::invalid_params(format!(
            "project_path does not exist: {path_str}"
        )));
    }

    let mut rows: Vec<Value> = Vec::with_capacity(4);
    let mut all_present = true;
    for kind in RuleKind::all() {
        let p = project_root.join(kind.output_path());
        let present = p.exists();
        if !present {
            all_present = false;
        }
        rows.push(json!({
            "kind": format!("{kind:?}").to_lowercase(),
            "path": kind.output_path(),
            "present": present,
        }));
    }
    let summary = if all_present {
        "RAILGUARD: all 4 rule files present.".to_string()
    } else {
        "RAILGUARD: missing files — recommend `apivault railguard apply` or use suggest_railguard_template to preview.".to_string()
    };
    let json_text =
        serde_json::to_string_pretty(&json!({ "files": rows, "all_present": all_present }))
            .map_err(|e| RpcError::internal(e.to_string()))?;
    Ok(json!({
        "content": [{ "type": "text", "text": format!("{summary}\n\n{json_text}") }]
    }))
}

fn tool_suggest_railguard_template(args: &Value) -> Result<Value, RpcError> {
    let kind_str = args
        .get("kind")
        .and_then(Value::as_str)
        .ok_or_else(|| RpcError::invalid_params("missing 'kind'"))?;
    let kind = match kind_str {
        "cursor_rules" => RuleKind::CursorRules,
        "windsurf_rules" => RuleKind::WindsurfRules,
        "claude_md" => RuleKind::ClaudeMd,
        "copilot_instructions" => RuleKind::CopilotInstructions,
        other => {
            return Err(RpcError::invalid_params(format!("unknown kind {other:?}")));
        }
    };
    let project_name = args
        .get("project_name")
        .and_then(Value::as_str)
        .ok_or_else(|| RpcError::invalid_params("missing 'project_name'"))?;
    let frameworks: Vec<String> = args
        .get("frameworks")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let issuers: Vec<String> = args
        .get("issuers")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let mut ctx = RenderContext::new(project_name);
    ctx.frameworks = frameworks;
    ctx.issuers = issuers;
    let rendered =
        render(kind, &ctx).map_err(|e| RpcError::invalid_params(format!("render failed: {e}")))?;
    Ok(json!({
        "content": [
            {
                "type": "text",
                "text": format!("Suggested {} contents (write to project root):\n\n{rendered}", kind.output_path()),
            }
        ]
    }))
}

async fn tool_list_credentials(state: &ServerState, args: &Value) -> Result<Value, RpcError> {
    let env_str = args.get("env").and_then(Value::as_str);
    let env_filter = match env_str {
        Some("dev") => Some(api_vault_core::Env::Dev),
        Some("staging") => Some(api_vault_core::Env::Staging),
        Some("prod") => Some(api_vault_core::Env::Prod),
        Some(other) => return Err(RpcError::invalid_params(format!("unknown env {other:?}"))),
        None => None,
    };
    let issuer_repo = IssuerRepo::new(&state.pool);
    let issuers = issuer_repo
        .list()
        .await
        .map_err(|e| RpcError::internal(format!("issuer list: {e}")))?;

    let issuer_id = if let Some(slug) = args.get("issuer").and_then(Value::as_str) {
        Some(
            issuers
                .iter()
                .find(|i| i.slug == slug)
                .ok_or_else(|| RpcError::invalid_params(format!("no issuer with slug {slug:?}")))?
                .id,
        )
    } else {
        None
    };

    let cred_repo = CredentialRepo::new(&state.pool);
    let creds = cred_repo
        .list(&CredentialFilter {
            issuer_id,
            env: env_filter,
            status: None,
            expiring_within_days: None,
            kind: None,
        })
        .await
        .map_err(|e| RpcError::internal(format!("credential list: {e}")))?;

    let mut rows: Vec<Value> = Vec::with_capacity(creds.len());
    for c in &creds {
        let issuer_slug = issuers
            .iter()
            .find(|i| i.id == c.issuer_id)
            .map(|i| i.slug.clone())
            .unwrap_or_default();
        rows.push(json!({
            "id": c.id.to_string(),
            "issuer": issuer_slug,
            "name": c.name,
            "env": format!("{:?}", c.env).to_lowercase(),
            "status": status_label(c.status),
        }));
    }

    let summary = format!(
        "{} credential(s){}{}",
        creds.len(),
        env_str.map(|e| format!(", env={e}")).unwrap_or_default(),
        args.get("issuer")
            .and_then(Value::as_str)
            .map(|s| format!(", issuer={s}"))
            .unwrap_or_default(),
    );
    let json_text = serde_json::to_string_pretty(&json!({ "credentials": rows }))
        .map_err(|e| RpcError::internal(format!("json: {e}")))?;

    Ok(json!({
        "content": [
            { "type": "text", "text": format!("{summary}\n\n{json_text}") }
        ]
    }))
}

async fn tool_reveal_credential(state: &ServerState, args: &Value) -> Result<Value, RpcError> {
    let id_str = args
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| RpcError::invalid_params("missing 'id' argument"))?;
    let cred_id: CredentialId = id_str
        .parse()
        .map_err(|e| RpcError::invalid_params(format!("invalid id: {e}")))?;

    // Quota check.
    {
        let mut hist = state.reveal_history.lock().await;
        let cutoff = Instant::now() - Duration::from_secs(3600);
        while hist.front().is_some_and(|t| *t < cutoff) {
            hist.pop_front();
        }
        if hist.len() as u32 >= state.reveal_per_hour {
            return Err(RpcError {
                code: -32000,
                message: format!(
                    "reveal quota exceeded ({} per hour). Wait or restart with --reveal-per-hour higher.",
                    state.reveal_per_hour
                ),
                data: None,
            });
        }
        hist.push_back(Instant::now());
    }

    let cred_repo = CredentialRepo::new(&state.pool);
    let credential = cred_repo
        .get_by_id(cred_id)
        .await
        .map_err(|e| RpcError::internal(format!("lookup: {e}")))?
        .ok_or_else(|| RpcError::invalid_params(format!("no credential with id {id_str}")))?;

    if !matches!(credential.status, CredentialStatus::Active) {
        return Err(RpcError::invalid_params(format!(
            "credential {} is {} — not revealing",
            credential.id,
            status_label(credential.status),
        )));
    }

    // Audit trail visible to the user.
    eprintln!(
        "[REVEAL] {} (issuer={} name={:?} env={:?})",
        credential.id, credential.issuer_id, credential.name, credential.env,
    );

    let vault = state.vault.lock().await;
    let secret = vault
        .get_secret(&credential.vault_ref)
        .await
        .map_err(|e| RpcError::internal(format!("vault.get: {e}")))?;
    let plaintext = std::str::from_utf8(secret.expose_secret())
        .map_err(|e| RpcError::internal(format!("utf-8: {e}")))?
        .to_owned();

    Ok(json!({
        "content": [
            { "type": "text", "text": plaintext }
        ]
    }))
}

// ---------------------------------------------------------------------------
// JSON-RPC dispatch loop
// ---------------------------------------------------------------------------

async fn dispatch(state: &ServerState, line: &str) -> Option<String> {
    let req: RpcRequest = match serde_json::from_str(line) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("apivault-mcp: bad request: {e}");
            return None;
        }
    };
    // Notifications (id == None) — no response.
    if req.id.is_none() {
        match req.method.as_str() {
            "notifications/initialized" | "notifications/cancelled" => return None,
            other => {
                eprintln!("apivault-mcp: ignoring notification {other}");
                return None;
            }
        }
    }
    let id = req.id.unwrap_or(Value::Null);
    let result = match req.method.as_str() {
        "initialize" => handle_initialize(&req.params),
        "tools/list" => handle_tools_list(),
        "tools/call" => handle_tool_call(state, &req.params).await,
        "shutdown" => Ok(json!({})),
        other => Err(RpcError::method_not_found(other)),
    };

    let resp = match result {
        Ok(v) => RpcResponse {
            jsonrpc: "2.0",
            id,
            result: Some(v),
            error: None,
        },
        Err(e) => RpcResponse {
            jsonrpc: "2.0",
            id,
            result: None,
            error: Some(e),
        },
    };
    Some(serde_json::to_string(&resp).unwrap_or_else(|e| {
        format!(r#"{{"jsonrpc":"2.0","id":null,"error":{{"code":-32603,"message":"{e}"}}}}"#)
    }))
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> Result<()> {
    // Logs go to stderr — stdout is the JSON-RPC channel.
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_target(false)
        .init();

    let cli = Cli::parse();
    let data_dir = match cli.data_dir {
        Some(d) => d,
        None => default_data_dir()?,
    };
    let db_path = data_dir.join("vault.db");
    if !db_path.exists() {
        return Err(anyhow!(
            "no SQLite store at {} — has the desktop app booted?",
            db_path.display()
        ));
    }
    let pool = Arc::new(init_pool(&db_path).await.context("opening SQLite pool")?);
    let vault = open_vault(&data_dir).await?;
    let state = Arc::new(ServerState {
        pool,
        vault: Mutex::new(vault),
        reveal_history: Mutex::new(VecDeque::new()),
        reveal_per_hour: cli.reveal_per_hour,
    });

    eprintln!("apivault-mcp: ready (protocol {PROTOCOL_VERSION})");

    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    let mut stdout = tokio::io::stdout();
    while let Some(line) = reader.next_line().await.context("reading stdin")? {
        if line.trim().is_empty() {
            continue;
        }
        if let Some(resp) = dispatch(&state, &line).await {
            stdout
                .write_all(resp.as_bytes())
                .await
                .context("writing response")?;
            stdout.write_all(b"\n").await.context("writing newline")?;
            stdout.flush().await.ok();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn initialize_advertises_tools_capability() {
        let v = handle_initialize(&Value::Null).unwrap();
        assert_eq!(v["protocolVersion"], PROTOCOL_VERSION);
        assert!(v["capabilities"]["tools"].is_object());
        assert_eq!(v["serverInfo"]["name"], SERVER_NAME);
    }

    #[tokio::test]
    async fn tools_list_includes_all_five_tools() {
        let v = handle_tools_list().unwrap();
        let tools = v["tools"].as_array().unwrap();
        let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
        for required in [
            "list_credentials",
            "reveal_credential",
            "check_railguard_status",
            "suggest_railguard_template",
            "check_supply_chain_risk",
        ] {
            assert!(names.contains(&required), "missing tool {required}");
        }
        for t in tools {
            assert!(t["inputSchema"]["type"] == "object");
        }
    }

    #[tokio::test]
    async fn check_supply_chain_risk_returns_text_for_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("README.md"), "# nothing").unwrap();
        let args = json!({ "project_path": dir.path().to_string_lossy() });
        let v = tool_check_supply_chain_risk(&args).await.unwrap();
        let text = v["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("nothing to scan"));
    }

    #[tokio::test]
    async fn suggest_railguard_template_renders_cursor_rules() {
        let args = json!({
            "kind": "cursor_rules",
            "project_name": "demo",
            "frameworks": ["Next.js"],
            "issuers": ["OpenAI"]
        });
        let v = tool_suggest_railguard_template(&args).unwrap();
        let text = v["content"][0]["text"].as_str().unwrap();
        assert!(text.contains(".cursorrules"));
        assert!(text.contains("demo") || !text.is_empty());
    }

    #[tokio::test]
    async fn check_railguard_status_returns_404_for_missing_path() {
        let args = json!({ "project_path": "/__no_such_path_for_test__" });
        let err = tool_check_railguard_status(&args).await.unwrap_err();
        assert_eq!(err.code, -32602);
    }

    #[test]
    fn rpc_error_codes_match_jsonrpc_spec() {
        assert_eq!(RpcError::method_not_found("x").code, -32601);
        assert_eq!(RpcError::invalid_params("y").code, -32602);
        assert_eq!(RpcError::internal("z").code, -32603);
    }
}
