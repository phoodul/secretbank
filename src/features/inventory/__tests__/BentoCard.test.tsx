/**
 * BentoCard — M24 C-2 정정 TDD 테스트
 *
 * 정정된 레이아웃:
 *   Row 1 — name (라벨 없이)
 *   Row 2 — "URL:" 라벨 + 값
 *   Row 3 — "ID:" 라벨 + (password: 마스킹 + reveal) | (api_key: issuer 평문)
 *   Row 4 — "PW:" / "Key:" 라벨 + 마스킹 + reveal + copy
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
    has_secondary: false,
    primary_label: null,
    secondary_label: null,
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
    has_secondary: false,
    primary_label: null,
    secondary_label: null,
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

  it("PW 행에 마스킹된 dots를 렌더링한다", () => {
    renderCard(makeApiKey());
    // 마스킹 표시: ••••••••••••• 패턴 (여러 개 있을 수 있음)
    const masked = screen.getAllByText(/•+/);
    expect(masked.length).toBeGreaterThan(0);
  });

  it("Show 버튼을 렌더링한다 (aria-label 기준)", () => {
    renderCard(makeApiKey());
    // PW 행의 Show 버튼 (aria-label = "Show")
    expect(screen.getAllByRole("button", { name: /show/i }).length).toBeGreaterThan(0);
  });

  it("Copy 버튼을 렌더링한다", () => {
    renderCard(makeApiKey());
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  // ── 라벨 표시 ─────────────────────────────────────────────────────────────

  it("URL이 있으면 'URL:' 라벨을 표시한다", () => {
    renderCard(makePassword({ url: "https://gmail.com" }));
    expect(screen.getByText("URL:")).toBeInTheDocument();
  });

  it("URL 값이 'URL:' 라벨 옆에 표시된다", () => {
    renderCard(makePassword({ url: "https://gmail.com" }));
    expect(screen.getByText("https://gmail.com")).toBeInTheDocument();
  });

  it("URL이 null이면 URL 라벨을 렌더링하지 않는다", () => {
    renderCard(makeApiKey({ url: null }));
    expect(screen.queryByText("URL:")).toBeNull();
  });

  it("password: 'ID:' 라벨을 표시한다", () => {
    renderCard(makePassword());
    expect(screen.getByText("ID:")).toBeInTheDocument();
  });

  it("api_key: 'ID:' 라벨을 표시한다 (issuer name 옆에)", () => {
    renderCard(makeApiKey({ issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB" }));
    expect(screen.getByText("ID:")).toBeInTheDocument();
  });

  it("password: 'PW:' 라벨을 표시한다", () => {
    renderCard(makePassword());
    expect(screen.getByText("PW:")).toBeInTheDocument();
  });

  it("api_key: 'API Key:' 라벨을 표시한다 (PW 대신)", () => {
    renderCard(makeApiKey());
    expect(screen.getByText("API Key:")).toBeInTheDocument();
    expect(screen.queryByText("PW:")).toBeNull();
  });

  // ── ID 행 — kind 별 동작 ───────────────────────────────────────────────────

  it("api_key: ID 행에 issuer display_name을 평문으로 표시한다", () => {
    renderCard(makeApiKey({ issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB" }));
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
  });

  it("api_key: ID 행에 reveal 버튼이 없다", () => {
    renderCard(makeApiKey({ issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB" }));
    // Show 버튼은 PW 행 하나만 존재해야 함
    const showBtns = screen.getAllByRole("button", { name: /show/i });
    // api_key 에는 ID reveal 버튼이 없으므로 PW 행 1개만
    expect(showBtns).toHaveLength(1);
  });

  it("password: ID 행의 username이 마스킹되어 표시된다", () => {
    renderCard(makePassword({ username: "user@gmail.com" }));
    // ID 행과 PW 행 모두 마스킹 — username 평문은 보이지 않음
    expect(screen.queryByText("user@gmail.com")).toBeNull();
    const masked = screen.getAllByText(/•+/);
    expect(masked.length).toBeGreaterThanOrEqual(2); // ID행 + PW행
  });

  it("password: ID [보기] 클릭 시 username이 노출된다 (Tauri 호출 없음)", async () => {
    const user = userEvent.setup();
    renderCard(makePassword({ username: "user@gmail.com" }));

    // Show 버튼이 2개 (ID + PW) — ID 행의 첫 번째 버튼
    const showBtns = screen.getAllByRole("button", { name: /show/i });
    await user.click(showBtns[0]);

    // Tauri invoke 호출 없음
    expect(mockInvoke).not.toHaveBeenCalledWith("credential_reveal", expect.anything());

    // username 노출
    await waitFor(() => {
      expect(screen.getByText("user@gmail.com")).toBeInTheDocument();
    });
  });

  it("password: ID reveal 후 30초 지나면 다시 마스킹된다 (fake timer)", async () => {
    vi.useFakeTimers();
    try {
      renderCard(makePassword({ username: "user@gmail.com" }));

      const showBtns = screen.getAllByRole("button", { name: /show/i });

      await act(async () => {
        showBtns[0].click();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText("user@gmail.com")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(screen.queryByText("user@gmail.com")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // ── PW Show / reveal ───────────────────────────────────────────────────────

  it("PW Show 클릭 시 credential_reveal Tauri 커맨드를 slot: primary 로 호출한다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue("sk-test-secret-value");
    renderCard(makeApiKey());

    // api_key는 Show 버튼이 PW 행 하나뿐
    const showBtn = screen.getByRole("button", { name: /show/i });
    await user.click(showBtn);

    expect(mockInvoke).toHaveBeenCalledWith("credential_reveal", {
      id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
      slot: "primary",
    });
  });

  it("PW reveal 성공 시 실제 값이 표시된다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue("sk-test-secret-value");
    renderCard(makeApiKey());

    const showBtn = screen.getByRole("button", { name: /show/i });
    await user.click(showBtn);

    await waitFor(() => {
      expect(screen.getByText("sk-test-secret-value")).toBeInTheDocument();
    });
  });

  it("PW reveal 후 Hide 버튼이 나타난다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue("sk-test-secret-value");
    renderCard(makeApiKey());

    const showBtn = screen.getByRole("button", { name: /show/i });
    await user.click(showBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /hide/i })).toBeInTheDocument();
    });
  });

  it("PW reveal 후 30초가 지나면 다시 마스킹된다 (fake timer)", async () => {
    vi.useFakeTimers();
    try {
      mockInvoke.mockImplementation(() => Promise.resolve("sk-test-secret-value"));

      renderCard(makeApiKey());

      const showBtn = screen.getByRole("button", { name: /show/i });

      await act(async () => {
        showBtn.click();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText("sk-test-secret-value")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(screen.queryByText("sk-test-secret-value")).not.toBeInTheDocument();
      expect(screen.getAllByText(/•+/).length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Copy ──────────────────────────────────────────────────────────────────

  it("Copy 클릭 시 credential_copy_to_clipboard 커맨드를 slot: primary 로 호출한다", async () => {
    const user = userEvent.setup();
    renderCard(makeApiKey());

    const copyBtn = screen.getByRole("button", { name: /copy/i });
    await user.click(copyBtn);

    expect(mockInvoke).toHaveBeenCalledWith("credential_copy_to_clipboard", {
      id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
      slot: "primary",
    });
  });

  // ── has_secondary pair row ─────────────────────────────────────────────────

  it("has_secondary: true 일 때 두 번째 reveal/copy row 가 렌더된다", () => {
    renderCard(
      makeApiKey({
        has_secondary: true,
        secondary_label: "Secret Key",
      }),
    );

    // "Secret Key" 라벨이 노출됨
    expect(screen.getByText("Secret Key")).toBeInTheDocument();

    // Show 버튼 2개 (primary + secondary), Copy 버튼 2개
    const showBtns = screen.getAllByRole("button", { name: /show/i });
    expect(showBtns.length).toBeGreaterThanOrEqual(2);

    const copyBtns = screen.getAllByRole("button", { name: /copy/i });
    expect(copyBtns).toHaveLength(2);
  });

  it("secondary reveal 클릭 시 credential_reveal 이 slot: secondary 로 호출된다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue("sk-secret-secondary");

    renderCard(
      makeApiKey({
        has_secondary: true,
        secondary_label: "Secret Key",
      }),
    );

    // Show 버튼들 중 두 번째 = secondary row
    const showBtns = screen.getAllByRole("button", { name: /show/i });
    await user.click(showBtns[showBtns.length - 1]);

    expect(mockInvoke).toHaveBeenCalledWith("credential_reveal", {
      id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
      slot: "secondary",
    });
  });

  it("secondary copy 클릭 시 credential_copy_to_clipboard 이 slot: secondary 로 호출된다", async () => {
    const user = userEvent.setup();
    renderCard(
      makeApiKey({
        has_secondary: true,
        secondary_label: "Secret Key",
      }),
    );

    // Copy 버튼 2개 중 두 번째 = secondary row
    const copyBtns = screen.getAllByRole("button", { name: /copy/i });
    await user.click(copyBtns[copyBtns.length - 1]);

    expect(mockInvoke).toHaveBeenCalledWith("credential_copy_to_clipboard", {
      id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
      slot: "secondary",
    });
  });

  // ── ⋮ 메뉴 ────────────────────────────────────────────────────────────────

  it("⋮ 메뉴 트리거 버튼이 존재한다", () => {
    renderCard(makeApiKey());
    expect(screen.getByRole("button", { name: /more options/i })).toBeInTheDocument();
  });
});
