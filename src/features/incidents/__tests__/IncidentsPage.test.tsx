import { render, screen, waitFor, within } from "@testing-library/react";
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

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { IncidentsPage } from "../IncidentsPage";
import type { IncidentListEntry } from "../types";

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<IncidentListEntry> = {}): IncidentListEntry {
  return {
    incident: {
      id: "01J0000000000000000000000I",
      source: "nvd",
      source_id: "CVE-2025-1234",
      issuer_id: null,
      severity: "high",
      title: "High severity vulnerability in example package",
      body: null,
      url: "https://nvd.nist.gov/vuln/detail/CVE-2025-1234",
      domain: null,
      detected_at: 1700000000000,
      published_at: null,
    },
    matches: [],
    ...overrides,
  };
}

function makeEntryWithMatch(
  id: string,
  severity: IncidentListEntry["incident"]["severity"] = "high",
  dismissedAt: string | null = null,
): IncidentListEntry {
  return {
    incident: {
      id,
      source: "rss",
      source_id: `RSS-${id}`,
      issuer_id: null,
      severity,
      title: `Incident ${id}`,
      body: null,
      url: null,
      domain: null,
      detected_at: 1700000000000,
      published_at: null,
    },
    matches: [
      {
        id: `match-${id}`,
        credential_id: `cred-${id}`,
        credential_label: `API Key ${id}`,
        issuer_display_name: "Stripe",
        reason: "issuer_match",
        matched_at: 1700000001000,
        dismissed_at: dismissedAt,
      },
    ],
  };
}

/** Generate 10 incident entries with mixed attributes */
function make10Entries(): IncidentListEntry[] {
  return Array.from({ length: 10 }, (_, i) => {
    const id = `entry-${i.toString().padStart(26, "0")}`;
    const severity = (["info", "low", "medium", "high", "critical"] as const)[i % 5];
    return makeEntry({
      incident: {
        id,
        source: "nvd",
        source_id: `CVE-2025-${1000 + i}`,
        issuer_id: null,
        severity,
        title: `Incident ${i + 1}`,
        body: null,
        url: null,
        domain: null,
        detected_at: 1700000000000 + i * 1000,
        published_at: null,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function routeInvokes(responses: {
  incident_list?: IncidentListEntry[];
  incident_dismiss?: number;
  incident_feed_refresh?: number;
}) {
  mockInvoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case "incident_list":
        return Promise.resolve(responses.incident_list ?? []);
      case "incident_dismiss":
        return Promise.resolve(responses.incident_dismiss ?? 1);
      case "incident_feed_refresh":
        return Promise.resolve(responses.incident_feed_refresh ?? 0);
      default:
        return Promise.resolve(undefined);
    }
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <IncidentsPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IncidentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: Renders 10 mock incidents
  // -------------------------------------------------------------------------
  it("10개의 mock incident 를 렌더링한다", async () => {
    routeInvokes({ incident_list: make10Entries() });

    renderPage();

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId("incidents-loading")).not.toBeInTheDocument();
    });

    const cards = screen.getAllByTestId("incident-card");
    expect(cards).toHaveLength(10);

    // Spot-check
    expect(screen.getByText("Incident 1")).toBeInTheDocument();
    expect(screen.getByText("Incident 10")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 2: Filter tabs narrow correctly
  // -------------------------------------------------------------------------
  it("필터 탭이 올바르게 동작한다", async () => {
    const user = userEvent.setup();

    // Two incidents: one critical, one with active match, one dismissed
    const criticalEntry = makeEntry({
      incident: {
        ...makeEntry().incident,
        id: "crit-1",
        severity: "critical",
        title: "Critical incident",
      },
    });
    const affectingEntry = makeEntryWithMatch("aff-1", "high", null);
    const dismissedEntry = makeEntryWithMatch("dis-1", "medium", "2025-01-01T00:00:00Z");

    // Critical tab → only critical filter sent; server returns criticalEntry
    mockInvoke.mockImplementation((cmd: string, args: unknown) => {
      if (cmd === "incident_list") {
        const filter = (args as { filter: { severity?: string; include_dismissed?: boolean } })
          .filter;
        if (filter.severity === "critical") {
          return Promise.resolve([criticalEntry]);
        }
        if (filter.include_dismissed === true) {
          return Promise.resolve([dismissedEntry]);
        }
        // default: all active
        return Promise.resolve([affectingEntry]);
      }
      return Promise.resolve(undefined);
    });

    renderPage();

    // Default "All" tab: affecting entry shown
    await waitFor(() => {
      expect(screen.getByText("Incident aff-1")).toBeInTheDocument();
    });

    // Click "Critical" tab
    await user.click(screen.getByRole("tab", { name: /critical/i }));
    await waitFor(() => {
      expect(screen.getByText("Critical incident")).toBeInTheDocument();
    });

    // Click "Dismissed" tab
    await user.click(screen.getByRole("tab", { name: /dismissed/i }));
    await waitFor(() => {
      expect(screen.getByText("Incident dis-1")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Test 3: Dismiss calls incident_dismiss
  // -------------------------------------------------------------------------
  it("Dismiss 버튼 클릭 시 incident_dismiss 를 호출한다", async () => {
    const user = userEvent.setup();
    const entry = makeEntryWithMatch("dismiss-test");

    routeInvokes({ incident_list: [entry], incident_dismiss: 1 });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Incident dismiss-test")).toBeInTheDocument();
    });

    const card = screen.getByTestId("incident-card");
    const dismissBtn = within(card).getByRole("button", { name: /dismiss/i });
    await user.click(dismissBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("incident_dismiss", {
        id: "dismiss-test",
      });
    });

    expect(toast.success).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 4: Error state renders
  // -------------------------------------------------------------------------
  it("에러 발생 시 에러 배너가 표시된다", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "incident_list") {
        return Promise.reject("network error");
      }
      return Promise.resolve(undefined);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/failed to load incidents/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 5: incidents:updated event triggers refetch
  // -------------------------------------------------------------------------
  it("incidents:updated 이벤트가 수신되면 목록을 다시 가져온다", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let listenCallback: ((event: any) => void) | undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockListen.mockImplementation((_event: string, handler: (event: any) => void) => {
      listenCallback = handler;
      return Promise.resolve(() => undefined);
    });

    routeInvokes({ incident_list: [] });

    renderPage();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId("incidents-empty")).toBeInTheDocument();
    });

    // Simulate new incident arriving
    const newEntry = makeEntry();
    routeInvokes({ incident_list: [newEntry] });

    // Fire the event listener (pass a dummy event payload)
    listenCallback?.({ payload: null, id: 0, event: "incidents:updated", windowLabel: "" });

    await waitFor(() => {
      const cards = screen.getAllByTestId("incident-card");
      expect(cards).toHaveLength(1);
    });
  });
});
