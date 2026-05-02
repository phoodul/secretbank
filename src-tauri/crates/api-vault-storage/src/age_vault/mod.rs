//! age 기반 암호화 볼트 구현.
//!
//! ## 키 파생 흐름 (옵션 α)
//!
//! ```text
//! password + salt_enc
//!     │ Argon2id (m=64MiB, t=3, p=1)
//!     ▼
//! enc_key (32 bytes, SecretBox)
//!     │ HKDF-SHA256(info = "age-vault")
//!     ▼
//! age_seed (32 bytes, SecretBox)
//!     │ x25519_dalek::StaticSecret::from(bytes)
//!     ▼
//! age::x25519::Identity  ──→  age::x25519::Recipient
//!     │                            │
//!     │ (decrypt)             (encrypt)
//!     ▼                            ▼
//! age Decryptor            age Encryptor::with_recipients
//! ```
//!
//! ## 잠금/해제 상태 전이
//!
//! ```text
//! open()
//!   ├─ 파일 없음 → NotInitialized  (initialize() 호출 필요)
//!   └─ 파일 있음 → Locked           (unlock() 호출 필요)
//!
//! initialize(password) → Locked
//! unlock(password)     → Unlocked (identity + records 메모리 로드)
//! lock()               → Locked   (identity + records zeroize 후 drop)
//! ```

pub mod file;
pub mod record_map;

use std::{
    collections::HashMap,
    io::{Read, Write},
    iter,
    path::{Path, PathBuf},
    sync::Arc,
};

use async_trait::async_trait;
use secrecy::{ExposeSecret, SecretBox, SecretString};
use tokio::sync::RwLock;
use x25519_dalek::StaticSecret;
use zeroize::Zeroize;

use api_vault_charter::{
    shamir_split, unwrap_enc_key, wrap_enc_key, Charter, CharterSecret, ShamirShare, WrappedKey,
};
use api_vault_crypto::kdf;

use crate::vault::{SecretBytes, VaultError, VaultStorage};

use self::file::{read_vault_file, write_vault_file, VaultHeader};

// ───────────────────────────────────────────────────
//  Charter (recovery) 발급 모드 / 발급 결과
// ───────────────────────────────────────────────────

/// vault 생성 시 charter 발급 정책.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CharterMode {
    /// charter 발급 안 함 (legacy / 사용자가 명시적으로 거부).
    None,
    /// 단일 charter — 한 장 (6 단어 + verifier).
    Single,
    /// Shamir 2-of-3 분할 — 3 장 중 2장으로 복원 가능.
    Shamir2of3,
}

/// vault 생성 시 1회만 사용자에게 노출되는 charter 발급 결과.
///
/// 호출자는 이 값을 사용자에게 표시하고 (인쇄 / PDF / 화면) 즉시 폐기해야 한다.
/// 메모리 안전: 내부 [`Charter`] / [`ShamirShare`] 의 단어/index 는 user-facing 표현이라 평문이며,
/// 실제 secret 인 [`CharterSecret`] 은 Drop 시 zeroize.
#[derive(Debug)]
pub enum CharterIssuance {
    /// charter 발급을 건너뛴 경우.
    None,
    /// 단일 charter.
    Single(Charter),
    /// Shamir 2-of-3 — 3 장의 share. UI 가 사용자에게 모두 보여줘야.
    Shamir(Box<[ShamirShare; 3]>),
}

impl CharterIssuance {
    /// 발급된 charter 가 있는지 (None 이 아닌지).
    pub fn is_some(&self) -> bool {
        !matches!(self, CharterIssuance::None)
    }
}

// ───────────────────────────────────────────────────
//  내부 상태 enum
// ───────────────────────────────────────────────────

/// 볼트 내부 상태.
///
/// - `NotInitialized`: 파일이 없어 아직 `initialize()` 를 호출하지 않은 상태.
/// - `Locked`: 파일은 있으나 메모리에 keys/records 가 없는 상태.
/// - `Unlocked`: 인증 완료, records 를 메모리에 보유 중인 상태.
enum VaultState {
    /// 볼트 파일이 존재하지 않는다. `initialize()` 를 호출해야 한다.
    NotInitialized,

    /// 파일은 존재하지만 아직 잠겨 있다. salt 만 알고 있다.
    Locked { header: VaultHeader },

    /// 잠금 해제 상태. identity 와 records 가 메모리에 있다.
    Unlocked {
        header: VaultHeader,
        /// X25519 Identity: StaticSecret 를 직접 보유. drop 시 zeroize.
        identity: Box<age::x25519::Identity>,
        /// 비밀 레코드 맵. 값은 SecretBox 로 보호.
        records: HashMap<String, SecretBox<Vec<u8>>>,
        /// put/delete 후 아직 disk 에 flush 하지 않은 경우 true.
        dirty: bool,
    },
}

// ───────────────────────────────────────────────────
//  AgeVaultStorage
// ───────────────────────────────────────────────────

/// age 기반 암호화 볼트 저장소.
///
/// - 볼트 파일 하나 (`vault.age`) 에 모든 secrets 를 저장한다.
/// - 파일 레이아웃: `MAGIC + VERSION + SALT_AUTH + SALT_ENC + age_payload`.
/// - `Arc<RwLock<_>>` 로 내부 상태를 공유하므로 `VaultStorage` 의 `&self` 메서드에서
///   읽기 잠금, `&mut self` 메서드에서 쓰기 잠금을 획득한다.
pub struct AgeVaultStorage {
    /// 볼트 파일 경로.
    path: PathBuf,
    /// 내부 상태 (잠금/해제/미초기화).
    state: Arc<RwLock<VaultState>>,
}

impl AgeVaultStorage {
    /// 볼트를 연다.
    ///
    /// - 파일이 존재하면 헤더를 읽고 `Locked` 상태로 시작한다.
    /// - 파일이 없으면 `NotInitialized` 상태가 된다. `initialize()` 를 호출해야 한다.
    pub async fn open(path: impl Into<PathBuf>) -> Result<Self, VaultError> {
        let path = path.into();

        let state = if path.exists() {
            // 파일이 있으면 헤더만 읽어 Locked 상태로 시작한다.
            let (header, _payload) = read_vault_file(&path)?;
            VaultState::Locked { header }
        } else {
            VaultState::NotInitialized
        };

        Ok(Self {
            path,
            state: Arc::new(RwLock::new(state)),
        })
    }

    /// 볼트를 초기화한다 (charter 없이 — legacy / 명시적 opt-out).
    ///
    /// 사용자에게 recovery 옵션을 제공하지 않는다. 출시 빌드는 가급적
    /// [`Self::initialize_with_charter`] 를 사용하라.
    ///
    /// 이미 파일이 존재하면 `VaultError::Crypto("vault already initialized")` 를 반환한다.
    pub async fn initialize(&mut self, password: &SecretString) -> Result<(), VaultError> {
        let _ = self
            .initialize_with_charter(password, CharterMode::None)
            .await?;
        Ok(())
    }

    /// 볼트를 초기화하며 동시에 Vault Charter 를 발급한다.
    ///
    /// 흐름:
    /// 1. 새 salt 2개 생성 (auth / enc).
    /// 2. mode != None 인 경우:
    ///    - random `CharterSecret` 생성.
    ///    - password → Argon2id → enc_key (32B) 파생.
    ///    - charter_secret 으로 enc_key 를 XChaCha20-Poly1305 envelope.
    ///    - envelope 를 vault header 의 charter_envelope 슬롯에 저장.
    /// 3. 빈 record map 을 age 로 암호화하고 파일에 기록.
    /// 4. 호출자에게 [`CharterIssuance`] 반환 — UI 는 즉시 사용자에게 1회 표시.
    ///
    /// 발급된 [`Charter`] / [`ShamirShare`] 는 vault 파일에 저장되지 않는다.
    /// vault 파일에는 envelope (charter 로만 풀 수 있는 wrap) 만 들어간다.
    pub async fn initialize_with_charter(
        &mut self,
        password: &SecretString,
        mode: CharterMode,
    ) -> Result<CharterIssuance, VaultError> {
        {
            let state = self.state.read().await;
            if !matches!(*state, VaultState::NotInitialized) {
                return Err(VaultError::Crypto("vault already initialized".into()));
            }
        }

        let salt_auth = kdf::generate_salt();
        let salt_enc = kdf::generate_salt();

        let (charter_envelope_bytes, issuance) = match mode {
            CharterMode::None => (None, CharterIssuance::None),
            CharterMode::Single | CharterMode::Shamir2of3 => {
                let enc_key = kdf::derive_enc_key(password, &salt_enc)
                    .map_err(|e| VaultError::Crypto(format!("enc_key derive: {e}")))?;
                let charter_secret = CharterSecret::random();
                let wrapped: WrappedKey = wrap_enc_key(&charter_secret, enc_key.expose_secret())
                    .map_err(|e| VaultError::Crypto(format!("charter wrap: {e}")))?;
                let envelope_bytes = wrapped.to_bytes();

                let issuance = match mode {
                    CharterMode::Single => {
                        CharterIssuance::Single(Charter::from_secret(&charter_secret))
                    }
                    CharterMode::Shamir2of3 => {
                        CharterIssuance::Shamir(Box::new(shamir_split(&charter_secret)))
                    }
                    CharterMode::None => unreachable!(),
                };
                (Some(envelope_bytes), issuance)
            }
        };

        let header = VaultHeader {
            salt_auth,
            salt_enc,
            charter_envelope: charter_envelope_bytes,
        };

        // 빈 레코드 맵을 암호화해 파일에 기록한다.
        let empty_map: HashMap<String, Vec<u8>> = HashMap::new();
        let payload_bytes = record_map::serialize(&empty_map)?;
        let age_payload = encrypt_payload(&header, password, &payload_bytes)?;

        write_vault_file(&self.path, &header, &age_payload)?;

        // Locked 상태로 전이 (unlock 을 별도 호출해야 한다)
        let mut state = self.state.write().await;
        *state = VaultState::Locked { header };

        Ok(issuance)
    }

    /// Vault Charter 로 vault 를 복구하고 새 passphrase 로 재발급한다.
    ///
    /// 흐름:
    /// 1. vault 파일 헤더에서 charter envelope 추출 (없으면 `Crypto("no charter envelope")`).
    /// 2. `charter_secret` 으로 envelope 를 unwrap → 기존 `enc_key` (32B) 복원.
    /// 3. 기존 `enc_key` 로 identity 파생 → age payload 복호화 → record map 추출.
    /// 4. 새 salt 2개 + `new_password` 로 새 enc_key 파생.
    /// 5. `new_charter_mode` 에 따라 (None/Single/Shamir2of3) 새 charter 동시 발급.
    /// 6. record map 을 새 identity 로 재암호화, 새 헤더 + envelope 로 atomic write.
    /// 7. 호출자에게 [`CharterIssuance`] 반환 (새 charter 가 발급됐다면 그것).
    ///
    /// 이 작업이 성공한 후로는 옛 passphrase 로는 unlock 할 수 없고,
    /// 옛 charter 도 더 이상 작동하지 않는다 (envelope 새로 만들어져 있음).
    pub async fn recover_with_charter(
        &mut self,
        charter_secret: CharterSecret,
        new_password: &SecretString,
        new_charter_mode: CharterMode,
    ) -> Result<CharterIssuance, VaultError> {
        // 1. 파일에서 헤더 + age payload 읽기
        let (old_header, age_payload) = read_vault_file(&self.path)?;

        // 2. charter envelope 추출
        let envelope_bytes = old_header.charter_envelope.as_ref().ok_or_else(|| {
            VaultError::Crypto("vault has no charter envelope (cannot recover via charter)".into())
        })?;
        let wrapped = WrappedKey::from_bytes(envelope_bytes)
            .map_err(|e| VaultError::Crypto(format!("malformed charter envelope: {e}")))?;

        // 3. unwrap → 기존 enc_key (32B)
        let recovered_enc_bytes = unwrap_enc_key(&charter_secret, &wrapped).map_err(|_| {
            VaultError::Crypto(
                "charter does not unlock this vault (wrong charter or tampered envelope)".into(),
            )
        })?;
        let recovered_enc = SecretBox::new(Box::new(recovered_enc_bytes));

        // 4. 기존 identity 파생 → age payload 복호화 → records 추출
        let old_identity = identity_from_enc_key(&recovered_enc)?;
        let plaintext = age_decrypt_with_identity(&old_identity, &age_payload)?;
        let map: HashMap<String, Vec<u8>> = record_map::deserialize(&plaintext)?;

        // 5. 새 salt + 새 password 로 새 enc_key 파생
        let new_salt_auth = kdf::generate_salt();
        let new_salt_enc = kdf::generate_salt();
        let new_enc_key = kdf::derive_enc_key(new_password, &new_salt_enc)
            .map_err(|e| VaultError::Crypto(format!("new enc_key derive: {e}")))?;

        // 6. 새 charter (옵션)
        let (new_envelope_bytes, issuance) = match new_charter_mode {
            CharterMode::None => (None, CharterIssuance::None),
            CharterMode::Single | CharterMode::Shamir2of3 => {
                let new_secret = CharterSecret::random();
                let new_wrapped = wrap_enc_key(&new_secret, new_enc_key.expose_secret())
                    .map_err(|e| VaultError::Crypto(format!("new charter wrap: {e}")))?;
                let issuance = match new_charter_mode {
                    CharterMode::Single => {
                        CharterIssuance::Single(Charter::from_secret(&new_secret))
                    }
                    CharterMode::Shamir2of3 => {
                        CharterIssuance::Shamir(Box::new(shamir_split(&new_secret)))
                    }
                    CharterMode::None => unreachable!(),
                };
                (Some(new_wrapped.to_bytes()), issuance)
            }
        };

        // 7. records 를 새 identity 로 재암호화
        let new_header = VaultHeader {
            salt_auth: new_salt_auth,
            salt_enc: new_salt_enc,
            charter_envelope: new_envelope_bytes,
        };
        let payload_bytes = record_map::serialize(&map)?;
        let new_age_payload = encrypt_payload(&new_header, new_password, &payload_bytes)?;
        write_vault_file(&self.path, &new_header, &new_age_payload)?;

        // 8. Locked 상태로 전이 (호출자가 new_password 로 unlock 해야 한다)
        let mut state = self.state.write().await;
        *state = VaultState::Locked { header: new_header };

        Ok(issuance)
    }

    /// 내부 flush: dirty 플래그가 true 일 때 records → MessagePack → age encrypt → disk.
    ///
    /// `state` 에 대한 쓰기 잠금은 이미 호출자가 보유하고 있어야 한다.
    fn flush_unlocked(
        path: &Path,
        header: &VaultHeader,
        identity: &age::x25519::Identity,
        records: &HashMap<String, SecretBox<Vec<u8>>>,
    ) -> Result<(), VaultError> {
        // SecretBox<Vec<u8>> → Vec<u8> 맵으로 변환 후 직렬화
        let plain_map: HashMap<String, Vec<u8>> = records
            .iter()
            .map(|(k, v)| (k.clone(), v.expose_secret().clone()))
            .collect();

        let payload_bytes = record_map::serialize(&plain_map)?;

        // identity 에서 recipient 를 뽑아 암호화에 사용한다.
        // x25519::Identity::to_public() 이 Recipient 를 반환한다.
        let recipient = identity.to_public();
        let age_payload = age_encrypt_with_recipient(&recipient, &payload_bytes)?;

        write_vault_file(path, header, &age_payload)?;
        Ok(())
    }
}

// ───────────────────────────────────────────────────
//  암호화 / 복호화 헬퍼
// ───────────────────────────────────────────────────

/// password + header 의 salt_enc 로 X25519 Identity 를 파생한다.
///
/// 키 파생 순서:
/// 1. Argon2id(password, salt_enc) → enc_key (32 bytes)
/// 2. HKDF-SHA256(enc_key, "age-vault") → age_seed (32 bytes)
/// 3. StaticSecret::from(age_seed) → age::x25519::Identity
fn derive_identity(
    password: &SecretString,
    header: &VaultHeader,
) -> Result<age::x25519::Identity, VaultError> {
    // 1단계: Argon2id → enc_key
    let enc_key = kdf::derive_enc_key(password, &header.salt_enc)
        .map_err(|e| VaultError::Crypto(e.to_string()))?;
    // 2~3단계: enc_key → identity (recover_with_charter 와 공유)
    identity_from_enc_key(&enc_key)
}

/// enc_key (이미 derive 되었거나 charter envelope 에서 unwrap 된 32B) 에서 identity 파생.
///
/// recovery 경로에서 password Argon2id 를 거치지 않고 enc_key 가 직접 알려진 경우 사용한다.
fn identity_from_enc_key(
    enc_key: &SecretBox<[u8; 32]>,
) -> Result<age::x25519::Identity, VaultError> {
    let age_seed =
        kdf::derive_subkey(enc_key, "age-vault").map_err(|e| VaultError::Crypto(e.to_string()))?;
    let seed_bytes: [u8; 32] = *age_seed.expose_secret();
    let static_secret = StaticSecret::from(seed_bytes);
    identity_from_static_secret(static_secret)
}

/// `StaticSecret` 을 age::x25519::Identity 로 변환한다.
///
/// age::x25519::Identity 의 내부 생성자는 공개되지 않으므로
/// StaticSecret bytes → bech32 문자열 → `Identity::from_str` 경로를 이용한다.
/// 이 경로는 age 자체의 `Identity::to_string()` / `from_str` 과 100% 호환된다.
///
/// 중간 bech32 문자열은 처리 후 즉시 zeroize 된다.
fn identity_from_static_secret(
    static_secret: StaticSecret,
) -> Result<age::x25519::Identity, VaultError> {
    use bech32::{ToBase32, Variant};

    // StaticSecret 의 raw 32 bytes
    let mut sk_bytes = static_secret.to_bytes();

    // age 가 내부에서 쓰는 것과 동일한 bech32 포맷:
    //   "AGE-SECRET-KEY-" prefix (uppercase bech32) + base32(sk_bytes)
    let sk_base32 = sk_bytes.to_base32();
    let encoded = bech32::encode("age-secret-key-", sk_base32, Variant::Bech32)
        .map_err(|e| VaultError::Crypto(format!("bech32 encode error: {e}")))?
        .to_uppercase();

    // age::x25519::Identity 는 FromStr 을 구현하며
    // "AGE-SECRET-KEY-..." 형식의 문자열을 파싱한다.
    let identity: age::x25519::Identity = encoded
        .parse()
        .map_err(|e: &str| VaultError::Crypto(format!("identity parse error: {e}")))?;

    // 중간 바이트 즉시 zeroize
    sk_bytes.zeroize();

    Ok(identity)
}

/// `age::x25519::Recipient` 로 plaintext 를 암호화한다.
fn age_encrypt_with_recipient(
    recipient: &age::x25519::Recipient,
    plaintext: &[u8],
) -> Result<Vec<u8>, VaultError> {
    let encryptor = age::Encryptor::with_recipients(iter::once(recipient as &dyn age::Recipient))
        .map_err(|e| VaultError::Crypto(e.to_string()))?;

    let mut ciphertext = Vec::new();
    let mut writer = encryptor
        .wrap_output(&mut ciphertext)
        .map_err(|e| VaultError::Crypto(e.to_string()))?;

    writer.write_all(plaintext).map_err(VaultError::Io)?;
    writer
        .finish()
        .map_err(|e| VaultError::Crypto(e.to_string()))?;

    Ok(ciphertext)
}

/// `age::x25519::Identity` 로 ciphertext 를 복호화한다.
///
/// 복호화 실패는 `VaultError::WrongPassword` 로 변환한다.
/// (age 는 올바른 Identity 가 없으면 DecryptError::NoMatchingKeys 를 반환)
fn age_decrypt_with_identity(
    identity: &age::x25519::Identity,
    ciphertext: &[u8],
) -> Result<Vec<u8>, VaultError> {
    let decryptor = age::Decryptor::new(ciphertext).map_err(|_| VaultError::WrongPassword)?;

    let mut plaintext = Vec::new();
    let mut reader = decryptor
        .decrypt(iter::once(identity as &dyn age::Identity))
        .map_err(|_| VaultError::WrongPassword)?;

    reader.read_to_end(&mut plaintext).map_err(VaultError::Io)?;

    Ok(plaintext)
}

/// password + header 로 payload 를 암호화한다 (initialize 에서 사용).
fn encrypt_payload(
    header: &VaultHeader,
    password: &SecretString,
    plaintext: &[u8],
) -> Result<Vec<u8>, VaultError> {
    let identity = derive_identity(password, header)?;
    let recipient = identity.to_public();
    age_encrypt_with_recipient(&recipient, plaintext)
}

// ───────────────────────────────────────────────────
//  VaultStorage impl
// ───────────────────────────────────────────────────

#[async_trait]
impl VaultStorage for AgeVaultStorage {
    /// 볼트를 잠금 해제한다.
    ///
    /// 1. 파일에서 header + age_payload 를 읽는다.
    /// 2. password → Identity 파생.
    /// 3. age 복호화 → MessagePack 역직렬화 → records 로드.
    /// 4. 복호화 실패 시 `WrongPassword` 반환.
    async fn unlock(&mut self, password: SecretString) -> Result<(), VaultError> {
        let mut state = self.state.write().await;

        // Locked 상태여야 unlock 가능
        let header = match &*state {
            VaultState::Locked { header } => header.clone(),
            VaultState::NotInitialized => {
                return Err(VaultError::Crypto(
                    "vault not initialized; call initialize() first".into(),
                ))
            }
            VaultState::Unlocked { .. } => return Ok(()), // 이미 열림
        };

        // 파일에서 header + payload 다시 읽기 (최신 내용 보장)
        let (_header, age_payload) = read_vault_file(&self.path)?;

        // Identity 파생 (Argon2id + HKDF)
        let identity = derive_identity(&password, &header)?;

        // age 복호화
        let plaintext = age_decrypt_with_identity(&identity, &age_payload)?;

        // MessagePack 역직렬화
        let map: HashMap<String, Vec<u8>> = record_map::deserialize(&plaintext)?;

        // Vec<u8> → SecretBox<Vec<u8>> 로 래핑
        let records: HashMap<String, SecretBox<Vec<u8>>> = map
            .into_iter()
            .map(|(k, v)| (k, SecretBox::new(Box::new(v))))
            .collect();

        *state = VaultState::Unlocked {
            header,
            identity: Box::new(identity),
            records,
            dirty: false,
        };

        Ok(())
    }

    async fn is_unlocked(&self) -> bool {
        matches!(*self.state.read().await, VaultState::Unlocked { .. })
    }

    /// 볼트를 잠근다.
    ///
    /// dirty 이면 flush 후 상태를 Locked 로 전이한다.
    /// identity 와 records 는 drop 시 자동으로 zeroize 된다 (SecretBox, StaticSecret).
    async fn lock(&mut self) -> Result<(), VaultError> {
        let mut state = self.state.write().await;

        let (header, identity, records, dirty) = match &*state {
            VaultState::Unlocked {
                header,
                identity,
                records,
                dirty,
            } => (header.clone(), identity, records, *dirty),
            _ => return Ok(()),
        };

        // dirty 이면 disk 에 저장
        if dirty {
            Self::flush_unlocked(&self.path, &header, identity, records)?;
        }

        *state = VaultState::Locked { header };
        Ok(())
    }

    async fn put_secret(&mut self, path: &str, value: SecretBytes) -> Result<(), VaultError> {
        let mut state = self.state.write().await;

        match &mut *state {
            VaultState::Unlocked { records, dirty, .. } => {
                let bytes = value.expose_secret().clone();
                records.insert(path.to_owned(), SecretBox::new(Box::new(bytes)));
                *dirty = true;
                Ok(())
            }
            _ => Err(VaultError::NotUnlocked),
        }
    }

    async fn get_secret(&self, path: &str) -> Result<SecretBytes, VaultError> {
        let state = self.state.read().await;

        match &*state {
            VaultState::Unlocked { records, .. } => records
                .get(path)
                .map(|v| SecretBytes::new(v.expose_secret().clone()))
                .ok_or_else(|| VaultError::NotFound {
                    path: path.to_owned(),
                }),
            _ => Err(VaultError::NotUnlocked),
        }
    }

    async fn delete_secret(&mut self, path: &str) -> Result<(), VaultError> {
        let mut state = self.state.write().await;

        match &mut *state {
            VaultState::Unlocked { records, dirty, .. } => {
                if records.remove(path).is_none() {
                    return Err(VaultError::NotFound {
                        path: path.to_owned(),
                    });
                }
                *dirty = true;
                Ok(())
            }
            _ => Err(VaultError::NotUnlocked),
        }
    }

    async fn list_secrets(&self, prefix: &str) -> Result<Vec<String>, VaultError> {
        let state = self.state.read().await;

        match &*state {
            VaultState::Unlocked { records, .. } => {
                let mut paths: Vec<String> = records
                    .keys()
                    .filter(|p| p.starts_with(prefix))
                    .cloned()
                    .collect();
                paths.sort();
                Ok(paths)
            }
            _ => Err(VaultError::NotUnlocked),
        }
    }

    /// 잠금 해제 상태를 유지하면서 메모리 레코드를 디스크에 즉시 기록한다.
    ///
    /// `dirty` 여부와 무관하게 항상 디스크에 쓴다 (설정 변경 후 즉시 안전 보장).
    /// `Locked` / `NotInitialized` 상태에서 호출하면 `VaultError::NotUnlocked` 반환.
    async fn flush(&mut self) -> Result<(), VaultError> {
        let mut state = self.state.write().await;

        match &mut *state {
            VaultState::Unlocked {
                header,
                identity,
                records,
                dirty,
            } => {
                Self::flush_unlocked(&self.path, header, identity, records)?;
                *dirty = false;
                Ok(())
            }
            _ => Err(VaultError::NotUnlocked),
        }
    }
}
