use secretbank_core::{
    CredentialFilter, CredentialInput, CredentialPatch, CredentialStatus, Env, IssuerInput,
};
use secretbank_storage::sqlite::{
    repositories::{credential::CredentialRepo, issuer::IssuerRepo},
    StorageError,
};
use sqlx::SqlitePool;

async fn make_issuer(pool: &SqlitePool) -> secretbank_core::IssuerId {
    let repo = IssuerRepo::new(pool);
    repo.insert(&IssuerInput {
        slug: "stripe".to_string(),
        display_name: "Stripe".to_string(),
        docs_url: None,
        issue_url: None,
        status_url: None,
        security_feed_url: None,
        connector_id: None,
        icon_key: None,
        default_primary_label: None,
        default_secondary_label: None,
        domains: vec![],
    })
    .await
    .expect("issuer insert failed")
}

#[sqlx::test(migrations = "./migrations")]
async fn credential_crud_roundtrip(pool: SqlitePool) -> Result<(), StorageError> {
    let issuer_id = make_issuer(&pool).await;
    let repo = CredentialRepo::new(&pool);

    let input = CredentialInput {
        issuer_id,
        name: "Stripe Live Key".to_string(),
        env: Env::Prod,
        scope: Some("payments".to_string()),
        rotation_policy_days: Some(90),
        rotation_runbook_id: None,
        expires_at: None,
        owner: Some("alice@example.com".to_string()),
        hash_hint: Some("kE9x".to_string()),
        kind: Default::default(),
        url: None,
        username: None,
        primary_label: None,
        secondary_label: None,
    };

    // insert
    let vault_ref = format!("credentials/{}", secretbank_core::CredentialId::new());
    let id = repo.insert(&input, vault_ref.clone()).await?;

    // get_by_id
    let cred = repo.get_by_id(id).await?.expect("credential should exist");
    assert_eq!(cred.id, id);
    assert_eq!(cred.issuer_id, issuer_id);
    assert_eq!(cred.name, "Stripe Live Key");
    assert_eq!(cred.env, Env::Prod);
    assert_eq!(cred.status, CredentialStatus::Active);
    assert_eq!(cred.vault_ref, vault_ref);
    assert_eq!(cred.hash_hint.as_deref(), Some("kE9x"));

    // list with filter
    let summaries = repo
        .list(&CredentialFilter {
            issuer_id: Some(issuer_id),
            env: Some(Env::Prod),
            status: None,
            expiring_within_days: None,
            kind: None,
        })
        .await?;
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0].id, id);

    // update
    let patch = CredentialPatch {
        name: Some("Stripe Live Key (rotated)".to_string()),
        status: Some(CredentialStatus::Revoked),
        ..Default::default()
    };
    repo.update(id, &patch).await?;
    let updated = repo.get_by_id(id).await?.expect("should still exist");
    assert_eq!(updated.name, "Stripe Live Key (rotated)");
    assert_eq!(updated.status, CredentialStatus::Revoked);

    // delete
    repo.delete(id).await?;
    assert!(repo.get_by_id(id).await?.is_none());

    Ok(())
}

#[sqlx::test(migrations = "./migrations")]
async fn credential_filter_by_env(pool: SqlitePool) -> Result<(), StorageError> {
    let issuer_id = make_issuer(&pool).await;
    let repo = CredentialRepo::new(&pool);

    // 두 개 삽입: prod / dev
    let prod_input = CredentialInput {
        issuer_id,
        name: "Prod Key".to_string(),
        env: Env::Prod,
        scope: None,
        rotation_policy_days: None,
        rotation_runbook_id: None,
        expires_at: None,
        owner: None,
        hash_hint: None,
        kind: Default::default(),
        url: None,
        username: None,
        primary_label: None,
        secondary_label: None,
    };
    let dev_input = CredentialInput {
        issuer_id,
        name: "Dev Key".to_string(),
        env: Env::Dev,
        ..prod_input.clone()
    };

    repo.insert(&prod_input, "credentials/prod".to_string())
        .await?;
    repo.insert(&dev_input, "credentials/dev".to_string())
        .await?;

    let dev_only = repo
        .list(&CredentialFilter {
            env: Some(Env::Dev),
            ..Default::default()
        })
        .await?;
    assert_eq!(dev_only.len(), 1);
    assert_eq!(dev_only[0].name, "Dev Key");

    let all = repo.list(&CredentialFilter::default()).await?;
    assert_eq!(all.len(), 2);

    Ok(())
}
