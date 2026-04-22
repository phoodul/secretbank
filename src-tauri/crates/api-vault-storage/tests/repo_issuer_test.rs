use api_vault_core::IssuerInput;
use api_vault_storage::sqlite::{repositories::issuer::IssuerRepo, StorageError};
use sqlx::SqlitePool;

#[sqlx::test(migrations = "./migrations")]
async fn issuer_crud_roundtrip(pool: SqlitePool) -> Result<(), StorageError> {
    let repo = IssuerRepo::new(&pool);

    let input = IssuerInput {
        slug: "openai".to_string(),
        display_name: "OpenAI".to_string(),
        docs_url: Some("https://platform.openai.com/docs".to_string()),
        issue_url: None,
        status_url: Some("https://status.openai.com".to_string()),
        security_feed_url: None,
        connector_id: None,
        icon_key: Some("openai".to_string()),
    };

    // insert
    let id = repo.insert(&input).await?;

    // get_by_id
    let issuer = repo.get_by_id(id).await?.expect("issuer should exist");
    assert_eq!(issuer.id, id);
    assert_eq!(issuer.slug, "openai");
    assert_eq!(issuer.display_name, "OpenAI");
    assert_eq!(
        issuer.docs_url.as_deref(),
        Some("https://platform.openai.com/docs")
    );
    assert_eq!(issuer.icon_key.as_deref(), Some("openai"));

    // list
    let list = repo.list().await?;
    assert_eq!(list.len(), 1);

    // update
    let updated_input = IssuerInput {
        slug: "openai".to_string(),
        display_name: "OpenAI (updated)".to_string(),
        docs_url: None,
        issue_url: None,
        status_url: None,
        security_feed_url: None,
        connector_id: None,
        icon_key: None,
    };
    repo.update(id, &updated_input).await?;
    let updated = repo.get_by_id(id).await?.expect("should still exist");
    assert_eq!(updated.display_name, "OpenAI (updated)");
    assert!(updated.docs_url.is_none());

    // delete
    repo.delete(id).await?;
    let gone = repo.get_by_id(id).await?;
    assert!(gone.is_none());

    Ok(())
}
