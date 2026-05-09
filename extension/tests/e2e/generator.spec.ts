// @file tests/e2e/generator.spec.ts
// @license AGPL-3.0-or-later
//
// E2E: generator 시나리오 stub — F-3.
//
// TODO (F-3 이후 점진 보강):
//   1. 가짜 사이트 navigate → password input focus
//   2. GeneratorIcon 표시 확인 (content script 가 input 옆에 주입)
//   3. GeneratorIcon 클릭 → GeneratorPanel 표시
//   4. Diceware / Random 옵션 전환
//   5. "Generate" → "Use this" → input value 검증 (생성된 password)
//   6. 강도 미터 (zxcvbn) 표시 확인
//
// 현재는 기본 smoke 만 포함. 실 spec 은 GeneratorIcon DOM 통합 후 구현.

import { test, expect } from "./fixtures.js";
import { FAKE_SITE_ORIGIN } from "./fixtures.js";

test.describe("Generator E2E (Chromium MV3) — stub", () => {
  test.skip(true, "TODO: GeneratorIcon DOM 통합 후 구현 예정");

  test("password input focus 시 GeneratorIcon 이 표시되어야 한다", async ({
    page,
    fakeSiteServer,
    extensionId,
  }) => {
    void fakeSiteServer;
    void extensionId;

    // TODO: 구현
    await page.goto(FAKE_SITE_ORIGIN);

    const passwordInput = page.locator('[data-testid="password-input"]');
    await passwordInput.click();

    // GeneratorIcon 은 content script 가 input 옆에 Shadow DOM 으로 주입.
    // TODO: GeneratorIcon shadow host selector 확정 후 아래 구현
    // const generatorIcon = page.locator('#sb-generator-icon');
    // await expect(generatorIcon).toBeVisible({ timeout: 3000 });
    expect(true).toBe(true); // placeholder
  });

  test("GeneratorPanel 에서 생성된 password 가 input 에 채워져야 한다", async ({
    page,
    fakeSiteServer,
    extensionId,
  }) => {
    void fakeSiteServer;
    void extensionId;

    // TODO: 구현
    await page.goto(FAKE_SITE_ORIGIN);
    expect(true).toBe(true); // placeholder
  });
});
