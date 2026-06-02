import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// download-proxy 는 D1/KV 바인딩 없음 — 단순 fetch proxy
// wrangler.toml 의 routes 설정만 참조하여 Worker 환경 구성
// vitest v4 + pool-workers 0.16: defineWorkersConfig → cloudflareTest 플러그인
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
    }),
  ],
});
