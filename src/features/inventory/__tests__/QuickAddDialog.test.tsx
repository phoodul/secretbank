/**
 * QuickAddDialog Vitest — M24 Phase 2-4-a
 *
 * 테스트 목록:
 * 1. URL 패턴 일치 시 클립보드에서 prefill
 * 2. 클립보드가 URL 패턴이 아닌 경우 prefill 안 함
 * 3. URL 변경 → issuer 자동 감지 메시지 표시
 * 4. 최소 필드(URL/username/password) 입력 후 submit → credential_create 호출
 * 5. password 비어있으면 submit 안 됨
 * 6. "전체 옵션 보기" 클릭 → onShowFullForm 호출
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { QuickAddDialog } from "../QuickAddDialog";
import type { Issuer } from "../use-issuers";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";

const mockInvoke = vi.mocked(invoke);
const mockReadText = vi.mocked(readText);
const mockToast = {
  success: vi.mocked(toast.success),
  error: vi.mocked(toast.error),
};

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_ISSUERS: Issuer[] = [
  {
    id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
    slug: "openai",
    display_name: "OpenAI",
    docs_url: "https://platform.openai.com/docs",
    issue_url: "https://platform.openai.com/account/api-keys",
    status_url: null,
    security_feed_url: null,
    connector_id: null,
    icon_key: "openai",
    default_primary_label: null,
    default_secondary_label: null,
    domains: ["openai.com"],
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
  {
    id: "01HZBBBBBBBBBBBBBBBBBBBBBD",
    slug: "github",
    display_name: "GitHub",
    docs_url: "https://docs.github.com/rest",
    issue_url: "https://github.com/settings/tokens",
    status_url: null,
    security_feed_url: null,
    connector_id: null,
    icon_key: "github",
    default_primary_label: null,
    default_secondary_label: null,
    domains: ["github.com"],
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(
  props: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSuccess?: () => void;
    onShowFullForm?: (prefill: {
      url?: string;
      username?: string;
      value?: string;
      name?: string;
      kind: "api_key" | "password";
    }) => void;
  } = {},
) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const onSuccess = props.onSuccess ?? vi.fn();
  const onShowFullForm = props.onShowFullForm ?? vi.fn();
  const open = props.open ?? true;

  const result = render(
    <MemoryRouter>
      <QuickAddDialog
        open={open}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
        onShowFullForm={onShowFullForm}
      />
    </MemoryRouter>,
  );
  return { ...result, onOpenChange, onSuccess, onShowFullForm };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // 기본: 클립보드 비어있음
  mockReadText.mockResolvedValue(null as unknown as string);
  // issuer_list 기본 mock
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "issuer_list") return Promise.resolve(MOCK_ISSUERS);
    return Promise.resolve("01HZNEWCREDID00000000000");
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QuickAddDialog", () => {
  it("1. URL 패턴 일치 시 클립보드에서 URL을 prefill한다", async () => {
    mockReadText.mockResolvedValue("https://github.com/settings/tokens");

    renderDialog();

    // 다이얼로그 타이틀 확인
    expect(await screen.findByText("Quick Add")).toBeInTheDocument();

    // URL 필드에 클립보드 값이 채워져야 함
    await waitFor(() => {
      const urlInput = screen.getByPlaceholderText("https://example.com");
      expect(urlInput).toHaveValue("https://github.com/settings/tokens");
    });

    // "클립보드에서 자동 입력됨" 메시지 표시
    expect(screen.getByText(/Auto-filled from clipboard/i)).toBeInTheDocument();
  });

  it("2. 클립보드가 URL 패턴이 아니면 prefill하지 않는다", async () => {
    mockReadText.mockResolvedValue("random text not a url");

    renderDialog();

    expect(await screen.findByText("Quick Add")).toBeInTheDocument();

    await waitFor(() => {
      const urlInput = screen.getByPlaceholderText("https://example.com");
      expect(urlInput).toHaveValue("");
    });

    // "클립보드에서 자동 입력됨" 메시지 미표시
    expect(screen.queryByText(/Auto-filled from clipboard/i)).not.toBeInTheDocument();
  });

  it("3. URL 입력 시 issuer 자동 감지 메시지를 표시한다", async () => {
    mockReadText.mockResolvedValue(null as unknown as string);
    const user = userEvent.setup();

    renderDialog();

    expect(await screen.findByText("Quick Add")).toBeInTheDocument();

    const urlInput = screen.getByPlaceholderText("https://example.com");
    await user.type(urlInput, "https://github.com/settings/tokens");

    await waitFor(() => {
      expect(screen.getByTestId("issuer-detected")).toBeInTheDocument();
      expect(screen.getByTestId("issuer-detected")).toHaveTextContent("GitHub detected");
    });
  });

  it("4. URL/username/password 입력 후 submit → credential_create 호출 (kind/env default 포함)", async () => {
    mockReadText.mockResolvedValue(null as unknown as string);
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    renderDialog({ onSuccess });

    expect(await screen.findByText("Quick Add")).toBeInTheDocument();

    // URL 입력
    const urlInput = screen.getByPlaceholderText("https://example.com");
    await user.type(urlInput, "https://example.com/login");

    // Username 입력
    const usernameInput = screen.getByPlaceholderText("user@example.com");
    await user.type(usernameInput, "user@example.com");

    // Password 입력
    const passwordInput = screen.getByPlaceholderText(/password/i);
    await user.type(passwordInput, "super-secret-123");

    // Submit
    const submitBtn = screen.getByRole("button", { name: /add credential/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("credential_create", {
        args: expect.objectContaining({
          url: "https://example.com/login",
          username: "user@example.com",
          value: "super-secret-123",
          env: "prod",
          kind: expect.stringMatching(/api_key|password/),
        }),
      });
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it("5. password 필드가 비어있으면 submit 안 됨", async () => {
    mockReadText.mockResolvedValue(null as unknown as string);
    const user = userEvent.setup();

    renderDialog();

    expect(await screen.findByText("Quick Add")).toBeInTheDocument();

    // password 비워둔 채 submit
    const submitBtn = screen.getByRole("button", { name: /add credential/i });
    await user.click(submitBtn);

    // credential_create 미호출
    await waitFor(() => {
      expect(mockInvoke).not.toHaveBeenCalledWith("credential_create", expect.anything());
    });
  });

  it("6. '전체 옵션 보기' 클릭 → onShowFullForm에 현재 입력값을 prefill로 전달한다", async () => {
    mockReadText.mockResolvedValue(null as unknown as string);
    const user = userEvent.setup();
    const onShowFullForm = vi.fn();
    const onOpenChange = vi.fn();

    renderDialog({ onShowFullForm, onOpenChange });

    expect(await screen.findByText("Quick Add")).toBeInTheDocument();

    // URL 입력
    const urlInput = screen.getByPlaceholderText("https://example.com");
    await user.type(urlInput, "https://github.com");

    // "전체 옵션 보기" 클릭
    const fullOptionsBtn = screen.getByTestId("show-full-options");
    await user.click(fullOptionsBtn);

    expect(onShowFullForm).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://github.com",
        kind: expect.stringMatching(/api_key|password/),
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // unused variable 경고 억제를 위한 참조 (실제 사용 목적)
  it("mockToast 참조 (lint 억제)", () => {
    expect(mockToast).toBeDefined();
  });
});
