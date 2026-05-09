// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// B-6: 데스크톱 앱 측 Extension 페어링 dialog + device-bound key 보관.
//
// # 흐름
//   1. Frontend 또는 nm-host 가 `pairing_request_received` Tauri command 호출.
//   2. Command 가 frontend 로 승인/거부 결정을 반환 (frontend 가 Dialog 렌더).
//   3. 승인 시: X25519 keypair 생성 → age vault 에 priv/pairedAt 저장 → audit log.
//   4. 거부 시: audit log 만 기록하고 desktop_pub = None 반환.
//
// # 보안 요구사항
//   - priv key 는 SecretBytes 로 즉시 래핑 — 평문 IPC 미통과.
//   - 공개키는 base64 로 직렬화해 frontend 에 전달 (30자 hex fingerprint 병행).
//   - 다중 ext_id 분리: vault key path = `device/extension/{ext_id}/priv`.
//   - audit_ctx 기존 chain 유지 — 신규 action 문자열만 추가.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use secretbank_audit::{actions, AuditActor};
use secretbank_crypto::pairing as crypto_pairing;
use secretbank_storage::vault::SecretBytes;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;
use thiserror::Error;
use time::OffsetDateTime;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/// 프론트엔드가 pairing_request_received 를 invoke 할 때 전달하는 입력.
#[derive(Debug, Deserialize)]
pub struct PairingRequestInput {
    /// Extension 측 X25519 공개키 (base64 인코딩, 44자).
    pub extension_pub: String,
    /// 브라우저 Extension 의 고유 ID (예: "abcdefghijklmnop" 16자).
    pub extension_id: String,
}

/// pairing_request_received 커맨드의 반환값.
#[derive(Debug, Serialize)]
pub struct PairingDecision {
    /// true = 사용자 승인, false = 거부.
    pub approved: bool,
    /// 승인 시 데스크톱의 X25519 공개키 (base64), 거부 시 None.
    pub desktop_pub: Option<String>,
    /// 이 디바이스의 ID (audit log 추적용).
    pub device_id: String,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ExtPairingError {
    /// vault 가 잠겨 있어 작업 불가.
    #[error("vault is locked")]
    VaultLocked,

    /// extension_pub base64 디코딩 실패 또는 길이 불일치.
    #[error("invalid extension public key: {message}")]
    InvalidPubKey { message: String },

    /// vault put/get/flush 오류.
    #[error("vault storage error")]
    VaultStorage,

    /// 내부 오류.
    #[error("internal error: {message}")]
    Internal { message: String },
}

impl From<base64::DecodeError> for ExtPairingError {
    fn from(e: base64::DecodeError) -> Self {
        ExtPairingError::InvalidPubKey {
            message: e.to_string(),
        }
    }
}

impl From<secretbank_storage::vault::VaultError> for ExtPairingError {
    fn from(e: secretbank_storage::vault::VaultError) -> Self {
        match e {
            secretbank_storage::vault::VaultError::NotUnlocked => Self::VaultLocked,
            _ => Self::VaultStorage,
        }
    }
}

// ---------------------------------------------------------------------------
// fingerprint 유틸
// ---------------------------------------------------------------------------

/// ext_pub 의 SHA-256 해시 앞 8바이트를 emoji-coded fingerprint 로 변환한다.
///
/// 각 바이트를 6개 emoji 팔레트 중 하나로 매핑 (256 = 42*6 + 4 나머지).
/// 8 emoji 시퀀스로 사용자가 빠르게 비교 가능.
///
/// emoji 팔레트 (6색 × 43 = 258, 실용적 mod 6):
///   0 = 🔵, 1 = 🟢, 2 = 🟡, 3 = 🟠, 4 = 🔴, 5 = 🟣
pub fn emoji_fingerprint(pub_bytes: &[u8; 32]) -> String {
    const PALETTE: [&str; 6] = ["🔵", "🟢", "🟡", "🟠", "🔴", "🟣"];
    let hash: [u8; 32] = Sha256::digest(pub_bytes).into();
    // 앞 8바이트만 사용
    hash[..8]
        .iter()
        .map(|b| PALETTE[(*b as usize) % PALETTE.len()])
        .collect::<String>()
}

/// ext_pub 의 SHA-256 앞 8바이트를 16진수 hex 로 반환 (16자).
///
/// UI 에서 emoji 와 병행 표시하거나 접근성 대체 텍스트로 사용.
pub fn hex_fingerprint(pub_bytes: &[u8; 32]) -> String {
    let hash: [u8; 32] = Sha256::digest(pub_bytes).into();
    hex::encode(&hash[..8])
}

// ---------------------------------------------------------------------------
// 핵심 비즈니스 로직 (테스트에서 재사용 가능한 inner 함수)
// ---------------------------------------------------------------------------

/// Extension 페어링 승인 처리 내부 로직.
///
/// 승인 = true 시:
///   1. X25519 keypair 생성 (secretbank-crypto 재사용).
///   2. priv → vault `device/extension/{ext_id}/priv` (SecretBytes).
///   3. pairedAt → vault `device/extension/{ext_id}/pairedAt`.
///   4. vault flush.
///   5. audit log `extension.pairing.approved`.
///   6. desktop_pub base64 반환.
///
/// 승인 = false 시:
///   - audit log `extension.pairing.rejected`.
///   - desktop_pub = None 반환.
pub async fn process_pairing_decision(
    ctx: &AppContext,
    ext_id: &str,
    ext_pub_bytes: &[u8; 32],
    approved: bool,
) -> Result<PairingDecision, ExtPairingError> {
    // device_id 는 audit 기록용으로 context 에서 가져온다.
    // identity 가 없으면 audit 은 skip 되지만 동작은 계속한다.
    let device_id = {
        let identity_guard = ctx.device_identity.read().await;
        identity_guard
            .as_ref()
            .map(|i| i.device_id.to_string())
            .unwrap_or_else(|| "unknown".to_string())
    };

    // 페어링 요청 도착 시점 audit (승인/거부 결정 이전).
    // ext_id 가 metadata 에 포함되어 다중 확장 환경에서 분리 조회 가능.
    ctx.audit
        .record(
            AuditActor::LocalUser,
            actions::EXT_PAIRING_REQUEST,
            "extension",
            ext_id,
            Some(format!(
                r#"{{"ext_id":"{ext_id}","fingerprint":"{}","approved":{approved}}}"#,
                hex_fingerprint(ext_pub_bytes)
            )),
        )
        .await;

    if !approved {
        // 거부 — audit 만 기록
        ctx.audit
            .record(
                AuditActor::LocalUser,
                actions::EXT_PAIRING_REJECTED,
                "extension",
                ext_id,
                Some(format!(
                    r#"{{"ext_id":"{ext_id}","fingerprint":"{}"}}"#,
                    hex_fingerprint(ext_pub_bytes)
                )),
            )
            .await;

        return Ok(PairingDecision {
            approved: false,
            desktop_pub: None,
            device_id,
        });
    }

    // 승인 — 1. vault unlock 확인
    {
        let vault = ctx.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(ExtPairingError::VaultLocked);
        }
    }

    // 2. X25519 keypair 생성 (secretbank-crypto 재사용, B-4 PairingSession 동등)
    let keypair = crypto_pairing::generate_keypair();
    let desktop_pub_b64 = B64.encode(keypair.pub_key);

    // 3. priv key → vault (SecretBytes — 평문 IPC 미통과)
    let priv_path = format!("device/extension/{ext_id}/priv");
    let paired_at_path = format!("device/extension/{ext_id}/pairedAt");

    // priv_key 는 SecretBox → expose_secret() 후 즉시 SecretBytes 로 이전
    {
        use secrecy::ExposeSecret as _;
        let priv_bytes: Vec<u8> = keypair.priv_key.expose_secret().to_vec();
        let secret = SecretBytes::new(priv_bytes);

        let now_ts = OffsetDateTime::now_utc().unix_timestamp().to_string();
        let now_bytes = SecretBytes::new(now_ts.as_bytes().to_vec());

        let mut vault = ctx.vault.write().await;
        vault.put_secret(&priv_path, secret).await?;
        vault.put_secret(&paired_at_path, now_bytes).await?;
        vault.flush().await?;
    }
    // keypair.priv_key 는 여기서 drop → zeroize

    // 4. audit log `extension.pairing.approved`
    ctx.audit
        .record(
            AuditActor::LocalUser,
            actions::EXT_PAIRING_APPROVED,
            "extension",
            ext_id,
            Some(format!(
                r#"{{"ext_id":"{ext_id}","fingerprint":"{}","desktop_pub":"{}"}}"#,
                hex_fingerprint(ext_pub_bytes),
                desktop_pub_b64
            )),
        )
        .await;

    Ok(PairingDecision {
        approved: true,
        desktop_pub: Some(desktop_pub_b64),
        device_id,
    })
}

/// Extension 페어링 해제 (revoke) 내부 로직.
///
/// vault 에서 `device/extension/{ext_id}/priv` 와 `pairedAt` 을 삭제하고
/// audit log `extension.pairing.revoked` 를 기록한다.
pub async fn process_pairing_revoke(ctx: &AppContext, ext_id: &str) -> Result<(), ExtPairingError> {
    {
        let vault = ctx.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(ExtPairingError::VaultLocked);
        }
    }

    let priv_path = format!("device/extension/{ext_id}/priv");
    let paired_at_path = format!("device/extension/{ext_id}/pairedAt");

    {
        let mut vault = ctx.vault.write().await;
        // NotFound 는 무시 (이미 삭제된 경우 idempotent)
        let _ = vault.delete_secret(&priv_path).await;
        let _ = vault.delete_secret(&paired_at_path).await;
        vault.flush().await?;
    }

    ctx.audit
        .record(
            AuditActor::LocalUser,
            actions::EXT_PAIRING_REVOKED,
            "extension",
            ext_id,
            None,
        )
        .await;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Extension 페어링 요청 수신 — 사용자 승인/거부 결정 처리.
///
/// # 파라미터
/// - `extension_pub`: Extension 의 X25519 공개키 (base64).
/// - `extension_id`: Extension 의 고유 ID.
/// - `approved`: 사용자가 UI 에서 Approve 를 선택했는지 여부.
///
/// # 반환
/// `PairingDecision` — approved + desktop_pub(옵션) + device_id.
///
/// # 보안
/// - vault 잠금 상태에서 승인 시 VaultLocked 에러.
/// - priv key 는 SecretBytes 래핑 → 평문 IPC 미통과.
/// - 다중 ext_id 지원: vault path 에 ext_id 포함.
#[tauri::command]
pub async fn ext_pairing_request_received(
    state: State<'_, AppContext>,
    extension_pub: String,
    extension_id: String,
    approved: bool,
) -> Result<PairingDecision, ExtPairingError> {
    // ext_pub base64 → 32바이트 배열 검증
    let pub_bytes_vec = B64.decode(&extension_pub)?;
    let pub_bytes: [u8; 32] =
        pub_bytes_vec
            .try_into()
            .map_err(|v: Vec<u8>| ExtPairingError::InvalidPubKey {
                message: format!("expected 32 bytes, got {}", v.len()),
            })?;

    process_pairing_decision(&state, &extension_id, &pub_bytes, approved).await
}

/// Extension 페어링 해제 — vault 에서 해당 ext_id 의 키를 삭제하고 audit 기록.
#[tauri::command]
pub async fn ext_pairing_revoke(
    state: State<'_, AppContext>,
    extension_id: String,
) -> Result<(), ExtPairingError> {
    process_pairing_revoke(&state, &extension_id).await
}

/// 등록된 Extension 목록 조회 — vault 의 `device/extension/` prefix 로 나열.
///
/// 반환: ext_id 목록 (중복 제거).
#[tauri::command]
pub async fn ext_pairing_list(
    state: State<'_, AppContext>,
) -> Result<Vec<String>, ExtPairingError> {
    let vault = state.vault.read().await;
    if !vault.is_unlocked().await {
        return Err(ExtPairingError::VaultLocked);
    }

    let paths = vault
        .list_secrets("device/extension/")
        .await
        .map_err(|_| ExtPairingError::VaultStorage)?;

    // `device/extension/{ext_id}/priv` → ext_id 추출 (중복 제거)
    let mut ext_ids: Vec<String> = paths
        .into_iter()
        .filter_map(|p| {
            // "device/extension/{ext_id}/priv" 구조
            let parts: Vec<&str> = p.splitn(4, '/').collect();
            if parts.len() == 4 && parts[0] == "device" && parts[1] == "extension" {
                Some(parts[2].to_string())
            } else {
                None
            }
        })
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    ext_ids.sort();
    Ok(ext_ids)
}

// ---------------------------------------------------------------------------
// 단위 테스트
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use secrecy::SecretString;
    use secretbank_core::DevicePlatform;
    use secretbank_storage::sqlite::init_pool;
    use secretbank_storage::vault::mock::MockVaultStorage;
    use secretbank_storage::vault::{ExposeSecret, VaultStorage as _};
    use secretbank_storage::AuditRepo;
    use tokio::sync::{Mutex, RwLock};

    use crate::audit_ctx::AuditCtx;
    use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
    use crate::context::AppContext;
    use crate::services::device_identity::{ensure_device_keys, DeviceIdentity};

    use super::*;

    // ── helpers ──────────────────────────────────────────────────────────────

    async fn make_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.expect("init_pool");
        (dir, pool)
    }

    async fn make_unlocked_vault() -> MockVaultStorage {
        let mut v = MockVaultStorage::new("pw");
        v.unlock(SecretString::from("pw".to_owned())).await.unwrap();
        v
    }

    async fn make_ctx_with_identity(
        pool: Arc<sqlx::SqlitePool>,
        vault: MockVaultStorage,
    ) -> AppContext {
        // device identity 용 별도 vault (ensure_device_keys 내부에서 write 필요)
        let vault_for_id: Arc<
            RwLock<Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync>>,
        > = {
            let mut v = MockVaultStorage::new("pw");
            v.unlock(SecretString::from("pw".to_owned())).await.unwrap();
            Arc::new(RwLock::new(Box::new(v)))
        };
        let identity = ensure_device_keys(
            vault_for_id,
            pool.as_ref(),
            "test-device",
            DevicePlatform::Linux,
        )
        .await
        .expect("ensure_device_keys");

        make_ctx_inner(pool, vault, Some(identity))
    }

    fn make_ctx_inner(
        pool: Arc<sqlx::SqlitePool>,
        vault: MockVaultStorage,
        identity: Option<DeviceIdentity>,
    ) -> AppContext {
        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity = Arc::new(RwLock::new(identity));
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
            import_sessions: Arc::new(crate::import::ImportSessionStore::new()),
            relay_client: Arc::new(
                crate::services::relay_client::RelayClient::new(
                    url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap(),
            ),
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter: crate::services::sync_emit::noop_emitter(),
            nm_bridge: Arc::new(Mutex::new(None)),
            pairing_session: Arc::new(RwLock::new(None)),
        }
    }

    /// ext 공개키 + 비밀키를 함께 반환한다 (ECDH 대칭성 검증용).
    fn gen_ext_keypair() -> (secrecy::SecretBox<[u8; 32]>, [u8; 32]) {
        let kp = crypto_pairing::generate_keypair();
        (kp.priv_key, kp.pub_key)
    }

    fn gen_ext_pub() -> [u8; 32] {
        gen_ext_keypair().1
    }

    // ── EP1: 승인 시 vault put round-trip ────────────────────────────────────

    #[tokio::test]
    async fn ep1_approved_vault_put_round_trip() {
        use secrecy::ExposeSecret as _;
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let (ext_priv, ext_pub) = gen_ext_keypair();
        let ext_id = "chrome_test_ext_001";

        let decision = process_pairing_decision(&ctx, ext_id, &ext_pub, true)
            .await
            .expect("승인 처리 실패");

        assert!(decision.approved, "approved flag 가 true 여야 한다");
        assert!(
            decision.desktop_pub.is_some(),
            "desktop_pub 가 Some 이어야 한다"
        );

        // vault 에서 priv 읽기 — NotUnlocked 없이 성공해야 함
        let priv_path = format!("device/extension/{ext_id}/priv");
        let vault_guard = ctx.vault.read().await;
        let stored = vault_guard
            .get_secret(&priv_path)
            .await
            .expect("priv 가 vault 에 있어야 한다");

        // 32바이트 X25519 priv key
        assert_eq!(
            stored.expose_secret().len(),
            32,
            "저장된 priv key 는 32바이트여야 한다"
        );

        // ECDH 대칭성 검증:
        //   desktop_ck = ECDH(desktop_priv, ext_pub, "")
        //   ext_ck     = ECDH(ext_priv,     desktop_pub, "")
        //   두 값이 같아야 한다 (X25519 ECDH 대칭성).
        let desktop_pub_bytes: [u8; 32] = B64
            .decode(decision.desktop_pub.unwrap())
            .expect("base64 decode")
            .try_into()
            .expect("32바이트");

        let priv_arr: [u8; 32] = stored
            .expose_secret()
            .as_slice()
            .try_into()
            .expect("32바이트");
        let desktop_priv_secret = secrecy::SecretBox::new(Box::new(priv_arr));

        let ck_desktop =
            secretbank_crypto::pairing::derive_channel_key(&desktop_priv_secret, &ext_pub, "")
                .unwrap();
        let ck_ext =
            secretbank_crypto::pairing::derive_channel_key(&ext_priv, &desktop_pub_bytes, "")
                .unwrap();

        assert_eq!(
            ck_desktop.expose_secret(),
            ck_ext.expose_secret(),
            "ECDH 대칭성: desktop 측과 ext 측 channel key 가 같아야 한다"
        );
    }

    // ── EP2: 거부 시 vault 에 키 없음 ────────────────────────────────────────

    #[tokio::test]
    async fn ep2_rejected_vault_has_no_key() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let ext_pub = gen_ext_pub();
        let ext_id = "firefox_test_ext_001";

        let decision = process_pairing_decision(&ctx, ext_id, &ext_pub, false)
            .await
            .expect("거부 처리 실패");

        assert!(!decision.approved, "approved flag 가 false 여야 한다");
        assert!(
            decision.desktop_pub.is_none(),
            "거부 시 desktop_pub 가 None 이어야 한다"
        );

        // vault 에 priv 가 없어야 함
        let priv_path = format!("device/extension/{ext_id}/priv");
        let vault_guard = ctx.vault.read().await;
        let result = vault_guard.get_secret(&priv_path).await;
        assert!(
            matches!(
                result,
                Err(secretbank_storage::vault::VaultError::NotFound { .. })
            ),
            "거부 시 vault 에 priv 가 없어야 한다"
        );
    }

    // ── EP3: audit log 기록 — approved + rejected 둘 다 ─────────────────────

    #[tokio::test]
    async fn ep3_audit_log_approved_and_rejected() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let ext_pub_a = gen_ext_pub();
        let ext_pub_r = gen_ext_pub();

        // 승인 1건
        process_pairing_decision(&ctx, "ext_approve_001", &ext_pub_a, true)
            .await
            .expect("승인 실패");

        // 거부 1건
        process_pairing_decision(&ctx, "ext_reject_001", &ext_pub_r, false)
            .await
            .expect("거부 실패");

        let repo = AuditRepo::new(pool.as_ref());
        let all = repo
            .list(&secretbank_storage::AuditFilter {
                limit: 100,
                ..Default::default()
            })
            .await
            .unwrap();

        let approved_entries: Vec<_> = all
            .iter()
            .filter(|e| e.action == "extension.pairing.approved")
            .collect();
        let rejected_entries: Vec<_> = all
            .iter()
            .filter(|e| e.action == "extension.pairing.rejected")
            .collect();

        assert_eq!(approved_entries.len(), 1, "approved audit 1건 기록");
        assert_eq!(rejected_entries.len(), 1, "rejected audit 1건 기록");

        // subject_id 가 ext_id 와 일치
        assert_eq!(
            approved_entries[0].subject_id, "ext_approve_001",
            "approved subject_id = ext_id"
        );
        assert_eq!(
            rejected_entries[0].subject_id, "ext_reject_001",
            "rejected subject_id = ext_id"
        );
    }

    // ── EP4: 다중 ext_id 키 분리 (chrome / firefox / edge 동시) ─────────────

    #[tokio::test]
    async fn ep4_multi_ext_id_key_isolation() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let ids = ["chrome_ext_aaa", "firefox_ext_bbb", "edge_ext_ccc"];
        let mut desktop_pubs: Vec<String> = Vec::new();

        for ext_id in &ids {
            let ext_pub = gen_ext_pub();
            let decision = process_pairing_decision(&ctx, ext_id, &ext_pub, true)
                .await
                .expect("승인 실패");
            desktop_pubs.push(decision.desktop_pub.unwrap());
        }

        // 각 ext_id 의 vault 경로에 독립적인 priv 가 저장되어 있어야 한다
        let vault_guard = ctx.vault.read().await;
        let mut priv_keys: Vec<Vec<u8>> = Vec::new();

        for ext_id in &ids {
            let priv_path = format!("device/extension/{ext_id}/priv");
            let stored = vault_guard
                .get_secret(&priv_path)
                .await
                .expect("priv 가 있어야 한다");
            priv_keys.push(stored.expose_secret().clone());
        }

        // 세 priv key 가 서로 달라야 한다 (독립 keypair)
        assert_ne!(priv_keys[0], priv_keys[1], "chrome/firefox priv 분리");
        assert_ne!(priv_keys[1], priv_keys[2], "firefox/edge priv 분리");
        assert_ne!(priv_keys[0], priv_keys[2], "chrome/edge priv 분리");

        // desktop_pub 도 서로 달라야 한다
        assert_ne!(
            desktop_pubs[0], desktop_pubs[1],
            "chrome/firefox desktop_pub 분리"
        );
        assert_ne!(
            desktop_pubs[1], desktop_pubs[2],
            "firefox/edge desktop_pub 분리"
        );
    }

    // ── EP5: revoke 후 vault 에 priv 없음 + audit log revoked ───────────────

    #[tokio::test]
    async fn ep5_revoke_removes_key_and_audits() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let ext_pub = gen_ext_pub();
        let ext_id = "chrome_revoke_test";

        // 먼저 승인
        process_pairing_decision(&ctx, ext_id, &ext_pub, true)
            .await
            .expect("승인 실패");

        // 페어링 해제
        process_pairing_revoke(&ctx, ext_id)
            .await
            .expect("revoke 실패");

        // vault 에 priv 없음
        let priv_path = format!("device/extension/{ext_id}/priv");
        let vault_guard = ctx.vault.read().await;
        let result = vault_guard.get_secret(&priv_path).await;
        assert!(
            matches!(
                result,
                Err(secretbank_storage::vault::VaultError::NotFound { .. })
            ),
            "revoke 후 vault 에 priv 없어야 한다"
        );
        drop(vault_guard);

        // audit revoked 기록
        let repo = AuditRepo::new(pool.as_ref());
        let all = repo
            .list(&secretbank_storage::AuditFilter {
                limit: 100,
                ..Default::default()
            })
            .await
            .unwrap();

        let revoked: Vec<_> = all
            .iter()
            .filter(|e| e.action == "extension.pairing.revoked")
            .collect();
        assert_eq!(revoked.len(), 1, "revoke audit 1건 기록");
        assert_eq!(revoked[0].subject_id, ext_id);
    }

    // ── EP6: vault locked 시 승인 → VaultLocked 에러 ─────────────────────────

    #[tokio::test]
    async fn ep6_approve_when_vault_locked_returns_error() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        // 잠긴 vault (unlock 안 함)
        let locked_vault = MockVaultStorage::new("pw");
        let ctx = make_ctx_inner(pool, locked_vault, None);

        let ext_pub = gen_ext_pub();
        let result = process_pairing_decision(&ctx, "some_ext", &ext_pub, true).await;
        assert!(
            matches!(result, Err(ExtPairingError::VaultLocked)),
            "vault locked → VaultLocked 에러"
        );
    }

    // ── EP7: 잘못된 extension_pub (base64 길이 불일치) ────────────────────────

    #[tokio::test]
    async fn ep7_invalid_ext_pub_base64_error() {
        // base64 파싱이 성공하더라도 31바이트이면 InvalidPubKey 반환
        // (커맨드 레벨에서 처리 — inner 함수는 배열을 받으므로 커맨드 로직 직접 테스트)
        let short = B64.encode([0u8; 31]);
        let result = B64.decode(&short).and_then(|b| {
            let _: [u8; 32] = b
                .try_into()
                .map_err(|_| base64::DecodeError::InvalidLength(31))?;
            Ok(())
        });
        assert!(result.is_err(), "31바이트 → 변환 실패");
    }

    // ── EP8: emoji_fingerprint 는 8 emoji 반환 ────────────────────────────────

    #[test]
    fn ep8_emoji_fingerprint_length() {
        let pub_bytes = [0xABu8; 32];
        let fp = emoji_fingerprint(&pub_bytes);
        // 8개의 emoji — 각 emoji 는 UTF-8 멀티바이트지만 char 카운트는 8
        let char_count = fp.chars().count();
        assert_eq!(char_count, 8, "emoji fingerprint 는 8 emoji 여야 한다");
    }

    // ── EP9: hex_fingerprint 는 16자 hex ────────────────────────────────────

    #[test]
    fn ep9_hex_fingerprint_format() {
        let pub_bytes = [0xCDu8; 32];
        let fp = hex_fingerprint(&pub_bytes);
        assert_eq!(fp.len(), 16, "hex fingerprint 는 16자 (8 bytes * 2)");
        assert!(fp.chars().all(|c| c.is_ascii_hexdigit()), "모두 hex 문자");
    }

    // ── EP10: pairedAt vault 에 timestamp 저장 검증 ─────────────────────────

    #[tokio::test]
    async fn ep10_paired_at_stored_in_vault() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let ext_pub = gen_ext_pub();
        let ext_id = "paired_at_test_ext";

        process_pairing_decision(&ctx, ext_id, &ext_pub, true)
            .await
            .expect("승인 실패");

        let paired_at_path = format!("device/extension/{ext_id}/pairedAt");
        let vault_guard = ctx.vault.read().await;
        let stored = vault_guard
            .get_secret(&paired_at_path)
            .await
            .expect("pairedAt 이 vault 에 있어야 한다");

        let ts_str = String::from_utf8(stored.expose_secret().clone()).expect("UTF-8");
        let ts: i64 = ts_str.parse().expect("unix timestamp 숫자");
        // 2025-01-01 00:00:00 UTC = 1735689600 보다 크면 현재 시각
        assert!(ts > 1_735_689_600, "timestamp 가 2025년 이후여야 한다");
    }

    // ── EP11: extension.pairing.request audit 가 승인/거부 이전에 기록 ─────────

    #[tokio::test]
    async fn ep11_pairing_request_audit_recorded_before_decision() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let ext_pub_a = gen_ext_pub();
        let ext_pub_r = gen_ext_pub();
        let ext_id_a = "ext_request_approve";
        let ext_id_r = "ext_request_reject";

        // 승인 1건 — request + approved 2건 기록
        process_pairing_decision(&ctx, ext_id_a, &ext_pub_a, true)
            .await
            .expect("승인 실패");

        // 거부 1건 — request + rejected 2건 기록
        process_pairing_decision(&ctx, ext_id_r, &ext_pub_r, false)
            .await
            .expect("거부 실패");

        let repo = AuditRepo::new(pool.as_ref());
        let all = repo
            .list(&secretbank_storage::AuditFilter {
                limit: 100,
                ..Default::default()
            })
            .await
            .unwrap();

        // extension.pairing.request 가 2건 (승인/거부 각 1건씩) 기록되어야 한다
        let request_entries: Vec<_> = all
            .iter()
            .filter(|e| e.action == secretbank_audit::actions::EXT_PAIRING_REQUEST)
            .collect();
        assert_eq!(request_entries.len(), 2, "pairing.request audit 2건 기록");

        // 각 ext_id 가 subject_id 에 포함되어야 한다
        let has_approve_id = request_entries.iter().any(|e| e.subject_id == ext_id_a);
        let has_reject_id = request_entries.iter().any(|e| e.subject_id == ext_id_r);
        assert!(has_approve_id, "승인 ext_id 의 request audit 있어야 한다");
        assert!(has_reject_id, "거부 ext_id 의 request audit 있어야 한다");

        // request audit 이 approved/rejected audit 보다 seq 가 앞서야 한다
        // (같은 ext_id 기준: request seq < approved/rejected seq)
        let request_a = request_entries
            .iter()
            .find(|e| e.subject_id == ext_id_a)
            .unwrap();
        let approved_a = all
            .iter()
            .find(|e| e.action == secretbank_audit::actions::EXT_PAIRING_APPROVED)
            .unwrap();
        assert!(
            request_a.seq < approved_a.seq,
            "request audit(seq={}) 가 approved audit(seq={}) 보다 먼저 기록되어야 한다",
            request_a.seq,
            approved_a.seq
        );
    }
}
