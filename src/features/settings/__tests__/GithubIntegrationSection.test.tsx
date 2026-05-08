import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

// entitlement_current — Pro by default so existing scan tests pass unchanged
const PRO_ENTITLEMENT = { tier: "pro", pro_until: Date.now() + 86_400_000, from_cache: false };
const FREE_ENTITLEMENT = { tier: "free", pro_until: null, from_cache: false };

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { GithubIntegrationSection } from "../GithubIntegrationSection";

const mockInvoke = vi.mocked(invoke);
const mockShellOpen = vi.mocked(shellOpen);

function renderSection() {
  return render(
    <MemoryRouter>
      <GithubIntegrationSection />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GithubIntegrationSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // entitlement_current — Pro by default so scan tests work
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "entitlement_current") return Promise.resolve(PRO_ENTITLEMENT);
      return Promise.resolve([]);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // (a) Not connected 상태 — installations 빈 배열
  it("installations 가 없을 때 Not connected 배지와 Connect 버튼이 렌더된다", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "entitlement_current") return Promise.resolve(PRO_ENTITLEMENT);
      if (cmd === "github_list_installations") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/Not connected/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /connect github/i })).toBeInTheDocument();
  });

  // (b) Connect 버튼 클릭 → invoke github_install_url + shell.open 호출
  it("Connect 버튼 클릭 시 github_install_url invoke 후 shell.open 으로 브라우저를 연다", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "entitlement_current") return Promise.resolve(PRO_ENTITLEMENT);
      if (cmd === "github_list_installations") return Promise.resolve([]);
      if (cmd === "github_install_url")
        return Promise.resolve("https://github.com/apps/secretbank/installations/new");
      return Promise.resolve([]);
    });

    const user = userEvent.setup();
    renderSection();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect github/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /connect github/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("github_install_url");
    });

    await waitFor(() => {
      expect(mockShellOpen).toHaveBeenCalledWith(
        "https://github.com/apps/secretbank/installations/new",
      );
    });
  });

  // (c) Connected 상태 — installation 1개 + scan 버튼 동작
  it("installation 이 있을 때 Connected 배지와 installation 카드가 렌더되고 Scan 버튼이 동작한다", async () => {
    const mockInstallation = {
      installation_id: 12345678,
      installed_at: Date.now() - 60_000,
      repos: [],
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "entitlement_current") return Promise.resolve(PRO_ENTITLEMENT);
      if (cmd === "github_list_installations") return Promise.resolve([mockInstallation]);
      if (cmd === "github_scan_repo") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const user = userEvent.setup();
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/Connected/i)).toBeInTheDocument();
    });

    // Installation card shows short ID
    expect(screen.getByText(/Installation ID: 12345678/i)).toBeInTheDocument();

    // Fill scan form
    const ownerInput = screen.getByPlaceholderText(/owner/i);
    const repoInput = screen.getByPlaceholderText(/repo/i);
    await user.type(ownerInput, "acme");
    await user.type(repoInput, "backend");

    // Click Scan
    const scanBtn = screen.getByRole("button", { name: /^scan$/i });
    await user.click(scanBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("github_scan_repo", {
        input: { installation_id: 12345678, owner: "acme", repo: "backend" },
      });
    });

    // Empty results message
    await waitFor(() => {
      expect(screen.getByText(/No secret scanning alerts found/i)).toBeInTheDocument();
    });
  });

  // (d) Remove 클릭 → confirm dialog → invoke github_remove_installation
  it("Remove 클릭 시 확인 다이얼로그가 열리고 확인 후 github_remove_installation 을 호출한다", async () => {
    const mockInstallation = {
      installation_id: 99001122,
      installed_at: Date.now() - 3_600_000,
      repos: [],
    };

    let removed = false;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "entitlement_current") return Promise.resolve(PRO_ENTITLEMENT);
      if (cmd === "github_list_installations")
        return Promise.resolve(removed ? [] : [mockInstallation]);
      if (cmd === "github_remove_installation") {
        removed = true;
        return Promise.resolve(undefined);
      }
      return Promise.resolve([]);
    });

    const user = userEvent.setup();
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/Installation ID: 99001122/i)).toBeInTheDocument();
    });

    // Click Remove button on the card
    const removeBtn = screen.getByRole("button", { name: /remove/i });
    await user.click(removeBtn);

    // Confirmation dialog appears
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Click the confirm button inside the dialog
    const confirmBtn = screen.getByRole("button", { name: /^remove$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("github_remove_installation", {
        installationId: 99001122,
      });
    });

    // Dialog should close after confirmation
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  // (e) 기존 IntegrationsSection (NVD key) 테스트 회귀 없음 — invoke mock 이 github_* 에 반응하지 않음
  it("다른 invoke 커맨드(vault_status)는 github_ 커맨드와 독립적으로 동작한다", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "entitlement_current") return Promise.resolve(PRO_ENTITLEMENT);
      if (cmd === "github_list_installations") return Promise.resolve([]);
      return Promise.resolve([]);
    });
    renderSection();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("github_list_installations");
    });
    // vault_status 는 호출 안 됨
    const allCalls = mockInvoke.mock.calls.map((c) => c[0]);
    expect(allCalls).not.toContain("vault_status");
  });

  // (f) Free 사용자: Scan 버튼 disabled + Pro badge
  it("Free 상태에서 Scan 버튼은 disabled 이고 Pro 배지가 표시된다", async () => {
    const mockInstallation = {
      installation_id: 55556666,
      installed_at: Date.now() - 60_000,
      repos: [],
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "entitlement_current") return Promise.resolve(FREE_ENTITLEMENT);
      if (cmd === "github_list_installations") return Promise.resolve([mockInstallation]);
      return Promise.resolve([]);
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/Connected/i)).toBeInTheDocument();
    });

    // Scan 버튼 disabled
    const scanBtn = screen.getByRole("button", { name: /^scan$/i });
    expect(scanBtn).toBeDisabled();

    // Pro 배지 존재
    expect(screen.getByText("Pro")).toBeInTheDocument();
  });
});
