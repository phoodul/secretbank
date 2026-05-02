/**
 * T048: Tests for MobileGraphList component.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import "@/lib/i18n";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { MobileGraphList } from "../MobileGraphList";
import type { GraphPayload } from "../types";

const mockInvoke = vi.mocked(invoke);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAYLOAD_WITH_CREDS: GraphPayload = {
  nodes: [
    { id: "iss-1", kind: "issuer", label: "GitHub", meta_json: { slug: "github" } },
    { id: "cred-1", kind: "credential", label: "GitHub Token", meta_json: { env: "prod" } },
    { id: "cred-2", kind: "credential", label: "Stripe Key", meta_json: { env: "staging" } },
    { id: "proj-1", kind: "project", label: "My App", meta_json: {} },
    { id: "dep-1", kind: "deployment", label: "prod.example.com", meta_json: { env: "prod" } },
  ],
  edges: [
    { id: "iss-1->cred-1", source: "iss-1", target: "cred-1", kind: "issues" },
    { id: "cred-1->proj-1", source: "cred-1", target: "proj-1", kind: "used_by" },
    { id: "proj-1->dep-1", source: "proj-1", target: "dep-1", kind: "deployed_as" },
  ],
};

const PAYLOAD_NO_CREDS: GraphPayload = {
  nodes: [
    { id: "iss-1", kind: "issuer", label: "GitHub", meta_json: {} },
    { id: "proj-1", kind: "project", label: "My App", meta_json: {} },
  ],
  edges: [],
};

const BLAST_RADIUS_RESPONSE = {
  primary: [{ kind: "project", id: "proj-1" }],
  secondary: [{ kind: "deployment", id: "dep-1" }],
  tertiary: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MobileGraphList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders credentials list from payload", () => {
    mockInvoke.mockReturnValue(new Promise(() => undefined));
    render(<MobileGraphList payload={PAYLOAD_WITH_CREDS} />);

    expect(screen.getByText("GitHub Token")).toBeInTheDocument();
    expect(screen.getByText("Stripe Key")).toBeInTheDocument();
    // Issuer and project nodes should NOT appear in credentials list
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    expect(screen.queryByText("My App")).not.toBeInTheDocument();
  });

  it("shows empty state when no credentials present", () => {
    render(<MobileGraphList payload={PAYLOAD_NO_CREDS} />);

    expect(screen.getByTestId("mobile-graph-empty")).toBeInTheDocument();
    // Should show empty message
    const emptyMsg = screen.getByText(/No credentials to analyze yet|분석할 자격증명/i);
    expect(emptyMsg).toBeInTheDocument();
  });

  it("selecting a credential calls invoke with blast_radius_for_credential", async () => {
    const user = userEvent.setup();
    mockInvoke.mockReturnValue(new Promise(() => undefined)); // never resolves

    render(<MobileGraphList payload={PAYLOAD_WITH_CREDS} />);

    const credCard = screen.getByText("GitHub Token").closest("button");
    expect(credCard).toBeTruthy();
    await user.click(credCard!);

    expect(mockInvoke).toHaveBeenCalledWith("blast_radius_for_credential", { id: "cred-1" });
  });

  it("impact tree shows primary and secondary buckets after selection", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(BLAST_RADIUS_RESPONSE);

    render(<MobileGraphList payload={PAYLOAD_WITH_CREDS} />);

    const credCard = screen.getByText("GitHub Token").closest("button");
    await user.click(credCard!);

    // Wait for the impact tree to appear
    await waitFor(() => {
      expect(screen.getByTestId("impact-tree")).toBeInTheDocument();
    });

    // Project in primary bucket
    expect(screen.getByText("My App")).toBeInTheDocument();
    // Deployment in secondary bucket
    expect(screen.getByText("prod.example.com")).toBeInTheDocument();
  });

  it("clear button resets selection", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(BLAST_RADIUS_RESPONSE);

    render(<MobileGraphList payload={PAYLOAD_WITH_CREDS} />);

    const credCard = screen.getByText("GitHub Token").closest("button");
    await user.click(credCard!);

    // Wait for impact tree
    await waitFor(() => {
      expect(screen.getByTestId("impact-tree")).toBeInTheDocument();
    });

    // Click clear button
    const clearBtn = screen.getByRole("button", { name: /clear|초기화|クリア|清除/i });
    await user.click(clearBtn);

    // Impact tree should disappear
    await waitFor(() => {
      expect(screen.queryByTestId("impact-tree")).not.toBeInTheDocument();
    });
  });

  it("tertiary bucket hidden when empty", async () => {
    const user = userEvent.setup();
    // BLAST_RADIUS_RESPONSE has empty tertiary
    mockInvoke.mockResolvedValueOnce(BLAST_RADIUS_RESPONSE);

    render(<MobileGraphList payload={PAYLOAD_WITH_CREDS} />);

    const credCard = screen.getByText("GitHub Token").closest("button");
    await user.click(credCard!);

    await waitFor(() => {
      expect(screen.getByTestId("impact-tree")).toBeInTheDocument();
    });

    // Tertiary section header should NOT be rendered (bucket is empty)
    const tertiaryPattern = /Tertiary|3차|第3層|第三层/i;
    expect(screen.queryByText(tertiaryPattern)).not.toBeInTheDocument();
  });

  it("toggling same credential clears the selection", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(BLAST_RADIUS_RESPONSE);

    render(<MobileGraphList payload={PAYLOAD_WITH_CREDS} />);

    const credCard = screen.getByText("GitHub Token").closest("button");
    await user.click(credCard!);

    await waitFor(() => {
      expect(screen.getByTestId("impact-tree")).toBeInTheDocument();
    });

    // Tap the same credential again — should clear
    await user.click(credCard!);

    await waitFor(() => {
      expect(screen.queryByTestId("impact-tree")).not.toBeInTheDocument();
    });
  });
});
