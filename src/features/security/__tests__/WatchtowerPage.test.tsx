/**
 * WatchtowerPage Vitest 테스트 (T1~T9)
 *
 * T1: 검사 이력 없음 → no_history 빈 상태 CTA 렌더링
 * T2: 알림 있음 → SecurityAlertCard 렌더링 (count)
 * T3: [Run Check] 클릭 → invoke('run_security_check') 호출 (force_hibp 인자 포함)
 * T4: running 상태 → 버튼 disabled + "Checking..." 텍스트
 * T5: All clear → all_clear 메시지 렌더링
 * T6: HIBP opt-in false → opt_in_banner 표시
 * T7: vault 잠금 에러 → vault_locked 메시지 표시
 * T8: dismiss 클릭 → invoke('dismiss_security_alert', { alertId }) 호출
 * T9: SecurityBadge — 다중 alert 시 우선순위 1개만 표시
 */

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

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { WatchtowerPage } from "../WatchtowerPage";
import { SecurityBadge } from "../SecurityBadge";
import type { SecurityAlertView, SecurityCheckSummary } from "../types";

const mockInvoke = vi.mocked(invoke);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAlert(overrides: Partial<SecurityAlertView> = {}): SecurityAlertView {
  return {
    id: "alert-01",
    credential_id: "cred-01",
    alert_kind: "weak_password",
    alert_meta: { score: 1, length: 6 },
    dismissed_at: null,
    checked_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSummary(overrides: Partial<SecurityCheckSummary> = {}): SecurityCheckSummary {
  return {
    total_credentials_checked: 5,
    alerts_count_by_kind: { weak_password: 1 },
    hibp_called: false,
    hibp_failed: false,
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function routeInvokes(opts: {
  list?: SecurityAlertView[];
  listError?: unknown;
  runSummary?: SecurityCheckSummary;
  runError?: unknown;
  dismissResult?: undefined;
}) {
  mockInvoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case "list_security_alerts":
        if (opts.listError) return Promise.reject(opts.listError);
        return Promise.resolve(opts.list ?? []);
      case "run_security_check":
        if (opts.runError) return Promise.reject(opts.runError);
        return Promise.resolve(opts.runSummary ?? makeSummary());
      case "dismiss_security_alert":
        return Promise.resolve(opts.dismissResult);
      default:
        return Promise.resolve(undefined);
    }
  });
}

function renderPage() {
  // Reset localStorage HIBP key to default (disabled) before each test
  localStorage.removeItem("apivault.hibp_opt_in");

  return render(
    <MemoryRouter>
      <WatchtowerPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WatchtowerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // T1: 검사 이력 없음 → no_history 빈 상태 CTA 렌더링
  // -------------------------------------------------------------------------
  it("T1: 검사 이력 없음 → no_history 빈 상태 + CTA 렌더링", async () => {
    routeInvokes({ list: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("no-history-empty")).toBeInTheDocument();
    });

    // CTA 버튼 존재
    expect(screen.getByTestId("no-history-run-check")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // T2: 알림 있음 → SecurityAlertCard 렌더링 (count)
  // -------------------------------------------------------------------------
  it("T2: 알림 있음 → SecurityAlertCard 2개 렌더링", async () => {
    const alerts = [
      makeAlert({ id: "a1", credential_id: "cred-01", alert_kind: "weak_password" }),
      makeAlert({ id: "a2", credential_id: "cred-02", alert_kind: "reused_password" }),
    ];

    // First call (mount): returns alerts
    // Second call (after run_security_check): returns same alerts
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_security_alerts") return Promise.resolve(alerts);
      if (cmd === "run_security_check") return Promise.resolve(makeSummary());
      return Promise.resolve(undefined);
    });

    renderPage();

    await waitFor(() => {
      const cards = screen.getAllByTestId("security-alert-card");
      expect(cards).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // T3: [Run Check] 클릭 → invoke('run_security_check') 호출 (force_hibp 포함)
  // -------------------------------------------------------------------------
  it("T3: [Run Check] 클릭 → run_security_check 호출, forceHibp=false (opt-in 비활성)", async () => {
    const user = userEvent.setup();

    routeInvokes({
      list: [],
      runSummary: makeSummary({ alerts_count_by_kind: {} }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("no-history-empty")).toBeInTheDocument();
    });

    const runBtn = screen.getByTestId("run-check-button");
    await user.click(runBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("run_security_check", {
        forceHibp: false,
      });
    });
  });

  // -------------------------------------------------------------------------
  // T4: running 상태 → 버튼 disabled + "Checking..." 텍스트
  // -------------------------------------------------------------------------
  it("T4: run_security_check 실행 중 → 버튼 disabled + Checking 텍스트", async () => {
    const user = userEvent.setup();

    // Delay the resolve so we can check mid-flight state
    let resolveRun!: (v: SecurityCheckSummary) => void;
    const runPromise = new Promise<SecurityCheckSummary>((res) => {
      resolveRun = res;
    });

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_security_alerts") return Promise.resolve([]);
      if (cmd === "run_security_check") return runPromise;
      return Promise.resolve(undefined);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("no-history-empty")).toBeInTheDocument();
    });

    const runBtn = screen.getByTestId("run-check-button");
    await user.click(runBtn);

    // Button should be disabled while running
    await waitFor(() => {
      expect(runBtn).toBeDisabled();
    });

    // Resolve to avoid pending promise warnings
    resolveRun(makeSummary());
  });

  // -------------------------------------------------------------------------
  // T5: All clear → all_clear 메시지 렌더링
  // -------------------------------------------------------------------------
  it("T5: 검사 완료 후 alert 없음 → all_clear 상태 렌더링", async () => {
    const user = userEvent.setup();

    // list_security_alerts: 1st call (mount) returns empty, 2nd (after run) returns empty
    routeInvokes({
      list: [],
      runSummary: makeSummary({ alerts_count_by_kind: {} }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("no-history-empty")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("run-check-button"));

    await waitFor(() => {
      expect(screen.getByTestId("all-clear-state")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // T6: HIBP opt-in false → opt_in_banner 표시
  // -------------------------------------------------------------------------
  it("T6: HIBP opt-in 비활성 시 opt_in_banner 표시", async () => {
    // Ensure opt-in is false (default)
    localStorage.removeItem("apivault.hibp_opt_in");

    routeInvokes({ list: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("hibp-opt-in-banner")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // T7: vault 잠금 에러 → vault_locked 메시지 표시
  // -------------------------------------------------------------------------
  it("T7: vault locked 에러 → vault_locked 에러 배너 표시", async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_security_alerts") return Promise.resolve([]);
      if (cmd === "run_security_check") return Promise.reject({ code: "vault_locked" });
      return Promise.resolve(undefined);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("no-history-empty")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("run-check-button"));

    await waitFor(() => {
      expect(screen.getByTestId("vault-locked-error")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // T8: dismiss 클릭 → invoke('dismiss_security_alert', { alertId }) 호출
  // -------------------------------------------------------------------------
  it("T8: Dismiss 클릭 → dismiss_security_alert(alertId) 호출", async () => {
    const user = userEvent.setup();
    const alert = makeAlert({ id: "alert-dismiss-test" });

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_security_alerts") return Promise.resolve([alert]);
      if (cmd === "dismiss_security_alert") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("security-alert-card")).toBeInTheDocument();
    });

    const dismissBtn = screen.getByTestId("dismiss-button");
    await user.click(dismissBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("dismiss_security_alert", {
        alertId: "alert-dismiss-test",
      });
    });
  });
});

// ---------------------------------------------------------------------------
// T9: SecurityBadge — 다중 alert 시 우선순위 1개만 표시
// ---------------------------------------------------------------------------

describe("SecurityBadge", () => {
  it("T9: 다중 alert 시 최고 우선순위(compromised) 배지 1개만 표시", () => {
    const alerts: SecurityAlertView[] = [
      makeAlert({ id: "a1", alert_kind: "weak_password", dismissed_at: null }),
      makeAlert({ id: "a2", alert_kind: "compromised_password", dismissed_at: null }),
      makeAlert({ id: "a3", alert_kind: "reused_password", dismissed_at: null }),
    ];

    render(<SecurityBadge credentialId="cred-01" alerts={alerts} />);

    // "Compromised" badge should appear (highest priority) and only 1 badge total
    expect(screen.getByText(/compromised/i)).toBeInTheDocument();
    expect(screen.queryAllByText(/compromised/i)).toHaveLength(1);

    // Lower-priority kinds must NOT be rendered
    expect(screen.queryByText(/weak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reused/i)).not.toBeInTheDocument();
  });
});
