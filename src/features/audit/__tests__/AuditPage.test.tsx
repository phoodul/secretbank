import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";

// ---------------------------------------------------------------------------
// Mocks — must come before component imports
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { AuditPage } from "../AuditPage";
import type { AuditEntry, ChainVerifyReport } from "../types";

const mockInvoke = vi.mocked(invoke);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "01J0000000000000000000000A",
    seq: 1,
    device_id: "device-abc-123",
    actor: "local-user",
    action: "credential.create",
    subject_kind: "credential",
    subject_id: "01J0000000000000000000000C",
    payload_json: null,
    created_at_ms: Date.now() - 60_000,
    prev_hash_hex: "0".repeat(64),
    entry_hash_hex: "a".repeat(64),
    signature_hex: "b".repeat(128),
    ...overrides,
  };
}

function makeReport(allValid: boolean): ChainVerifyReport {
  return {
    all_valid: allValid,
    total_entries: 3,
    devices: [
      {
        device_id: "device-abc-123",
        valid_count: allValid ? 3 : 2,
        first_invalid_seq: allValid ? null : 2,
      },
    ],
  };
}

function routeInvokes(responses: {
  audit_list?: AuditEntry[];
  audit_verify_chain?: ChainVerifyReport;
  audit_list_error?: boolean;
}) {
  mockInvoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case "audit_list":
        if (responses.audit_list_error) return Promise.reject("network error");
        return Promise.resolve(responses.audit_list ?? []);
      case "audit_verify_chain":
        return Promise.resolve(responses.audit_verify_chain ?? makeReport(true));
      case "vault_status":
        return Promise.resolve({ state: "unlocked" });
      case "credential_list":
      case "project_list":
        return Promise.resolve([]);
      default:
        return Promise.resolve(undefined);
    }
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuditPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuditPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // (a) Empty state when audit_list returns []
  // -------------------------------------------------------------------------
  it("(a) audit_list 가 빈 배열을 반환하면 empty state 를 렌더링한다", async () => {
    routeInvokes({ audit_list: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("audit-empty")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // (b) Renders table with 3 mock entries of different actions
  // -------------------------------------------------------------------------
  it("(b) 3개의 mock entry 를 테이블로 렌더링한다", async () => {
    const entries: AuditEntry[] = [
      makeEntry({ id: "01J0000000000000000000000A", seq: 1, action: "credential.create" }),
      makeEntry({ id: "01J0000000000000000000000B", seq: 2, action: "project.update" }),
      makeEntry({ id: "01J0000000000000000000000C", seq: 3, action: "credential.delete" }),
    ];
    routeInvokes({ audit_list: entries });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("audit-table")).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId("audit-row");
    expect(rows).toHaveLength(3);

    // Spot-check action labels are present
    expect(screen.getByText("credential.create")).toBeInTheDocument();
    expect(screen.getByText("project.update")).toBeInTheDocument();
    expect(screen.getByText("credential.delete")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // (c) Filter action_prefix calls audit_list with correct param
  // -------------------------------------------------------------------------
  it("(c) action prefix 필터링 시 audit_list 에 action_prefix 를 전달한다", async () => {
    const user = userEvent.setup();
    routeInvokes({ audit_list: [] });

    renderPage();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId("audit-empty")).toBeInTheDocument();
    });

    // Type into the action prefix input
    const input = screen.getByPlaceholderText(/e\.g\. credential\./i);
    await user.clear(input);
    await user.type(input, "credential.");

    // Wait for re-fetch
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "audit_list",
        expect.objectContaining({
          input: expect.objectContaining({ action_prefix: "credential." }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // (d) Verify integrity → green success banner on all_valid=true
  // -------------------------------------------------------------------------
  it("(d) Verify integrity 클릭 시 all_valid=true 이면 성공 배너를 표시한다", async () => {
    const user = userEvent.setup();
    routeInvokes({ audit_list: [], audit_verify_chain: makeReport(true) });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("audit-empty")).toBeInTheDocument();
    });

    const verifyBtn = screen.getByRole("button", { name: /verify integrity/i });
    await user.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByTestId("verify-success-banner")).toBeInTheDocument();
    });

    expect(mockInvoke).toHaveBeenCalledWith("audit_verify_chain");
  });

  // -------------------------------------------------------------------------
  // (e) Red banner + device rows when all_valid=false
  // -------------------------------------------------------------------------
  it("(e) all_valid=false 이면 red banner 와 디바이스 행을 표시한다", async () => {
    const user = userEvent.setup();
    routeInvokes({ audit_list: [], audit_verify_chain: makeReport(false) });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("audit-empty")).toBeInTheDocument();
    });

    const verifyBtn = screen.getByRole("button", { name: /verify integrity/i });
    await user.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByTestId("verify-failed-banner")).toBeInTheDocument();
    });

    // Device detail row is present
    expect(screen.getByText(/device-abc-123/i)).toBeInTheDocument();
    // first_invalid_seq shown
    expect(screen.getByText(/first invalid seq: 2/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // (f) Load more increments offset
  // -------------------------------------------------------------------------
  it("(f) Load more 클릭 시 offset 이 증가한 채로 audit_list 를 재호출한다", async () => {
    const user = userEvent.setup();

    // Return 100 entries to show "Load more"
    const entries = Array.from({ length: 100 }, (_, i) =>
      makeEntry({ id: `entry-${i.toString().padStart(26, "0")}`, seq: i + 1 }),
    );
    routeInvokes({ audit_list: entries });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("audit-table")).toBeInTheDocument();
    });

    const loadMoreBtn = screen.getByTestId("load-more-btn");
    await user.click(loadMoreBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "audit_list",
        expect.objectContaining({
          input: expect.objectContaining({ offset: 100 }),
        }),
      );
    });
  });
});
