// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// T-24-E-E2: issuer_recipes 테이블 CRUD.
//
// 도메인 별 password 생성 레시피를 조회/저장한다.
// 우선순위: preset > user > heuristic (RecipeSource::priority 기준).
// TM-EXT-ACTOR: silent 등록은 audit log 1건 기록 후 이 repo 에 저장.

use secretbank_core::{IssuerRecipe, RecipeSource, StoredRecipe};
use sqlx::{Row, SqlitePool};
use time::OffsetDateTime;

use crate::sqlite::{dt_to_ms, StorageError};

pub struct IssuerRecipeRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> IssuerRecipeRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    // -------------------------------------------------------------------------
    // 조회
    // -------------------------------------------------------------------------

    /// 도메인에 대해 가장 높은 우선순위(source = preset > user > heuristic)의 레시피를 반환한다.
    ///
    /// 레시피가 없으면 `None` 반환 → 호출자가 heuristic fallback 적용.
    pub async fn get_best_for_domain(
        &self,
        domain: &str,
    ) -> Result<Option<StoredRecipe>, StorageError> {
        // preset → user → heuristic 우선순위로 한 번에 조회.
        // source 컬럼의 CASE 정렬로 우선순위를 표현한다.
        let row = sqlx::query(
            r#"SELECT domain, recipe_json, source, updated_at
               FROM issuer_recipes
               WHERE domain = ?
               ORDER BY CASE source
                   WHEN 'preset'    THEN 0
                   WHEN 'user'      THEN 1
                   WHEN 'heuristic' THEN 2
                   ELSE 3
               END ASC
               LIMIT 1"#,
        )
        .bind(domain)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_stored(&r)).transpose()
    }

    /// 특정 source 의 레시피를 조회한다.
    pub async fn get_by_domain_and_source(
        &self,
        domain: &str,
        source: RecipeSource,
    ) -> Result<Option<StoredRecipe>, StorageError> {
        let row = sqlx::query(
            r#"SELECT domain, recipe_json, source, updated_at
               FROM issuer_recipes
               WHERE domain = ? AND source = ?"#,
        )
        .bind(domain)
        .bind(source.as_str())
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_stored(&r)).transpose()
    }

    // -------------------------------------------------------------------------
    // 저장 (upsert)
    // -------------------------------------------------------------------------

    /// 레시피를 upsert 한다.
    ///
    /// 같은 (domain, source) 조합이 이미 있으면 덮어쓴다.
    /// TM-EXT-ACTOR: caller 가 audit log 1건 기록 후 이 메서드를 호출해야 한다.
    pub async fn upsert(
        &self,
        domain: &str,
        source: RecipeSource,
        recipe: &IssuerRecipe,
    ) -> Result<(), StorageError> {
        let recipe_json =
            serde_json::to_string(recipe).map_err(|e| StorageError::Parse(e.to_string()))?;
        let now = dt_to_ms(OffsetDateTime::now_utc());

        sqlx::query(
            r#"INSERT INTO issuer_recipes (domain, recipe_json, source, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(domain, source) DO UPDATE SET
                   recipe_json = excluded.recipe_json,
                   updated_at  = excluded.updated_at"#,
        )
        .bind(domain)
        .bind(&recipe_json)
        .bind(source.as_str())
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    /// 도메인의 특정 source 레시피를 삭제한다 (사용자 삭제 경로).
    pub async fn delete(&self, domain: &str, source: RecipeSource) -> Result<(), StorageError> {
        sqlx::query("DELETE FROM issuer_recipes WHERE domain = ? AND source = ?")
            .bind(domain)
            .bind(source.as_str())
            .execute(self.pool)
            .await?;

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Row → StoredRecipe 변환
// ---------------------------------------------------------------------------

fn row_to_stored(r: &sqlx::sqlite::SqliteRow) -> Result<StoredRecipe, StorageError> {
    let domain: String = r.try_get("domain")?;
    let recipe_json: String = r.try_get("recipe_json")?;
    let source_str: String = r.try_get("source")?;
    let updated_at: i64 = r.try_get("updated_at")?;

    let recipe: IssuerRecipe = serde_json::from_str(&recipe_json)
        .map_err(|e| StorageError::Parse(format!("recipe_json 파싱 실패: {e}")))?;

    let source = RecipeSource::try_from_str(&source_str)
        .ok_or_else(|| StorageError::Parse(format!("알 수 없는 source: {source_str}")))?;

    Ok(StoredRecipe {
        domain,
        source,
        recipe,
        updated_at,
    })
}

// ---------------------------------------------------------------------------
// 단위 테스트
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sqlite::init_pool;

    async fn make_pool() -> (SqlitePool, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.expect("init_pool");
        (pool, dir)
    }

    fn sample_recipe(min: u32, max: u32) -> IssuerRecipe {
        IssuerRecipe {
            min,
            max,
            uppercase: 1,
            number: 1,
            special: 0,
            forbidden: String::new(),
        }
    }

    // ── IR-T1: upsert + get_best_for_domain round-trip ──────────────────────
    #[tokio::test]
    async fn ir_t1_upsert_and_get_best() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRecipeRepo::new(&pool);

        let recipe = sample_recipe(8, 32);
        repo.upsert("github.com", RecipeSource::User, &recipe)
            .await
            .expect("upsert");

        let found = repo
            .get_best_for_domain("github.com")
            .await
            .expect("get_best")
            .expect("Some");

        assert_eq!(found.domain, "github.com");
        assert_eq!(found.source, RecipeSource::User);
        assert_eq!(found.recipe.min, 8);
        assert_eq!(found.recipe.max, 32);
    }

    // ── IR-T2: 없는 도메인 → None ──────────────────────────────────────────
    #[tokio::test]
    async fn ir_t2_missing_domain_returns_none() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRecipeRepo::new(&pool);

        let result = repo
            .get_best_for_domain("nope.example.com")
            .await
            .expect("get_best");

        assert!(result.is_none());
    }

    // ── IR-T3: preset 우선 — preset + heuristic 있을 때 preset 반환 ────────
    #[tokio::test]
    async fn ir_t3_preset_wins_over_heuristic() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRecipeRepo::new(&pool);

        repo.upsert("stripe.com", RecipeSource::Heuristic, &sample_recipe(6, 20))
            .await
            .expect("upsert heuristic");
        repo.upsert("stripe.com", RecipeSource::Preset, &sample_recipe(12, 64))
            .await
            .expect("upsert preset");

        let best = repo
            .get_best_for_domain("stripe.com")
            .await
            .expect("get_best")
            .expect("Some");

        assert_eq!(best.source, RecipeSource::Preset, "preset 우선이어야 한다");
        assert_eq!(best.recipe.min, 12);
    }

    // ── IR-T4: user 이 heuristic 보다 우선 ─────────────────────────────────
    #[tokio::test]
    async fn ir_t4_user_wins_over_heuristic() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRecipeRepo::new(&pool);

        repo.upsert("openai.com", RecipeSource::Heuristic, &sample_recipe(6, 20))
            .await
            .expect("upsert heuristic");
        repo.upsert("openai.com", RecipeSource::User, &sample_recipe(16, 48))
            .await
            .expect("upsert user");

        let best = repo
            .get_best_for_domain("openai.com")
            .await
            .expect("get_best")
            .expect("Some");

        assert_eq!(
            best.source,
            RecipeSource::User,
            "user 이 heuristic 보다 우선"
        );
        assert_eq!(best.recipe.min, 16);
    }

    // ── IR-T5: upsert 은 같은 (domain, source) 를 업데이트한다 ─────────────
    #[tokio::test]
    async fn ir_t5_upsert_overwrites_same_source() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRecipeRepo::new(&pool);

        repo.upsert("aws.com", RecipeSource::User, &sample_recipe(8, 32))
            .await
            .expect("first upsert");
        repo.upsert("aws.com", RecipeSource::User, &sample_recipe(20, 64))
            .await
            .expect("second upsert");

        let found = repo
            .get_by_domain_and_source("aws.com", RecipeSource::User)
            .await
            .expect("get")
            .expect("Some");

        assert_eq!(found.recipe.min, 20, "덮어쓰기 후 새 min");
    }

    // ── IR-T6: delete 후 get_best → None ──────────────────────────────────
    #[tokio::test]
    async fn ir_t6_delete_removes_recipe() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRecipeRepo::new(&pool);

        repo.upsert("twilio.com", RecipeSource::User, &sample_recipe(10, 40))
            .await
            .expect("upsert");
        repo.delete("twilio.com", RecipeSource::User)
            .await
            .expect("delete");

        let result = repo
            .get_best_for_domain("twilio.com")
            .await
            .expect("get_best");

        assert!(result.is_none(), "삭제 후 None 이어야 한다");
    }
}
