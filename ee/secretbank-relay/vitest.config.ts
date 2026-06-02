import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// D1 마이그레이션은 vitest-pool-workers 가 자동 적용하지 않으므로
// readD1Migrations 로 읽어 TEST_MIGRATIONS 바인딩에 주입하고
// 각 테스트에서 applyD1Migrations(env.DB, env.TEST_MIGRATIONS) 로 사용한다.
//
// vitest v4 + pool-workers 0.16: defineWorkersConfig(async () => ...) 가
// 제거되어 cloudflareTest 플러그인의 async 팩토리로 마이그레이션.
// 출처: https://developers.cloudflare.com/workers/testing/vitest-integration/
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrationsPath = path.join(__dirname, "migrations");
      const migrations = await readD1Migrations(migrationsPath);

      return {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // M8 Auth — fixture values override wrangler.toml [vars] 의 빈 값
            JWT_SIGNING_KEY: "test-jwt-signing-key-at-least-32-chars-long",
            GITHUB_OAUTH_CLIENT_ID: "test-github-client-id",
            GITHUB_OAUTH_CLIENT_SECRET: "test-github-client-secret",
            GOOGLE_OAUTH_CLIENT_ID: "test-google-client-id",
            GOOGLE_OAUTH_CLIENT_SECRET: "test-google-client-secret",
          },
        },
      };
    }),
  ],
});
