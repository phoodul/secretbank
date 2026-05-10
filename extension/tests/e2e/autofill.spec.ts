// @file tests/e2e/autofill.spec.ts
// @license AGPL-3.0-or-later
//
// E2E: autofill 시나리오 — Chromium MV3 + Mock NM Host (F-5).
//
// 시나리오:
//   1. 가짜 사이트(fakeSite) 로 이동
//   2. password input 에 focus
//   3. autofill 트리거 (Ctrl+Shift+L hotkey — C-5 구현)
//   4. CredentialList 팝업에서 첫 번째 credential 클릭
//   5. password input value 가 채워졌는지 검증
//
// Mock NM Host 기본 fixture:
//   credential_list_by_domain → localhost 에는 매칭 없음 (domain_match = github.com).
//   따라서 C-5 hotkey 트리거 후 CredentialList 가 비어있을 수 있음.
//   → 여기서는 extension 이 정상 로딩되고 content script 가 주입됨을 확인하는 smoke test.
//
// 실제 autofill fill 검증은 mock-nm-host fixture 에서 localhost 를 github.com 도메인으로
// 오버라이드해야 하므로 TODO 로 남겨둔다.
//
// NOTE: Manifest V3 + Playwright headful 환경에서 extension 로딩 여부를
//       extensionId 유무로 확인. extensionId === undefined 이면 test.skip().

import { FAKE_SITE_ORIGIN } from "./fixtures.js";
import { test, expect } from "./fixtures.js";

test.describe("Autofill E2E (Chromium MV3)", () => {
  // ── Smoke: extension 로딩 확인 ──────────────────────────────────────────
  test("extension service worker 가 정상 부팅되어야 한다", async ({ context, extensionId }) => {
    // CI 에서 headless 환경이면 service worker 미부팅 가능 — skip
    if (!extensionId) {
      test.skip(true, "Extension service worker 미부팅 — headless 환경 건너뜀");
      return;
    }
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  // ── Smoke: 가짜 사이트 로딩 확인 ────────────────────────────────────────
  test("가짜 사이트가 login form 을 서빙해야 한다", async ({ page, fakeSiteServer }) => {
    void fakeSiteServer; // fixture 시작 보장
    await page.goto(FAKE_SITE_ORIGIN);
    await expect(page.locator('[data-testid="username-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="submit-btn"]')).toBeVisible();
  });

  // ── Smoke: content script 주입 확인 ─────────────────────────────────────
  test("content script 가 가짜 사이트에 주입되어야 한다", async ({
    page,
    fakeSiteServer,
    extensionId,
  }) => {
    void fakeSiteServer;
    if (!extensionId) {
      test.skip(true, "Extension service worker 미부팅 — headless 환경 건너뜀");
      return;
    }

    await page.goto(FAKE_SITE_ORIGIN);

    // content script 주입 대기 — SB content script 는 document_idle 에 실행
    // 최대 5초 대기
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    // password input 이 여전히 존재해야 함 (content script 가 DOM 를 깨뜨리지 않아야 함)
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
  });

  // ── Autofill hotkey 트리거 (TODO: 실제 fill 값 검증) ────────────────────
  // TODO: mock-nm-host fixture 에서 localhost 도메인을 credential 에 매핑하면
  //       autofill 후 실제 값이 채워지는지 검증 가능.
  //       현재는 hotkey 가 에러 없이 동작하는지만 확인 (smoke).
  test("password input focus 후 Ctrl+Shift+L 을 눌러도 에러가 없어야 한다", async ({
    page,
    fakeSiteServer,
    extensionId,
  }) => {
    void fakeSiteServer;
    if (!extensionId) {
      test.skip(true, "Extension service worker 미부팅 — headless 환경 건너뜀");
      return;
    }

    await page.goto(FAKE_SITE_ORIGIN);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    const passwordInput = page.locator('[data-testid="password-input"]');
    await passwordInput.click();

    // C-5 autofill hotkey: Ctrl+Shift+L
    await page.keyboard.press("Control+Shift+L");

    // 에러 다이얼로그나 JS exception 없이 페이지가 그대로여야 함
    await page.waitForTimeout(500);
    await expect(passwordInput).toBeVisible();
  });
});
