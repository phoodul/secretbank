// @file tests/e2e/fixtures.ts
// @license AGPL-3.0-or-later
//
// Playwright E2E 공용 fixture — F-3 Chromium.
//
// 제공:
//   1. fakeSite  — 가짜 login form 을 서빙하는 Node http 서버 (고정 포트 49152)
//   2. extId     — Chromium MV3 로딩 후 service_workers() 에서 EXT_ID 추출
//   3. nmHost    — mock-nm-host 와의 연동 상태 (install.sh 는 사전 실행 가정)
//
// 주의:
//   - Manifest V3 + Playwright : chrome.runtime.id 는 service_workers() 를 통해 추출.
//   - NM Host 는 Chromium 이 실제로 실행할 때 OS 의 NM manifest 에서 경로를 찾는다.
//     CI 에서는 install.sh 가 NM manifest 를 ~/.config/chromium/NativeMessagingHosts/ 에 등록.
//   - extId 추출에 실패하면 테스트를 skip 처리 (NM manifest 에 EXT_ID 가 맞지 않으면 NM 통신 불가).

import { test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** 가짜 login form 페이지 포트 (임의 고정 — IANA 임시 포트 범위) */
export const FAKE_SITE_PORT = 49152;
export const FAKE_SITE_ORIGIN = `http://localhost:${FAKE_SITE_PORT}`;

/** fake 도메인 — fixtures.json 과 일치 (mock-nm-host 기본 fixture: github.com) */
export const FIXTURE_DOMAIN = "github.com";

/** Chromium MV3 빌드 경로 */
const EXTENSION_PATH = path.resolve(__dirname, "../../dist/chromium-mv3");

// ---------------------------------------------------------------------------
// 가짜 사이트 HTML (login form)
// ---------------------------------------------------------------------------

/**
 * 가짜 login form HTML.
 * - action="/login" (POST) — submit 시 303 redirect → /logged-in
 * - username + password + autocomplete attribute
 * - data-testid 로 Playwright selector 정의
 */
export const FAKE_LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Fake Login — Secretbank E2E</title>
</head>
<body>
  <h1>Fake Login</h1>
  <form id="login-form" action="/login" method="post">
    <label for="username">Username</label>
    <input
      id="username"
      name="username"
      type="text"
      autocomplete="username"
      data-testid="username-input"
      placeholder="username"
    />
    <label for="password">Password</label>
    <input
      id="password"
      name="password"
      type="password"
      autocomplete="current-password"
      data-testid="password-input"
      placeholder="password"
    />
    <button type="submit" data-testid="submit-btn">Login</button>
  </form>
  <script>
    // form submit 가로채기 — SPA 처럼 처리하여 페이지 이동 없이 이벤트 발생
    document.getElementById('login-form').addEventListener('submit', function(e) {
      e.preventDefault();
      document.body.setAttribute('data-submitted', 'true');
    });
  </script>
</body>
</html>`;

/** POST /login 후 리다이렉트할 페이지 */
const FAKE_LOGGED_IN_HTML = `<!DOCTYPE html>
<html>
<body><p data-testid="logged-in">Logged in</p></body>
</html>`;

// ---------------------------------------------------------------------------
// 가짜 사이트 HTTP 서버
// ---------------------------------------------------------------------------

/** 가짜 사이트 서버 시작. Promise<http.Server> 반환. */
export function startFakeSite(): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(FAKE_LOGIN_HTML);
        return;
      }
      if (req.method === "POST" && req.url === "/login") {
        res.writeHead(303, { Location: "/logged-in" });
        res.end();
        return;
      }
      if (req.url === "/logged-in") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(FAKE_LOGGED_IN_HTML);
        return;
      }
      res.writeHead(404);
      res.end("Not found");
    });

    server.once("error", reject);
    server.listen(FAKE_SITE_PORT, "127.0.0.1", () => resolve(server));
  });
}

/** 가짜 사이트 서버 종료. */
export function stopFakeSite(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// EXT_ID 추출 유틸
// ---------------------------------------------------------------------------

/**
 * Chromium MV3 extension 의 ID 를 service_workers() 에서 추출한다.
 *
 * Playwright + MV3 알려진 한계:
 *   chrome.runtime.id 는 content script 내에서 접근 불가.
 *   대신 service_workers() URL (chrome-extension://<EXT_ID>/...) 에서 파싱한다.
 *
 * @param context BrowserContext (--load-extension 으로 로딩된 Chromium)
 * @returns 확장 ID 문자열 | undefined (service worker 미부팅 시)
 */
export async function extractExtensionId(context: BrowserContext): Promise<string | undefined> {
  // service worker 가 부팅되길 최대 10초 대기
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const workers = context.serviceWorkers();
    for (const worker of workers) {
      const url = worker.url();
      // chrome-extension://<ID>/...
      const match = url.match(/^chrome-extension:\/\/([a-z]{32})\//);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// mock-nm-host NM manifest 갱신
// ---------------------------------------------------------------------------

/**
 * EXT_ID 를 알게 된 후 Chromium NM manifest 를 갱신한다.
 *
 * install.sh 는 placeholder_ext_id 로 등록했을 수 있으므로,
 * 실제 EXT_ID 로 manifest 를 덮어쓴다.
 *
 * CI 에서는 install.sh 를 EXT_ID 인자와 함께 재호출하거나
 * 직접 manifest 파일을 수정한다.
 */
export function updateNmManifestExtId(extId: string): void {
  const hostName = "com.secretbank.nm_host";
  const hostJsPath = path.resolve(__dirname, "../mock-nm-host/index.js");

  // Linux / macOS 경로 결정
  const isLinux = os.platform() === "linux";
  const isMac = os.platform() === "darwin";

  let manifestDir: string | undefined;
  if (isLinux) {
    manifestDir = path.join(os.homedir(), ".config/chromium/NativeMessagingHosts");
  } else if (isMac) {
    manifestDir = path.join(
      os.homedir(),
      "Library/Application Support/Chromium/NativeMessagingHosts",
    );
  }

  if (!manifestDir) {
    // Windows 또는 미지원 OS — skip (install.ps1 이 레지스트리에 등록)
    return;
  }

  const manifestPath = path.join(manifestDir, `${hostName}.json`);
  if (!fs.existsSync(manifestPath)) {
    // install.sh 가 아직 실행되지 않음 — 여기서 생성
    fs.mkdirSync(manifestDir, { recursive: true });
  }

  const manifest = {
    name: hostName,
    description: "Secretbank Mock Native Messaging Host (test-only)",
    path: hostJsPath,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extId}/`],
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Playwright test fixture 정의
// ---------------------------------------------------------------------------

interface FakeSiteFixture {
  /** Persistent BrowserContext (extension loaded). base context 를 override. */
  context: BrowserContext;
  /** Persistent context 의 첫 번째 page. base page 를 override. */
  page: Page;
  /** 가짜 사이트 서버 (이미 listen 중) */
  fakeSiteServer: http.Server;
  /** 확장 ID (undefined = service worker 미부팅) */
  extensionId: string | undefined;
}

/**
 * base test 를 확장하는 fixture.
 * - context: chromium.launchPersistentContext 로 unpacked extension 로딩
 *   (Playwright 1.54+ 는 --user-data-dir 를 launch args 로 reject 하므로
 *   API 가 받는 첫 인자로 userDataDir 전달이 필수.)
 * - page: persistent context 의 기본 페이지 (없으면 newPage)
 * - fakeSiteServer: 각 테스트 전 시작, 후 종료
 * - extensionId: BrowserContext 에서 추출
 *
 * 사용 예:
 *   import { test } from "./fixtures.ts";
 *   test("autofill", async ({ page, fakeSiteServer, extensionId }) => { ... });
 */
export const test = base.extend<FakeSiteFixture>({
  context: async ({}, use) => {
    // PLAYWRIGHT_USER_DATA_DIR (globalSetup 에서 mkdtemp) 또는 즉석 tmpdir.
    const userDataDir =
      process.env.PLAYWRIGHT_USER_DATA_DIR ||
      fs.mkdtempSync(path.join(os.tmpdir(), "sb-e2e-fixture-"));

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [`--load-extension=${EXTENSION_PATH}`, `--disable-extensions-except=${EXTENSION_PATH}`],
    });
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] || (await context.newPage());
    await use(page);
  },

  fakeSiteServer: async ({}, use) => {
    let server: http.Server | undefined;
    try {
      server = await startFakeSite();
      await use(server);
    } finally {
      if (server) await stopFakeSite(server);
    }
  },

  extensionId: async ({ context }, use) => {
    const extId = await extractExtensionId(context);
    if (extId) {
      // EXT_ID 를 NM manifest 에 반영 (Chromium 재시작 없이는 효과 없지만 기록용)
      updateNmManifestExtId(extId);
    }
    await use(extId);
  },
});

export { expect } from "@playwright/test";
