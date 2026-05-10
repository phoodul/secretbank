// @vitest-environment node
// @file tests/web-ext/build-smoke.test.ts
// @license AGPL-3.0-or-later
//
// F-4: Firefox build smoke test (옵션 D).
//
// Firefox 풀 E2E (Selenium/web-ext run) 는 Phase F-2 (Safari/Edge 정비 시) 에서 구현.
// 여기서는 `wxt build --browser firefox` 산출물이 올바른지 검증한다:
//   1. dist/firefox-mv2/ 폴더 존재
//   2. manifest.json 파싱 가능 + 필수 필드 존재
//   3. 주요 entry 파일 (background/popup/content) 존재
//
// 빌드를 이미 CI 에서 수행한 경우 SKIP_FIREFOX_BUILD=true 로 재빌드 생략 가능.

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** extension/ 루트 경로 */
const EXT_ROOT = path.resolve(__dirname, "../../");

/** Firefox MV2 빌드 출력 경로 */
const FIREFOX_DIST = path.join(EXT_ROOT, "dist", "firefox-mv2");

/** 빌드 스킵 여부 — CI에서 별도 step 으로 빌드했을 때 사용 */
const SKIP_BUILD = process.env["SKIP_FIREFOX_BUILD"] === "true";

// ---------------------------------------------------------------------------
// beforeAll: Firefox 빌드 실행 (SKIP_BUILD=false 일 때만)
// ---------------------------------------------------------------------------

beforeAll(
  () => {
    if (SKIP_BUILD) {
      console.info("[build-smoke] SKIP_FIREFOX_BUILD=true — 빌드 건너뜀");
      return;
    }

    console.info("[build-smoke] wxt build --browser firefox 실행 중...");
    try {
      execSync("pnpm build:firefox", {
        cwd: EXT_ROOT,
        stdio: "pipe",
        timeout: 120_000, // 2분
      });
      console.info("[build-smoke] 빌드 완료");
    } catch (err: unknown) {
      const error = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
      const stderr = error.stderr?.toString() ?? "";
      const stdout = error.stdout?.toString() ?? "";
      throw new Error(`Firefox 빌드 실패:\nstdout: ${stdout}\nstderr: ${stderr}`);
    }
  },
  150_000, // beforeAll timeout: 2.5분
);

// ---------------------------------------------------------------------------
// dist/firefox-mv2 폴더 존재
// ---------------------------------------------------------------------------

describe("Firefox MV2 dist 폴더", () => {
  it("dist/firefox-mv2/ 폴더가 존재한다", () => {
    expect(fs.existsSync(FIREFOX_DIST), `${FIREFOX_DIST} 가 없음`).toBe(true);
  });

  it("dist/firefox-mv2/ 는 디렉토리다", () => {
    const stat = fs.statSync(FIREFOX_DIST);
    expect(stat.isDirectory()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// manifest.json 검증
// ---------------------------------------------------------------------------

describe("manifest.json 존재 및 파싱", () => {
  const manifestPath = path.join(FIREFOX_DIST, "manifest.json");

  it("manifest.json 파일이 존재한다", () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it("manifest.json 이 유효한 JSON 이다", () => {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("manifest_version 이 2 이다 (Firefox MV2 빌드)", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.manifest_version).toBe(2);
  });

  it("name 필드가 존재한다", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(typeof manifest.name).toBe("string");
    expect(manifest.name.length).toBeGreaterThan(0);
  });

  it("version 필드가 존재한다", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(typeof manifest.version).toBe("string");
    expect(manifest.version.length).toBeGreaterThan(0);
  });

  it("permissions 배열이 존재한다", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(Array.isArray(manifest.permissions)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 주요 entry 파일 존재 확인
// ---------------------------------------------------------------------------

describe("주요 entry 파일 존재", () => {
  it("popup.html 이 존재한다", () => {
    const p = path.join(FIREFOX_DIST, "popup.html");
    expect(fs.existsSync(p), "popup.html 없음").toBe(true);
  });

  it("content-scripts/ 디렉토리가 존재한다", () => {
    const p = path.join(FIREFOX_DIST, "content-scripts");
    expect(fs.existsSync(p), "content-scripts/ 없음").toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it("content-main.js (MAIN world) 가 존재한다", () => {
    // MAIN world content script — wxt 빌드 시 content-scripts/ 또는 루트에 위치
    const inDir = path.join(FIREFOX_DIST, "content-scripts", "content-main.js");
    const inRoot = path.join(FIREFOX_DIST, "content-main.js");
    const exists = fs.existsSync(inDir) || fs.existsSync(inRoot);
    expect(exists, "content-main.js 없음 (content-scripts/ 및 루트 모두 확인)").toBe(true);
  });

  it("content.js (ISOLATED world) 가 content-scripts/ 에 존재한다", () => {
    const p = path.join(FIREFOX_DIST, "content-scripts", "content.js");
    expect(fs.existsSync(p), "content-scripts/content.js 없음").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// browser_action (MV2 popup 등록 방식) 검증
// ---------------------------------------------------------------------------

describe("browser_action (MV2 popup)", () => {
  it("browser_action 필드가 존재한다 (MV2 popup 등록)", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(FIREFOX_DIST, "manifest.json"), "utf-8"));
    // MV2: browser_action 또는 page_action
    const hasAction = "browser_action" in manifest || "page_action" in manifest;
    expect(hasAction).toBe(true);
  });

  it("browser_action.default_popup 이 popup.html 을 가리킨다", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(FIREFOX_DIST, "manifest.json"), "utf-8"));
    const popup = manifest.browser_action?.default_popup ?? manifest.page_action?.default_popup;
    expect(popup).toBeTruthy();
    // popup.html 또는 경로 포함 여부 확인
    expect(String(popup)).toContain("popup");
  });
});
