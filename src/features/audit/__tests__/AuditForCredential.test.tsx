/**
 * T074 — AuditForCredential 컴포넌트 테스트
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";

// ---------------------------------------------------------------------------
// Mocks — before component imports
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { AuditForCredential } from "../AuditForCredential";
import type { AuditEntry } from "../types";

const mockInvoke = vi.mocked(invoke);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CRED_ID = "01HZBBBBBBBBBBBBBBBBBBBBBB";

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "01J0000000000000000000000A",
    seq: 1,
    device_id: "device-abc-123",
    actor: "local-user",
    action: "credential.create",
    subject_kind: "credential",
    subject_id: CRED_ID,
    payload_json: null,
    created_at_ms: Date.now() - 60_000,
    prev_hash_hex: "0".repeat(64),
    entry_hash_hex: "a".repeat(64),
    signature_hex: "b".repeat(128),
    ...overrides,
  };
}

function renderComponent(credentialId: string | null = CRED_ID) {
  return render(
    <MemoryRouter>
      <AuditForCredential credentialId={credentialId} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuditForCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // (a) Empty state when audit_list returns []
  // -------------------------------------------------------------------------
  it("(a) audit_list 가 [] 를 반환하면 empty state 를 렌더링한다", async () => {
    mockInvoke.mockResolvedValue([]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("audit-for-credential-empty")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // (b) Renders 5 mock entries with correct action badges
  // -------------------------------------------------------------------------
  it("(b) 5개의 mock entry 를 올바른 action badge 와 함께 렌더링한다", async () => {
    const actions = [
      "credential.create",
      "credential.update",
      "credential.delete",
      "credential.reveal",
      "project.update",
    ];
    const entries = actions.map((action, i) =>
      makeEntry({
        id: `01J000000000000000000000${i.toString(16).toUpperCase()}`,
        seq: i + 1,
        action,
      }),
    );
    mockInvoke.mockResolvedValue(entries);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("audit-for-credential-list")).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId("audit-for-credential-row");
    expect(rows).toHaveLength(5);

    // Action badge 텍스트가 모두 존재하는지 확인
    for (const action of actions) {
      expect(screen.getByText(action)).toBeInTheDocument();
    }
  });

  // -------------------------------------------------------------------------
  // (c) Invokes audit_list with correct params
  // -------------------------------------------------------------------------
  it("(c) audit_list 를 subject_kind='credential', subject_id, limit=10 으로 호출한다", async () => {
    mockInvoke.mockResolvedValue([]);

    renderComponent(CRED_ID);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "audit_list",
        expect.objectContaining({
          input: expect.objectContaining({
            subject_kind: "credential",
            subject_id: CRED_ID,
            limit: 10,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // (d) credentialId=null → renders nothing
  // -------------------------------------------------------------------------
  it("(d) credentialId 가 null 이면 아무것도 렌더링하지 않는다", () => {
    renderComponent(null);

    expect(screen.queryByTestId("audit-for-credential-loading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("audit-for-credential-empty")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // (e) Error state
  // -------------------------------------------------------------------------
  it("(e) audit_list 실패 시 error banner 를 렌더링한다", async () => {
    mockInvoke.mockRejectedValue("network error");

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId("audit-for-credential-error")).toBeInTheDocument();
    });
  });
});
