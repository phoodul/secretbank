/**
 * Standalone Playwright config for site/ smoke. Assumes site is already
 * served at http://localhost:4173 (run `npx http-server site -p 4173` first).
 * Kept separate so the regular E2E run never touches GitHub API.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /.*site-download\.spec\.ts$/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { trace: "off", screenshot: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
