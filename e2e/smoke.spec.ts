/**
 * Browser-mode smoke tests — verify the React app boots, key routes render,
 * and there are no console errors on the happy path.
 *
 * Limitations: Tauri commands are mocked, so anything that depends on Rust
 * state (e.g. real KDF, real audit chain verification) is out of scope.
 * Real desktop binary E2E lives in a separate runbook (deferred).
 */
import { expect, test } from "@playwright/test";

import { buildInitScript, type CommandMap, type SettingMap } from "./lib/tauri-mock";

const lockedVault: CommandMap = {
  vault_status: { kind: "ok", value: { state: "locked" } },
};

const unlockedVault: CommandMap = {
  vault_status: { kind: "ok", value: { state: "unlocked" } },
  vault_setting_get: { kind: "ok", value: null },
  credential_list: { kind: "ok", value: [] },
  project_list: { kind: "ok", value: [] },
  issuer_list: { kind: "ok", value: [] },
  github_list_installations: { kind: "ok", value: [] },
  entitlement_current: {
    kind: "ok",
    value: { tier: "free", pro_until: null, from_cache: false },
  },
  settings_get: { kind: "ok", value: null },
  settings_set: { kind: "ok", value: null },
  audit_list: { kind: "ok", value: [] },
  audit_verify_chain: {
    kind: "ok",
    value: { ok: true, verified_count: 0 },
  },
  incident_list: { kind: "ok", value: [] },
  graph_fetch: { kind: "ok", value: { nodes: [], edges: [] } },
  auth_status: { kind: "ok", value: null },
};

// Onboarding marked complete so AppShell routes (settings, inventory) render
// without redirect to /welcome.
const onboardingDone: SettingMap = {
  "secretbank.settings.onboarding.done": "true",
};

test.describe("smoke", () => {
  test("locked vault → LockScreen renders", async ({ page }) => {
    await page.addInitScript({ content: buildInitScript(lockedVault) });

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    // The unlock form has a passphrase field with autoComplete=current-password.
    await expect(page.getByLabel(/passphrase/i)).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("unlocked vault → inventory route reachable, settings route reachable", async ({ page }) => {
    await page.addInitScript({
      content: buildInitScript(unlockedVault, onboardingDone),
    });

    await page.goto("/");
    // Inventory page: header `h1` "Inventory" or similar — locale-dependent.
    // Use a more resilient assertion: the <main> region rendered by AppShell.
    await expect(page.getByRole("main")).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("/auth/sign-in renders sign-in scaffold", async ({ page }) => {
    await page.addInitScript({
      content: buildInitScript(unlockedVault, onboardingDone),
    });

    await page.goto("/auth/sign-in");

    await expect(page.getByRole("heading", { name: /Connect to Secretbank/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /passkey/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /GitHub/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
  });
});
