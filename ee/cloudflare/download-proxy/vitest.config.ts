import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// download-proxy 는 D1/KV 바인딩 없음 — 단순 fetch proxy
// wrangler.toml 의 routes 설정만 참조하여 Worker 환경 구성
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
