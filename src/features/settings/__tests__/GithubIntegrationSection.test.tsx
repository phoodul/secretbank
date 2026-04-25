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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // (a) Not connected 상태 — installations 빈 배열
  it("installations 가 없을 때 Not connected 배지와 Connect 버튼이 렌더된다", async () => {
    mockInvoke.mockResolvedValueOnce([]); // github_list_installations

    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/Not connected/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /connect github/i })).toBeInTheDocument();
  });

  // (b) Connect 버튼 클릭 → invoke github_install_url + shell.open 호출
  it("Connect 버튼 클릭 시 github_install_url invoke 후 shell.open 으로 브라우저를 연다", async () => {
    mockInvoke
      .mockResolvedValueOnce([]) // github_list_installations (initial load)
      .mockResolvedValueOnce("https://github.com/apps/api-vault/installations/new"); // github_install_url

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
        "https://github.com/apps/api-vault/installations/new",
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

    mockInvoke
      .mockResolvedValueOnce([mockInstallation]) // github_list_installations (initial)
      .mockResolvedValueOnce([]); // github_scan_repo

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

    mockInvoke
      .mockResolvedValueOnce([mockInstallation]) // github_list_installations (initial)
      .mockResolvedValueOnce(undefined) // github_remove_installation
      .mockResolvedValueOnce([]); // github_list_installations (refresh after remove)

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
    // github_list_installations 만 mock — vault_status 없어도 에러 없음
    mockInvoke.mockResolvedValueOnce([]);
    renderSection();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("github_list_installations");
    });
    // vault_status 는 호출 안 됨
    const allCalls = mockInvoke.mock.calls.map((c) => c[0]);
    expect(allCalls).not.toContain("vault_status");
  });
});
