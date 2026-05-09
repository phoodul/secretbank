// @file tests/e2e/save.spec.ts
// @license AGPL-3.0-or-later
//
// E2E: save 시나리오 stub — F-3.
//
// TODO (F-3 이후 점진 보강):
//   1. 가짜 사이트 form fill (username + password)
//   2. submit → SaveBanner 표시 확인
//   3. "Save" 클릭 → SaveDialog popup 표시
//   4. 저장 → mock-nm-host credential_create 호출 검증
//
// 현재는 기본 smoke 만 포함. 실 spec 은 content script SaveBanner DOM 통합 후 구현.

import { test, expect } from "./fixtures.js";
import { FAKE_SITE_ORIGIN } from "./fixtures.js";

test.describe("Save E2E (Chromium MV3) — stub", () => {
  test.skip(true, "TODO: SaveBanner DOM 통합 후 구현 예정");

  test("form submit 후 SaveBanner 가 표시되어야 한다", async ({
    page,
    fakeSiteServer,
    extensionId,
  }) => {
    void fakeSiteServer;
    void extensionId;

    // TODO: 구현
    await page.goto(FAKE_SITE_ORIGIN);

    const usernameInput = page.locator('[data-testid="username-input"]');
    const passwordInput = page.locator('[data-testid="password-input"]');
    const submitBtn = page.locator('[data-testid="submit-btn"]');

    await usernameInput.fill("testuser");
    await passwordInput.fill("TestPassword123!");
    await submitBtn.click();

    // SaveBanner 는 content script 가 Shadow DOM 으로 주입하는 컴포넌트.
    // data-testid 또는 shadow host selector 로 찾아야 함.
    // TODO: SaveBanner shadow host selector 확정 후 아래 구현
    // const saveBanner = page.locator('#sb-save-banner');
    // await expect(saveBanner).toBeVisible({ timeout: 5000 });
    expect(true).toBe(true); // placeholder
  });
});
