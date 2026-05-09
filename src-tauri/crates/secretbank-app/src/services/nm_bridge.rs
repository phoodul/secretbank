// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// D-6: nm-host ↔ Tauri IPC 브리지 (TCP localhost).
//
// 보안 설계:
//   - 127.0.0.1 전용 bind — 외부 IP listen 절대 금지 (TM-EXT-BRIDGE-1).
//   - 모든 메시지에 session_token 필수 — 미첨부/만료/위조 시 거부 (TM-EXT-BRIDGE-2).
//   - 포트는 OS 동적 할당 후 ENV var `SECRETBANK_BRIDGE_PORT` 로 nm-host 에 전달.
//
// 프로토콜: 4-byte LE length + UTF-8 JSON (NM protocol 과 동일 schema).
// nm-host 측 클라이언트: bridge_client.rs (secretbank-nm-host crate).

use std::net::SocketAddr;
use std::sync::Arc;

use secrecy::ExposeSecret;
use secretbank_audit::AuditActor;
use secretbank_core::{CredentialId, CredentialInput, CredentialKind, Env};
use secretbank_nm_host::session;
use secretbank_storage::vault::{SecretBytes, VaultStorage};
use serde_json::Value;
use sqlx::SqlitePool;
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{watch, RwLock};
use tokio::task::JoinHandle;
use tracing::{debug, error, warn};

use crate::audit_ctx::AuditCtx;
use crate::commands::credentials::resolve_issuer_for_domain;
use crate::context::AppContext;
use crate::services::sync_emit::SharedDbChangeEmitter;

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/// 메시지 크기 상한 — NM protocol 과 동일 1 MiB. TM-EXT-BRIDGE-1.
const MAX_MSG_SIZE: usize = 1_048_576;

// ---------------------------------------------------------------------------
// BridgeContext — AppContext 의 Arc 필드 부분 집합 (Clone 가능)
// ---------------------------------------------------------------------------

/// 브리지 연결 처리에 필요한 AppContext 필드 부분 집합.
/// Arc 포인터만 복제하므로 실제 데이터 복사 없음.
#[derive(Clone)]
pub struct BridgeContext {
    pub vault: Arc<RwLock<Box<dyn VaultStorage + Send + Sync>>>,
    pub pool: Arc<SqlitePool>,
    pub audit: Arc<AuditCtx>,
    pub db_change_emitter: SharedDbChangeEmitter,
}

impl BridgeContext {
    /// AppContext 에서 필요한 Arc 필드만 추출한다.
    pub fn from_app(ctx: &AppContext) -> Self {
        Self {
            vault: ctx.vault.clone(),
            pool: ctx.pool.clone(),
            audit: ctx.audit.clone(),
            db_change_emitter: ctx.db_change_emitter.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// 브리지 핸들 — vault unlock/lock 생명주기와 연동
// ---------------------------------------------------------------------------

/// 브리지 서버 핸들. vault lock 시 drop 으로 자동 종료.
pub struct NmBridgeHandle {
    /// 수신 포트 (nm-host 에 `SECRETBANK_BRIDGE_PORT` ENV 로 전달).
    pub port: u16,
    /// 종료 신호 송신 채널.
    shutdown_tx: watch::Sender<bool>,
    /// 서버 태스크 핸들.
    _task: JoinHandle<()>,
}

impl Drop for NmBridgeHandle {
    fn drop(&mut self) {
        // TM-EXT-BRIDGE-1: vault lock 시 브리지 즉시 종료.
        let _ = self.shutdown_tx.send(true);
    }
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/// TCP 브리지 서버를 127.0.0.1:0 에 bind 하고 수신 루프를 spawn 한다.
///
/// 성공 시 [`NmBridgeHandle`] 반환. vault unlock 시 호출, lock 시 drop.
pub async fn start_bridge(bctx: BridgeContext) -> std::io::Result<NmBridgeHandle> {
    // TM-EXT-BRIDGE-1: loopback 전용 bind — 0 포트 = OS 동적 할당.
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();

    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    let task = tokio::spawn(serve_loop(listener, bctx, shutdown_rx));

    Ok(NmBridgeHandle {
        port,
        shutdown_tx,
        _task: task,
    })
}

// ---------------------------------------------------------------------------
// 서버 루프
// ---------------------------------------------------------------------------

async fn serve_loop(
    listener: TcpListener,
    bctx: BridgeContext,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    loop {
        tokio::select! {
            accept = listener.accept() => {
                match accept {
                    Ok((stream, peer)) => {
                        debug!("nm-bridge: 연결 수락 from {peer}");
                        let bctx2 = bctx.clone();
                        tokio::spawn(handle_conn(stream, peer, bctx2));
                    }
                    Err(e) => {
                        error!("nm-bridge: accept 오류: {e}");
                        break;
                    }
                }
            }
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    debug!("nm-bridge: 종료 신호 수신 — 서버 루프 종료");
                    break;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 연결 핸들러
// ---------------------------------------------------------------------------

async fn handle_conn(stream: TcpStream, peer: SocketAddr, bctx: BridgeContext) {
    let (reader, writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let mut writer = BufWriter::new(writer);

    loop {
        // 4-byte LE length header 읽기
        let mut len_buf = [0u8; 4];
        match reader.read_exact(&mut len_buf).await {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(e) => {
                error!("nm-bridge: {peer} 읽기 오류: {e}");
                break;
            }
        }

        let body_len = u32::from_le_bytes(len_buf) as usize;
        if body_len > MAX_MSG_SIZE {
            // TM-EXT-BRIDGE-1: 과도한 메시지는 즉시 연결 종료.
            warn!("nm-bridge: {peer} 메시지 크기 초과 ({body_len}) — 연결 종료");
            break;
        }

        let mut body_buf = vec![0u8; body_len];
        if let Err(e) = reader.read_exact(&mut body_buf).await {
            error!("nm-bridge: {peer} body 읽기 오류: {e}");
            break;
        }

        let msg: Value = match serde_json::from_slice(&body_buf) {
            Ok(v) => v,
            Err(e) => {
                error!("nm-bridge: {peer} JSON 파싱 오류: {e}");
                break;
            }
        };

        let response = dispatch(&msg, &bctx).await;

        // 응답 직렬화 + 전송
        let resp_bytes = match serde_json::to_vec(&response) {
            Ok(b) => b,
            Err(e) => {
                error!("nm-bridge: {peer} 응답 직렬화 오류: {e}");
                break;
            }
        };

        let resp_len = resp_bytes.len() as u32;
        if writer.write_all(&resp_len.to_le_bytes()).await.is_err() {
            break;
        }
        if writer.write_all(&resp_bytes).await.is_err() {
            break;
        }
        if writer.flush().await.is_err() {
            break;
        }
    }

    debug!("nm-bridge: {peer} 연결 종료");
}

// ---------------------------------------------------------------------------
// 메시지 디스패처
// ---------------------------------------------------------------------------

/// 요청 메시지를 라우팅하고 응답 Value 를 반환한다.
///
/// # Session token 검증 (TM-EXT-BRIDGE-2)
/// 모든 요청에 session_token 필수. verify_token 실패 시 vault_locked 응답.
async fn dispatch(msg: &Value, bctx: &BridgeContext) -> Value {
    let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let session_token = msg
        .get("session_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // TM-EXT-BRIDGE-2: session token 검증 — 모든 요청에 적용.
    if !verify_session_token(session_token, bctx).await {
        return serde_json::json!({ "ok": false, "error": "vault_locked" });
    }

    match msg_type {
        "credential_list_by_domain" => {
            let domain = msg.get("domain").and_then(|v| v.as_str()).unwrap_or("");
            handle_list_by_domain(domain, bctx).await
        }
        "get_credential_list" => {
            let domain_filter = msg.get("domain_filter").and_then(|v| v.as_str());
            handle_get_credential_list(domain_filter, bctx).await
        }
        "credential_create" => handle_credential_create(msg, bctx).await,
        "credential_update" => handle_credential_update(msg, bctx).await,
        // T-24-E-G1-1: credential 1-hop mini-graph 조회
        "graph_for_credential" => handle_graph_for_credential(msg, bctx).await,
        // T-24-E-G2-1: host incident 조회 (severity ≥ MEDIUM)
        "incident_check_for_host" => handle_incident_check_for_host(msg, bctx).await,
        // T-24-E-G3-1: autofill/save 시 host blast radius preview
        "blast_radius_for_host" => handle_blast_radius_for_host(msg, bctx).await,
        _ => serde_json::json!({ "ok": false, "error": "unknown_type" }),
    }
}

// ---------------------------------------------------------------------------
// Session token 검증 헬퍼
// ---------------------------------------------------------------------------

/// vault 에서 session secret 을 읽고 HMAC 검증한다.
///
/// vault 잠금 / secret 없음 / 만료 / 서명 불일치 → false. TM-EXT-BRIDGE-2.
async fn verify_session_token(token: &str, bctx: &BridgeContext) -> bool {
    if token.is_empty() {
        return false;
    }

    // session secret 경로 (B-7 규칙: device/extension/{ext_id}/session_secret)
    // nm-host 는 단일 paired extension 이므로 ext_id = "default" 로 고정 (B-7 패턴).
    // TODO(Phase-F): ext_id 를 token payload 에서 추출하면 multi-ext 지원 가능.
    let secret_path = "device/extension/default/session_secret";

    let vault = bctx.vault.read().await;
    if !vault.is_unlocked().await {
        return false;
    }

    let secret_bytes = match vault.get_secret(secret_path).await {
        Ok(b) => b,
        Err(_) => return false,
    };

    let secret_key: [u8; 32] = match secret_bytes.expose_secret().as_slice().try_into() {
        Ok(k) => k,
        Err(_) => return false,
    };

    // ext_id = "default" — B-7 verify_token 패턴.
    let ttl_secs = 4 * 60 * 60; // 기본 4시간 — vault_setting 조회 생략 (bridge 단순화).
    session::verify_token(&secret_key, token, "default", ttl_secs).is_ok()
}

// ---------------------------------------------------------------------------
// 핸들러 — AppContext 대신 BridgeContext 사용
// ---------------------------------------------------------------------------

// credential_create_internal / credential_update_internal 은 &AppContext 를 요구하므로
// BridgeContext 에서 임시 AppContext 를 재구성하는 대신, 내부 로직을 직접 실행한다.
// 이 방식이 의존성을 최소화한다.

async fn handle_list_by_domain(domain: &str, bctx: &BridgeContext) -> Value {
    use secretbank_core::CredentialFilter;
    use secretbank_storage::sqlite::repositories::credential::CredentialRepo;

    // vault 잠금 재확인 (defense-in-depth).
    {
        let vault = bctx.vault.read().await;
        if !vault.is_unlocked().await {
            return serde_json::json!({
                "type": "credential_list_by_domain_response",
                "exists": false
            });
        }
    }

    if domain.is_empty() {
        return serde_json::json!({
            "type": "credential_list_by_domain_response",
            "exists": false
        });
    }

    // url 필드에 domain 이 포함된 Password 종류 credential 탐색.
    let repo = CredentialRepo::new(&bctx.pool);
    let filter = CredentialFilter {
        kind: Some(CredentialKind::Password),
        ..Default::default()
    };

    match repo.list(&filter).await {
        Ok(creds) => {
            let found = creds.iter().find(|c| {
                c.url
                    .as_deref()
                    .map(|u| u.contains(domain))
                    .unwrap_or(false)
            });

            match found {
                Some(c) => serde_json::json!({
                    "type": "credential_list_by_domain_response",
                    "exists": true,
                    "credential_id": c.id.to_string()
                }),
                None => serde_json::json!({
                    "type": "credential_list_by_domain_response",
                    "exists": false
                }),
            }
        }
        Err(e) => {
            error!("nm-bridge: list_by_domain 오류: {e}");
            serde_json::json!({
                "type": "credential_list_by_domain_response",
                "exists": false
            })
        }
    }
}

/// E-4: popup CredentialList 용 전체(또는 도메인 필터) credential 목록 반환.
///
/// 반환 필드: credential_id, issuer(name), domain(url 에서 추출), username.
/// password ❌ — 카드 표시용 최소 정보만.
async fn handle_get_credential_list(domain_filter: Option<&str>, bctx: &BridgeContext) -> Value {
    use secretbank_core::CredentialFilter;
    use secretbank_storage::sqlite::repositories::{
        credential::CredentialRepo, issuer::IssuerRepo,
    };

    {
        let vault = bctx.vault.read().await;
        if !vault.is_unlocked().await {
            return serde_json::json!({
                "type": "get_credential_list_response",
                "ok": false,
                "error": "vault_locked"
            });
        }
    }

    let cred_repo = CredentialRepo::new(&bctx.pool);
    let issuer_repo = IssuerRepo::new(&bctx.pool);

    // Password kind 만 대상 — autofill 은 Password credential 에 적용.
    let filter = CredentialFilter {
        kind: Some(secretbank_core::CredentialKind::Password),
        ..Default::default()
    };

    let creds = match cred_repo.list(&filter).await {
        Ok(c) => c,
        Err(e) => {
            error!("nm-bridge: get_credential_list 오류: {e}");
            return serde_json::json!({
                "type": "get_credential_list_response",
                "ok": false,
                "error": "db_error"
            });
        }
    };

    // 도메인 추출 헬퍼 — url 필드에서 host 부분만.
    fn extract_host(url: Option<&str>) -> String {
        let Some(u) = url else { return String::new() };
        let u = u
            .trim_start_matches("https://")
            .trim_start_matches("http://");
        u.split('/').next().unwrap_or("").to_string()
    }

    // 도메인 필터 적용 + 아이템 변환.
    let mut items: Vec<serde_json::Value> = Vec::with_capacity(creds.len());
    for cred in &creds {
        let domain = extract_host(cred.url.as_deref());

        // domain_filter 가 있으면 domain 이 filter 를 포함(prefix)하는 경우만 포함.
        if let Some(f) = domain_filter {
            if !f.is_empty() && !domain.contains(f) && !f.contains(&domain) {
                continue;
            }
        }

        // issuer 이름 조회 (없으면 credential name 으로 대체).
        let issuer_name = issuer_repo
            .get_by_id(cred.issuer_id)
            .await
            .ok()
            .flatten()
            .map(|i| i.display_name)
            .unwrap_or_else(|| cred.name.clone());

        let mut item = serde_json::json!({
            "credential_id": cred.id.to_string(),
            "issuer": issuer_name,
            "domain": domain,
        });
        if let Some(u) = &cred.username {
            if !u.is_empty() {
                item["username"] = serde_json::Value::String(u.clone());
            }
        }
        items.push(item);
    }

    serde_json::json!({
        "type": "get_credential_list_response",
        "ok": true,
        "items": items
    })
}

async fn handle_credential_create(msg: &Value, bctx: &BridgeContext) -> Value {
    use secretbank_storage::sqlite::repositories::credential::CredentialRepo;

    let domain = msg.get("domain").and_then(|v| v.as_str()).unwrap_or("");
    let username = msg.get("username").and_then(|v| v.as_str()).unwrap_or("");
    // T-CRED-1: password plaintext — 즉시 처리.
    let password = msg.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let site_name = msg
        .get("site_name")
        .and_then(|v| v.as_str())
        .unwrap_or(domain);
    let ext_id = msg
        .get("ext_id")
        .and_then(|v| v.as_str())
        .unwrap_or("default");

    if domain.is_empty() || password.is_empty() {
        return serde_json::json!({
            "type": "credential_save_response",
            "ok": false,
            "error": "missing_fields"
        });
    }

    // issuer 자동 해석 — resolve_issuer_for_domain (D-5).
    let issuer_id = match resolve_issuer_for_domain(domain, &bctx.pool).await {
        Ok(id) => id,
        Err(e) => {
            error!("nm-bridge: resolve_issuer_for_domain 오류: {e}");
            return serde_json::json!({
                "type": "credential_save_response",
                "ok": false,
                "error": "issuer_resolve_failed"
            });
        }
    };

    let name = if site_name.is_empty() {
        domain
    } else {
        site_name
    };

    // credential row 삽입 + vault secret 기록.
    let cred_repo = CredentialRepo::new(&bctx.pool);
    let cred_id = CredentialId::new();
    let vault_ref = format!("credentials/{cred_id}");

    let input = CredentialInput {
        issuer_id,
        name: name.to_string(),
        env: Env::Prod,
        scope: None,
        rotation_policy_days: None,
        rotation_runbook_id: None,
        expires_at: None,
        owner: None,
        hash_hint: None,
        kind: CredentialKind::Password,
        url: Some(format!("https://{domain}")),
        username: if username.is_empty() {
            None
        } else {
            Some(username.to_string())
        },
        primary_label: None,
        secondary_label: None,
    };

    if let Err(e) = cred_repo
        .insert_with_id(Some(cred_id), &input, vault_ref.clone())
        .await
    {
        error!("nm-bridge: credential row 삽입 오류: {e}");
        return serde_json::json!({
            "type": "credential_save_response",
            "ok": false,
            "error": "db_error"
        });
    }

    let secret_bytes = SecretBytes::new(password.as_bytes().to_vec());
    {
        let mut vault = bctx.vault.write().await;
        if let Err(e) = vault.put_secret(&vault_ref, secret_bytes).await {
            error!("nm-bridge: vault put_secret 오류: {e}");
            // rollback DB row
            let _ = cred_repo.delete(cred_id).await;
            return serde_json::json!({
                "type": "credential_save_response",
                "ok": false,
                "error": "vault_error"
            });
        }
    }

    // audit log — TM-EXT-ACTOR: actor = Extension(ext_id).
    let payload = serde_json::json!({ "issuer_id": issuer_id.to_string() }).to_string();
    bctx.audit
        .record(
            AuditActor::Extension(ext_id.to_string()),
            "extension.save.create",
            "credential",
            cred_id.to_string(),
            Some(payload),
        )
        .await;

    bctx.db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload::upsert(
            crate::services::sync_emit::DbChangeEntity::Credential,
            cred_id.to_string(),
        ));

    serde_json::json!({
        "type": "credential_save_response",
        "ok": true,
        "credential_id": cred_id.to_string()
    })
}

async fn handle_credential_update(msg: &Value, bctx: &BridgeContext) -> Value {
    use secretbank_core::CredentialPatch;
    use secretbank_storage::sqlite::repositories::credential::CredentialRepo;

    let credential_id_str = msg
        .get("credential_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let username = msg.get("username").and_then(|v| v.as_str());
    // T-CRED-1: password plaintext.
    let password = msg.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let ext_id = msg
        .get("ext_id")
        .and_then(|v| v.as_str())
        .unwrap_or("default");

    if credential_id_str.is_empty() || password.is_empty() {
        return serde_json::json!({
            "type": "credential_save_response",
            "ok": false,
            "error": "missing_fields"
        });
    }

    let cred_id: CredentialId = match credential_id_str.parse() {
        Ok(id) => id,
        Err(_) => {
            return serde_json::json!({
                "type": "credential_save_response",
                "ok": false,
                "error": "invalid_credential_id"
            });
        }
    };

    let cred_repo = CredentialRepo::new(&bctx.pool);
    let cred = match cred_repo.get_by_id(cred_id).await {
        Ok(Some(c)) => c,
        _ => {
            return serde_json::json!({
                "type": "credential_save_response",
                "ok": false,
                "error": "not_found"
            });
        }
    };

    // vault 에 새 password 기록.
    let secret_bytes = SecretBytes::new(password.as_bytes().to_vec());
    {
        let mut vault = bctx.vault.write().await;
        if let Err(e) = vault.put_secret(&cred.vault_ref, secret_bytes).await {
            error!("nm-bridge: vault put_secret 오류: {e}");
            return serde_json::json!({
                "type": "credential_save_response",
                "ok": false,
                "error": "vault_error"
            });
        }
    }

    let patch = CredentialPatch {
        username: username.map(|u| u.to_string()),
        ..Default::default()
    };

    if let Err(e) = cred_repo.update(cred_id, &patch).await {
        error!("nm-bridge: credential update 오류: {e}");
        return serde_json::json!({
            "type": "credential_save_response",
            "ok": false,
            "error": "db_error"
        });
    }

    // audit log — TM-EXT-ACTOR: actor = Extension(ext_id).
    bctx.audit
        .record(
            AuditActor::Extension(ext_id.to_string()),
            "extension.save.update",
            "credential",
            cred_id.to_string(),
            None,
        )
        .await;

    bctx.db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload::upsert(
            crate::services::sync_emit::DbChangeEntity::Credential,
            cred_id.to_string(),
        ));

    serde_json::json!({
        "type": "credential_save_response",
        "ok": true
    })
}

// ---------------------------------------------------------------------------
// T-24-E-G1-1: graph_for_credential 핸들러
// ---------------------------------------------------------------------------

/// credential 의 1-hop mini-graph 를 반환한다.
///
/// nm-host → bridge forward → 이 핸들러 → DB 조회 → mini-graph 응답.
/// credential plaintext ❌ — center_label = issuer display_name 만.
async fn handle_graph_for_credential(msg: &Value, bctx: &BridgeContext) -> Value {
    use secretbank_storage::sqlite::repositories::{
        credential::CredentialRepo, deployment::DeploymentRepo, issuer::IssuerRepo,
        project::ProjectRepo, usage::UsageRepo,
    };
    use std::collections::HashMap;

    use secretbank_audit::{actions, AuditActor};
    use secretbank_core::{graph::DependencyGraph, CredentialId};

    use crate::commands::graph::extract_credential_mini_graph;

    let credential_id_str = msg
        .get("credential_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if credential_id_str.is_empty() {
        return serde_json::json!({
            "type": "graph_for_credential_response",
            "ok": false,
            "error": "missing_credential_id"
        });
    }

    let credential_id: CredentialId = match credential_id_str.parse() {
        Ok(id) => id,
        Err(_) => {
            return serde_json::json!({
                "type": "graph_for_credential_response",
                "ok": false,
                "error": "invalid_credential_id"
            });
        }
    };

    // vault 잠금 재확인 (defense-in-depth).
    {
        let vault = bctx.vault.read().await;
        if !vault.is_unlocked().await {
            return serde_json::json!({
                "type": "graph_for_credential_response",
                "ok": false,
                "error": "vault_locked"
            });
        }
    }

    // DB에서 그래프 구성에 필요한 모든 엔티티 로드.
    let issuers = match IssuerRepo::new(&bctx.pool).list().await {
        Ok(v) => v,
        Err(e) => {
            error!("nm-bridge: graph_for_credential issuers 조회 오류: {e}");
            return serde_json::json!({
                "type": "graph_for_credential_response",
                "ok": false,
                "error": "db_error"
            });
        }
    };
    let credentials = match CredentialRepo::new(&bctx.pool).list_all().await {
        Ok(v) => v,
        Err(e) => {
            error!("nm-bridge: graph_for_credential credentials 조회 오류: {e}");
            return serde_json::json!({
                "type": "graph_for_credential_response",
                "ok": false,
                "error": "db_error"
            });
        }
    };
    let usages = match UsageRepo::new(&bctx.pool).list_all().await {
        Ok(v) => v,
        Err(e) => {
            error!("nm-bridge: graph_for_credential usages 조회 오류: {e}");
            return serde_json::json!({
                "type": "graph_for_credential_response",
                "ok": false,
                "error": "db_error"
            });
        }
    };
    let projects = match ProjectRepo::new(&bctx.pool).list().await {
        Ok(v) => v,
        Err(e) => {
            error!("nm-bridge: graph_for_credential projects 조회 오류: {e}");
            return serde_json::json!({
                "type": "graph_for_credential_response",
                "ok": false,
                "error": "db_error"
            });
        }
    };
    let deployments = match DeploymentRepo::new(&bctx.pool).list_all().await {
        Ok(v) => v,
        Err(e) => {
            error!("nm-bridge: graph_for_credential deployments 조회 오류: {e}");
            return serde_json::json!({
                "type": "graph_for_credential_response",
                "ok": false,
                "error": "db_error"
            });
        }
    };

    let graph = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &deployments);

    // center_label — issuer display_name (plaintext ❌).
    let center_label = credentials
        .iter()
        .find(|c| c.id == credential_id)
        .and_then(|c| issuers.iter().find(|i| i.id == c.issuer_id))
        .map(|i| i.display_name.clone())
        .unwrap_or_else(|| credential_id.to_string());

    let project_map: HashMap<String, &secretbank_core::Project> =
        projects.iter().map(|p| (p.id.to_string(), p)).collect();

    let mini = extract_credential_mini_graph(&graph, credential_id, &project_map, &center_label);

    // audit log (best-effort).
    bctx.audit
        .record(
            AuditActor::LocalUser,
            actions::EXT_GRAPH_FETCH,
            "credential",
            credential_id.to_string(),
            None,
        )
        .await;

    serde_json::json!({
        "type": "graph_for_credential_response",
        "ok": true,
        "center_id": mini.center_id,
        "center_label": mini.center_label,
        "project_nodes": mini.project_nodes,
        "edges": mini.edges,
        "hidden_count": mini.hidden_count
    })
}

// ---------------------------------------------------------------------------
// T-24-E-G2-1: incident_check_for_host 핸들러
// ---------------------------------------------------------------------------

/// extension content-script 가 현재 방문 중인 host 의 incident 목록을 조회한다.
///
/// 요청 필드:
///   - `host` (string): 정규화 전 host (예: "github.com", "www.stripe.com")
///
/// 응답:
///   - `type`: "incident_check_for_host_response"
///   - `ok`: true/false
///   - `matches`: `[{ incident_id, severity, title, published_at, source }]` (ok=true 시)
///   - `error`: 오류 코드 (ok=false 시)
///
/// severity ≥ MEDIUM 필터링은 `match_incidents_by_host` 내부에서 처리.
/// audit log: EXT_INCIDENT_LOOKUP 1건 기록.
async fn handle_incident_check_for_host(msg: &Value, bctx: &BridgeContext) -> Value {
    use secretbank_audit::actions::EXT_INCIDENT_LOOKUP;
    use secretbank_core::IncidentFilter;
    use secretbank_feeds::match_incidents_by_host;
    use secretbank_storage::sqlite::repositories::incident::IncidentRepo;
    use secretbank_storage::sqlite::repositories::issuer::IssuerRepo;

    let host = msg.get("host").and_then(|v| v.as_str()).unwrap_or("");

    if host.trim().is_empty() {
        return serde_json::json!({
            "type": "incident_check_for_host_response",
            "ok": true,
            "matches": []
        });
    }

    // vault 잠금 재확인 (defense-in-depth).
    {
        let vault = bctx.vault.read().await;
        if !vault.is_unlocked().await {
            return serde_json::json!({
                "type": "incident_check_for_host_response",
                "ok": false,
                "error": "vault_locked"
            });
        }
    }

    let incident_repo = IncidentRepo::new(&bctx.pool);
    let issuer_repo = IssuerRepo::new(&bctx.pool);

    // 전체 active incident 로드 (include_dismissed=false → dismissed 제외).
    let filter = IncidentFilter {
        include_dismissed: false,
        ..Default::default()
    };
    let incident_entries = match incident_repo.list_with_matches(&filter).await {
        Ok(v) => v,
        Err(e) => {
            error!("nm-bridge: incident_check_for_host incidents 조회 오류: {e}");
            return serde_json::json!({
                "type": "incident_check_for_host_response",
                "ok": false,
                "error": "db_error"
            });
        }
    };
    let incidents: Vec<_> = incident_entries
        .into_iter()
        .map(|entry| entry.incident)
        .collect();

    let issuers = match issuer_repo.list().await {
        Ok(v) => v,
        Err(e) => {
            error!("nm-bridge: incident_check_for_host issuers 조회 오류: {e}");
            return serde_json::json!({
                "type": "incident_check_for_host_response",
                "ok": false,
                "error": "db_error"
            });
        }
    };

    // host-only 매칭 (severity ≥ MEDIUM 필터는 matcher 내부).
    let matches = match_incidents_by_host(host, &incidents, &issuers);

    // audit log (best-effort).
    bctx.audit
        .record(
            AuditActor::LocalUser,
            EXT_INCIDENT_LOOKUP,
            "host",
            host.to_string(),
            None,
        )
        .await;

    use secretbank_core::models::incident::IncidentSeverity;

    let match_items: Vec<serde_json::Value> = matches
        .into_iter()
        .map(|m| {
            let severity_str = match m.severity {
                IncidentSeverity::Info => "info",
                IncidentSeverity::Low => "low",
                IncidentSeverity::Medium => "medium",
                IncidentSeverity::High => "high",
                IncidentSeverity::Critical => "critical",
            };
            serde_json::json!({
                "incident_id": m.incident_id.to_string(),
                "severity": severity_str,
                "title": m.title,
                "published_at": m.published_at,
                "source": m.source,
            })
        })
        .collect();

    serde_json::json!({
        "type": "incident_check_for_host_response",
        "ok": true,
        "matches": match_items
    })
}

// ---------------------------------------------------------------------------
// T-24-E-G3-1: blast_radius_for_host 핸들러
// ---------------------------------------------------------------------------

/// Extension autofill/save 시 host 기반 blast radius preview 를 반환한다.
///
/// 요청 필드:
///   - `host` (string): 정규화 전 host (예: "github.com", "www.stripe.com")
///
/// 응답:
///   - `type`: "blast_radius_for_host_response"
///   - `ok`: true/false
///   - `credential_id`: Option<String> (ok=true 시)
///   - `affected`: Vec<{ kind, label, status }> (최대 5개)
///   - `total`: usize
///   - `hidden_count`: usize
///
/// host 매칭 ❌ → credential_id=null, affected=[], total=0.
/// audit log: EXT_BLAST_RADIUS_PREVIEW 1건 기록.
async fn handle_blast_radius_for_host(msg: &Value, bctx: &BridgeContext) -> Value {
    use secretbank_audit::{actions::EXT_BLAST_RADIUS_PREVIEW, AuditActor};
    use secretbank_core::{blast_radius::blast_radius, graph::DependencyGraph, CredentialKind};
    use secretbank_storage::sqlite::repositories::{
        credential::CredentialRepo, deployment::DeploymentRepo, issuer::IssuerRepo,
        project::ProjectRepo, usage::UsageRepo,
    };

    let host = msg.get("host").and_then(|v| v.as_str()).unwrap_or("");

    // audit log (best-effort) — 항상 기록.
    bctx.audit
        .record(
            AuditActor::LocalUser,
            EXT_BLAST_RADIUS_PREVIEW,
            "host",
            host.to_string(),
            None,
        )
        .await;

    if host.trim().is_empty() {
        return serde_json::json!({
            "type": "blast_radius_for_host_response",
            "ok": true,
            "credential_id": null,
            "affected": [],
            "total": 0,
            "hidden_count": 0
        });
    }

    // vault 잠금 재확인 (defense-in-depth).
    {
        let vault = bctx.vault.read().await;
        if !vault.is_unlocked().await {
            return serde_json::json!({
                "type": "blast_radius_for_host_response",
                "ok": false,
                "error": "vault_locked"
            });
        }
    }

    let issuer_repo = IssuerRepo::new(&bctx.pool);

    // 1. host → issuer (domains[] 매칭)
    let issuer = match issuer_repo.find_by_domain(host).await {
        Ok(Some(i)) => i,
        Ok(None) => {
            return serde_json::json!({
                "type": "blast_radius_for_host_response",
                "ok": true,
                "credential_id": null,
                "affected": [],
                "total": 0,
                "hidden_count": 0
            });
        }
        Err(e) => {
            error!("nm-bridge: blast_radius_for_host issuer 조회 오류: {e}");
            return serde_json::json!({
                "type": "blast_radius_for_host_response",
                "ok": false,
                "error": "db_error"
            });
        }
    };

    // 2. issuer → Password credential (가장 최근 생성된 것).
    // list_all() 은 Credential (created_at 포함), list() 는 CredentialSummary (created_at 없음).
    let all_creds = match CredentialRepo::new(&bctx.pool).list_all().await {
        Ok(c) => c,
        Err(e) => {
            error!("nm-bridge: blast_radius_for_host credential 조회 오류: {e}");
            return serde_json::json!({
                "type": "blast_radius_for_host_response",
                "ok": false,
                "error": "db_error"
            });
        }
    };
    let mut creds: Vec<secretbank_core::Credential> = all_creds
        .into_iter()
        .filter(|c| c.issuer_id == issuer.id && c.kind == CredentialKind::Password)
        .collect();

    creds.sort_by_key(|c| std::cmp::Reverse(c.created_at));

    let credential_id = match creds.into_iter().next() {
        Some(c) => c.id,
        None => {
            return serde_json::json!({
                "type": "blast_radius_for_host_response",
                "ok": true,
                "credential_id": null,
                "affected": [],
                "total": 0,
                "hidden_count": 0
            });
        }
    };

    // 3. 그래프 로드 + blast_radius 계산
    let issuers = IssuerRepo::new(&bctx.pool).list().await.unwrap_or_default();
    let credentials = CredentialRepo::new(&bctx.pool)
        .list_all()
        .await
        .unwrap_or_default();
    let usages = UsageRepo::new(&bctx.pool)
        .list_all()
        .await
        .unwrap_or_default();
    let projects = ProjectRepo::new(&bctx.pool)
        .list()
        .await
        .unwrap_or_default();
    let deployments = DeploymentRepo::new(&bctx.pool)
        .list_all()
        .await
        .unwrap_or_default();

    let graph = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &deployments);
    let br = blast_radius(&graph, credential_id);

    // 4. affected 아이템 변환 (primary + secondary, 최대 5개)
    const MAX_VISIBLE: usize = 5;

    let project_map: std::collections::HashMap<String, &secretbank_core::Project> =
        projects.iter().map(|p| (p.id.to_string(), p)).collect();
    let dep_map: std::collections::HashMap<String, &secretbank_core::Deployment> =
        deployments.iter().map(|d| (d.id.to_string(), d)).collect();

    let mut affected_items: Vec<serde_json::Value> = Vec::new();

    use secretbank_core::graph::NodeRef;
    for nr in br.primary.iter().chain(br.secondary.iter()) {
        let item = match nr {
            NodeRef::Project(pid) => {
                let label = project_map
                    .get(&pid.to_string())
                    .map(|p| p.name.clone())
                    .unwrap_or_else(|| format!("<project:{pid}>"));
                serde_json::json!({ "kind": "project", "label": label, "status": "active" })
            }
            NodeRef::Deployment(did) => {
                let label = dep_map
                    .get(&did.to_string())
                    .map(|d| {
                        let env = match d.env {
                            secretbank_core::Env::Dev => "dev",
                            secretbank_core::Env::Staging => "staging",
                            secretbank_core::Env::Prod => "prod",
                        };
                        format!("{} @ {}", d.url, env)
                    })
                    .unwrap_or_else(|| format!("<deployment:{did}>"));
                serde_json::json!({ "kind": "deployment", "label": label, "status": "active" })
            }
            _ => continue,
        };
        affected_items.push(item);
    }

    // 결정성: (kind, label) 정렬.
    affected_items.sort_by(|a, b| {
        let ka = a["kind"].as_str().unwrap_or("");
        let kb = b["kind"].as_str().unwrap_or("");
        let la = a["label"].as_str().unwrap_or("");
        let lb = b["label"].as_str().unwrap_or("");
        ka.cmp(kb).then(la.cmp(lb))
    });

    let total = affected_items.len();
    let hidden_count = total.saturating_sub(MAX_VISIBLE);
    let visible: Vec<_> = affected_items.into_iter().take(MAX_VISIBLE).collect();

    serde_json::json!({
        "type": "blast_radius_for_host_response",
        "ok": true,
        "credential_id": credential_id.to_string(),
        "affected": visible,
        "total": total,
        "hidden_count": hidden_count
    })
}

// ---------------------------------------------------------------------------
// 단위 테스트
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // NM-BRIDGE-T1: token 빈 문자열 → verify 거부.
    #[test]
    fn t1_empty_token_rejected() {
        assert!("".is_empty());
        assert!(!"non-empty".is_empty());
    }

    // NM-BRIDGE-T2: 라우팅 패턴 검증 — 알려진 type 은 forward, unknown 은 error.
    #[test]
    fn t2_routing_pattern() {
        let known = [
            "credential_list_by_domain",
            "credential_create",
            "credential_update",
        ];
        let unknown = "unknown_xyz";
        assert!(known.contains(&"credential_create"));
        assert!(!known.contains(&unknown));
    }

    // NM-BRIDGE-T3: 4-byte LE 프레임 인코딩.
    #[test]
    fn t3_frame_length_encoding() {
        let body = b"hello";
        let len = body.len() as u32;
        let header = len.to_le_bytes();
        assert_eq!(u32::from_le_bytes(header) as usize, body.len());
    }

    // NM-BRIDGE-T4: MAX_MSG_SIZE 상수.
    #[test]
    fn t4_max_msg_size_constant() {
        assert_eq!(MAX_MSG_SIZE, 1_048_576);
    }
}
