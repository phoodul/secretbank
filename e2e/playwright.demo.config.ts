/**
 * Demo capture 전용 Playwright config — `pnpm capture:demo` 가 사용.
 *
 * webServer 는 vite preview (production build) — Vite dev server 의 cold start
 * 가 14초+ 걸려 영상 첫 frame 까지 흰 화면이 길게 나오던 문제 해결. preview
 * 모드는 미리 build 된 chunks 를 serve 하므로 첫 mount < 1초.
 *
 * 사전 조건: capture-demo.ts 가 vite build 를 먼저 실행한다.
 */
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4174);

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
    // production build 의 chunks 를 serve. capture-demo.ts 가 build 보장.
    command: `node ${path.join("node_modules", "vite", "bin", "vite.js")} preview --port ${PORT} --strictPort`,
    cwd: REPO_ROOT,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
