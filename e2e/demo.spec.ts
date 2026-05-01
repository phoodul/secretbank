/**
 * Demo capture specs — record beautiful UI states for HN / Product Hunt /
 * marketing. Runs in browser-only mode (Tauri mocked) at 1280x800 with
 * unconditional video recording.
 *
 * Output: each test produces `.webm` in test-results/, copied by
 * `scripts/capture-demo.ts` into `media/`.
 *
 * Three scenes — pick one or concatenate with ffmpeg:
 *   1. lock-screen      — sci-fi HUD + atmosphere + 15-language switcher
 *   2. charter-issuance — Lapis vault charter UI (the marquee differentiator)
 *   3. recovery-flow    — RecoveryDialog (Single + Shamir mode toggle)
 *
 * To run:
 *   pnpm capture:demo
 */
import { test, expect } from "@playwright/test";

import { buildInitScript, type CommandMap } from "./lib/tauri-mock";

// 모든 demo 테스트는 1280x800 + 비디오 ON
test.use({
  viewport: { width: 1280, height: 800 },
  video: { mode: "on", size: { width: 1280, height: 800 } },
});

// ────────────────────────────────────────────────────────────────────
// Scene 1 — LockScreen (sci-fi HUD + 15-language switcher)
// ────────────────────────────────────────────────────────────────────

const lockedVaultWithCharter: CommandMap = {
  vault_status: { kind: "ok", value: { state: "locked" } },
  vault_has_charter: { kind: "ok", value: true },
  vault_charter_cooldown_status: {
    kind: "ok",
    value: { enabled: true, cooldown_active: false, cooldown_until: null },
  },
};

test("demo: lock-screen", async ({ page }) => {
  await page.addInitScript({ content: buildInitScript(lockedVaultWithCharter) });
  await page.goto("/");

  // LockScreen render 확인 (role=dialog 의 첫 번째)
  await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 10_000 });

  // 마우스를 화면 중앙 근처로 천천히 움직여서 mouse gloss 효과 시연
  // (LockScreenAtmosphere 의 조명이 마우스를 따라 움직임)
  const cx = 640;
  const cy = 400;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(angle) * 200, cy + Math.sin(angle) * 120, { steps: 25 });
    await page.waitForTimeout(800);
  }

  // 마지막에는 가운데로 복귀해서 vault mechanism 이 잘 보이게
  await page.mouse.move(cx, cy, { steps: 30 });
  await page.waitForTimeout(2_000);
});

// ────────────────────────────────────────────────────────────────────
// Scene 2 — Charter issuance (Lapis vault — 우리 차별화 무기)
// ────────────────────────────────────────────────────────────────────

const noVault: CommandMap = {
  vault_status: { kind: "ok", value: { state: "needs_init" } },
  vault_has_charter: { kind: "ok", value: false },
  vault_charter_cooldown_status: {
    kind: "ok",
    value: { enabled: false, cooldown_active: false, cooldown_until: null },
  },
  // CreateVaultDialog 의 submit 시 호출 — 실제 Diceware 단어 흉내
  vault_init_with_charter: {
    kind: "ok",
    value: {
      kind: "single",
      charter: {
        words: ["lapis", "tumbler", "compass", "harvest", "ember", "violet"],
        verifier: 4827,
        formatted: "lapis tumbler compass harvest ember violet · 4827",
      },
    },
  },
  settings_get: { kind: "ok", value: null },
  settings_set: { kind: "ok", value: null },
};

test("demo: charter-issuance", async ({ page }) => {
  await page.addInitScript({ content: buildInitScript(noVault) });
  await page.goto("/");

  // CreateVaultDialog 자동 열림 (vault_status === needs_init)
  const dialog = page.getByRole("dialog");
  await expect(dialog.first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);

  // passphrase 입력 — 키보드 이벤트로 자연스럽게
  const pw = page.locator("#create-passphrase");
  await pw.click();
  await pw.pressSequentially("correct horse battery staple", { delay: 80 });
  await page.waitForTimeout(600);

  const confirm = page.locator("#create-confirm");
  await confirm.click();
  await confirm.pressSequentially("correct horse battery staple", { delay: 80 });
  await page.waitForTimeout(800);

  // Single charter 라디오는 default — 따로 클릭 불필요
  // submit
  const submit = page.getByRole("button", { name: /create vault|볼트 생성/i });
  await submit.click();

  // CharterDisplay 가 phase=issued 에서 마운트됨 — Lapis tone + 황동 봉인
  await page.waitForTimeout(500);

  // 가독성 + 인상 깊은 frame 캡처용 — 6 단어 + 4 자리 검증자가 한 화면에 나오는 시점
  await page.waitForTimeout(7_000);
});

// ────────────────────────────────────────────────────────────────────
// Scene 3 — RecoveryDialog (Forgot passphrase 진입점)
// ────────────────────────────────────────────────────────────────────

test("demo: recovery-flow", async ({ page }) => {
  await page.addInitScript({ content: buildInitScript(lockedVaultWithCharter) });
  await page.goto("/");

  await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2_000);

  // Forgot passphrase 링크 클릭 → RecoveryDialog
  const forgot = page.getByTestId("lockscreen-forgot-link");
  await forgot.click();

  // RecoveryDialog 가 마운트
  await page.waitForTimeout(800);

  // 첫 단어 input 에 charter words 입력 — 시각적으로 cinematic 한 typing
  // RecoveryDialog 의 input 셀렉터는 implementation 마다 다를 수 있으니
  // 첫 textbox 부터 순차적으로 채운다.
  const inputs = page.getByRole("textbox");
  const count = Math.min(await inputs.count(), 6);
  const words = ["lapis", "tumbler", "compass", "harvest", "ember", "violet"];
  for (let i = 0; i < count; i++) {
    await inputs.nth(i).click();
    await inputs.nth(i).pressSequentially(words[i] ?? "demo", { delay: 90 });
    await page.waitForTimeout(250);
  }

  // 마지막 frame 캡처용 대기
  await page.waitForTimeout(1_500);
});
