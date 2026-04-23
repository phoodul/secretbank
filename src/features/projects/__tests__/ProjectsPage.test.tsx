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
import type { Deployment, Project, ProjectUsage } from "../types";
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
    score: { total: 100, level: "safe", factors: [] },
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

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: "01J0000000000000000000000D",
    project_id: "01J0000000000000000000000P",
    url: "https://billing.example.com",
    platform: "vercel",
    env: "prod",
    created_at: 1700000000000,
    ...overrides,
  };
}

/** 커맨드명 매칭 기반 invoke mock. 순서 의존성을 제거한다. */
interface RoutedResponses {
  project_list?: Project[];
  project_create?: string;
  project_update?: Project;
  project_delete?: undefined;
  usage_list_for_project?: ProjectUsage[];
  credential_list?: CredentialSummary[];
  deployment_list_for_project?: Deployment[];
}

function routeInvokes(responses: RoutedResponses) {
  mockInvoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case "project_list":
        return Promise.resolve(responses.project_list ?? []);
      case "project_create":
        return Promise.resolve(responses.project_create ?? "new-id");
      case "project_update":
        return Promise.resolve(
          responses.project_update ?? makeProject({ id: "updated" }),
        );
      case "project_delete":
        return Promise.resolve(undefined);
      case "usage_list_for_project":
        return Promise.resolve(responses.usage_list_for_project ?? []);
      case "credential_list":
        return Promise.resolve(responses.credential_list ?? []);
      case "deployment_list_for_project":
        return Promise.resolve(responses.deployment_list_for_project ?? []);
      default:
        return Promise.resolve(undefined);
    }
  });
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
    routeInvokes({ project_list: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    });
  });

  it("project_list 결과로 카드를 렌더링한다", async () => {
    routeInvokes({
      project_list: [makeProject(), makeProject({ id: "p2", name: "Marketing Site" })],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Billing API")).toBeInTheDocument();
      expect(screen.getByText("Marketing Site")).toBeInTheDocument();
    });
  });

  it("검색 입력으로 이름 기반 필터링이 동작한다", async () => {
    const user = userEvent.setup();
    routeInvokes({
      project_list: [
        makeProject({ name: "Billing API" }),
        makeProject({ id: "p2", name: "Marketing Site" }),
      ],
    });

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
    routeInvokes({ project_list: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new project/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /new project/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /create project/i })).toBeInTheDocument();
  });

  it("Create Dialog 제출 시 project_create 를 호출한다", async () => {
    const user = userEvent.setup();
    routeInvokes({ project_list: [] });

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
  });

  it("카드 클릭 시 Detail Drawer 가 열리고 연결된 credential 을 보여준다", async () => {
    const user = userEvent.setup();
    routeInvokes({
      project_list: [makeProject()],
      usage_list_for_project: [makeUsage({ credential_id: "C1" })],
      credential_list: [makeCred({ id: "C1", name: "Stripe live" })],
    });

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
    routeInvokes({ project_list: [project] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Billing API")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Billing API"));

    // Sheet 안의 project-level Delete 버튼 (action row 의 "Delete")
    const deleteButtons = await screen.findAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]);

    // AlertDialog "Delete" confirm 버튼
    const alert = await screen.findByRole("alertdialog");
    await user.click(within(alert).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("project_delete", { id: project.id });
    });
  });

  it("Detail Drawer 에 Deployment 섹션이 보이고, 기존 배포 항목을 렌더링한다", async () => {
    const user = userEvent.setup();
    routeInvokes({
      project_list: [makeProject()],
      deployment_list_for_project: [
        makeDeployment({ url: "https://billing.example.com", platform: "vercel" }),
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Billing API")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Billing API"));

    await waitFor(() => {
      expect(screen.getByText("https://billing.example.com")).toBeInTheDocument();
    });

    // Deployment 섹션 헤딩 존재
    expect(screen.getByRole("heading", { name: /deployments/i })).toBeInTheDocument();
  });
});
