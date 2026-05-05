/**
 * BentoCard — M24 C-2 TDD 테스트
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { BentoCard } from "../BentoCard";
import type { CredentialSummary } from "../types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// useIssuers mock — api_key 케이스: issuer lookup
vi.mock("../use-issuers", () => ({
  useIssuers: vi.fn(() => ({
    issuers: [
      {
        id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
        slug: "openai",
        display_name: "OpenAI",
        docs_url: null,
        issue_url: null,
        status_url: null,
        security_feed_url: null,
        connector_id: null,
        icon_key: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ],
    loading: false,
    error: null,
  })),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApiKey(overrides: Partial<CredentialSummary> = {}): CredentialSummary {
  return {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
    name: "OpenAI Production",
    env: "prod",
    status: "active",
    expires_at: null,
    hash_hint: "ab12",
    score: { total: 100, level: "safe", factors: [] },
    kind: "api_key",
    url: null,
    username: null,
    ...overrides,
  };
}

function makePassword(overrides: Partial<CredentialSummary> = {}): CredentialSummary {
  return {
    id: "01HZAAAAAAAAAAAAAAAAAAAA01",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
    name: "Gmail",
    env: "prod",
    status: "active",
    expires_at: null,
    hash_hint: null,
    score: { total: 100, level: "safe", factors: [] },
    kind: "password",
    url: "https://gmail.com",
    username: "user@gmail.com",
    ...overrides,
  };
}

function renderCard(credential: CredentialSummary, onSelect?: (id: string) => void) {
  return render(
    <MemoryRouter>
      <BentoCard credential={credential} onSelect={onSelect} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BentoCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 기본 렌더 ──────────────────────────────────────────────────────────────

  it("credential name을 렌더링한다", () => {
    renderCard(makeApiKey({ name: "My API Key" }));
    expect(screen.getByText("My API Key")).toBeInTheDocument();
  });

  it("마스킹된 dots를 렌더링한다", () => {
    renderCard(makeApiKey());
    // 마스킹 표시: ••••••••••••• 혹은 유사 패턴
    expect(screen.getByText(/•+/)).toBeInTheDocument();
  });

  it("Show 버튼을 렌더링한다", () => {
    renderCard(makeApiKey());
    expect(screen.getByRole("button", { name: /show/i })).toBeInTheDocument();
  });

  it("Copy 버튼을 렌더링한다", () => {
    renderCard(makeApiKey());
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  // ── kind 별 표시 ───────────────────────────────────────────────────────────

  it("api_key: issuer display_name을 표시한다", () => {
    renderCard(makeApiKey({ issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB" }));
    // useIssuers mock이 OpenAI를 반환하므로 OpenAI가 표시되어야 함
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
  });

  it("password: username을 표시한다", () => {
    renderCard(makePassword());
    expect(screen.getByText("user@gmail.com")).toBeInTheDocument();
  });

  // ── URL ───────────────────────────────────────────────────────────────────

  it("url이 있으면 렌더링한다", () => {
    renderCard(makePassword({ url: "https://gmail.com" }));
    expect(screen.getByText("https://gmail.com")).toBeInTheDocument();
  });

  it("url이 null이면 URL 요소를 렌더링하지 않는다", () => {
    renderCard(makeApiKey({ url: null }));
    expect(screen.queryByText("https://")).toBeNull();
  });

  // ── Show / reveal ──────────────────────────────────────────────────────────

  it("Show 클릭 시 credential_reveal Tauri 커맨드를 호출한다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue("sk-test-secret-value");
    renderCard(makeApiKey());

    const showBtn = screen.getByRole("button", { name: /show/i });
    await user.click(showBtn);

    expect(mockInvoke).toHaveBeenCalledWith("credential_reveal", {
      id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
    });
  });

  it("reveal 성공 시 실제 값이 표시된다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue("sk-test-secret-value");
    renderCard(makeApiKey());

    const showBtn = screen.getByRole("button", { name: /show/i });
    await user.click(showBtn);

    await waitFor(() => {
      expect(screen.getByText("sk-test-secret-value")).toBeInTheDocument();
    });
  });

  it("reveal 후 Hide 버튼이 나타난다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue("sk-test-secret-value");
    renderCard(makeApiKey());

    const showBtn = screen.getByRole("button", { name: /show/i });
    await user.click(showBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /hide/i })).toBeInTheDocument();
    });
  });

  it("reveal 후 30초가 지나면 다시 마스킹된다 (fake timer)", async () => {
    // fake timer 환경: Promise microtask 를 flush 하기 위해
    // vi.runAllMicrotasks() + act 패턴을 사용한다
    vi.useFakeTimers();
    try {
      // invoke 는 즉시 resolve 되는 Promise 반환
      mockInvoke.mockImplementation(() => Promise.resolve("sk-test-secret-value"));

      renderCard(makeApiKey());

      const showBtn = screen.getByRole("button", { name: /show/i });

      // act 안에서 클릭 + microtask flush
      await act(async () => {
        showBtn.click();
        // microtask (Promise resolution) 를 drain 한다
        await Promise.resolve();
        await Promise.resolve();
      });

      // reveal 값이 표시되어야 함
      expect(screen.getByText("sk-test-secret-value")).toBeInTheDocument();

      // 30초 진행
      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      // 마스킹으로 복귀해야 함
      expect(screen.queryByText("sk-test-secret-value")).not.toBeInTheDocument();
      expect(screen.getByText(/•+/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Copy ──────────────────────────────────────────────────────────────────

  it("Copy 클릭 시 credential_copy_to_clipboard 커맨드를 호출한다", async () => {
    const user = userEvent.setup();
    renderCard(makeApiKey());

    const copyBtn = screen.getByRole("button", { name: /copy/i });
    await user.click(copyBtn);

    expect(mockInvoke).toHaveBeenCalledWith("credential_copy_to_clipboard", {
      id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
    });
  });

  // ── ⋮ 메뉴 ────────────────────────────────────────────────────────────────

  it("⋮ 메뉴 트리거 버튼이 존재한다", () => {
    renderCard(makeApiKey());
    expect(screen.getByRole("button", { name: /more options/i })).toBeInTheDocument();
  });
});
