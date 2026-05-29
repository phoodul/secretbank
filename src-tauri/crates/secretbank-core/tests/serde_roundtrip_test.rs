use secretbank_core::{Credential, CredentialId, CredentialInput, CredentialStatus, Env, IssuerId};
use time::OffsetDateTime;

/// Serialize → deserialize 왕복 테스트.
#[test]
fn credential_input_serde_roundtrip() {
    let input = CredentialInput {
        issuer_id: IssuerId::new(),
        name: "My OpenAI Key".to_string(),
        env: Env::Prod,
        scope: Some("completions:read".to_string()),
        rotation_policy_days: Some(30),
        rotation_runbook_id: None,
        expires_at: None,
        owner: Some("alice@example.com".to_string()),
        hash_hint: Some("k9aX".to_string()),
        kind: Default::default(),
        url: None,
        username: None,
        primary_label: None,
        secondary_label: None,
        custom_kind_label: None,
    };

    let json = serde_json::to_string(&input).expect("serialize");
    let back: CredentialInput = serde_json::from_str(&json).expect("deserialize");
    assert_eq!(input, back);
}

/// Env enum lowercase 직렬화 확인.
#[test]
fn env_enum_serde_roundtrip() {
    assert_eq!(serde_json::to_string(&Env::Dev).unwrap(), "\"dev\"");
    assert_eq!(serde_json::to_string(&Env::Staging).unwrap(), "\"staging\"");
    assert_eq!(serde_json::to_string(&Env::Prod).unwrap(), "\"prod\"");

    let dev: Env = serde_json::from_str("\"dev\"").unwrap();
    let staging: Env = serde_json::from_str("\"staging\"").unwrap();
    let prod: Env = serde_json::from_str("\"prod\"").unwrap();

    assert_eq!(dev, Env::Dev);
    assert_eq!(staging, Env::Staging);
    assert_eq!(prod, Env::Prod);
}

/// Unix ms 시간 왕복 테스트.
#[test]
fn datetime_unix_ms_roundtrip() {
    // 밀리초 정밀도로 자른 시각 (SQLite INTEGER 저장 방식과 동일).
    let now_ms = OffsetDateTime::now_utc().unix_timestamp() * 1000;
    let now = OffsetDateTime::from_unix_timestamp(now_ms / 1000).unwrap();

    let cred = Credential {
        id: CredentialId::new(),
        issuer_id: IssuerId::new(),
        name: "Test Key".to_string(),
        env: Env::Dev,
        scope: None,
        vault_ref: "credentials/01JWXYZ".to_string(),
        created_at: now,
        last_rotated_at: None,
        expires_at: None,
        owner: None,
        rotation_policy_days: None,
        rotation_runbook_id: None,
        status: CredentialStatus::Active,
        hash_hint: None,
        kind: Default::default(),
        url: None,
        username: None,
        secondary_value_ref: None,
        primary_label: None,
        secondary_label: None,
        custom_kind_label: None,
    };

    let json = serde_json::to_string(&cred).expect("serialize");
    let back: Credential = serde_json::from_str(&json).expect("deserialize");

    // created_at 은 초 단위로 저장되므로 초 단위 비교.
    assert_eq!(
        cred.created_at.unix_timestamp(),
        back.created_at.unix_timestamp()
    );
    assert_eq!(cred.name, back.name);
    assert_eq!(cred.env, back.env);
}
