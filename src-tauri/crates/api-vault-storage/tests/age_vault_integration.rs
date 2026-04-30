//! AgeVaultStorage 통합 테스트.
//!
//! 각 테스트는 임시 디렉터리를 사용하므로 서로 격리된다.
//! Argon2id (m=64MiB, t=3) 로 인해 테스트당 0.5–1초 소요.

use api_vault_storage::{
    age_vault::AgeVaultStorage,
    vault::{SecretBytes, VaultError, VaultStorage},
};
use secrecy::{ExposeSecret, SecretString};

fn make_password(s: &str) -> SecretString {
    SecretString::from(s.to_owned())
}

fn make_secret(b: &[u8]) -> SecretBytes {
    SecretBytes::new(b.to_vec())
}

// ─────────────────────────────────────────────
//  1. initialize 시 vault.age 파일 생성
// ─────────────────────────────────────────────
#[tokio::test]
async fn initialize_creates_new_vault() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");

    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
    assert!(!vault_path.exists(), "초기화 전에는 파일이 없어야 함");

    vault.initialize(&make_password("test-pass")).await.unwrap();
    assert!(vault_path.exists(), "초기화 후 파일이 생성되어야 함");
}

// ─────────────────────────────────────────────
//  2. 이미 존재하는 볼트에 initialize 호출 시 에러
// ─────────────────────────────────────────────
#[tokio::test]
async fn initialize_fails_when_exists() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");

    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
    vault.initialize(&make_password("pw")).await.unwrap();

    // 두 번째 initialize: 같은 인스턴스, 이미 Locked 상태이므로 에러
    let result = vault.initialize(&make_password("pw")).await;
    assert!(
        matches!(result, Err(VaultError::Crypto(_))),
        "이미 초기화된 볼트에 initialize 는 Crypto 에러를 반환해야 함"
    );
}

// ─────────────────────────────────────────────
//  3. 올바른 비밀번호로 unlock 성공
// ─────────────────────────────────────────────
#[tokio::test]
async fn unlock_with_correct_password() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");

    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
    vault
        .initialize(&make_password("correct-pw"))
        .await
        .unwrap();

    vault.lock().await.unwrap();
    assert!(!vault.is_unlocked().await);

    vault.unlock(make_password("correct-pw")).await.unwrap();
    assert!(vault.is_unlocked().await);
}

// ─────────────────────────────────────────────
//  4. 틀린 비밀번호로 unlock 시 WrongPassword
// ─────────────────────────────────────────────
#[tokio::test]
async fn unlock_with_wrong_password_returns_wrongpassword() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");

    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
    vault
        .initialize(&make_password("correct-pw"))
        .await
        .unwrap();
    vault.lock().await.unwrap();

    // 새 인스턴스로 다시 열어서 틀린 비번으로 unlock
    let mut vault2 = AgeVaultStorage::open(&vault_path).await.unwrap();
    let result = vault2.unlock(make_password("wrong-pw")).await;

    assert!(
        matches!(result, Err(VaultError::WrongPassword)),
        "틀린 비번 → WrongPassword 를 반환해야 함, got: {:?}",
        result
    );
}

// ─────────────────────────────────────────────
//  5. put / get 라운드트립
// ─────────────────────────────────────────────
#[tokio::test]
async fn put_get_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");

    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
    vault.initialize(&make_password("pw")).await.unwrap();
    vault.unlock(make_password("pw")).await.unwrap();

    let secret_value = b"super-secret-api-key-12345";
    vault
        .put_secret("openai/prod", make_secret(secret_value))
        .await
        .unwrap();

    let retrieved = vault.get_secret("openai/prod").await.unwrap();
    assert_eq!(
        retrieved.expose_secret(),
        secret_value,
        "put/get 라운드트립 값이 일치해야 함"
    );
}

// ─────────────────────────────────────────────
//  6. lock → unlock (새 인스턴스) 후 값 유지
// ─────────────────────────────────────────────
#[tokio::test]
async fn persistence_across_lock_unlock() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");

    // 초기화 + 값 저장
    {
        let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
        vault.initialize(&make_password("pw")).await.unwrap();
        vault.unlock(make_password("pw")).await.unwrap();
        vault
            .put_secret("stripe/prod", make_secret(b"sk_live_abc123"))
            .await
            .unwrap();
        vault.lock().await.unwrap(); // flush 포함
    }

    // 새 인스턴스로 열어서 값 확인
    {
        let mut vault2 = AgeVaultStorage::open(&vault_path).await.unwrap();
        vault2.unlock(make_password("pw")).await.unwrap();

        let val = vault2.get_secret("stripe/prod").await.unwrap();
        assert_eq!(
            val.expose_secret(),
            b"sk_live_abc123",
            "lock 후 새 인스턴스로 열어도 값이 유지되어야 함"
        );
    }
}

// ─────────────────────────────────────────────
//  7. put 후 lock 시 백업 파일 생성 확인
// ─────────────────────────────────────────────
#[tokio::test]
async fn backup_created_on_flush() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");

    // 첫 번째 initialize (파일 생성)
    {
        let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
        vault.initialize(&make_password("pw")).await.unwrap();
        vault.unlock(make_password("pw")).await.unwrap();
    }

    // 두 번째 인스턴스: put → lock (기존 파일이 있으므로 백업 생성)
    {
        let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
        vault.unlock(make_password("pw")).await.unwrap();
        vault
            .put_secret("github/token", make_secret(b"ghp_xxxx"))
            .await
            .unwrap();
        vault.lock().await.unwrap(); // dirty → flush → backup
    }

    // 디렉터리에 vault.age.bak-* 파일이 있어야 함
    let backups: Vec<_> = std::fs::read_dir(dir.path())
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().contains("vault.age.bak-"))
        .collect();

    assert!(
        !backups.is_empty(),
        "flush 시 백업 파일이 생성되어야 함. 현재 디렉터리: {:?}",
        std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name())
            .collect::<Vec<_>>()
    );
}

// ─────────────────────────────────────────────
//  8. flush() — unlocked 상태에서 디스크 영속화 (잠금 없이)
// ─────────────────────────────────────────────
#[tokio::test]
async fn flush_persists_data_while_staying_unlocked() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");

    // 초기화 + 잠금 해제 + 값 저장 + flush (lock 아님)
    {
        let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
        vault.initialize(&make_password("pw")).await.unwrap();
        vault.unlock(make_password("pw")).await.unwrap();
        vault
            .put_secret("settings/nvd_api_key", make_secret(b"nvd-test-key"))
            .await
            .unwrap();
        // flush: 잠금 없이 디스크에 기록
        vault.flush().await.unwrap();
        // 아직 unlocked 상태여야 함
        assert!(vault.is_unlocked().await, "flush 후 여전히 unlocked 상태여야 함");
    }

    // 새 인스턴스로 열어서 값 확인 (flush 로 디스크에 쓰였으므로 복원 가능)
    {
        let mut vault2 = AgeVaultStorage::open(&vault_path).await.unwrap();
        vault2.unlock(make_password("pw")).await.unwrap();
        let val = vault2.get_secret("settings/nvd_api_key").await.unwrap();
        assert_eq!(
            val.expose_secret(),
            b"nvd-test-key",
            "flush 후 새 인스턴스에서 값이 복원되어야 함"
        );
    }
}

// ─────────────────────────────────────────────
//  9. flush() — locked 상태에서 호출 시 NotUnlocked 에러
// ─────────────────────────────────────────────
#[tokio::test]
async fn flush_while_locked_returns_not_unlocked() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");

    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
    vault.initialize(&make_password("pw")).await.unwrap();
    // initialize 후 Locked 상태
    let result = vault.flush().await;
    assert!(
        matches!(result, Err(VaultError::NotUnlocked)),
        "Locked 상태에서 flush → NotUnlocked 에러, got: {:?}",
        result
    );
}

// ─────────────────────────────────────────────
//  M23-B-2: initialize_with_charter — 발급 모드별 검증
// ─────────────────────────────────────────────

use api_vault_charter::{unwrap_enc_key, WrappedKey};
use api_vault_storage::age_vault::{
    file::{read_vault_file, HEADER_V1_SIZE},
    CharterIssuance, CharterMode,
};

#[tokio::test]
async fn initialize_with_charter_single_writes_envelope_and_yields_charter() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();

    let issuance = vault
        .initialize_with_charter(&make_password("pw"), CharterMode::Single)
        .await
        .unwrap();

    let charter = match issuance {
        CharterIssuance::Single(c) => c,
        other => panic!("expected Single issuance, got {other:?}"),
    };
    assert_eq!(charter.words.len(), 6);
    assert!(charter.verifier < 10_000);

    // 디스크 파일 — VERSION_V2 + CHARTER_FLAG=0x01.
    let raw = std::fs::read(&vault_path).unwrap();
    assert_eq!(raw[8], 0x02, "version byte = v2");
    assert_eq!(raw[HEADER_V1_SIZE], 0x01, "charter flag = present");
}

#[tokio::test]
async fn initialize_with_charter_shamir_yields_three_distinct_shares() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();

    let issuance = vault
        .initialize_with_charter(&make_password("pw"), CharterMode::Shamir2of3)
        .await
        .unwrap();

    match issuance {
        CharterIssuance::Shamir(shares) => {
            assert_eq!(shares.len(), 3);
            assert_ne!(shares[0].words, shares[1].words);
            assert_ne!(shares[1].words, shares[2].words);
            assert_ne!(shares[0].words, shares[2].words);
            for sh in shares.iter() {
                assert_eq!(sh.words.len(), 7);
                assert!((1..=3).contains(&sh.index));
            }
        }
        other => panic!("expected Shamir, got {other:?}"),
    }

    // 단일 envelope 만 디스크에 저장 (Shamir 분할은 발급된 share 에서만 의미).
    let (header, _) = read_vault_file(&vault_path).unwrap();
    assert!(
        header.charter_envelope.is_some(),
        "Shamir 모드도 envelope 1개만 저장"
    );
}

#[tokio::test]
async fn initialize_with_charter_none_omits_envelope() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();

    let issuance = vault
        .initialize_with_charter(&make_password("pw"), CharterMode::None)
        .await
        .unwrap();
    assert!(matches!(issuance, CharterIssuance::None));

    let (header, _) = read_vault_file(&vault_path).unwrap();
    assert!(
        header.charter_envelope.is_none(),
        "None 모드는 envelope 저장하지 않음"
    );
}

#[tokio::test]
async fn legacy_initialize_remains_no_charter_path() {
    // 기존 `initialize()` 경로 — charter 발급 안 함.
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
    vault.initialize(&make_password("pw")).await.unwrap();

    let (header, _) = read_vault_file(&vault_path).unwrap();
    assert!(
        header.charter_envelope.is_none(),
        "legacy initialize 는 charter 없이 동작"
    );
}

#[tokio::test]
async fn issued_charter_unwraps_envelope_back_to_password_derived_enc_key() {
    use api_vault_crypto::kdf;
    use secrecy::ExposeSecret;

    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();

    let issuance = vault
        .initialize_with_charter(&make_password("pw"), CharterMode::Single)
        .await
        .unwrap();
    let charter = match issuance {
        CharterIssuance::Single(c) => c,
        _ => panic!("expected Single"),
    };

    let (header, _) = read_vault_file(&vault_path).unwrap();
    let envelope_bytes = header.charter_envelope.expect("envelope must be present");
    let wrapped = WrappedKey::from_bytes(&envelope_bytes).expect("WrappedKey parse");

    // charter → CharterSecret → unwrap → enc_key.
    let secret = charter.to_secret().expect("charter verifier valid");
    let recovered_enc = unwrap_enc_key(&secret, &wrapped).expect("envelope decrypts");

    // password 로 다시 derive 한 enc_key 와 비트 동일.
    let derived = kdf::derive_enc_key(&make_password("pw"), &header.salt_enc).unwrap();
    assert_eq!(&recovered_enc, derived.expose_secret());
}

#[tokio::test]
async fn shamir_shares_combine_back_to_envelope_unwrap_capable_secret() {
    use api_vault_charter::shamir_combine;
    use api_vault_crypto::kdf;
    use secrecy::ExposeSecret;

    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();

    let issuance = vault
        .initialize_with_charter(&make_password("pw"), CharterMode::Shamir2of3)
        .await
        .unwrap();
    let shares = match issuance {
        CharterIssuance::Shamir(s) => s,
        _ => panic!("expected Shamir"),
    };

    // 3장 중 2장으로 secret 복원.
    let secret = shamir_combine(&[shares[0].clone(), shares[2].clone()])
        .expect("any 2 shares must reconstruct");

    let (header, _) = read_vault_file(&vault_path).unwrap();
    let wrapped = WrappedKey::from_bytes(header.charter_envelope.as_ref().unwrap()).unwrap();
    let recovered_enc = unwrap_enc_key(&secret, &wrapped).expect("envelope decrypts");

    let derived = kdf::derive_enc_key(&make_password("pw"), &header.salt_enc).unwrap();
    assert_eq!(&recovered_enc, derived.expose_secret());
}

#[tokio::test]
async fn vault_with_charter_unlocks_via_password_normally() {
    // charter 발급은 password unlock 경로에 영향 주지 않는다.
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();

    vault
        .initialize_with_charter(&make_password("pw"), CharterMode::Single)
        .await
        .unwrap();
    vault.lock().await.unwrap();
    vault.unlock(make_password("pw")).await.unwrap();
    assert!(vault.is_unlocked().await);
}
