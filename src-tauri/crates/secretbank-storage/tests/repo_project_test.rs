use secretbank_core::{ProjectInput, ProjectPatch};
use secretbank_storage::sqlite::{repositories::project::ProjectRepo, StorageError};
use sqlx::SqlitePool;

#[sqlx::test(migrations = "./migrations")]
async fn project_crud_roundtrip(pool: SqlitePool) -> Result<(), StorageError> {
    let repo = ProjectRepo::new(&pool);

    let input = ProjectInput {
        name: "my-saas".to_string(),
        repo_url: Some("https://github.com/acme/my-saas".to_string()),
        framework: Some("next".to_string()),
        runtime: Some("node".to_string()),
        local_path: None,
    };

    // insert
    let id = repo.insert(&input).await?;

    // get_by_id
    let project = repo.get_by_id(id).await?.expect("project should exist");
    assert_eq!(project.id, id);
    assert_eq!(project.name, "my-saas");
    assert_eq!(project.framework.as_deref(), Some("next"));

    // list
    let list = repo.list().await?;
    assert_eq!(list.len(), 1);

    // update
    let patch = ProjectPatch {
        name: Some("my-saas-v2".to_string()),
        framework: Some("remix".to_string()),
        ..Default::default()
    };
    repo.update(id, &patch).await?;
    let updated = repo.get_by_id(id).await?.expect("should still exist");
    assert_eq!(updated.name, "my-saas-v2");
    assert_eq!(updated.framework.as_deref(), Some("remix"));
    // updated_at should be >= created_at
    assert!(updated.updated_at >= project.created_at);

    // delete
    repo.delete(id).await?;
    assert!(repo.get_by_id(id).await?.is_none());

    Ok(())
}
