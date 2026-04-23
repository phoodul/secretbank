import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import { DeploymentSection } from "../DeploymentSection";
import type { Deployment } from "../types";

const mockInvoke = vi.mocked(invoke);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = "01J0000000000000000000000P";

function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: "01J000000000000000000000DX",
    project_id: PROJECT_ID,
    url: "https://billing.example.com",
    platform: "vercel",
    env: "prod",
    created_at: 1700000000000,
    ...overrides,
  };
}

interface DeploymentRoutes {
  list?: Deployment[];
  listAfterCreate?: Deployment[];
  listAfterDelete?: Deployment[];
}

function routeInvokes(routes: DeploymentRoutes) {
  // deployment_list_for_project 를 두 번째부터는 다른 값으로 반환하고 싶을 때
  // 순차적으로 소비되는 큐 구조를 만들어둔다.
  const listQueue = [routes.list ?? []];
  if (routes.listAfterCreate) listQueue.push(routes.listAfterCreate);
  if (routes.listAfterDelete) listQueue.push(routes.listAfterDelete);

  mockInvoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case "deployment_list_for_project":
        return Promise.resolve(listQueue.length > 1 ? listQueue.shift() : listQueue[0]);
      case "deployment_create":
        return Promise.resolve("new-id");
      case "deployment_update":
        return Promise.resolve(makeDeployment({ id: "updated" }));
      case "deployment_delete":
        return Promise.resolve(undefined);
      default:
        return Promise.resolve(undefined);
    }
  });
}

function renderSection() {
  return render(<DeploymentSection projectId={PROJECT_ID} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeploymentSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("mount 시 deployment_list_for_project 호출 + empty 상태 표시", async () => {
    routeInvokes({ list: [] });

    renderSection();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("deployment_list_for_project", {
        projectId: PROJECT_ID,
      });
    });

    expect(await screen.findByText(/no deployments yet/i)).toBeInTheDocument();
  });

  it("deployment_list 결과를 목록으로 렌더한다", async () => {
    routeInvokes({
      list: [
        makeDeployment({ id: "d1", url: "https://prod.example.com", platform: "vercel" }),
        makeDeployment({ id: "d2", url: "https://staging.example.com", platform: "railway" }),
      ],
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText("https://prod.example.com")).toBeInTheDocument();
      expect(screen.getByText("https://staging.example.com")).toBeInTheDocument();
    });
  });

  it("Add 버튼 → Dialog 제출 시 deployment_create 호출 + 목록 refresh", async () => {
    const user = userEvent.setup();
    const created = makeDeployment({ id: "d-new", url: "https://new.example.com" });

    routeInvokes({
      list: [],
      listAfterCreate: [created],
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/no deployments yet/i)).toBeInTheDocument();
    });

    // "Add" 버튼 — section header 의 addDeployment 버튼
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    // Dialog 렌더 대기
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /add deployment/i })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/^url$/i), "https://new.example.com");
    await user.click(screen.getByRole("button", { name: /add deployment/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "deployment_create",
        expect.objectContaining({
          input: expect.objectContaining({
            project_id: PROJECT_ID,
            url: "https://new.example.com",
            platform: "vercel",
            env: "prod",
          }),
        }),
      );
    });

    // 목록 refresh 반영
    await waitFor(() => {
      expect(screen.getByText("https://new.example.com")).toBeInTheDocument();
    });
  });

  it("행의 delete 버튼 → 확인 다이얼로그 → deployment_delete 호출", async () => {
    const user = userEvent.setup();
    const existing = makeDeployment({ id: "d1", url: "https://prod.example.com" });

    routeInvokes({
      list: [existing],
      listAfterDelete: [],
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText("https://prod.example.com")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /delete deployment/i }));

    const alert = await screen.findByRole("alertdialog");
    await user.click(within(alert).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("deployment_delete", { id: existing.id });
    });
  });
});
