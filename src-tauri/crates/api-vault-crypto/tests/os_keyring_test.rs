use api_vault_crypto::os_keyring::{delete_master, load_master, store_master};
use api_vault_crypto::KeyringError;
use secrecy::ExposeSecret;

/// 테스트마다 고유한 user_id 를 만들기 위한 간단한 식별자.
/// ulid 대신 타임스탬프 + 스레드 ID 조합 사용 (추가 dep 없이).
fn unique_user_id(label: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("test-{}-{}", label, ts)
}

#[test]
#[ignore = "OS Keyring 통합 테스트: 로컬 환경에서만 실행 (cargo test -- --ignored)"]
fn roundtrip_store_and_load() {
    let user_id = unique_user_id("roundtrip");
    let payload = b"super-secret-master-key-32bytes!";

    store_master(&user_id, payload).expect("store_master failed");

    let loaded = load_master(&user_id).expect("load_master failed");
    assert_eq!(
        loaded.expose_secret().as_slice(),
        payload,
        "저장한 값과 불러온 값이 일치해야 한다"
    );

    // 정리
    delete_master(&user_id).expect("cleanup delete_master failed");
}

#[test]
#[ignore = "OS Keyring 통합 테스트: 로컬 환경에서만 실행 (cargo test -- --ignored)"]
fn delete_removes_entry() {
    let user_id = unique_user_id("delete");
    let payload = b"ephemeral-key-data";

    store_master(&user_id, payload).expect("store_master failed");
    delete_master(&user_id).expect("delete_master failed");

    let result = load_master(&user_id);
    assert!(
        matches!(result, Err(KeyringError::NotFound)),
        "삭제 후 load 는 NotFound 여야 한다, got: {:?}",
        result
    );
}

#[test]
#[ignore = "OS Keyring 통합 테스트: 로컬 환경에서만 실행 (cargo test -- --ignored)"]
fn load_missing_returns_not_found() {
    let user_id = unique_user_id("missing");

    // 처음부터 저장하지 않은 항목 조회
    let result = load_master(&user_id);
    assert!(
        matches!(result, Err(KeyringError::NotFound)),
        "존재하지 않는 항목 조회는 NotFound 여야 한다, got: {:?}",
        result
    );
}
