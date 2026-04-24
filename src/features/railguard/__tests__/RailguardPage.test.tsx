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
import { toast } from "sonner";
import { RailguardPage } from "../RailguardPage";
import type { RuleFileApplied, RuleFilePreview } from "../types";
import { ALL_RULE_KINDS } from "../types";

const mockInvoke = vi.mocked(invoke);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePreview(kind: RuleFilePreview["kind"] = "cursor_rules"): RuleFilePreview {
  return {
    kind,
    path: `/home/user/proj/.${kind}`,
    content: "# Guardrail rules\nDo not hardcode API keys.",
    exists: false,
    action: "create",
  };
}

function makeApplied(kind: RuleFileApplied["kind"] = "cursor_rules"): RuleFileApplied {
  return {
    kind,
    path: `/home/user/proj/.${kind}`,
    backup_path: null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(initialPath = "/railguard") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <RailguardPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RailguardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test (a): renders header + form with 4 default-checked rules
  // -------------------------------------------------------------------------
  it("(a) 헤더와 4개의 기본 체크된 룰 체크박스를 렌더링한다", () => {
    renderPage();

    // Header
    expect(screen.getByText("RAILGUARD")).toBeInTheDocument();

    // 4 rule checkboxes — all checked
    for (const kind of ALL_RULE_KINDS) {
      const checkbox = screen.getByTestId(`rule-checkbox-${kind}`);
      expect(checkbox).toBeInTheDocument();
      // Radix Checkbox: checked state via aria-checked or data attribute
      expect(checkbox).toHaveAttribute("aria-checked", "true");
    }

    // Preview button
    expect(screen.getByTestId("railguard-preview-btn")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test (b): Preview button calls railguard_preview invoke with correct args
  // -------------------------------------------------------------------------
  it("(b) Preview 버튼 클릭 시 railguard_preview 를 올바른 인자로 호출한다", async () => {
    const user = userEvent.setup();
    const previews = ALL_RULE_KINDS.map(makePreview);

    mockInvoke.mockResolvedValueOnce(previews);

    renderPage();

    // Enter a project path
    const pathInput = screen.getByTestId("railguard-path-input");
    await user.clear(pathInput);
    await user.type(pathInput, "/home/user/proj");

    // Click Preview
    await user.click(screen.getByTestId("railguard-preview-btn"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("railguard_preview", {
        projectPath: "/home/user/proj",
        rules: ALL_RULE_KINDS,
        context: expect.objectContaining({ project_name: "proj" }),
      });
    });

    // Preview results appear
    await waitFor(() => {
      expect(screen.getByTestId("rule-files-preview")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Test (c): After preview, Apply button appears; clicking calls railguard_apply
  // -------------------------------------------------------------------------
  it("(c) 미리보기 후 Apply 버튼이 나타나고 railguard_apply 를 기본 모드로 호출한다", async () => {
    const user = userEvent.setup();
    const previews = [makePreview("cursor_rules")];
    const applied = [makeApplied("cursor_rules")];

    mockInvoke
      .mockResolvedValueOnce(previews) // railguard_preview
      .mockResolvedValueOnce(applied); // railguard_apply

    renderPage();

    const pathInput = screen.getByTestId("railguard-path-input");
    await user.clear(pathInput);
    await user.type(pathInput, "/home/user/proj");

    await user.click(screen.getByTestId("railguard-preview-btn"));

    // Wait for Apply button to appear
    await waitFor(() => {
      expect(screen.getByTestId("railguard-apply-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("railguard-apply-btn"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("railguard_apply", {
        projectPath: "/home/user/proj",
        rules: ALL_RULE_KINDS,
        context: expect.objectContaining({ project_name: "proj" }),
        mode: expect.arrayContaining([
          expect.objectContaining({ kind: "overwrite", backup: true }),
        ]),
      });
    });

    expect(toast.success).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test (d): Error state renders when preview rejects
  // -------------------------------------------------------------------------
  it("(d) preview 실패 시 에러 배너가 표시된다", async () => {
    const user = userEvent.setup();

    mockInvoke.mockRejectedValueOnce("railguard_preview failed");

    renderPage();

    const pathInput = screen.getByTestId("railguard-path-input");
    await user.clear(pathInput);
    await user.type(pathInput, "/home/user/proj");

    await user.click(screen.getByTestId("railguard-preview-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("railguard-error")).toBeInTheDocument();
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("railguard_preview failed")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test (e): Pre-fills projectPath from ?projectPath=... query param
  // -------------------------------------------------------------------------
  it("(e) URL 쿼리 파라미터 projectPath 로 경로 필드가 미리 채워진다", () => {
    renderPage("/railguard?projectPath=%2Fhome%2Fuser%2Fmy-project");

    const pathInput = screen.getByTestId<HTMLInputElement>("railguard-path-input");
    expect(pathInput.value).toBe("/home/user/my-project");
  });
});
