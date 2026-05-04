/**
 * Demo capture specs — record beautiful UI states for HN / Product Hunt /
 * marketing. Runs in browser-only mode (Tauri mocked) at 1280x800 with
 * unconditional video recording.
 *
 * Output: each test produces `.webm` in test-results/, copied by
 * `scripts/capture-demo.ts` into `media/`.
 *
 * Eight scenes — Security & Recovery (1-3) + Daily workflow (4-8):
 *   1. lock-screen      — sci-fi HUD + atmosphere + 15-language switcher
 *   2. charter-issuance — Lapis vault charter UI (the marquee differentiator)
 *   3. recovery-flow    — RecoveryDialog (Single + Shamir mode toggle)
 *   4. save-credential  — + New → issuer + name + value → Save
 *   5. dependency-graph — Issuer→Credential→Usage→Project→Deployment 시각화
 *   6. incident-alert   — NVD/GHSA matched incident + "Affecting you" highlight
 *   7. rotate-credential — Detail → Rotate → 새 value → 저장
 *   8. stale-references — Rotate 후 graph 의 사용처 (수동 점검 필요한 곳)
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

  // LockScreen 은 motion.section + aria-labelledby="lockscreen-title" → ARIA role=region.
  // (Radix Dialog 가 아니므로 role=dialog 로는 못 잡는다. passphrase input 으로 대기)
  await expect(page.locator("#unlock-passphrase")).toBeVisible({ timeout: 10_000 });

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
  // Rust serde tag = "state", rename_all = "snake_case" → "uninitialized" (NOT "needs_init")
  vault_status: { kind: "ok", value: { state: "uninitialized" } },
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

  // uninitialized 상태에서는 LockScreen 이 "First time? Create a new vault" 링크를 노출.
  // CreateVaultDialog 는 자동 열리지 않으므로 사용자가 클릭하는 것을 흉내낸다.
  // (i18n key: vault.createVaultLink — en: "First time? Create a new vault" / ko: "처음이신가요? 새 볼트 만들기")
  const createLink = page.getByRole("button", { name: /create a new vault|새 볼트 만들기/i });
  await expect(createLink).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await createLink.click();

  // 이제 CreateVaultDialog (Radix Dialog → role=dialog) 가 마운트됨
  const dialog = page.getByRole("dialog");
  await expect(dialog.first()).toBeVisible({ timeout: 5_000 });
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
  // submit (i18n vault.createButton — en: "Create Vault" / ko: "볼트 만들기")
  // dialog scope 로 좁혀 LockScreen 의 createVaultLink 와 충돌 방지
  const submit = dialog.getByRole("button", { name: /^create vault$|^볼트 만들기$/i });
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

  // LockScreen 은 region — passphrase input 으로 mount 확인
  await expect(page.locator("#unlock-passphrase")).toBeVisible({ timeout: 10_000 });

  // Forgot link 는 vault_has_charter=true 이후 비동기로 렌더되므로 Locator 자체로 대기
  const forgot = page.getByTestId("lockscreen-forgot-link");
  await expect(forgot).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(2_000);

  await forgot.click();

  // RecoveryDialog (Radix Dialog → role=dialog) 가 마운트되는 것까지 명시적으로 대기
  await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 5_000 });
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

// ────────────────────────────────────────────────────────────────────
// Daily workflow scenarios (4-8) — unlocked vault + onboarding done
// ────────────────────────────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

const ISSUERS = [
  { id: "issuer-openai", slug: "openai", name: "OpenAI", icon: "🤖", base_pattern: null },
  { id: "issuer-stripe", slug: "stripe", name: "Stripe", icon: "💳", base_pattern: null },
  { id: "issuer-github", slug: "github", name: "GitHub", icon: "🐙", base_pattern: null },
  { id: "issuer-aws", slug: "aws", name: "AWS", icon: "☁️", base_pattern: null },
];

const CREDENTIALS = [
  {
    id: "cred-openai-prod",
    name: "prod-openai-billing",
    issuer_slug: "openai",
    issuer_id: "issuer-openai",
    environment: "prod",
    status: "active" as const,
    created_at: NOW - 30 * DAY,
    last_rotated_at: NOW - 30 * DAY,
    rotation_policy_days: 90,
    expires_at: null,
    notes: null,
    score: 72,
  },
  {
    id: "cred-stripe-prod",
    name: "prod-stripe-secret",
    issuer_slug: "stripe",
    issuer_id: "issuer-stripe",
    environment: "prod",
    status: "active" as const,
    created_at: NOW - 60 * DAY,
    last_rotated_at: NOW - 14 * DAY,
    rotation_policy_days: 90,
    expires_at: null,
    notes: null,
    score: 88,
  },
  {
    id: "cred-github-pat",
    name: "github-deploy-pat",
    issuer_slug: "github",
    issuer_id: "issuer-github",
    environment: "prod",
    status: "active" as const,
    created_at: NOW - 90 * DAY,
    last_rotated_at: NOW - 90 * DAY,
    rotation_policy_days: 60,
    expires_at: NOW + 30 * DAY,
    notes: null,
    score: 55,
  },
];

const PROJECTS = [
  { id: "proj-billing", name: "Billing API", local_path: null, created_at: NOW - 60 * DAY },
  { id: "proj-checkout", name: "Checkout Service", local_path: null, created_at: NOW - 45 * DAY },
];

const DEPLOYMENTS = [
  {
    id: "dep-billing-prod",
    project_id: "proj-billing",
    name: "billing.prod",
    platform: "vercel",
    url: "https://api-billing.example.com",
    environment: "prod",
    created_at: NOW - 30 * DAY,
  },
  {
    id: "dep-checkout-prod",
    project_id: "proj-checkout",
    name: "checkout.prod",
    platform: "aws",
    url: "https://checkout.example.com",
    environment: "prod",
    created_at: NOW - 30 * DAY,
  },
];

const USAGES = [
  {
    id: "usage-1",
    credential_id: "cred-openai-prod",
    project_id: "proj-billing",
    file_path: "apps/billing/src/openai.ts",
    line_number: 14,
    created_at: NOW - 20 * DAY,
  },
  {
    id: "usage-2",
    credential_id: "cred-stripe-prod",
    project_id: "proj-checkout",
    file_path: "apps/checkout/server/stripe-webhook.ts",
    line_number: 7,
    created_at: NOW - 25 * DAY,
  },
  {
    id: "usage-3",
    credential_id: "cred-github-pat",
    project_id: "proj-billing",
    file_path: ".github/workflows/deploy.yml",
    line_number: 22,
    created_at: NOW - 50 * DAY,
  },
];

const GRAPH_PAYLOAD = {
  issuers: ISSUERS,
  credentials: CREDENTIALS,
  projects: PROJECTS,
  deployments: DEPLOYMENTS,
  usages: USAGES,
};

const INCIDENT_ENTRIES = [
  {
    id: "inc-1",
    title: "OpenAI API key abuse via leaked .env in popular npm package",
    summary:
      "GHSA-2026-04-29: An OpenAI key embedded in node_modules has been mass-scanned. Affected accounts may see anomalous usage spikes.",
    source: "ghsa",
    source_id: "GHSA-2026-0429-openai",
    url: "https://github.com/advisories/GHSA-2026-0429-openai",
    issuer_slug: "openai",
    severity: "high",
    published_at: NOW - 2 * DAY,
    matched_credential_ids: ["cred-openai-prod"],
    dismissed: false,
  },
  {
    id: "inc-2",
    title: "GitHub PAT scope inflation — fine-grained tokens leaked via supply chain",
    summary:
      "Affected: repos with admin PAT older than 60 days. Rotate to keep deploy pipelines safe.",
    source: "ghsa",
    source_id: "GHSA-2026-0428-github",
    url: "https://github.com/advisories/GHSA-2026-0428-github",
    issuer_slug: "github",
    severity: "medium",
    published_at: NOW - 4 * DAY,
    matched_credential_ids: ["cred-github-pat"],
    dismissed: false,
  },
];

function makeUnlockedBase(): CommandMap {
  return {
    vault_status: { kind: "ok", value: { state: "unlocked" } },
    vault_has_charter: { kind: "ok", value: true },
    vault_charter_cooldown_status: {
      kind: "ok",
      value: { enabled: false, cooldown_active: false, cooldown_until: null },
    },
    settings_get: { kind: "ok", value: null },
    settings_set: { kind: "ok", value: null },
    issuer_list: { kind: "ok", value: ISSUERS },
    credential_list: { kind: "ok", value: CREDENTIALS },
    project_list: { kind: "ok", value: PROJECTS },
    deployment_list_for_project: { kind: "ok", value: DEPLOYMENTS },
    usage_list_for_project: { kind: "ok", value: USAGES },
    graph_fetch: { kind: "ok", value: GRAPH_PAYLOAD },
    blast_radius_for_credential: {
      kind: "ok",
      value: {
        primary: ["cred-openai-prod"],
        secondary: ["usage-1"],
        tertiary: ["proj-billing", "dep-billing-prod"],
        unaffected: ["cred-stripe-prod", "cred-github-pat"],
      },
    },
    incident_list: { kind: "ok", value: INCIDENT_ENTRIES },
    incident_matches_for_credential: { kind: "ok", value: [INCIDENT_ENTRIES[0]] },
    list_incidents_with_matches_for_credential: { kind: "ok", value: [INCIDENT_ENTRIES[0]] },
    audit_list: { kind: "ok", value: [] },
    audit_verify_chain: { kind: "ok", value: { verified: true, broken_at: null, total: 0 } },
    entitlement_status: { kind: "ok", value: { plan: "pro", source: "beta", expires_at: null } },
    auth_status: { kind: "ok", value: { user_id: "demo-user", email: "demo@api-vault.app" } },
    feed_refresh: { kind: "ok", value: { ok: true } },
  };
}

const onboardingDoneSettings = { "onboarding-done": "true", "demo-mode": "true" };

// ────────────────────────────────────────────────────────────────────
// Scene 4 — Save credential (가장 자주 쓰는 워크플로우)
// ────────────────────────────────────────────────────────────────────
test("demo: save-credential", async ({ page }) => {
  const map: CommandMap = {
    ...makeUnlockedBase(),
    credential_list: { kind: "ok", value: [] }, // 빈 inventory 부터 시작
    credential_create: { kind: "ok", value: "cred-new-id" },
  };
  await page.addInitScript({ content: buildInitScript(map, onboardingDoneSettings) });
  await page.goto("/");

  // Inventory 페이지 마운트 — empty state 가 잠시 보임
  await page.waitForTimeout(1_500);

  // "+ New" 같은 primary action 버튼 — 라벨 다양 가능성, 광범위 매칭
  const newBtn = page
    .getByRole("button", { name: /add credential|new credential|새 자격증명|\+ new|new$/i })
    .first();
  if (await newBtn.isVisible().catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(800);
  }

  // CreateCredentialDialog 가 열림 — 진짜 Radix Dialog
  const dialog = page.getByRole("dialog").first();
  if (await dialog.isVisible().catch(() => false)) {
    // Issuer combobox — 첫 번째 선택지
    const issuerInput = page.getByRole("combobox").first();
    if (await issuerInput.isVisible().catch(() => false)) {
      await issuerInput.click();
      await page.waitForTimeout(400);
      // OpenAI option — 라벨 매칭
      const opt = page.getByRole("option", { name: /openai/i }).first();
      if (await opt.isVisible().catch(() => false)) {
        await opt.click();
        await page.waitForTimeout(400);
      }
    }
    // name + value 입력 — placeholder 또는 label 기반
    const nameInput = dialog.getByLabel(/name|이름/i).first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.click();
      await nameInput.pressSequentially("prod-openai-billing", { delay: 65 });
      await page.waitForTimeout(300);
    }
    const valueInput = dialog.getByLabel(/value|값|secret|key/i).first();
    if (await valueInput.isVisible().catch(() => false)) {
      await valueInput.click();
      await valueInput.pressSequentially("sk-proj-AbCdEfGhIjKlMnOpQrStUvWx", { delay: 50 });
      await page.waitForTimeout(500);
    }
  }

  // 마지막 frame 잠시
  await page.waitForTimeout(2_500);
});

// ────────────────────────────────────────────────────────────────────
// Scene 5 — Dependency graph (차별화 포인트)
// ────────────────────────────────────────────────────────────────────
test("demo: dependency-graph", async ({ page }) => {
  const map = makeUnlockedBase();
  await page.addInitScript({ content: buildInitScript(map, onboardingDoneSettings) });
  await page.goto("/graph");

  // GraphPage 마운트 + React Flow 초기 layout
  await page.waitForTimeout(2_500);

  // 마우스를 그래프 위로 부드럽게 — pan/zoom 효과
  await page.mouse.move(640, 400, { steps: 25 });
  await page.waitForTimeout(800);
  await page.mouse.move(740, 350, { steps: 25 });
  await page.waitForTimeout(800);
  await page.mouse.move(540, 450, { steps: 25 });
  await page.waitForTimeout(800);

  // 노드 클릭 시도 — credential 노드의 일반적 위치
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2_500);
});

// ────────────────────────────────────────────────────────────────────
// Scene 6 — Incident alert (NVD/GHSA matched)
// ────────────────────────────────────────────────────────────────────
test("demo: incident-alert", async ({ page }) => {
  const map = makeUnlockedBase();
  await page.addInitScript({ content: buildInitScript(map, onboardingDoneSettings) });
  await page.goto("/incidents");

  // IncidentsPage 마운트 + 카드 렌더
  await page.waitForTimeout(3_000);

  // 첫 카드로 마우스 이동 + hover
  await page.mouse.move(640, 350, { steps: 30 });
  await page.waitForTimeout(1_200);
  await page.mouse.move(640, 450, { steps: 30 });
  await page.waitForTimeout(2_500);
});

// ────────────────────────────────────────────────────────────────────
// Scene 7 — Rotate credential
// ────────────────────────────────────────────────────────────────────
test("demo: rotate-credential", async ({ page }) => {
  const credDetail = {
    ...CREDENTIALS[0],
    value_revealed: null,
    usages: [USAGES[0]],
  };
  const map: CommandMap = {
    ...makeUnlockedBase(),
    credential_get: { kind: "ok", value: credDetail },
    credential_rotate_value: { kind: "ok", value: null },
    credential_update: { kind: "ok", value: null },
  };
  await page.addInitScript({ content: buildInitScript(map, onboardingDoneSettings) });
  await page.goto("/");

  // Inventory 마운트 + 카드 1번 클릭 시도
  await page.waitForTimeout(1_800);
  const firstCard = page.getByText(/prod-openai-billing/i).first();
  if (await firstCard.isVisible().catch(() => false)) {
    await firstCard.click();
    await page.waitForTimeout(1_200);
  }

  // Rotate 버튼 (i18n inventory.rotate = "Rotate")
  const rotateBtn = page.getByRole("button", { name: /^rotate$|회전|rotate value/i }).first();
  if (await rotateBtn.isVisible().catch(() => false)) {
    await rotateBtn.click();
    await page.waitForTimeout(1_000);

    // new value 입력
    const valueInput = page.getByLabel(/new value|new secret|새 값|new key/i).first();
    if (await valueInput.isVisible().catch(() => false)) {
      await valueInput.click();
      await valueInput.pressSequentially("sk-proj-RoTaTeD2026MayNewSecretKey", { delay: 50 });
      await page.waitForTimeout(800);
    }
  }

  await page.waitForTimeout(2_500);
});

// ────────────────────────────────────────────────────────────────────
// Scene 8 — Stale references (rotate 후 graph 의 사용처 추적)
// ────────────────────────────────────────────────────────────────────
test("demo: stale-references", async ({ page }) => {
  // rotate 직후 — credential 의 last_rotated_at 이 NOW (방금) 인 상태
  const rotatedCredentials = [
    { ...CREDENTIALS[0], last_rotated_at: NOW - 60 }, // 1분 전 rotate
    ...CREDENTIALS.slice(1),
  ];
  const map: CommandMap = {
    ...makeUnlockedBase(),
    credential_list: { kind: "ok", value: rotatedCredentials },
    graph_fetch: {
      kind: "ok",
      value: { ...GRAPH_PAYLOAD, credentials: rotatedCredentials },
    },
  };
  await page.addInitScript({ content: buildInitScript(map, onboardingDoneSettings) });
  await page.goto("/graph");

  await page.waitForTimeout(2_500);

  // 그래프 위 마우스 — 사용처가 그대로 남아있다는 점 강조 (여러 노드 위 hover)
  await page.mouse.move(540, 360, { steps: 25 });
  await page.waitForTimeout(1_200);
  await page.mouse.move(700, 420, { steps: 25 });
  await page.waitForTimeout(1_200);
  await page.mouse.move(620, 380, { steps: 25 });
  await page.waitForTimeout(2_500);
});
