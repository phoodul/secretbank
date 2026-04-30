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

// ─────────────────────────────────────────────
//  M23-B-3: recover_with_charter — recovery 경로
// ─────────────────────────────────────────────

#[tokio::test]
async fn recover_with_correct_charter_then_unlock_via_new_password() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");

    // 1. vault 생성 + Single charter 발급
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
    let issuance = vault
        .initialize_with_charter(&make_password("old-pw"), CharterMode::Single)
        .await
        .unwrap();
    let charter = match issuance {
        CharterIssuance::Single(c) => c,
        _ => panic!("expected Single"),
    };

    // 2. 기존 records 가 있으면 의미가 있는 round-trip — 한 줄 추가 후 flush
    vault.unlock(make_password("old-pw")).await.unwrap();
    vault
        .put_secret("hello", make_secret(b"world"))
        .await
        .unwrap();
    vault.flush().await.unwrap();
    vault.lock().await.unwrap();

    // 3. recovery — charter 로 새 password 발급. 이 때는 새 charter 는 None.
    let charter_secret = charter.to_secret().expect("verifier valid");
    let recover_issuance = vault
        .recover_with_charter(charter_secret, &make_password("new-pw"), CharterMode::None)
        .await
        .unwrap();
    assert!(matches!(recover_issuance, CharterIssuance::None));

    // 4. 새 password 로 unlock + records 복원 검증
    vault.unlock(make_password("new-pw")).await.unwrap();
    let recovered = vault.get_secret("hello").await.unwrap();
    assert_eq!(recovered.expose_secret(), b"world");
}

#[tokio::test]
async fn recover_with_wrong_charter_fails() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
    vault
        .initialize_with_charter(&make_password("old-pw"), CharterMode::Single)
        .await
        .unwrap();

    // 다른 random secret 으로 recover 시도
    let bogus_secret = api_vault_charter::CharterSecret::random();
    let result = vault
        .recover_with_charter(bogus_secret, &make_password("new-pw"), CharterMode::None)
        .await;
    match result {
        Err(VaultError::Crypto(msg)) => {
            assert!(
                msg.contains("does not unlock"),
                "expected 'does not unlock' error, got: {msg}"
            );
        }
        other => panic!("expected Crypto error, got {other:?}"),
    }
}

#[tokio::test]
async fn recover_fails_when_vault_has_no_charter_envelope() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();
    // None 모드로 초기화 — charter envelope 없음
    vault
        .initialize_with_charter(&make_password("pw"), CharterMode::None)
        .await
        .unwrap();

    let some_secret = api_vault_charter::CharterSecret::random();
    let result = vault
        .recover_with_charter(some_secret, &make_password("new-pw"), CharterMode::None)
        .await;
    match result {
        Err(VaultError::Crypto(msg)) => {
            assert!(
                msg.contains("no charter envelope"),
                "expected 'no charter envelope', got: {msg}"
            );
        }
        other => panic!("expected Crypto error, got {other:?}"),
    }
}

#[tokio::test]
async fn recover_invalidates_old_password() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();

    let issuance = vault
        .initialize_with_charter(&make_password("old-pw"), CharterMode::Single)
        .await
        .unwrap();
    let charter = match issuance {
        CharterIssuance::Single(c) => c,
        _ => unreachable!(),
    };

    let secret = charter.to_secret().unwrap();
    vault
        .recover_with_charter(secret, &make_password("new-pw"), CharterMode::None)
        .await
        .unwrap();

    // 옛 password 로는 unlock 실패
    let result = vault.unlock(make_password("old-pw")).await;
    assert!(
        matches!(result, Err(VaultError::WrongPassword)),
        "old password must no longer unlock"
    );
}

#[tokio::test]
async fn recover_invalidates_old_charter() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();

    let issuance = vault
        .initialize_with_charter(&make_password("old-pw"), CharterMode::Single)
        .await
        .unwrap();
    let old_charter = match issuance {
        CharterIssuance::Single(c) => c,
        _ => unreachable!(),
    };

    // 한 번 recover (새 charter 도 함께 발급)
    let old_secret = old_charter.to_secret().unwrap();
    let new_issuance = vault
        .recover_with_charter(old_secret, &make_password("new-pw"), CharterMode::Single)
        .await
        .unwrap();
    let new_charter = match new_issuance {
        CharterIssuance::Single(c) => c,
        _ => panic!("expected new Single charter"),
    };

    // 옛 charter (의 secret) 로는 더 이상 recover 안 됨 — 다시 시도 시 fail
    let stale_secret = old_charter.to_secret().unwrap();
    let result = vault
        .recover_with_charter(stale_secret, &make_password("yet-newer-pw"), CharterMode::None)
        .await;
    assert!(
        matches!(result, Err(VaultError::Crypto(_))),
        "old charter must no longer recover after rotation"
    );

    // 새 charter 는 작동
    let fresh_secret = new_charter.to_secret().unwrap();
    vault
        .recover_with_charter(fresh_secret, &make_password("yet-newer-pw"), CharterMode::None)
        .await
        .unwrap();
    vault.unlock(make_password("yet-newer-pw")).await.unwrap();
}

#[tokio::test]
async fn recover_with_shamir_combine_path() {
    use api_vault_charter::shamir_combine;

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

    // 가족 시나리오: 1번과 3번 share 만 있음 (2번 분실)
    let combined = shamir_combine(&[shares[0].clone(), shares[2].clone()]).unwrap();

    vault
        .recover_with_charter(combined, &make_password("new-pw"), CharterMode::None)
        .await
        .unwrap();
    vault.unlock(make_password("new-pw")).await.unwrap();
    assert!(vault.is_unlocked().await);
}

#[tokio::test]
async fn recover_can_issue_new_shamir_set() {
    let dir = tempfile::tempdir().unwrap();
    let vault_path = dir.path().join("vault.age");
    let mut vault = AgeVaultStorage::open(&vault_path).await.unwrap();

    let issuance = vault
        .initialize_with_charter(&make_password("pw"), CharterMode::Single)
        .await
        .unwrap();
    let charter = match issuance {
        CharterIssuance::Single(c) => c,
        _ => unreachable!(),
    };

    // recover 시 Shamir 로 charter 모드 변경
    let secret = charter.to_secret().unwrap();
    let new_issuance = vault
        .recover_with_charter(secret, &make_password("pw2"), CharterMode::Shamir2of3)
        .await
        .unwrap();
    match new_issuance {
        CharterIssuance::Shamir(shares) => {
            assert_eq!(shares.len(), 3);
        }
        _ => panic!("expected Shamir issuance after recovery"),
    }
}
