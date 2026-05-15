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
  // unlock 성공 mock — Unlock 버튼 클릭 시 verifying → unlocking 애니메이션 트리거
  vault_unlock: { kind: "ok", value: null },
};

test("demo: lock-screen", async ({ page }) => {
  await page.addInitScript({ content: buildInitScript(lockedVaultWithCharter) });
  await page.goto("/");

  // LockScreen mount 대기 (passphrase input visible) — React 첫 paint 보장
  const pw = page.locator("#unlock-passphrase");
  await expect(pw).toBeVisible({ timeout: 10_000 });

  // 짧은 mouse cycle (분위기 — 2 cycle x 0.5s = 1s)
  const cx = 640;
  const cy = 400;
  for (let i = 0; i < 2; i++) {
    const angle = (i / 2) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(angle) * 180, cy + Math.sin(angle) * 100, { steps: 20 });
    await page.waitForTimeout(500);
  }

  // passphrase 타이핑 — 사용자가 보이도록 천천히 (delay 95ms x 30chars ≈ 2.85s)
  await pw.click();
  await page.waitForTimeout(300);
  await pw.pressSequentially("correct horse battery staple", { delay: 95 });
  await page.waitForTimeout(700);

  // Unlock 버튼 click — verifying → unlocking 애니메이션 트리거
  // (i18n vault.unlockButton — en: "Unlock" / ko: "잠금 해제")
  const unlockBtn = page.getByRole("button", { name: /^unlock$|^잠금 해제$/i }).first();
  await unlockBtn.click({ timeout: 3_000 }).catch(() => {
    /* 못 찾아도 계속 — 영상은 타이핑까지 캡처됨 */
  });

  // unlock 애니메이션 (UNLOCK_ANIMATION_MS = 1.4s spring → success ring) 보여주기
  await page.waitForTimeout(2_500);
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

// CredentialSummary (src/features/inventory/types.ts) — env (not environment),
// score is ScoreBreakdown object (not number), expires_at in ms.
const CREDENTIALS = [
  {
    id: "cred-openai-prod",
    issuer_id: "issuer-openai",
    name: "prod-openai-billing",
    env: "prod" as const,
    status: "active" as const,
    expires_at: null,
    hash_hint: "AbCd",
    score: { total: 72, level: "safe" as const, factors: [] },
  },
  {
    id: "cred-stripe-prod",
    issuer_id: "issuer-stripe",
    name: "prod-stripe-secret",
    env: "prod" as const,
    status: "active" as const,
    expires_at: null,
    hash_hint: "wXyZ",
    score: { total: 88, level: "safe" as const, factors: [] },
  },
  {
    id: "cred-github-pat",
    issuer_id: "issuer-github",
    name: "github-deploy-pat",
    env: "prod" as const,
    status: "active" as const,
    expires_at: (NOW + 30 * DAY) * 1000,
    hash_hint: "Q3rT",
    score: { total: 55, level: "warn" as const, factors: [] },
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

// 실제 GraphPayload type = { nodes: GraphNode[], edges: GraphEdge[] }
// (src/features/graph/types.ts) — 이전엔 { issuers, credentials, ... } 로
// 잘못 mock 해서 React 가 nodes.length 에서 throw → 페이지 빈 화면이 됐다.
const GRAPH_PAYLOAD = {
  nodes: [
    { id: "issuer-openai", kind: "issuer", label: "OpenAI", meta_json: {} },
    { id: "issuer-stripe", kind: "issuer", label: "Stripe", meta_json: {} },
    { id: "issuer-github", kind: "issuer", label: "GitHub", meta_json: {} },
    {
      id: "cred-openai-prod",
      kind: "credential",
      label: "prod-openai-billing",
      meta_json: { issuer_slug: "openai", env: "prod", status: "active" },
    },
    {
      id: "cred-stripe-prod",
      kind: "credential",
      label: "prod-stripe-secret",
      meta_json: { issuer_slug: "stripe", env: "prod", status: "active" },
    },
    {
      id: "cred-github-pat",
      kind: "credential",
      label: "github-deploy-pat",
      meta_json: { issuer_slug: "github", env: "prod", status: "active" },
    },
    { id: "proj-billing", kind: "project", label: "Billing API", meta_json: {} },
    { id: "proj-checkout", kind: "project", label: "Checkout Service", meta_json: {} },
    {
      id: "dep-billing-prod",
      kind: "deployment",
      label: "billing.prod",
      meta_json: { platform: "vercel", url: "https://api-billing.example.com" },
    },
    {
      id: "dep-checkout-prod",
      kind: "deployment",
      label: "checkout.prod",
      meta_json: { platform: "aws", url: "https://checkout.example.com" },
    },
  ],
  edges: [
    {
      id: "issuer-openai->cred-openai-prod:issues",
      source: "issuer-openai",
      target: "cred-openai-prod",
      kind: "issues",
    },
    {
      id: "issuer-stripe->cred-stripe-prod:issues",
      source: "issuer-stripe",
      target: "cred-stripe-prod",
      kind: "issues",
    },
    {
      id: "issuer-github->cred-github-pat:issues",
      source: "issuer-github",
      target: "cred-github-pat",
      kind: "issues",
    },
    {
      id: "cred-openai-prod->proj-billing:used_by",
      source: "cred-openai-prod",
      target: "proj-billing",
      kind: "used_by",
    },
    {
      id: "cred-stripe-prod->proj-checkout:used_by",
      source: "cred-stripe-prod",
      target: "proj-checkout",
      kind: "used_by",
    },
    {
      id: "cred-github-pat->proj-billing:used_by",
      source: "cred-github-pat",
      target: "proj-billing",
      kind: "used_by",
    },
    {
      id: "proj-billing->dep-billing-prod:deployed_as",
      source: "proj-billing",
      target: "dep-billing-prod",
      kind: "deployed_as",
    },
    {
      id: "proj-checkout->dep-checkout-prod:deployed_as",
      source: "proj-checkout",
      target: "dep-checkout-prod",
      kind: "deployed_as",
    },
  ],
};

// IncidentListEntry = { incident: Incident, matches: IncidentMatchDetail[] }
// (src/features/incidents/types.ts) — Rust enum + nested 구조. timestamps 는 ms.
const INCIDENT_ENTRIES = [
  {
    incident: {
      id: "inc-1",
      source: "ghsa",
      source_id: "GHSA-2026-0429-openai",
      issuer_id: "issuer-openai",
      severity: "high",
      title: "OpenAI API key abuse via leaked .env in popular npm package",
      body: "GHSA-2026-04-29: An OpenAI key embedded in node_modules has been mass-scanned. Affected accounts may see anomalous usage spikes.",
      url: "https://github.com/advisories/GHSA-2026-0429-openai",
      detected_at: (NOW - 2 * DAY) * 1000,
      published_at: (NOW - 2 * DAY) * 1000,
    },
    matches: [
      {
        id: "match-1-1",
        credential_id: "cred-openai-prod",
        credential_label: "prod-openai-billing",
        issuer_display_name: "OpenAI",
        reason: "issuer_match",
        matched_at: (NOW - 2 * DAY) * 1000,
        dismissed_at: null,
      },
    ],
  },
  {
    incident: {
      id: "inc-2",
      source: "ghsa",
      source_id: "GHSA-2026-0428-github",
      issuer_id: "issuer-github",
      severity: "medium",
      title: "GitHub PAT scope inflation — fine-grained tokens leaked via supply chain",
      body: "Affected: repos with admin PAT older than 60 days. Rotate to keep deploy pipelines safe.",
      url: "https://github.com/advisories/GHSA-2026-0428-github",
      detected_at: (NOW - 4 * DAY) * 1000,
      published_at: (NOW - 4 * DAY) * 1000,
    },
    matches: [
      {
        id: "match-2-1",
        credential_id: "cred-github-pat",
        credential_label: "github-deploy-pat",
        issuer_display_name: "GitHub",
        reason: "issuer_match",
        matched_at: (NOW - 4 * DAY) * 1000,
        dismissed_at: null,
      },
    ],
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
      // BlastRadius type = { primary, secondary, tertiary, unaffected }
      // 각 항목은 BlastRadiusNode { kind, id } 형식 (string 아님)
      value: {
        primary: [{ kind: "credential", id: "cred-openai-prod" }],
        secondary: [{ kind: "project", id: "proj-billing" }],
        tertiary: [{ kind: "deployment", id: "dep-billing-prod" }],
        unaffected: [],
      },
    },
    incident_list: { kind: "ok", value: INCIDENT_ENTRIES },
    incident_matches_for_credential: { kind: "ok", value: [INCIDENT_ENTRIES[0]] },
    list_incidents_with_matches_for_credential: { kind: "ok", value: [INCIDENT_ENTRIES[0]] },
    audit_list: { kind: "ok", value: [] },
    audit_verify_chain: { kind: "ok", value: { verified: true, broken_at: null, total: 0 } },
    entitlement_status: { kind: "ok", value: { plan: "pro", source: "beta", expires_at: null } },
    auth_status: { kind: "ok", value: { user_id: "demo-user", email: "demo@secretbank.app" } },
    feed_refresh: { kind: "ok", value: { ok: true } },
  };
}

// useOnboardingDone 의 실제 key (src/features/onboarding/use-onboarding.ts).
// 잘못 적으면 RequireOnboarding 가드가 /welcome 으로 redirect 해 모든 demo 가
// "Welcome to API Vault" 화면에 머문다.
const onboardingDoneSettings = {
  "secretbank.settings.onboarding.done": "true",
};

// ────────────────────────────────────────────────────────────────────
// Scene 4 — Save credential (drop a project folder, auto-detect .env keys)
// ────────────────────────────────────────────────────────────────────
const DETECTED_KEYS = [
  {
    file_path: "apps/billing/.env.production",
    line: 3,
    env_var_name: "OPENAI_API_KEY",
    issuer_slug: "openai",
    value_hint: "AbCd",
    confidence: 0.97,
  },
  {
    file_path: "apps/billing/.env.production",
    line: 7,
    env_var_name: "STRIPE_SECRET_KEY",
    issuer_slug: "stripe",
    value_hint: "wXyZ",
    confidence: 0.95,
  },
  {
    file_path: "apps/checkout/server/.env",
    line: 2,
    env_var_name: "DATABASE_URL",
    issuer_slug: null,
    value_hint: "f9e2",
    confidence: 0.62,
  },
  {
    file_path: ".github/workflows/deploy.yml",
    line: 22,
    env_var_name: "GITHUB_TOKEN",
    issuer_slug: "github",
    value_hint: "Q3rT",
    confidence: 0.88,
  },
];

test("demo: save-credential", async ({ page }) => {
  // Drop-zone 시나리오 — `/onboarding/scan?path=...` 가 env_scan_prepare 호출 →
  // DetectedKeysReview 가 발견된 키들을 보여줌. 사용자가 매핑하고 env_scan_commit.
  const map: CommandMap = {
    ...makeUnlockedBase(),
    credential_list: { kind: "ok", value: [] },
    env_scan_prepare: {
      kind: "ok",
      value: {
        sessionId: "demo-session",
        entries: DETECTED_KEYS,
        expiresAtUnixMs: Date.now() + 5 * 60 * 1000,
        scannedPath: "/Users/demo/Projects/billing",
      },
    },
    env_scan_commit: {
      kind: "ok",
      value: {
        projectId: "demo-project",
        projectName: "billing",
        credentialsCreated: DETECTED_KEYS.length,
        usagesCreated: DETECTED_KEYS.length,
        failed: 0,
        rows: [],
      },
    },
    railguard_preview: { kind: "ok", value: { sites: [] } },
  };
  await page.addInitScript({ content: buildInitScript(map, onboardingDoneSettings) });
  await page.goto("/onboarding/scan?path=" + encodeURIComponent("/Users/demo/Projects/billing"));

  // 페이지 마운트 + scan progress → done → DetectedKeysReview 렌더
  await page.waitForTimeout(3_500);

  // 마우스로 검출된 키들 위 hover (시각적 강조)
  await page.mouse.move(640, 320, { steps: 25 });
  await page.waitForTimeout(1_000);
  await page.mouse.move(640, 420, { steps: 25 });
  await page.waitForTimeout(1_500);
  await page.mouse.move(640, 520, { steps: 25 });
  await page.waitForTimeout(2_500);
});

// ────────────────────────────────────────────────────────────────────
// Scene 5 — Dependency graph (차별화 포인트)
// ────────────────────────────────────────────────────────────────────
test("demo: dependency-graph", async ({ page }) => {
  const map = makeUnlockedBase();
  await page.addInitScript({ content: buildInitScript(map, onboardingDoneSettings) });
  await page.goto("/graph");

  await page.addStyleTag({
    content: `
      .react-flow__attribution,
      .react-flow__minimap,
      .react-flow__controls { display: none !important; }
    `,
  });

  // GraphPage 마운트 + React Flow 초기 layout
  await page.waitForTimeout(3_500);

  // 그래프 전체가 보이는 상태에서 마우스만 천천히 — pan/zoom 효과만 (no click)
  // stale-references 와 차별화: dependency-graph 는 "구조 보여주기", stale 은 "rotate 후 영향".
  await page.mouse.move(740, 380, { steps: 30 });
  await page.waitForTimeout(1_500);
  await page.mouse.move(540, 460, { steps: 30 });
  await page.waitForTimeout(1_500);
  await page.mouse.move(640, 360, { steps: 30 });
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

  // Inventory 마운트 + 카드 1번 클릭. timeout 짧게 (영상 길이 cap).
  await page.waitForTimeout(2_500);
  const firstCard = page.getByText(/prod-openai-billing/i).first();
  await firstCard.click({ timeout: 5_000 }).catch(() => {
    /* selector 못 찾으면 skip — 영상은 inventory + drawer 까지 캡처 */
  });
  await page.waitForTimeout(2_500); // drawer slide-in

  // Rotate 버튼 시도 — fail 해도 timeout 안 발생 (영상 길어지지 않게)
  const rotateBtn = page.getByRole("button", { name: /^rotate$|회전|rotate value/i }).first();
  await rotateBtn.click({ timeout: 4_000 }).catch(() => {
    /* skip */
  });
  await page.waitForTimeout(1_500);

  // 마지막 frame — rotate detail 화면 충분히 보여줌. 전체 spec 약 11초.
  await page.waitForTimeout(2_500);
});

// ────────────────────────────────────────────────────────────────────
// Scene 8 — Stale references (rotate 후 graph 의 사용처 추적)
// ────────────────────────────────────────────────────────────────────
test("demo: stale-references", async ({ page }) => {
  // rotate 직후 — credential 의 last_rotated_at 이 NOW (방금) 인 상태.
  // graph 에 credential 클릭 → blast radius 활성화 → "이 곳들이 아직 옛 키를 참조"
  // 시각적 강조 (red/orange highlight). dependency-graph 시나리오와 차별화.
  const rotatedCredentials = [
    { ...CREDENTIALS[0], last_rotated_at: NOW - 60 },
    ...CREDENTIALS.slice(1),
  ];
  const map: CommandMap = {
    ...makeUnlockedBase(),
    credential_list: { kind: "ok", value: rotatedCredentials },
  };
  await page.addInitScript({ content: buildInitScript(map, onboardingDoneSettings) });
  await page.goto("/graph");

  await page.addStyleTag({
    content: `
      .react-flow__attribution,
      .react-flow__minimap,
      .react-flow__controls { display: none !important; }
    `,
  });

  await page.waitForTimeout(3_000);

  // credential 노드 클릭 → blast radius highlight
  const credNode = page.getByText(/prod-openai-billing/i).first();
  if (await credNode.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await credNode.click();
    await page.waitForTimeout(2_000);
  }

  // 차별화 핵심: 큰 overlay 텍스트 — "Old key still wired into these usages"
  // dependency-graph 는 그래프 구조 자체, stale-references 는 rotate 후 "어디 남았나" 강조.
  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "demo-stale-overlay";
    el.style.cssText = `
      position: fixed; left: 50%; top: 8%; transform: translateX(-50%);
      z-index: 9999; pointer-events: none;
      padding: 10px 18px; border-radius: 12px;
      background: linear-gradient(135deg, rgba(220,38,38,0.92), rgba(234,88,12,0.92));
      color: #fff; font-family: Inter, system-ui, sans-serif;
      font-weight: 600; font-size: 14px; letter-spacing: 0.01em;
      box-shadow: 0 8px 32px rgba(220,38,38,0.45);
      display: flex; align-items: center; gap: 10px;
    `;
    el.innerHTML = `
      <span style="font-size:18px">⚠</span>
      <div>
        <div>Old key still referenced in 1 project / 1 deployment</div>
        <div style="font-size:11px; opacity:0.85; font-weight:400; margin-top:2px">
          Rotate finished — manually update these call sites
        </div>
      </div>
    `;
    document.body.appendChild(el);
  });
  await page.waitForTimeout(3_000);

  // 그래프 위 마우스 — 사용처가 그대로 남아있다는 점 강조 (여러 노드 위 hover)
  await page.mouse.move(540, 360, { steps: 25 });
  await page.waitForTimeout(1_200);
  await page.mouse.move(700, 420, { steps: 25 });
  await page.waitForTimeout(1_200);
  await page.mouse.move(620, 380, { steps: 25 });
  await page.waitForTimeout(2_500);
});
