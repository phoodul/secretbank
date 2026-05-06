//! App setup: issuer preset seed and other first-run initialization.
//!
//! Call `seed_issuer_presets(&pool).await` once during `.setup()` — it is
//! idempotent (INSERT OR IGNORE) so repeated calls on every launch are safe.

use api_vault_core::IssuerId;
use api_vault_storage::sqlite::{SqlitePool, StorageError};
use time::OffsetDateTime;

// ---------------------------------------------------------------------------
// Internal preset data
// ---------------------------------------------------------------------------

struct PresetSeed {
    slug: &'static str,
    display_name: &'static str,
    docs_url: Option<&'static str>,
    issue_url: Option<&'static str>,
    status_url: Option<&'static str>,
    security_feed_url: Option<&'static str>,
    icon_key: &'static str,
    default_primary_label: Option<&'static str>,
    default_secondary_label: Option<&'static str>,
    domains: &'static [&'static str],
}

static PRESETS: [PresetSeed; 10] = [
    PresetSeed {
        slug: "openai",
        display_name: "OpenAI",
        docs_url: Some("https://platform.openai.com/docs/api-reference"),
        issue_url: Some("https://platform.openai.com/account/api-keys"),
        status_url: Some("https://status.openai.com"),
        security_feed_url: None,
        icon_key: "openai",
        default_primary_label: Some("API Key"),
        default_secondary_label: None,
        domains: &["openai.com"],
    },
    PresetSeed {
        slug: "stripe",
        display_name: "Stripe",
        docs_url: Some("https://stripe.com/docs/api"),
        issue_url: Some("https://dashboard.stripe.com/apikeys"),
        status_url: Some("https://status.stripe.com"),
        security_feed_url: Some("https://stripe.com/blog/rss.xml"),
        icon_key: "stripe",
        default_primary_label: Some("API Key"),
        default_secondary_label: None,
        domains: &["stripe.com"],
    },
    PresetSeed {
        slug: "github",
        display_name: "GitHub",
        docs_url: Some("https://docs.github.com/rest"),
        issue_url: Some("https://github.com/settings/tokens"),
        status_url: Some("https://www.githubstatus.com"),
        security_feed_url: Some("https://github.blog/category/security/feed/"),
        icon_key: "github",
        default_primary_label: Some("Client ID"),
        default_secondary_label: Some("Client Secret"),
        domains: &["github.com", "github.io"],
    },
    PresetSeed {
        slug: "aws",
        display_name: "AWS",
        docs_url: Some("https://docs.aws.amazon.com"),
        issue_url: Some("https://console.aws.amazon.com/iam/home"),
        status_url: Some("https://health.aws.amazon.com/health/status"),
        security_feed_url: Some("https://aws.amazon.com/security/security-bulletins/rss/"),
        icon_key: "aws",
        default_primary_label: Some("Access Key"),
        default_secondary_label: Some("Secret Key"),
        domains: &["aws.amazon.com", "amazonaws.com"],
    },
    PresetSeed {
        slug: "vercel",
        display_name: "Vercel",
        docs_url: Some("https://vercel.com/docs/rest-api"),
        issue_url: Some("https://vercel.com/account/tokens"),
        status_url: Some("https://www.vercel-status.com"),
        security_feed_url: None,
        icon_key: "vercel",
        default_primary_label: Some("API Key"),
        default_secondary_label: None,
        domains: &["vercel.com", "vercel.app"],
    },
    PresetSeed {
        slug: "supabase",
        display_name: "Supabase",
        docs_url: Some("https://supabase.com/docs/reference"),
        issue_url: Some("https://supabase.com/dashboard/account/tokens"),
        status_url: Some("https://status.supabase.com"),
        security_feed_url: None,
        icon_key: "supabase",
        default_primary_label: Some("Public Key"),
        default_secondary_label: Some("Secret Key"),
        domains: &["supabase.com", "supabase.io", "supabase.co"],
    },
    PresetSeed {
        slug: "google",
        display_name: "Google Cloud",
        docs_url: Some("https://cloud.google.com/apis/docs/overview"),
        issue_url: Some("https://console.cloud.google.com/apis/credentials"),
        status_url: Some("https://status.cloud.google.com"),
        security_feed_url: None,
        icon_key: "google",
        default_primary_label: Some("API Key"),
        default_secondary_label: None,
        domains: &[
            "googleapis.com",
            "googleusercontent.com",
            "cloud.google.com",
        ],
    },
    PresetSeed {
        slug: "anthropic",
        display_name: "Anthropic",
        docs_url: Some("https://docs.anthropic.com"),
        issue_url: Some("https://console.anthropic.com/settings/keys"),
        status_url: Some("https://status.anthropic.com"),
        security_feed_url: None,
        icon_key: "anthropic",
        default_primary_label: Some("API Key"),
        default_secondary_label: None,
        domains: &["anthropic.com", "claude.ai"],
    },
    PresetSeed {
        slug: "paddle",
        display_name: "Paddle",
        docs_url: Some("https://developer.paddle.com"),
        issue_url: Some("https://vendors.paddle.com/authentication"),
        status_url: Some("https://status.paddle.com"),
        security_feed_url: None,
        icon_key: "paddle",
        default_primary_label: Some("API Key"),
        default_secondary_label: None,
        domains: &["paddle.com"],
    },
    PresetSeed {
        slug: "cloudflare",
        display_name: "Cloudflare",
        docs_url: Some("https://developers.cloudflare.com/api"),
        issue_url: Some("https://dash.cloudflare.com/profile/api-tokens"),
        status_url: Some("https://www.cloudflarestatus.com"),
        security_feed_url: Some("https://www.cloudflarestatus.com/history.rss"),
        icon_key: "cloudflare",
        default_primary_label: Some("API Key"),
        default_secondary_label: None,
        domains: &[
            "cloudflare.com",
            "cloudflare.dev",
            "workers.dev",
            "pages.dev",
        ],
    },
];

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/// Upsert 10 built-in issuer presets into the `issuer` table using
/// `INSERT OR IGNORE`.
///
/// Safe to call on every app launch (idempotent).
/// Returns the number of rows actually inserted (0 when all already exist).
pub async fn seed_issuer_presets(pool: &SqlitePool) -> Result<u64, StorageError> {
    let now_dt = OffsetDateTime::now_utc();
    let now = now_dt.unix_timestamp() * 1000 + (now_dt.nanosecond() as i64 / 1_000_000);
    let mut inserted = 0u64;

    for p in &PRESETS {
        let id = IssuerId::new().to_string();

        let domains_json = serde_json::to_string(p.domains).unwrap_or_else(|_| "[]".to_string());
        let res = sqlx::query(
            r#"INSERT OR IGNORE INTO issuer
               (id, slug, display_name, docs_url, issue_url, status_url,
                security_feed_url, connector_id, icon_key,
                default_primary_label, default_secondary_label,
                domains, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&id)
        .bind(p.slug)
        .bind(p.display_name)
        .bind(p.docs_url)
        .bind(p.issue_url)
        .bind(p.status_url)
        .bind(p.security_feed_url)
        .bind(p.icon_key)
        .bind(p.default_primary_label)
        .bind(p.default_secondary_label)
        .bind(domains_json)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await?;

        inserted += res.rows_affected();
    }

    Ok(inserted)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use api_vault_storage::sqlite::repositories::issuer::IssuerRepo;

    /// Creates a temporary SQLite pool with migrations applied.
    async fn make_pool() -> (SqlitePool, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = api_vault_storage::sqlite::init_pool(&db_path)
            .await
            .expect("init_pool");
        (pool, dir)
    }

    #[tokio::test]
    async fn seed_inserts_10_presets() {
        let (pool, _dir) = make_pool().await;

        let inserted = seed_issuer_presets(&pool).await.expect("seed");
        assert_eq!(inserted, 10, "first run should insert exactly 10 rows");

        let repo = IssuerRepo::new(&pool);
        let list = repo.list().await.expect("list");
        assert_eq!(list.len(), 10, "issuer table should contain 10 rows");
    }

    #[tokio::test]
    async fn seed_is_idempotent() {
        let (pool, _dir) = make_pool().await;

        let first = seed_issuer_presets(&pool).await.expect("first seed");
        assert_eq!(first, 10);

        let second = seed_issuer_presets(&pool).await.expect("second seed");
        assert_eq!(second, 0, "second run should insert 0 rows (all exist)");

        let repo = IssuerRepo::new(&pool);
        let list = repo.list().await.expect("list");
        assert_eq!(list.len(), 10, "count must still be 10 after second seed");
    }

    #[tokio::test]
    async fn seed_slug_set_matches_expected() {
        let (pool, _dir) = make_pool().await;
        seed_issuer_presets(&pool).await.expect("seed");

        let repo = IssuerRepo::new(&pool);
        let list = repo.list().await.expect("list");

        let slugs: std::collections::HashSet<String> = list.into_iter().map(|i| i.slug).collect();

        let expected: std::collections::HashSet<String> = [
            "openai",
            "stripe",
            "github",
            "aws",
            "vercel",
            "supabase",
            "google",
            "anthropic",
            "paddle",
            "cloudflare",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();

        assert_eq!(slugs, expected);
    }
}
