use api_vault_crypto::kdf::{derive_auth_hash, derive_enc_key, derive_subkey, generate_salt};
use secrecy::{ExposeSecret, SecretString};

fn test_password() -> SecretString {
    SecretString::new("correct-horse-battery-staple".into())
}

#[test]
fn auth_hash_is_deterministic() {
    let password = test_password();
    let salt = [0x01u8; 16];

    let hash1 = derive_auth_hash(&password, &salt).expect("derive_auth_hash failed");
    let hash2 = derive_auth_hash(&password, &salt).expect("derive_auth_hash failed");

    assert_eq!(hash1, hash2, "동일 입력 → 동일 auth_hash");
    assert_eq!(hash1.len(), 32);
}

#[test]
fn auth_hash_differs_by_salt() {
    let password = test_password();
    let salt_a = [0xAAu8; 16];
    let salt_b = [0xBBu8; 16];

    let hash_a = derive_auth_hash(&password, &salt_a).expect("derive_auth_hash failed");
    let hash_b = derive_auth_hash(&password, &salt_b).expect("derive_auth_hash failed");

    assert_ne!(hash_a, hash_b, "다른 salt → 다른 auth_hash");
}

#[test]
fn enc_key_is_deterministic() {
    let password = test_password();
    let salt = [0x02u8; 16];

    let key1 = derive_enc_key(&password, &salt).expect("derive_enc_key failed");
    let key2 = derive_enc_key(&password, &salt).expect("derive_enc_key failed");

    assert_eq!(
        key1.expose_secret(),
        key2.expose_secret(),
        "동일 입력 → 동일 enc_key"
    );
}

#[test]
fn subkey_differs_by_info() {
    let password = test_password();
    let salt = [0x03u8; 16];
    let root = derive_enc_key(&password, &salt).expect("derive_enc_key failed");

    let sk_age = derive_subkey(&root, "age-vault").expect("derive_subkey failed");
    let sk_crdt = derive_subkey(&root, "crdt-root").expect("derive_subkey failed");

    assert_ne!(
        sk_age.expose_secret(),
        sk_crdt.expose_secret(),
        "다른 info → 다른 subkey"
    );
}

#[test]
fn salt_is_16_bytes_and_random() {
    let salt1 = generate_salt();
    let salt2 = generate_salt();

    assert_eq!(salt1.len(), 16, "salt 길이는 16 bytes");
    assert_ne!(salt1, salt2, "두 번 생성한 salt 는 달라야 한다 (랜덤)");
}
