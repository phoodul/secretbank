import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { ProjectCombobox } from "../ProjectCombobox";
import { linkCredentialToProject } from "../link-credential-to-project";
import type { Project } from "@/features/projects/types";

const mockInvoke = vi.mocked(invoke);

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "01J0000000000000000000000P",
    name: "Secretbank",
    repo_url: null,
    framework: null,
    runtime: null,
    local_path: null,
    created_at: 1700000000000,
    updated_at: 1700000000000,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProjectCombobox", () => {
  it("기존 프로젝트 선택 → onChange(id) 호출", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue([makeProject()] as never);
    const onChange = vi.fn();

    render(<ProjectCombobox value="" onChange={onChange} />);

    // 로드 완료 대기 (project_list 호출)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("project_list"));

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Secretbank"));

    expect(onChange).toHaveBeenCalledWith("01J0000000000000000000000P");
  });

  it("검색창에 새 이름 입력 → 인라인 생성 → project_create + onChange(새 id)", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "project_list") return Promise.resolve([] as never);
      if (cmd === "project_create") return Promise.resolve("01J0000000000000000000NEW" as never);
      return Promise.resolve(undefined as never);
    });
    const onChange = vi.fn();

    render(<ProjectCombobox value="" onChange={onChange} />);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("project_list"));

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText(/search or type/i), "My New Project");

    // "Create \"My New Project\"" 항목 클릭
    await user.click(await screen.findByText(/Create "My New Project"/i));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("project_create", {
        input: {
          name: "My New Project",
          repo_url: null,
          framework: null,
          runtime: null,
          local_path: null,
        },
      }),
    );
    expect(onChange).toHaveBeenCalledWith("01J0000000000000000000NEW");
  });

  it("linkCredentialToProject → 그룹 전용 usage_create (where_value 빈 값)", async () => {
    mockInvoke.mockResolvedValue("01J0000000000000000000000U" as never);

    await linkCredentialToProject("01J0000000000000000000000C", "01J0000000000000000000000P");

    expect(mockInvoke).toHaveBeenCalledWith("usage_create", {
      input: {
        credential_id: "01J0000000000000000000000C",
        project_id: "01J0000000000000000000000P",
        deployment_id: null,
        where_kind: "env_var",
        where_value: "",
      },
    });
  });
});
