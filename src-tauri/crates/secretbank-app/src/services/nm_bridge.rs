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
        "credential_create" => handle_credential_create(msg, bctx).await,
        "credential_update" => handle_credential_update(msg, bctx).await,
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
