use secretbank_core::{CredentialInput, Env, IssuerInput, ProjectInput, UsageInput, UsageWhereKind};
use secretbank_storage::sqlite::{
    repositories::{
        credential::CredentialRepo, issuer::IssuerRepo, project::ProjectRepo, usage::UsageRepo,
    },
    StorageError,
};
use sqlx::SqlitePool;

#[sqlx::test(migrations = "./migrations")]
async fn usage_insert_list_roundtrip(pool: SqlitePool) -> Result<(), StorageError> {
    // 1. 선행 레코드 생성
    let issuer_id = IssuerRepo::new(&pool)
        .insert(&IssuerInput {
            slug: "github".to_string(),
            display_name: "GitHub".to_string(),
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
        .await?;

    let credential_id = CredentialRepo::new(&pool)
        .insert(
            &CredentialInput {
                issuer_id,
                name: "GitHub PAT".to_string(),
                env: Env::Dev,
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
            },
            "credentials/gh-pat".to_string(),
        )
        .await?;

    let project_id = ProjectRepo::new(&pool)
        .insert(&ProjectInput {
            name: "my-app".to_string(),
            repo_url: None,
            framework: None,
            runtime: None,
            local_path: None,
        })
        .await?;

    // 2. usage insert
    let usage_repo = UsageRepo::new(&pool);
    let usage_input = UsageInput {
        credential_id,
        project_id,
        deployment_id: None,
        where_kind: UsageWhereKind::EnvVar,
        where_value: "GITHUB_TOKEN".to_string(),
    };
    let usage_id = usage_repo.insert(&usage_input).await?;

    // 3. get_by_id
    let usage = usage_repo
        .get_by_id(usage_id)
        .await?
        .expect("usage should exist");
    assert_eq!(usage.id, usage_id);
    assert_eq!(usage.credential_id, credential_id);
    assert_eq!(usage.where_kind, UsageWhereKind::EnvVar);
    assert_eq!(usage.where_value, "GITHUB_TOKEN");

    // 4. list_for_credential
    let by_cred = usage_repo.list_for_credential(credential_id).await?;
    assert_eq!(by_cred.len(), 1);

    // 5. list_for_project
    let by_proj = usage_repo.list_for_project(project_id).await?;
    assert_eq!(by_proj.len(), 1);

    // 6. delete
    usage_repo.delete(usage_id).await?;
    assert!(usage_repo.get_by_id(usage_id).await?.is_none());

    // 7. 목록이 빔 확인
    let empty = usage_repo.list_for_credential(credential_id).await?;
    assert!(empty.is_empty());

    Ok(())
}
