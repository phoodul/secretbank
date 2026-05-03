/**
 * site/index.html download UI smoke — verifies OS-detected primary button
 * label change after live GitHub API fetch + dropdown menu populated with
 * 6 expected items (Windows .exe/.msi, macOS .dmg, Linux AppImage/.deb/.rpm).
 *
 * This spec is opt-in. Excluded from regular E2E in playwright.config.ts.
 * Run only via: pnpm exec playwright test --config=e2e/playwright.site.config.ts
 */
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

test("site download UI: primary updated + dropdown populated", async ({ page }) => {
  await page.goto("http://localhost:4173/");

  const primary = page.locator("#download-primary");
  const toggle = page.locator("#download-toggle");
  const menu = page.locator("#download-menu");

  await expect(primary).toBeVisible();
  await expect(toggle).toBeVisible();

  // 초기 라벨은 "Download". JS 가 GitHub API fetch 후 OS-specific 라벨로 갱신.
  // headless chromium 은 보통 Linux 로 잡힘.
  await expect(primary.locator(".download-label")).toHaveText(/Download for /, { timeout: 15_000 });

  // primary href 가 GitHub releases asset URL 로 바뀐다.
  await expect(primary).toHaveAttribute(
    "href",
    /github\.com\/phoodul\/api-vault\/releases\/download\//,
    { timeout: 5_000 },
  );

  // 처음엔 menu 가 닫혀있음 (CSS .open 클래스 없음 → opacity 0 + pointer-events none).
  await expect(menu).not.toHaveClass(/open/);

  // toggle 클릭 → menu open
  await toggle.click();
  await expect(menu).toHaveClass(/open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // menu 안에 OS 별 heading 3개 (Windows / macOS / Linux)
  await expect(menu.locator(".menu-heading", { hasText: "Windows" })).toBeVisible();
  await expect(menu.locator(".menu-heading", { hasText: "macOS" })).toBeVisible();
  await expect(menu.locator(".menu-heading", { hasText: "Linux" })).toBeVisible();

  // 6 개 item (Windows 2 + macOS 1 + Linux 3)
  const items = menu.locator("a.menu-item");
  await expect(items).toHaveCount(6);

  // 모든 item 이 GitHub release download URL
  const hrefs = await items.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
  for (const href of hrefs) {
    expect(href).toMatch(/github\.com\/phoodul\/api-vault\/releases\/download\//);
  }

  // ARM 안내 note + All releases footer
  await expect(menu.locator(".menu-note")).toBeVisible();
  await expect(menu.locator(".menu-foot a")).toContainText(/All releases/);

  // Escape 닫기
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveClass(/open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});
