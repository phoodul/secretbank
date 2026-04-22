/// Integration tests for the initial SQLite migration.
/// Uses `#[sqlx::test]` which spins up a temporary in-memory database,
/// applies all migrations automatically, and tears down after each test.

/// Verify that all 11 expected tables are created by the migration.
#[sqlx::test(migrations = "./migrations")]
async fn migrations_apply_cleanly(pool: sqlx::SqlitePool) -> sqlx::Result<()> {
    let tables: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM sqlite_master \
         WHERE type='table' \
           AND name NOT LIKE 'sqlx_%' \
           AND name NOT LIKE 'sqlite_%' \
           AND name NOT LIKE '_sqlx_%' \
         ORDER BY name",
    )
    .fetch_all(&pool)
    .await?;

    let names: Vec<String> = tables.into_iter().map(|(n,)| n).collect();

    let expected = [
        "audit_log",
        "credential",
        "deployment",
        "device",
        "incident",
        "incident_match",
        "issuer",
        "project",
        "settings",
        "sync_state",
        "usage",
    ];

    for table in expected {
        assert!(
            names.contains(&table.to_string()),
            "missing table: {table}; found: {names:?}"
        );
    }

    assert_eq!(
        names.len(),
        expected.len(),
        "unexpected extra tables: {names:?}"
    );

    Ok(())
}

/// Verify that all 8 required indexes are present after migration.
#[sqlx::test(migrations = "./migrations")]
async fn indexes_created(pool: sqlx::SqlitePool) -> sqlx::Result<()> {
    let indexes: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM sqlite_master \
         WHERE type='index' AND name LIKE 'idx_%' \
         ORDER BY name",
    )
    .fetch_all(&pool)
    .await?;

    let idx_names: Vec<String> = indexes.into_iter().map(|(n,)| n).collect();

    let expected_idx = [
        "idx_audit_seq",
        "idx_credential_expires",
        "idx_credential_issuer",
        "idx_credential_status",
        "idx_incident_issuer_detected",
        "idx_match_credential",
        "idx_usage_credential",
        "idx_usage_project",
    ];

    for idx in expected_idx {
        assert!(
            idx_names.contains(&idx.to_string()),
            "missing index: {idx}; found: {idx_names:?}"
        );
    }

    Ok(())
}

/// Verify that `PRAGMA foreign_keys = ON` is enforced on new connections.
/// `#[sqlx::test]` applies migrations via a separate connection and then
/// hands us a fresh pooled connection; we confirm FK pragma is on.
#[sqlx::test(migrations = "./migrations")]
async fn foreign_keys_enforced(pool: sqlx::SqlitePool) -> sqlx::Result<()> {
    let (fk,): (i64,) = sqlx::query_as("PRAGMA foreign_keys")
        .fetch_one(&pool)
        .await?;
    assert_eq!(fk, 1, "foreign_keys should be ON");
    Ok(())
}

/// Inserting a credential that references a non-existent issuer must fail.
#[sqlx::test(migrations = "./migrations")]
async fn insert_credential_requires_valid_issuer(pool: sqlx::SqlitePool) -> sqlx::Result<()> {
    let result = sqlx::query(
        "INSERT INTO credential \
         (id, issuer_id, name, env, vault_ref, created_at, status) \
         VALUES ('cred_01', 'no_such_issuer', 'test key', 'prod', 'credentials/cred_01', 1713742800000, 'active')",
    )
    .execute(&pool)
    .await;

    assert!(
        result.is_err(),
        "FK violation expected when issuer does not exist"
    );
    Ok(())
}

/// A full happy-path: insert an issuer, credential, project, then a usage record.
/// Verifies cascading FK relationships work end-to-end.
#[sqlx::test(migrations = "./migrations")]
async fn insert_full_chain(pool: sqlx::SqlitePool) -> sqlx::Result<()> {
    let now: i64 = 1_713_742_800_000;

    sqlx::query(
        "INSERT INTO issuer (id, slug, display_name, created_at, updated_at) \
         VALUES ('iss_01', 'openai', 'OpenAI', ?1, ?1)",
    )
    .bind(now)
    .execute(&pool)
    .await?;

    sqlx::query(
        "INSERT INTO credential \
         (id, issuer_id, name, env, vault_ref, created_at, status) \
         VALUES ('cred_01', 'iss_01', 'prod key', 'prod', 'credentials/cred_01', ?1, 'active')",
    )
    .bind(now)
    .execute(&pool)
    .await?;

    sqlx::query(
        "INSERT INTO project (id, name, created_at, updated_at) \
         VALUES ('proj_01', 'my-app', ?1, ?1)",
    )
    .bind(now)
    .execute(&pool)
    .await?;

    sqlx::query(
        "INSERT INTO usage \
         (id, credential_id, project_id, where_kind, where_value) \
         VALUES ('usage_01', 'cred_01', 'proj_01', 'env_var', 'OPENAI_API_KEY')",
    )
    .execute(&pool)
    .await?;

    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM usage")
        .fetch_one(&pool)
        .await?;
    assert_eq!(count, 1);

    // Deleting the credential should cascade to usage.
    sqlx::query("DELETE FROM credential WHERE id = 'cred_01'")
        .execute(&pool)
        .await?;

    let (count_after,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM usage")
        .fetch_one(&pool)
        .await?;
    assert_eq!(
        count_after, 0,
        "usage should be cascade-deleted with credential"
    );

    Ok(())
}
