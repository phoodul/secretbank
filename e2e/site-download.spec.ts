/**
 * site/index.html download grid smoke — verifies the 3-column download
 * section under the hero (Windows / macOS / Linux cards) is populated
 * by live GitHub Releases API.
 *
 * This spec is opt-in. Excluded from regular E2E in playwright.config.ts.
 * Run only via:
 *   npx http-server site -p 4173 -c-1 --silent &
 *   pnpm exec playwright test --config=e2e/playwright.site.config.ts
 */
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

test("site download grid: 3 cards populated + recommended item highlighted", async ({ page }) => {
  await page.goto("http://localhost:4173/");

  // hero 의 Download 버튼은 단순 anchor 로 #download 섹션을 가리킨다.
  const heroBtn = page.locator(".hero a.btn-primary");
  await expect(heroBtn).toBeVisible();
  await expect(heroBtn).toHaveAttribute("href", "#download");

  // download section 마운트 확인
  const section = page.locator("#download");
  await expect(section).toBeVisible();
  await expect(section.locator("h2")).toHaveText(/Choose your platform/i);

  // 버전 텍스트가 GitHub API fetch 후 "loading…" → "v0.1.0-pre…" 로 갱신
  await expect(page.locator("#download-version")).toHaveText(/^v\d/, { timeout: 15_000 });

  // 3 카드 모두 마운트 (Windows / macOS / Linux)
  const cards = page.locator("#download-grid .download-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).locator("h3")).toContainText("Windows");
  await expect(cards.nth(1).locator("h3")).toContainText("macOS");
  await expect(cards.nth(2).locator("h3")).toContainText("Linux");

  // 모든 download link 가 GitHub release URL 패턴
  const links = page.locator("#download-grid .card-list a");
  const count = await links.count();
  expect(count).toBeGreaterThanOrEqual(6); // Windows 2 + macOS 1 + Linux 3
  const hrefs = await links.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
  for (const href of hrefs) {
    expect(href).toMatch(/github\.com\/phoodul\/secretbank\/releases\/download\//);
  }

  // 각 카드에 recommended item 1개씩 (★ marker)
  const recommended = page.locator("#download-grid .card-list a.recommended");
  await expect(recommended).toHaveCount(3);

  // 감지된 OS (headless chromium = Linux) 의 카드에 "your system" 표시
  await expect(
    page.locator("#download-grid .download-card h3", { hasText: "your system" }),
  ).toHaveCount(1);
});
