/**
 * Playwright config for API Vault E2E smoke tests.
 *
 * 본 설정은 **Vite dev server (browser-only)** 모드를 대상으로 한다 —
 * Tauri runtime 없이 React 앱만 부팅해 화면 전환·i18n·라우팅 회귀를 잡는다.
 * `invoke()` 는 `e2e/lib/tauri-mock.ts` 가 page.addInitScript 로 polyfill 한다.
 *
 * 진짜 Tauri 데스크톱 바이너리를 통한 E2E 는 별도 작업으로 분리:
 * - tauri-driver + Windows: msedgedriver.exe (`docs/runbooks/e2e-testing.md`)
 * - macOS / Linux: 각 OS 의 WebView 드라이버 필요
 * - 본 설정은 그 작업 진입 전까지 회귀 안전망 역할
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
  testMatch: /.*\.spec\.ts$/,
  // demo.spec.ts 는 marketing 영상 캡처 전용 — 일반 E2E 흐름에서 제외.
  // site-download.spec.ts 는 site/ landing 의 GitHub API 호출을 검증 — 별도
  // http-server + playwright.site.config.ts 로만 실행 (CI 의 일반 E2E 에서는 제외).
  testIgnore: /.*(demo|site-download)\.spec\.ts$/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // Spawn vite via node directly so we sidestep pnpm/npm/shell PATH lookup
    // on Windows. cwd is pinned to the repo root so the resolved path is
    // always the workspace's `node_modules/vite/bin/vite.js`.
    command: `node ${path.join("node_modules", "vite", "bin", "vite.js")} --port ${PORT} --strictPort`,
    cwd: REPO_ROOT,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
