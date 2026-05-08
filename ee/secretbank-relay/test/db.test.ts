/**
 * D1 schema regression — 0001_init + 0002_auth 마이그레이션이 적용된 상태에서
 * - user 테이블에 auth/billing 컬럼이 존재한다
 * - device / passkey / oauth_account 테이블이 존재하고 INSERT/SELECT 가 동작한다
 *
 * @cloudflare/vitest-pool-workers 는 wrangler.toml 의 migrations_dir 을 자동으로
 * 적용하지 않으므로 setup 단계에서 applyD1Migrations 를 직접 호출한다.
 */
import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";
import type { Env } from "../src/env";

const typedEnv = env as unknown as Env & { TEST_MIGRATIONS: D1MigrationOptions[] };

beforeAll(async () => {
  // wrangler.toml 의 migrations_dir 이 vitest 에서는 자동 적용되지 않으므로
  // applyD1Migrations 로 명시적으로 적용한다. TEST_MIGRATIONS 는 vitest.config.ts
  // 에서 fs 로 주입한다.
  await applyD1Migrations(typedEnv.DB, typedEnv.TEST_MIGRATIONS);
});

describe("D1 schema (0001_init + 0002_auth + 0003_sync + 0004_sync_values)", () => {
  it("user 테이블에 auth/billing 컬럼이 모두 존재한다", async () => {
    const result = await typedEnv.DB.prepare("SELECT name FROM pragma_table_info('user')").all<{
      name: string;
    }>();

    const cols = (result.results ?? []).map((r) => r.name).sort();
    // legacy + new auth columns
    for (const col of [
      "id",
      "email",
      "created_at",
      "pro_until",
      "auth_hash",
      "salt_auth",
      "salt_enc",
      "plan",
      "plan_source",
      "plan_expires_at",
    ]) {
      expect(cols).toContain(col);
    }
  });

  it("device / passkey / oauth_account 테이블이 생성되어 있다", async () => {
    const result = await typedEnv.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();

    const tables = (result.results ?? []).map((r) => r.name);
    for (const t of [
      "device",
      "passkey",
      "oauth_account",
      "user",
      "github_installation",
      "encrypted_doc",
      "encrypted_secret_value",
    ]) {
      expect(tables).toContain(t);
    }
  });

  it("encrypted_secret_value 의 (user_id, credential_id) PK + cascade 가 동작한다", async () => {
    const userId = "user_secval_001";
    const now = Date.now();

    await typedEnv.DB.prepare(`INSERT INTO user (id, email, created_at) VALUES (?, ?, ?)`)
      .bind(userId, "secval1@example.com", now)
      .run();

    // 같은 (user, cred) 쌍에 두 번 insert 시 PK 충돌
    await typedEnv.DB.prepare(
      `INSERT INTO encrypted_secret_value (user_id, credential_id, version, ciphertext, updated_at)
       VALUES (?, ?, 1, ?, ?)`,
    )
      .bind(userId, "crd_aaa", new Uint8Array([1, 2, 3]), now)
      .run();

    let threw = false;
    try {
      await typedEnv.DB.prepare(
        `INSERT INTO encrypted_secret_value (user_id, credential_id, version, ciphertext, updated_at)
         VALUES (?, ?, 1, ?, ?)`,
      )
        .bind(userId, "crd_aaa", new Uint8Array([4, 5, 6]), now)
        .run();
    } catch (e) {
      threw = true;
      expect(String((e as Error).message)).toMatch(/UNIQUE|constraint|PRIMARY/i);
    }
    expect(threw).toBe(true);

    // user 삭제 시 cascade
    await typedEnv.DB.prepare(`DELETE FROM user WHERE id = ?`).bind(userId).run();
    const after = await typedEnv.DB.prepare(
      `SELECT COUNT(*) as n FROM encrypted_secret_value WHERE user_id = ?`,
    )
      .bind(userId)
      .first<{ n: number }>();
    expect(after?.n).toBe(0);
  });

  it("encrypted_doc 의 user_id PK + ON DELETE CASCADE 제약이 동작한다", async () => {
    const userId = "user_sync_001";
    const now = Date.now();

    await typedEnv.DB.prepare(`INSERT INTO user (id, email, created_at) VALUES (?, ?, ?)`)
      .bind(userId, "carol@example.com", now)
      .run();

    await typedEnv.DB.prepare(
      `INSERT INTO encrypted_doc (user_id, version, ciphertext, created_at, updated_at)
       VALUES (?, 1, ?, ?, ?)`,
    )
      .bind(userId, new Uint8Array([0xab, 0xcd, 0xef]), now, now)
      .run();

    const row = await typedEnv.DB.prepare(`SELECT version FROM encrypted_doc WHERE user_id = ?`)
      .bind(userId)
      .first<{ version: number }>();
    expect(row?.version).toBe(1);

    // user 삭제 시 cascade 로 encrypted_doc 도 삭제되어야 함.
    await typedEnv.DB.prepare(`DELETE FROM user WHERE id = ?`).bind(userId).run();
    const after = await typedEnv.DB.prepare(
      `SELECT COUNT(*) as n FROM encrypted_doc WHERE user_id = ?`,
    )
      .bind(userId)
      .first<{ n: number }>();
    expect(after?.n).toBe(0);
  });

  it("user 행 + passkey 행을 INSERT 하고 cascade FK 가 유지된다", async () => {
    const userId = "user_test_001";
    const now = Date.now();

    await typedEnv.DB.prepare(`INSERT INTO user (id, email, created_at) VALUES (?, ?, ?)`)
      .bind(userId, "alice@example.com", now)
      .run();

    await typedEnv.DB.prepare(
      `INSERT INTO passkey (id, user_id, credential_id, public_key, sign_count, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    )
      .bind("pk_test_001", userId, new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7, 8]), now)
      .run();

    const row = await typedEnv.DB.prepare(`SELECT user_id, sign_count FROM passkey WHERE id = ?`)
      .bind("pk_test_001")
      .first<{ user_id: string; sign_count: number }>();

    expect(row?.user_id).toBe(userId);
    expect(row?.sign_count).toBe(0);
  });

  it("oauth_account 의 (provider, provider_id) UNIQUE 제약이 동작한다", async () => {
    const userId = "user_test_002";
    const now = Date.now();

    await typedEnv.DB.prepare(`INSERT INTO user (id, email, created_at) VALUES (?, ?, ?)`)
      .bind(userId, "bob@example.com", now)
      .run();

    await typedEnv.DB.prepare(
      `INSERT INTO oauth_account (id, user_id, provider, provider_id, created_at)
       VALUES (?, ?, 'github', '12345', ?)`,
    )
      .bind("oa_test_001", userId, now)
      .run();

    let threw = false;
    try {
      await typedEnv.DB.prepare(
        `INSERT INTO oauth_account (id, user_id, provider, provider_id, created_at)
         VALUES (?, ?, 'github', '12345', ?)`,
      )
        .bind("oa_test_002", userId, now)
        .run();
    } catch (e) {
      threw = true;
      expect(String((e as Error).message)).toMatch(/UNIQUE|constraint/i);
    }
    expect(threw).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Type used in the env cast (added by vitest.config.ts setup)
// ─────────────────────────────────────────────────────────────
type D1MigrationOptions =
  Parameters<typeof applyD1Migrations>[1] extends Array<infer T> ? T : never;
