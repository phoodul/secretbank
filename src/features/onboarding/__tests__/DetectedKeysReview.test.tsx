import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function renderReview(
  detected: DetectedKey[],
  existing: CredentialSummary[] = [],
  scannedPath = "/home/u/proj",
) {
  return render(
    <>
      <DetectedKeysReview
        detected={detected}
        scannedPath={scannedPath}
        existingCredentials={existing}
      />
      <Toaster />
    </>,
  );
}

describe("DetectedKeysReview", () => {
  beforeEach(() => {
    invokeSpy.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    const existing: CredentialSummary[] = [
      {
        id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
        issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBOA",
        name: "Existing",
        env: "prod",
        status: "active",
        expires_at: null,
        hash_hint: "dupe",
      },
    ];
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
      if (cmd === "project_create") return Promise.resolve("01HZPROJECT00000000000000");
      if (cmd === "credential_create") return Promise.resolve("01HZCRED00000000000000000");
      if (cmd === "usage_create") return Promise.resolve("01HZUSAGE0000000000000000");
      return Promise.resolve(null);
    });

    renderReview(detected, [], "/home/u/my-project");

    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: /import 2 keys|2개 가져오기|2個インポート/i });
    await user.click(button);

    await waitFor(() => {
      const commands = invokeSpy.mock.calls.map((c) => c[0] as string);
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
});
