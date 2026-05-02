/**
 * Demo capture 전용 Playwright config — `pnpm capture:demo` 가 사용.
 *
 * playwright.config.ts 와 분리한 이유:
 * - 일반 E2E 는 demo.spec.ts 를 testIgnore 로 제외
 * - demo capture 는 demo.spec.ts 만 실행, video 자동 녹화
 *
 * webServer 는 base config 와 동일 (vite dev server).
 */
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 5173);

export default defineConfig({
  testDir: ".",
  testMatch: /.*demo\.spec\.ts$/,
  timeout: 120_000, // demo 시나리오는 2-15초 대기 포함, 여유롭게
  expect: { timeout: 5_000 },
  fullyParallel: false, // 비디오 출력 안정성 위해 순차 실행
  retries: 0,
  workers: 1,
  reporter: "list",

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    screenshot: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `node ${path.join("node_modules", "vite", "bin", "vite.js")} --port ${PORT} --strictPort`,
    cwd: REPO_ROOT,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
