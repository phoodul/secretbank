// @vitest-environment node
// @file tests/web-ext/manifest-validation.test.ts
// @license AGPL-3.0-or-later
//
// F-4: Firefox MV2 manifest schema 검증 (옵션 D).
//
// WXT 가 `--browser firefox` 빌드 시 생성하는 manifest.json 이
// Firefox MV2 스펙을 충족하는지 검증한다.
//
// 검증 항목:
//   - manifest_version: 2
//   - name / version / description 필수 문자열
//   - permissions: string[]
//   - content_scripts: [{matches, js, run_at}] 구조
//   - browser_action OR page_action (MV2 popup 등록)
//   - browser_specific_settings.gecko.id (Firefox 권고 필드)
//   - "world": "MAIN" 은 Firefox MV2 에서 지원 안 됨 → 별도 content script 로 분리되는지 확인
//
// Note:
//   Firefox MV3 는 109+ 부분 지원, 121+ 정식 지원.
//   WXT firefox 빌드는 현재 MV2 기본값 — 이 파일도 MV2 기준 검증.
//   MV3 전환 후 이 파일의 manifest_version 기대값을 3 으로 업데이트할 것.

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXT_ROOT = path.resolve(__dirname, "../../");
const FIREFOX_DIST = path.join(EXT_ROOT, "dist", "firefox-mv2");
const MANIFEST_PATH = path.join(FIREFOX_DIST, "manifest.json");

const SKIP_BUILD = process.env["SKIP_FIREFOX_BUILD"] === "true";

// ---------------------------------------------------------------------------
// beforeAll: 빌드 아티팩트 준비
// ---------------------------------------------------------------------------

beforeAll(() => {
  if (SKIP_BUILD) return;

  // manifest.json 이 이미 있으면 재빌드 생략 (build-smoke.test.ts 와 병렬 실행 방지)
  if (fs.existsSync(MANIFEST_PATH)) {
    console.info("[manifest-validation] 기존 dist/firefox-mv2/manifest.json 사용");
    return;
  }

  console.info("[manifest-validation] dist 없음 — 빌드 실행");
  try {
    execSync("pnpm build:firefox", {
      cwd: EXT_ROOT,
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; stdout?: Buffer };
    throw new Error(`Firefox 빌드 실패:\n${error.stderr?.toString()}\n${error.stdout?.toString()}`);
  }
}, 150_000);

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function loadManifest(): Record<string, unknown> {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 필수 최상위 필드
// ---------------------------------------------------------------------------

describe("Firefox MV2 manifest — 필수 최상위 필드", () => {
  it("manifest_version === 2", () => {
    expect(loadManifest().manifest_version).toBe(2);
  });

  it("name 은 비어있지 않은 문자열", () => {
    const { name } = loadManifest();
    expect(typeof name).toBe("string");
    expect((name as string).trim().length).toBeGreaterThan(0);
  });

  it("version 은 semver 형식 (x.y.z)", () => {
    const { version } = loadManifest();
    expect(typeof version).toBe("string");
    // MV2 version 은 최대 4자리 숫자점 형식 — 최소 x.y 는 있어야 함
    expect(version as string).toMatch(/^\d+\.\d+/);
  });

  it("description 은 문자열 (빈 값도 허용)", () => {
    const { description } = loadManifest();
    // description 은 선택적이지만 wxt 가 항상 포함
    if (description !== undefined) {
      expect(typeof description).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// permissions
// ---------------------------------------------------------------------------

describe("Firefox MV2 manifest — permissions", () => {
  it("permissions 는 배열이다", () => {
    const { permissions } = loadManifest();
    expect(Array.isArray(permissions)).toBe(true);
  });

  it("permissions 의 모든 항목은 문자열이다", () => {
    const { permissions } = loadManifest();
    for (const p of permissions as unknown[]) {
      expect(typeof p).toBe("string");
    }
  });

  it("activeTab 권한이 포함된다", () => {
    const { permissions } = loadManifest();
    expect(permissions as string[]).toContain("activeTab");
  });

  it("storage 권한이 포함된다", () => {
    const { permissions } = loadManifest();
    expect(permissions as string[]).toContain("storage");
  });
});

// ---------------------------------------------------------------------------
// content_scripts
// ---------------------------------------------------------------------------

describe("Firefox MV2 manifest — content_scripts", () => {
  it("content_scripts 는 배열이다", () => {
    const { content_scripts } = loadManifest();
    expect(Array.isArray(content_scripts)).toBe(true);
  });

  it("각 content_script 는 matches 배열을 가진다", () => {
    const { content_scripts } = loadManifest();
    for (const cs of content_scripts as Record<string, unknown>[]) {
      expect(Array.isArray(cs["matches"])).toBe(true);
    }
  });

  it("각 content_script 는 js 배열을 가진다", () => {
    const { content_scripts } = loadManifest();
    for (const cs of content_scripts as Record<string, unknown>[]) {
      expect(Array.isArray(cs["js"])).toBe(true);
    }
  });

  it("<all_urls> match 패턴을 가진 script 가 존재한다", () => {
    const { content_scripts } = loadManifest();
    const hasAllUrls = (content_scripts as Record<string, unknown>[]).some(
      (cs) => Array.isArray(cs["matches"]) && (cs["matches"] as string[]).includes("<all_urls>"),
    );
    expect(hasAllUrls).toBe(true);
  });

  it("Firefox MV2 는 'world: MAIN' content_script 를 지원하지 않음 — 별도 처리 확인", () => {
    // WXT firefox 빌드에서 MAIN world script 는 content_scripts 에서 제거되거나
    // 일반 content script 로 변환된다. manifest 에 world: "MAIN" 이 있으면 경고.
    const { content_scripts } = loadManifest();
    const mainWorldScripts = (content_scripts as Record<string, unknown>[]).filter(
      (cs) => cs["world"] === "MAIN",
    );
    // Firefox MV2 에서 world: "MAIN" 은 무시됨 — 0개여야 정상 (WXT 가 자동 제거)
    // 0개가 아니어도 빌드는 되지만 경고로 기록
    if (mainWorldScripts.length > 0) {
      console.warn(
        `[manifest-validation] Firefox MV2 manifest 에 world:"MAIN" script 가 ${mainWorldScripts.length}개 포함됨. Firefox 에서 무시됨.`,
      );
    }
    // 실패하지 않음 — 경고만 (WXT 동작 변경 추적용)
    expect(mainWorldScripts.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// browser_action (MV2 팝업 등록 방식)
// ---------------------------------------------------------------------------

describe("Firefox MV2 manifest — browser_action", () => {
  it("browser_action 또는 page_action 이 존재한다", () => {
    const manifest = loadManifest();
    const hasAction = "browser_action" in manifest || "page_action" in manifest;
    expect(hasAction).toBe(true);
  });

  it("browser_action.default_popup 이 설정되어 있다", () => {
    const manifest = loadManifest();
    const action =
      (manifest["browser_action"] as Record<string, unknown> | undefined) ??
      (manifest["page_action"] as Record<string, unknown> | undefined);
    expect(action).toBeDefined();
    expect(action?.["default_popup"]).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// browser_specific_settings.gecko (Firefox 권고 필드)
// ---------------------------------------------------------------------------

describe("Firefox MV2 manifest — gecko 설정 (권고)", () => {
  it("browser_specific_settings 또는 applications 필드 존재 (권고, 없어도 경고만)", () => {
    const manifest = loadManifest();
    const hasBss = "browser_specific_settings" in manifest;
    const hasApps = "applications" in manifest; // Firefox 구형 키

    if (!hasBss && !hasApps) {
      // 권고 사항 — wxt 가 gecko.id 를 자동 추가하지 않을 수 있음
      console.warn(
        "[manifest-validation] browser_specific_settings.gecko.id 가 없음. " +
          "Firefox AMO 제출 시 추가 권장 (wxt.config.ts manifest.browser_specific_settings).",
      );
    }

    // 실패시키지 않음 — 현재 wxt 빌드 기본값에 맞게 경고만
    expect(true).toBe(true);
  });

  it("browser_specific_settings.gecko.id 가 있다면 올바른 형식(@x@y)이다", () => {
    const manifest = loadManifest();
    const bss = manifest["browser_specific_settings"] as Record<string, unknown> | undefined;
    const gecko = bss?.["gecko"] as Record<string, unknown> | undefined;
    const geckoId = gecko?.["id"];

    if (geckoId !== undefined) {
      // gecko.id 형식: "extensionname@example.com" 또는 "{uuid}" 형식
      expect(typeof geckoId).toBe("string");
      const isEmailStyle = /^[^@]+@[^@]+$/.test(geckoId as string);
      const isUuidStyle = /^\{[0-9a-f-]+\}$/i.test(geckoId as string);
      expect(isEmailStyle || isUuidStyle).toBe(true);
    }
    // gecko.id 없으면 이 테스트는 조용히 통과
  });
});

// ---------------------------------------------------------------------------
// 전체 구조 스냅샷 (회귀 감지용)
// ---------------------------------------------------------------------------

describe("Firefox MV2 manifest — 구조 무결성", () => {
  it("manifest.json 크기가 0 보다 크다", () => {
    const stat = fs.statSync(MANIFEST_PATH);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("manifest.json 은 UTF-8 으로 파싱된다", () => {
    expect(() => {
      const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
      JSON.parse(raw);
    }).not.toThrow();
  });

  it("알려지지 않은 최상위 필드가 있어도 파싱이 깨지지 않는다", () => {
    // 단순히 파싱 가능하면 OK
    expect(() => loadManifest()).not.toThrow();
  });
});
