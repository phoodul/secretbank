import { render, screen, waitFor, within } from "@testing-library/react";
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

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { ProjectsPage } from "../ProjectsPage";
import type { Project, ProjectUsage } from "../types";
import type { CredentialSummary } from "@/features/inventory/types";

const mockInvoke = vi.mocked(invoke);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "01J0000000000000000000000P",
    name: "Billing API",
    repo_url: "https://github.com/acme/billing",
    framework: "Next.js",
    runtime: "Node 20",
    local_path: "/Users/me/code/billing",
    created_at: 1700000000000,
    updated_at: 1700000000000,
    ...overrides,
  };
}

function makeCred(overrides: Partial<CredentialSummary> = {}): CredentialSummary {
  return {
    id: "01J0000000000000000000000C",
    issuer_id: "01J0000000000000000000000I",
    name: "Stripe live",
    env: "prod",
    status: "active",
    expires_at: null,
    hash_hint: "abcd",
    ...overrides,
  };
}

function makeUsage(overrides: Partial<ProjectUsage> = {}): ProjectUsage {
  return {
    id: "01J0000000000000000000000U",
    credential_id: "01J0000000000000000000000C",
    project_id: "01J0000000000000000000000P",
    deployment_id: null,
    where_kind: "env_var",
    where_value: "STRIPE_KEY",
    verified_at: null,
    verified_by: "scan",
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("project_list 결과가 비어있으면 빈 상태를 표시한다", async () => {
    mockInvoke.mockResolvedValueOnce([] satisfies Project[]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    });
  });

  it("project_list 결과로 카드를 렌더링한다", async () => {
    const projects = [makeProject(), makeProject({ id: "p2", name: "Marketing Site" })];
    mockInvoke.mockResolvedValueOnce(projects);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Billing API")).toBeInTheDocument();
      expect(screen.getByText("Marketing Site")).toBeInTheDocument();
    });
  });

  it("검색 입력으로 이름 기반 필터링이 동작한다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce([
      makeProject({ name: "Billing API" }),
      makeProject({ id: "p2", name: "Marketing Site" }),
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Billing API")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/search projects/i), "market");

    expect(screen.queryByText("Billing API")).not.toBeInTheDocument();
    expect(screen.getByText("Marketing Site")).toBeInTheDocument();
  });

  it("'New project' 클릭 시 Create Dialog 가 열린다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce([] satisfies Project[]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new project/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /new project/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /create project/i })).toBeInTheDocument();
  });

  it("Create Dialog 제출 시 project_create 를 호출하고 목록을 refresh 한다", async () => {
    const user = userEvent.setup();
    const newItem = makeProject({ id: "new1", name: "New App" });

    // 1. 첫 project_list → []
    mockInvoke.mockResolvedValueOnce([]);
    // 2. project_create → id
    mockInvoke.mockResolvedValueOnce("new1");
    // 3. refresh 시 project_list → [newItem]
    mockInvoke.mockResolvedValueOnce([newItem]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new project/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /new project/i }));

    await user.type(screen.getByLabelText(/name/i), "New App");
    await user.click(screen.getByRole("button", { name: /create project/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "project_create",
        expect.objectContaining({
          input: expect.objectContaining({ name: "New App" }),
        }),
      );
    });

    expect(toast.success).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("New App")).toBeInTheDocument();
    });
  });

  it("카드 클릭 시 Detail Drawer 가 열리고 연결된 credential 을 보여준다", async () => {
    const user = userEvent.setup();
    const project = makeProject();
    const usage = makeUsage({ credential_id: "C1" });
    const cred = makeCred({ id: "C1", name: "Stripe live" });

    // 1. project_list
    mockInvoke.mockResolvedValueOnce([project]);
    // 2. usage_list_for_project (Promise.all 첫 번째)
    mockInvoke.mockResolvedValueOnce([usage]);
    // 3. credential_list (Promise.all 두 번째)
    mockInvoke.mockResolvedValueOnce([cred]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Billing API")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Billing API"));

    // Detail Drawer 헤딩
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Billing API" })).toBeInTheDocument();
    });

    // Linked credentials 섹션에서 cred 이름이 보여야 한다
    await waitFor(() => {
      expect(screen.getByText("Stripe live")).toBeInTheDocument();
    });
  });

  it("Detail Drawer 의 Delete 버튼 클릭 → 확인 다이얼로그 → project_delete 호출", async () => {
    const user = userEvent.setup();
    const project = makeProject();

    // 1. project_list
    mockInvoke.mockResolvedValueOnce([project]);
    // 2. usage_list_for_project
    mockInvoke.mockResolvedValueOnce([]);
    // 3. credential_list
    mockInvoke.mockResolvedValueOnce([]);
    // 4. project_delete
    mockInvoke.mockResolvedValueOnce(undefined);
    // 5. refresh → project_list
    mockInvoke.mockResolvedValueOnce([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Billing API")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Billing API"));

    // Sheet 안의 Delete 버튼 (Drawer 의 action row)
    const deleteButtons = await screen.findAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]);

    // AlertDialog "Delete" confirm 버튼
    const alert = await screen.findByRole("alertdialog");
    await user.click(within(alert).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("project_delete", { id: project.id });
    });
  });
});
