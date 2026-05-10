// @file playwright.config.ts
// @license AGPL-3.0-or-later
//
// Playwright E2E 설정 — Secretbank 브라우저 확장 (Chromium 전용, F-3).
//
// Manifest V3 unpacked extension 로딩 제약:
//   - headless 모드 미지원 (service worker 필요) → headless: false
//   - --load-extension 은 Chrome / Chromium stable 에서만 지원
//   - workers: 1 — extension context 는 직렬 실행
//
// Firefox E2E (F-4) 는 web-ext 기반 별도 워크플로우.

import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Chromium MV3 빌드 결과 경로 (wxt build --browser chromium → dist/chromium-mv3)
const EXTENSION_PATH = path.resolve(__dirname, "dist/chromium-mv3");

export default defineConfig({
  // e2e 폴더만 포함 (vitest 와 분리)
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",

  // timeout — extension service worker 부팅 시간 고려
  timeout: 60_000,

  // extension context 는 직렬 실행 필수
  workers: 1,
  fullyParallel: false,

  reporter: [
    ["list"],
    // GitHub Actions 환경에서만 GitHub reporter 활성화
    ...(process.env.CI ? [["github"] as ["github"]] : []),
  ],

  // 전체 재시도: CI 에서 flakiness 완충
  retries: process.env.CI ? 1 : 0,

  use: {
    // 스크린샷/영상은 실패 시만
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium-extension",
      use: {
        // Chromium headful (MV3 service worker 필요)
        ...devices["Desktop Chrome"],
        channel: undefined, // Playwright 내장 Chromium 사용
        headless: false,
        // launchOptions / args 는 fixtures.ts 의 context fixture 에서
        // chromium.launchPersistentContext(userDataDir, { args }) 로 전달.
        // (Playwright 1.54+ 는 --user-data-dir 를 launch args 로 reject.)
      },
    },
  ],

  // 전역 설정 (user-data-dir 임시 디렉토리 생성 등)
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",

  // 빌드 사전 단계 — 테스트 전 Chromium MV3 빌드 확인
  // (CI 에서는 별도 step 에서 빌드 후 실행하므로 여기서는 skip)
  // webServer 는 fixtures.ts 에서 직접 Node http server 로 관리
});
