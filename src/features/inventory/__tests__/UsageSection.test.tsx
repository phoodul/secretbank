import { render, screen, waitFor } from "@testing-library/react";
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
import { UsageSection } from "../UsageSection";
import type { Usage } from "../types";
import type { Project } from "@/features/projects/types";

const mockInvoke = vi.mocked(invoke);

const CRED_ID = "01J0000000000000000000000C";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "01J0000000000000000000000P",
    name: "Billing API",
    repo_url: null,
    framework: null,
    runtime: null,
    local_path: null,
    created_at: 1700000000000,
    updated_at: 1700000000000,
    ...overrides,
  };
}

function makeUsage(overrides: Partial<Usage> = {}): Usage {
  return {
    id: "01J0000000000000000000000U",
    credential_id: CRED_ID,
    project_id: "01J0000000000000000000000P",
    deployment_id: null,
    where_kind: "env_var",
    where_value: "STRIPE_KEY",
    verified_at: null,
    verified_by: "manual",
    ...overrides,
  };
}

interface Routes {
  project_list?: Project[];
}

function routeInvokes(routes: Routes = {}) {
  mockInvoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case "project_list":
        return Promise.resolve(routes.project_list ?? []);
      case "usage_create":
        return Promise.resolve("new-usage");
      case "usage_delete":
        return Promise.resolve(undefined);
      default:
        return Promise.resolve(undefined);
    }
  });
}

function renderSection(props: { usages: Usage[]; onChanged?: () => void }) {
  const onChanged = props.onChanged ?? vi.fn();
  const result = render(
    <UsageSection credentialId={CRED_ID} usages={props.usages} onChanged={onChanged} />,
  );
  return { ...result, onChanged };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UsageSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("usages 가 비어있으면 noUsages 메시지를 표시한다", async () => {
    routeInvokes();
    renderSection({ usages: [] });

    expect(await screen.findByText(/no usages linked yet/i)).toBeInTheDocument();
  });

  it("usages 목록을 렌더하고 project 이름을 해석해 표시한다", async () => {
    const project = makeProject();
    const usage = makeUsage();
    routeInvokes({ project_list: [project] });

    renderSection({ usages: [usage] });

    // project_list 로 이름 조회
    await waitFor(() => {
      expect(screen.getByText("Billing API")).toBeInTheDocument();
    });

    // where_value 는 그대로 렌더
    expect(screen.getByText("STRIPE_KEY")).toBeInTheDocument();
  });

  it("Link 버튼 클릭 시 form 이 열리고 project_list 호출 + 입력 후 usage_create 를 호출한다", async () => {
    const user = userEvent.setup();
    const project = makeProject({ id: "p1", name: "Billing API" });
    const onChanged = vi.fn();
    routeInvokes({ project_list: [project] });

    renderSection({ usages: [], onChanged });

    // "Link" 헤더 버튼
    await user.click(screen.getByRole("button", { name: /^link$/i }));

    // project_list 호출 확인
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("project_list");
    });

    // Project Select 열기 및 "Billing API" 선택
    await user.click(screen.getByRole("combobox", { name: /project/i }));
    await user.click(await screen.findByRole("option", { name: /billing api/i }));

    // where_value 입력
    await user.type(screen.getByLabelText(/reference$/i), "MY_SECRET");

    // Link usage 버튼
    await user.click(screen.getByRole("button", { name: /link usage/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "usage_create",
        expect.objectContaining({
          input: expect.objectContaining({
            credential_id: CRED_ID,
            project_id: "p1",
            where_kind: "env_var",
            where_value: "MY_SECRET",
          }),
        }),
      );
    });

    expect(onChanged).toHaveBeenCalled();
  });

  it("Remove usage 버튼 클릭 시 usage_delete 를 호출한다", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const project = makeProject();
    const usage = makeUsage({ id: "u1" });

    routeInvokes({ project_list: [project] });

    renderSection({ usages: [usage], onChanged });

    // 사용처 행 로드 대기
    await waitFor(() => {
      expect(screen.getByText("STRIPE_KEY")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /remove usage/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("usage_delete", { id: "u1" });
    });

    expect(onChanged).toHaveBeenCalled();
  });
});
