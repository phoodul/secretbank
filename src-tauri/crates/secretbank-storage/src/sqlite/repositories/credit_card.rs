//! CreditCardMetaRepo — `credit_card_meta` 테이블 CRUD.
//!
//! # 설계 원칙
//! - `last_4` / brand / expiry / cardholder_name / billing_address 만 평문 저장.
//! - 카드번호 / CVC / PIN 은 age vault 에 별도 경로 저장 (3-A-5 구현).
//! - `credential` 테이블 ON DELETE CASCADE 로 credential 삭제 시 자동 정리됨.
//!   명시적 `delete()` 도 제공 (정책 일관성).

use sqlx::Row;

use secretbank_core::models::credit_card::{CardBrand, CreditCardMeta};
use secretbank_core::CredentialId;

use crate::sqlite::{SqlitePool, StorageError};

// ---------------------------------------------------------------------------
// CreditCardMetaRepo
// ---------------------------------------------------------------------------

pub struct CreditCardMetaRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> CreditCardMetaRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    /// 신규 메타데이터 삽입. 동일 `credential_id` 가 이미 있으면 UNIQUE constraint 위반.
    ///
    /// `now`: ISO8601 문자열 (예: "2026-05-07T12:00:00Z")
    pub async fn insert(&self, meta: &CreditCardMeta, now: &str) -> Result<(), StorageError> {
        sqlx::query(
            r#"INSERT INTO credit_card_meta
               (credential_id, brand, expiry_month, expiry_year,
                cardholder_name, billing_address, last_4, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(meta.credential_id.to_string())
        .bind(meta.brand.as_str())
        .bind(meta.expiry_month as i64)
        .bind(meta.expiry_year as i64)
        .bind(meta.cardholder_name.as_deref())
        .bind(meta.billing_address.as_deref())
        .bind(meta.last_4.as_str())
        .bind(now)
        .bind(now)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    /// `credential_id` 로 단건 조회. 없으면 `None`.
    pub async fn get_by_credential(
        &self,
        credential_id: &str,
    ) -> Result<Option<CreditCardMeta>, StorageError> {
        let row = sqlx::query(
            r#"SELECT credential_id, brand, expiry_month, expiry_year,
                      cardholder_name, billing_address, last_4
               FROM credit_card_meta
               WHERE credential_id = ?"#,
        )
        .bind(credential_id)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_meta(&r)).transpose()
    }

    /// 전체 신용카드 메타 목록 (vault unlock 후 list 화면용).
    pub async fn list_all(&self) -> Result<Vec<CreditCardMeta>, StorageError> {
        let rows = sqlx::query(
            r#"SELECT credential_id, brand, expiry_month, expiry_year,
                      cardholder_name, billing_address, last_4
               FROM credit_card_meta
               ORDER BY credential_id"#,
        )
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_meta).collect()
    }

    /// 메타데이터 업데이트 (brand / expiry / cardholder_name / billing_address / last_4).
    ///
    /// 반환값: 영향받은 행 수 (0 = 해당 credential 없음).
    pub async fn update(&self, meta: &CreditCardMeta, now: &str) -> Result<u64, StorageError> {
        let result = sqlx::query(
            r#"UPDATE credit_card_meta
               SET brand = ?, expiry_month = ?, expiry_year = ?,
                   cardholder_name = ?, billing_address = ?, last_4 = ?,
                   updated_at = ?
               WHERE credential_id = ?"#,
        )
        .bind(meta.brand.as_str())
        .bind(meta.expiry_month as i64)
        .bind(meta.expiry_year as i64)
        .bind(meta.cardholder_name.as_deref())
        .bind(meta.billing_address.as_deref())
        .bind(meta.last_4.as_str())
        .bind(now)
        .bind(meta.credential_id.to_string())
        .execute(self.pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// 명시적 삭제. ON DELETE CASCADE 가 처리하지만 별도 호출 가능.
    ///
    /// 반환값: 삭제된 행 수.
    pub async fn delete(&self, credential_id: &str) -> Result<u64, StorageError> {
        let result = sqlx::query("DELETE FROM credit_card_meta WHERE credential_id = ?")
            .bind(credential_id)
            .execute(self.pool)
            .await?;
        Ok(result.rows_affected())
    }
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

fn row_to_meta(row: &sqlx::sqlite::SqliteRow) -> Result<CreditCardMeta, StorageError> {
    let cred_id_str: String = row.try_get("credential_id")?;
    let credential_id: CredentialId = cred_id_str
        .parse()
        .map_err(|e| StorageError::Parse(format!("invalid credential_id ULID: {e}")))?;

    let brand_str: String = row.try_get("brand")?;
    let brand = CardBrand::from_str_safe(&brand_str);

    let expiry_month: i64 = row.try_get("expiry_month")?;
    let expiry_year: i64 = row.try_get("expiry_year")?;

    Ok(CreditCardMeta {
        credential_id,
        brand,
        expiry_month: expiry_month as u8,
        expiry_year: expiry_year as u16,
        cardholder_name: row.try_get("cardholder_name")?,
        billing_address: row.try_get("billing_address")?,
        last_4: row.try_get("last_4")?,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sqlite::init_pool;
    use crate::sqlite::repositories::credential::CredentialRepo;
    use crate::sqlite::repositories::issuer::IssuerRepo;
    use secretbank_core::{CredentialInput, Env, IssuerInput};
    use tempfile::tempdir;

    async fn make_pool() -> (tempfile::TempDir, SqlitePool) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.unwrap();
        (dir, pool)
    }

    async fn insert_credential(pool: &SqlitePool, suffix: &str) -> CredentialId {
        let issuer_repo = IssuerRepo::new(pool);
        let issuer_id = issuer_repo
            .insert(&IssuerInput {
                slug: format!("issuer-{suffix}"),
                display_name: format!("Issuer {suffix}"),
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
            .unwrap();

        let cred_repo = CredentialRepo::new(pool);
        cred_repo
            .insert(
                &CredentialInput {
                    issuer_id,
                    name: format!("card-{suffix}"),
                    env: Env::Prod,
                    scope: None,
                    owner: None,
                    rotation_policy_days: None,
                    rotation_runbook_id: None,
                    expires_at: None,
                    hash_hint: Some("4242".to_string()),
                    kind: secretbank_core::CredentialKind::CreditCard,
                    url: None,
                    username: None,
                    primary_label: None,
                    secondary_label: None,
                    custom_kind_label: None,
                },
                format!("vault/credit_cards/card-{suffix}"),
            )
            .await
            .unwrap()
    }

    fn make_meta(credential_id: CredentialId) -> CreditCardMeta {
        CreditCardMeta {
            credential_id,
            brand: CardBrand::Visa,
            expiry_month: 12,
            expiry_year: 2028,
            cardholder_name: Some("Alice".to_string()),
            billing_address: None,
            last_4: "4242".to_string(),
        }
    }

    const NOW: &str = "2026-05-07T00:00:00Z";

    // CCM1: insert + get_by_credential
    #[tokio::test]
    async fn ccm1_insert_and_get() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ccm1").await;
        let repo = CreditCardMetaRepo::new(&pool);
        let meta = make_meta(cred_id);

        repo.insert(&meta, NOW).await.unwrap();

        let fetched = repo
            .get_by_credential(&cred_id.to_string())
            .await
            .unwrap()
            .expect("meta should exist");
        assert_eq!(fetched.brand, CardBrand::Visa);
        assert_eq!(fetched.expiry_month, 12);
        assert_eq!(fetched.expiry_year, 2028);
        assert_eq!(fetched.last_4, "4242");
        assert_eq!(fetched.cardholder_name.as_deref(), Some("Alice"));
        assert!(fetched.billing_address.is_none());
    }

    // CCM2: insert 후 list_all → 1개 반환
    #[tokio::test]
    async fn ccm2_list_all_returns_one() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ccm2").await;
        let repo = CreditCardMetaRepo::new(&pool);

        repo.insert(&make_meta(cred_id), NOW).await.unwrap();

        let list = repo.list_all().await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].last_4, "4242");
    }

    // CCM3: update brand/expiry → get_by_credential 변경 확인
    #[tokio::test]
    async fn ccm3_update_changes_fields() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ccm3").await;
        let repo = CreditCardMetaRepo::new(&pool);

        repo.insert(&make_meta(cred_id), NOW).await.unwrap();

        let updated = CreditCardMeta {
            credential_id: cred_id,
            brand: CardBrand::Mastercard,
            expiry_month: 6,
            expiry_year: 2030,
            cardholder_name: Some("Bob".to_string()),
            billing_address: Some("123 Main St".to_string()),
            last_4: "9999".to_string(),
        };
        let affected = repo.update(&updated, "2026-05-07T01:00:00Z").await.unwrap();
        assert_eq!(affected, 1);

        let fetched = repo
            .get_by_credential(&cred_id.to_string())
            .await
            .unwrap()
            .expect("meta should exist after update");
        assert_eq!(fetched.brand, CardBrand::Mastercard);
        assert_eq!(fetched.expiry_month, 6);
        assert_eq!(fetched.expiry_year, 2030);
        assert_eq!(fetched.last_4, "9999");
        assert_eq!(fetched.cardholder_name.as_deref(), Some("Bob"));
        assert_eq!(fetched.billing_address.as_deref(), Some("123 Main St"));
    }

    // CCM4: delete → get_by_credential None
    #[tokio::test]
    async fn ccm4_delete_returns_none() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ccm4").await;
        let repo = CreditCardMetaRepo::new(&pool);

        repo.insert(&make_meta(cred_id), NOW).await.unwrap();

        let deleted = repo.delete(&cred_id.to_string()).await.unwrap();
        assert_eq!(deleted, 1);

        let fetched = repo.get_by_credential(&cred_id.to_string()).await.unwrap();
        assert!(fetched.is_none());
    }

    // CCM5: credential 행 삭제 → CASCADE 로 credit_card_meta 도 삭제
    #[tokio::test]
    async fn ccm5_cascade_delete_on_credential() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ccm5").await;
        let repo = CreditCardMetaRepo::new(&pool);

        repo.insert(&make_meta(cred_id), NOW).await.unwrap();

        // credential 행 삭제
        sqlx::query("DELETE FROM credential WHERE id = ?")
            .bind(cred_id.to_string())
            .execute(&pool)
            .await
            .unwrap();

        let fetched = repo.get_by_credential(&cred_id.to_string()).await.unwrap();
        assert!(
            fetched.is_none(),
            "CASCADE 로 credit_card_meta 도 삭제되어야 함"
        );
    }

    // CCM6: last_4 필드 길이 — 4자리 저장/조회 확인 (모델 레벨 검증)
    #[tokio::test]
    async fn ccm6_last_4_is_four_chars() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ccm6").await;
        let repo = CreditCardMetaRepo::new(&pool);

        let meta = CreditCardMeta {
            credential_id: cred_id,
            brand: CardBrand::Amex,
            expiry_month: 3,
            expiry_year: 2026,
            cardholder_name: None,
            billing_address: None,
            last_4: "1005".to_string(), // Amex 마지막 4자리
        };
        repo.insert(&meta, NOW).await.unwrap();

        let fetched = repo
            .get_by_credential(&cred_id.to_string())
            .await
            .unwrap()
            .expect("meta should exist");
        assert_eq!(
            fetched.last_4.len(),
            4,
            "last_4 는 4자리여야 함: {:?}",
            fetched.last_4
        );
    }
}
