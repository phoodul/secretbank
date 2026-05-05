/**
 * MiniGraph — M24 1.5-G TDD 테스트
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { MiniGraph } from "../MiniGraph";
import type { CredentialFull } from "../types";
import type { Project } from "../../projects/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCredentialFull(usages: CredentialFull["usages"] = []): CredentialFull {
  return {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
    name: "OpenAI Key",
    env: "prod",
    scope: null,
    vault_ref: "vault://abc",
    created_at: Date.now(),
    last_rotated_at: null,
    expires_at: null,
    owner: null,
    rotation_policy_days: null,
    rotation_runbook_id: null,
    status: "active",
    hash_hint: "ab12",
    usages,
    score: { total: 100, level: "safe", factors: [] },
    kind: "api_key",
    url: null,
    username: null,
    secondary_value_ref: null,
    primary_label: null,
    secondary_label: null,
  };
}

function makeUsage(projectId: string): CredentialFull["usages"][number] {
  return {
    id: `usage-${projectId}`,
    credential_id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
    project_id: projectId,
    deployment_id: null,
    where_kind: "env_var",
    where_value: "OPENAI_API_KEY",
    verified_at: null,
    verified_by: null,
  };
}

function makeProject(id: string, name: string): Project {
  return {
    id,
    name,
    repo_url: null,
    framework: null,
    runtime: null,
    local_path: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

function renderMiniGraph(
  credentialId = "01HZAAAAAAAAAAAAAAAAAAAAAA",
  credentialName = "OpenAI Key",
) {
  return render(
    <MemoryRouter>
      <MiniGraph credentialId={credentialId} credentialName={credentialName} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MiniGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("usages 0 개이면 empty 메시지를 표시한다", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "credential_get") return Promise.resolve(makeCredentialFull([]));
      if (cmd === "project_list") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderMiniGraph();

    await waitFor(() => {
      expect(screen.getByText(/not used in any project yet/i)).toBeInTheDocument();
    });
  });

  it("usages 2 개(서로 다른 project) → 2개 project 노드 + 1개 중앙 노드 (총 3개 text element)", async () => {
    const projects: Project[] = [makeProject("p1", "Web App"), makeProject("p2", "Mobile App")];

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "credential_get")
        return Promise.resolve(makeCredentialFull([makeUsage("p1"), makeUsage("p2")]));
      if (cmd === "project_list") return Promise.resolve(projects);
      return Promise.resolve(null);
    });

    renderMiniGraph();

    // SVG 가 렌더되고 project 이름이 보여야 함
    await waitFor(() => {
      expect(screen.getByLabelText("Dependency graph")).toBeInTheDocument();
    });

    // project 노드 텍스트 확인
    expect(screen.getByText("Web App")).toBeInTheDocument();
    expect(screen.getByText("Mobile App")).toBeInTheDocument();

    // 중앙 credential 노드 텍스트 확인
    expect(screen.getByText("OpenAI Key")).toBeInTheDocument();
  });

  it("credential_get 과 project_list 두 invoke 가 모두 호출된다", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "credential_get") return Promise.resolve(makeCredentialFull([]));
      if (cmd === "project_list") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderMiniGraph("cred-123");

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("credential_get", { id: "cred-123" });
      expect(mockInvoke).toHaveBeenCalledWith("project_list");
    });
  });

  it("invoke 실패 시 아무것도 렌더하지 않는다 (조용히 fail)", async () => {
    mockInvoke.mockRejectedValue(new Error("vault locked"));

    renderMiniGraph();

    // 로딩 skeleton 이 사라진 뒤 null 을 렌더 — DOM 에 아무 텍스트 없어야 함
    await waitFor(() => {
      expect(screen.queryByLabelText("Loading graph")).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Dependency graph")).not.toBeInTheDocument();
    expect(screen.queryByText(/not used/i)).not.toBeInTheDocument();
  });
});
