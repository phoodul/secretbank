import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";

import "@/lib/i18n";

// ---------------------------------------------------------------------------
// invoke mock — tracks call order (project_create → credential_create × n → usage_create × n)
// ---------------------------------------------------------------------------

const invokeSpy = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeSpy(cmd, args),
}));

// ---------------------------------------------------------------------------
// useIssuers mock — minimal preset list with stable IDs
// ---------------------------------------------------------------------------

vi.mock("@/features/inventory/use-issuers", () => ({
  useIssuers: () => ({
    issuers: [
      {
        id: "01HZBBBBBBBBBBBBBBBBBBBBOA",
        slug: "openai",
        display_name: "OpenAI",
        docs_url: null,
        issue_url: null,
        status_url: null,
        security_feed_url: null,
        connector_id: null,
        icon_key: "openai",
        created_at: 0,
        updated_at: 0,
      },
      {
        id: "01HZBBBBBBBBBBBBBBBBBBBBSA",
        slug: "stripe",
        display_name: "Stripe",
        docs_url: null,
        issue_url: null,
        status_url: null,
        security_feed_url: null,
        connector_id: null,
        icon_key: "stripe",
        created_at: 0,
        updated_at: 0,
      },
    ],
    loading: false,
    error: null,
  }),
}));

import { DetectedKeysReview } from "../DetectedKeysReview";
import type { DetectedKey } from "../types";
import type { CredentialSummary } from "@/features/inventory/types";

function mockDetected(overrides: Partial<DetectedKey> = {}): DetectedKey {
  return {
    file_path: "/home/u/proj/.env",
    line: 1,
    env_var_name: "OPENAI_API_KEY",
    issuer_slug: "openai",
    value_hint: "aaaa",
    confidence: 0.95,
    ...overrides,
  };
}

function makeCredSummary(overrides: Partial<CredentialSummary> = {}): CredentialSummary {
  return {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBOA",
    name: "Existing Key",
    env: "prod",
    status: "active",
    expires_at: null,
    hash_hint: "aaaa",
    score: { total: 100, level: "safe", factors: [] },
    kind: "api_key",
    url: null,
    username: null,
    ...overrides,
  };
}

function renderReview(
  detected: DetectedKey[],
  existing: CredentialSummary[] = [],
  scannedPath = "/home/u/proj",
) {
  return render(
    <MemoryRouter>
      <DetectedKeysReview
        detected={detected}
        scannedPath={scannedPath}
        existingCredentials={existing}
      />
      <Toaster />
    </MemoryRouter>,
  );
}

describe("DetectedKeysReview", () => {
  beforeEach(() => {
    invokeSpy.mockReset();
    // Default mock: railguard_preview returns all missing, project_list returns empty.
    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === "railguard_preview") {
        return Promise.resolve([
          {
            kind: "cursor_rules",
            path: ".cursorrules",
            content: "",
            exists: false,
            action: "create",
          },
          {
            kind: "windsurf_rules",
            path: ".windsurfrules",
            content: "",
            exists: false,
            action: "create",
          },
          { kind: "claude_md", path: "CLAUDE.md", content: "", exists: false, action: "create" },
          {
            kind: "copilot_instructions",
            path: ".github/copilot-instructions.md",
            content: "",
            exists: false,
            action: "create",
          },
        ]);
      }
      if (cmd === "project_list") return Promise.resolve([]);
      if (cmd === "usage_list_for_project") return Promise.resolve([]);
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Existing tests (regression)
  // ---------------------------------------------------------------------------

  it("빈 결과면 'no detected keys' 안내를 보여준다", () => {
    renderReview([]);
    expect(screen.getByText(/no api keys detected|감지된 api 키가 없습니다/i)).toBeInTheDocument();
  });

  it("감지된 키를 표 한 줄씩 렌더한다", () => {
    const detected = [
      mockDetected({ env_var_name: "OPENAI_API_KEY", value_hint: "aaaa" }),
      mockDetected({
        env_var_name: "STRIPE_SECRET",
        issuer_slug: "stripe",
        value_hint: "bbbb",
        line: 5,
      }),
    ];
    renderReview(detected);
    expect(screen.getByText("OPENAI_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("STRIPE_SECRET")).toBeInTheDocument();
    expect(screen.getByText(/••••aaaa/)).toBeInTheDocument();
    expect(screen.getByText(/••••bbbb/)).toBeInTheDocument();
  });

  it("이미 추적 중인 hash_hint 는 'Already tracked' + 체크박스 비활성", () => {
    const detected = [mockDetected({ value_hint: "dupe" })];
    const existing: CredentialSummary[] = [makeCredSummary({ hash_hint: "dupe" })];
    renderReview(detected, existing);

    expect(screen.getByText(/already tracked|이미 등록됨/i)).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeDisabled();
  });

  it("Import 클릭 → project_create → credential_create × n → usage_create × n 순서로 호출", async () => {
    const detected = [
      mockDetected({ env_var_name: "OPENAI_API_KEY", value_hint: "aaaa" }),
      mockDetected({
        env_var_name: "STRIPE_SECRET",
        issuer_slug: "stripe",
        value_hint: "bbbb",
        line: 5,
      }),
    ];

    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === "railguard_preview") return Promise.resolve([]);
      if (cmd === "project_list") return Promise.resolve([]);
      if (cmd === "project_create") return Promise.resolve("01HZPROJECT00000000000000");
      if (cmd === "credential_create") return Promise.resolve("01HZCRED00000000000000000");
      if (cmd === "usage_create") return Promise.resolve("01HZUSAGE0000000000000000");
      return Promise.resolve(null);
    });

    renderReview(detected, [], "/home/u/my-project");

    const user = userEvent.setup();
    const button = screen.getByRole("button", {
      name: /import 2 keys|2개 가져오기|2個インポート/i,
    });
    await user.click(button);

    await waitFor(() => {
      const commands = invokeSpy.mock.calls
        .map((c) => c[0] as string)
        .filter(
          (c) =>
            c !== "railguard_preview" && c !== "project_list" && c !== "usage_list_for_project",
        );
      expect(commands).toEqual([
        "project_create",
        "credential_create",
        "usage_create",
        "credential_create",
        "usage_create",
      ]);
    });

    const projectCall = invokeSpy.mock.calls.find((c) => c[0] === "project_create");
    expect(projectCall?.[1]).toMatchObject({
      input: expect.objectContaining({
        name: "my-project",
        local_path: "/home/u/my-project",
      }),
    });
  });

  it("issuer 매칭 실패(entropy-only) 항목은 기본 선택되지 않는다", () => {
    const detected = [
      mockDetected({ issuer_slug: null, env_var_name: "UNKNOWN", value_hint: "cccc" }),
    ];
    renderReview(detected);
    const [cb] = screen.getAllByRole("checkbox");
    expect(cb).not.toBeChecked();
  });

  it("RAILGUARD CTA 배너가 표시되고 /railguard?projectPath=... 링크를 포함한다", async () => {
    const detected = [mockDetected()];
    renderReview(detected, [], "/home/u/my-scanned-project");

    // CTA defaults to visible; probe returns "all missing" → stays visible.
    const cta = await screen.findByTestId("railguard-cta");
    expect(cta).toBeInTheDocument();

    const ctaLink = screen.getByTestId("railguard-cta-link");
    expect(ctaLink).toBeInTheDocument();
    // Clicking should navigate (no error thrown)
    ctaLink.click();
  });

  it("T068 — 모든 RAILGUARD 룰 파일이 이미 존재하면 CTA 배너를 숨긴다", async () => {
    // Override default mock: every rule file already exists → banner should disappear.
    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === "railguard_preview") {
        return Promise.resolve([
          { kind: "cursor_rules", path: ".cursorrules", content: "", exists: true, action: "skip" },
          {
            kind: "windsurf_rules",
            path: ".windsurfrules",
            content: "",
            exists: true,
            action: "skip",
          },
          { kind: "claude_md", path: "CLAUDE.md", content: "", exists: true, action: "skip" },
          {
            kind: "copilot_instructions",
            path: ".github/copilot-instructions.md",
            content: "",
            exists: true,
            action: "skip",
          },
        ]);
      }
      if (cmd === "project_list") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const detected = [mockDetected()];
    renderReview(detected, [], "/home/u/ready-project");

    await waitFor(() => {
      expect(screen.queryByTestId("railguard-cta")).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // New rotation tests
  // ---------------------------------------------------------------------------

  it("rotated 시나리오 — 같은 env_var + 같은 project + 다른 hash_hint → Rotated 배지 + Replace 라디오 디폴트", async () => {
    // Setup: project_list returns a project matching scannedPath,
    // usage_list_for_project returns a usage linking OPENAI_API_KEY to credential "cred-old".
    const CRED_ID = "01HZCRED_OLD0000000000000";
    const existing = [
      makeCredSummary({ id: CRED_ID, hash_hint: "bbbb" }), // old hash_hint
    ];
    const detected = [
      mockDetected({ env_var_name: "OPENAI_API_KEY", value_hint: "cccc" }), // different hint → rotated
    ];

    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === "railguard_preview") return Promise.resolve([]);
      if (cmd === "project_list") {
        return Promise.resolve([
          {
            id: "proj-1",
            name: "proj",
            local_path: "/home/u/proj",
            repo_url: null,
            framework: null,
            runtime: null,
            created_at: 0,
            updated_at: 0,
          },
        ]);
      }
      if (cmd === "usage_list_for_project") {
        return Promise.resolve([
          {
            id: "u1",
            credential_id: CRED_ID,
            project_id: "proj-1",
            deployment_id: null,
            where_kind: "env_var",
            where_value: "OPENAI_API_KEY",
            verified_at: null,
            verified_by: null,
          },
        ]);
      }
      return Promise.resolve(null);
    });

    renderReview(detected, existing, "/home/u/proj");

    // Wait for the async project fetch to complete.
    const badge = await screen.findByTestId("rotated-badge-0");
    expect(badge).toBeInTheDocument();

    // Replace radio should be default-checked.
    await waitFor(() => {
      const replaceRadio = screen.getByTestId("replace-radio-0") as HTMLInputElement;
      expect(replaceRadio.checked).toBe(true);
    });
  });

  it("Replace 모드로 Import 클릭 → credential_rotate_value 호출됨, credential_create 호출 안 됨", async () => {
    const CRED_ID = "01HZCRED_OLD0000000000001";
    const existing = [makeCredSummary({ id: CRED_ID, hash_hint: "bbbb" })];
    const detected = [mockDetected({ env_var_name: "OPENAI_API_KEY", value_hint: "cccc" })];

    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === "railguard_preview") return Promise.resolve([]);
      if (cmd === "project_list") {
        return Promise.resolve([
          {
            id: "proj-1",
            name: "proj",
            local_path: "/home/u/proj",
            repo_url: null,
            framework: null,
            runtime: null,
            created_at: 0,
            updated_at: 0,
          },
        ]);
      }
      if (cmd === "usage_list_for_project") {
        return Promise.resolve([
          {
            id: "u1",
            credential_id: CRED_ID,
            project_id: "proj-1",
            deployment_id: null,
            where_kind: "env_var",
            where_value: "OPENAI_API_KEY",
            verified_at: null,
            verified_by: null,
          },
        ]);
      }
      if (cmd === "credential_rotate_value") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    renderReview(detected, existing, "/home/u/proj");

    // Wait for rotation detection.
    await screen.findByTestId("rotated-badge-0");

    const user = userEvent.setup();
    const importButton = await screen.findByRole("button", {
      name: /import|가져오기|インポート|导入/i,
    });
    await user.click(importButton);

    await waitFor(() => {
      const cmds = invokeSpy.mock.calls.map((c) => c[0] as string);
      expect(cmds).toContain("credential_rotate_value");
      expect(cmds).not.toContain("credential_create");
      expect(cmds).not.toContain("project_create");
    });

    const rotateCall = invokeSpy.mock.calls.find((c) => c[0] === "credential_rotate_value");
    expect(rotateCall?.[1]).toMatchObject({
      input: expect.objectContaining({
        id: CRED_ID,
        hash_hint: "cccc",
      }),
    });
  });

  it("같은 env_var + 같은 project + 같은 hash_hint → Already tracked (기존 동작 회귀 검증)", async () => {
    const CRED_ID = "01HZCRED_SAME0000000000";
    const existing = [makeCredSummary({ id: CRED_ID, hash_hint: "aaaa" })];
    const detected = [
      mockDetected({ env_var_name: "OPENAI_API_KEY", value_hint: "aaaa" }), // same hint
    ];

    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === "railguard_preview") return Promise.resolve([]);
      if (cmd === "project_list") {
        return Promise.resolve([
          {
            id: "proj-1",
            name: "proj",
            local_path: "/home/u/proj",
            repo_url: null,
            framework: null,
            runtime: null,
            created_at: 0,
            updated_at: 0,
          },
        ]);
      }
      if (cmd === "usage_list_for_project") {
        return Promise.resolve([
          {
            id: "u1",
            credential_id: CRED_ID,
            project_id: "proj-1",
            deployment_id: null,
            where_kind: "env_var",
            where_value: "OPENAI_API_KEY",
            verified_at: null,
            verified_by: null,
          },
        ]);
      }
      return Promise.resolve(null);
    });

    renderReview(detected, existing, "/home/u/proj");

    // "already tracked" badge should show.
    expect(await screen.findByText(/already tracked|이미 등록됨/i)).toBeInTheDocument();

    // No "rotated" badge.
    expect(screen.queryByTestId("rotated-badge-0")).not.toBeInTheDocument();

    // Checkbox disabled.
    const cb = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
    expect(cb.disabled).toBe(true);
  });

  it("다른 project (scannedPath 매칭 없음) → 기존 동작 (배지 없음, 신규 credential 으로 import)", async () => {
    const detected = [mockDetected({ env_var_name: "OPENAI_API_KEY", value_hint: "dddd" })];

    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === "railguard_preview") return Promise.resolve([]);
      if (cmd === "project_list") {
        // Different local_path → no match.
        return Promise.resolve([
          {
            id: "proj-other",
            name: "other",
            local_path: "/home/u/other-project",
            repo_url: null,
            framework: null,
            runtime: null,
            created_at: 0,
            updated_at: 0,
          },
        ]);
      }
      if (cmd === "project_create") return Promise.resolve("01HZNEWPROJECT000000000");
      if (cmd === "credential_create") return Promise.resolve("01HZNEWCRED0000000000");
      if (cmd === "usage_create") return Promise.resolve("01HZNEWUSAGE000000000");
      return Promise.resolve(null);
    });

    renderReview(detected, [], "/home/u/proj");

    // No rotated badge.
    await waitFor(() => {
      expect(screen.queryByTestId("rotated-badge-0")).not.toBeInTheDocument();
    });

    // Import button should exist and clicking creates a new credential.
    const user = userEvent.setup();
    const importButton = screen.getByRole("button", {
      name: /import 1 key|1개 가져오기|1個インポート|导入 1 个/i,
    });
    await user.click(importButton);

    await waitFor(() => {
      const cmds = invokeSpy.mock.calls
        .map((c) => c[0] as string)
        .filter(
          (c) => !["railguard_preview", "project_list", "usage_list_for_project"].includes(c),
        );
      expect(cmds).toContain("credential_create");
      expect(cmds).not.toContain("credential_rotate_value");
    });
  });

  it("Add as new 라디오 선택 후 Import → credential_create 호출됨 (replace 우회)", async () => {
    const CRED_ID = "01HZCRED_BYPASS000000000";
    const existing = [makeCredSummary({ id: CRED_ID, hash_hint: "bbbb" })];
    const detected = [mockDetected({ env_var_name: "OPENAI_API_KEY", value_hint: "cccc" })];

    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === "railguard_preview") return Promise.resolve([]);
      if (cmd === "project_list") {
        return Promise.resolve([
          {
            id: "proj-1",
            name: "proj",
            local_path: "/home/u/proj",
            repo_url: null,
            framework: null,
            runtime: null,
            created_at: 0,
            updated_at: 0,
          },
        ]);
      }
      if (cmd === "usage_list_for_project") {
        return Promise.resolve([
          {
            id: "u1",
            credential_id: CRED_ID,
            project_id: "proj-1",
            deployment_id: null,
            where_kind: "env_var",
            where_value: "OPENAI_API_KEY",
            verified_at: null,
            verified_by: null,
          },
        ]);
      }
      if (cmd === "project_create") return Promise.resolve("01HZNEWPROJECT000000001");
      if (cmd === "credential_create") return Promise.resolve("01HZNEWCRED0000000001");
      if (cmd === "usage_create") return Promise.resolve("01HZNEWUSAGE000000001");
      return Promise.resolve(null);
    });

    renderReview(detected, existing, "/home/u/proj");

    // Wait for rotation detection.
    await screen.findByTestId("rotated-badge-0");

    // Switch to "Add as new".
    const user = userEvent.setup();
    const addAsNewRadio = await screen.findByTestId("add-as-new-radio-0");
    await user.click(addAsNewRadio);

    const importButton = screen.getByRole("button", { name: /import|가져오기|インポート|导入/i });
    await user.click(importButton);

    await waitFor(() => {
      const cmds = invokeSpy.mock.calls.map((c) => c[0] as string);
      expect(cmds).toContain("credential_create");
      expect(cmds).not.toContain("credential_rotate_value");
    });
  });
});
