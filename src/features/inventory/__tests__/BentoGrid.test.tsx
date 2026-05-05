/**
 * BentoGrid — M24 C-3 TDD 테스트
 *
 * - loading: 스켈레톤 렌더링
 * - empty: EmptyState 렌더링
 * - items: BentoCard × N 렌더링
 * - onSelect 전파
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { BentoGrid } from "../BentoGrid";
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
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../use-issuers", () => ({
  useIssuers: vi.fn(() => ({
    issuers: [],
    loading: false,
    error: null,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(id: string, overrides: Partial<CredentialSummary> = {}): CredentialSummary {
  return {
    id,
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
    name: `Credential ${id}`,
    env: "prod",
    status: "active",
    expires_at: null,
    hash_hint: null,
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

function renderGrid(
  props: Partial<{
    items: CredentialSummary[];
    loading: boolean;
    onSelect: (id: string) => void;
  }> = {},
) {
  const { items = [], loading = false, onSelect } = props;
  return render(
    <MemoryRouter>
      <BentoGrid items={items} loading={loading} onSelect={onSelect} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BentoGrid", () => {
  // ── loading ───────────────────────────────────────────────────────────────

  it("loading=true 이면 스켈레톤을 렌더링한다", () => {
    renderGrid({ loading: true });
    // Skeleton 은 animate-pulse div — bento-grid data-testid 없어야 함
    expect(screen.queryByTestId("bento-grid")).toBeNull();
  });

  it("loading=true 이면 카드를 렌더링하지 않는다", () => {
    const items = [makeItem("id-1")];
    renderGrid({ items, loading: true });
    expect(screen.queryByText("Credential id-1")).toBeNull();
  });

  // ── empty state ───────────────────────────────────────────────────────────

  it("items가 빈 배열이면 EmptyState를 렌더링한다", () => {
    renderGrid({ items: [] });
    expect(screen.getByText(/No credentials yet/i)).toBeInTheDocument();
  });

  it("empty state 설명 문구가 표시된다", () => {
    renderGrid({ items: [] });
    expect(screen.getByText(/Add one or drop a project folder/i)).toBeInTheDocument();
  });

  it("items가 있으면 EmptyState를 렌더링하지 않는다", () => {
    renderGrid({ items: [makeItem("id-1")] });
    expect(screen.queryByText(/No credentials yet/i)).toBeNull();
  });

  // ── 아이템 렌더링 ─────────────────────────────────────────────────────────

  it("items 수만큼 BentoCard를 렌더링한다", () => {
    const items = [makeItem("id-1"), makeItem("id-2"), makeItem("id-3")];
    renderGrid({ items });
    expect(screen.getByTestId("bento-grid")).toBeInTheDocument();
    expect(screen.getByText("Credential id-1")).toBeInTheDocument();
    expect(screen.getByText("Credential id-2")).toBeInTheDocument();
    expect(screen.getByText("Credential id-3")).toBeInTheDocument();
  });

  it("단일 아이템도 올바르게 렌더링한다", () => {
    renderGrid({ items: [makeItem("solo")] });
    expect(screen.getByText("Credential solo")).toBeInTheDocument();
  });

  // ── onSelect 전파 ─────────────────────────────────────────────────────────

  it("카드 클릭 시 onSelect에 credential id를 전달한다", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderGrid({ items: [makeItem("id-click")], onSelect });

    // 카드 자체(role=button)를 클릭
    const cardEl = screen.getByText("Credential id-click").closest("[role='button']");
    expect(cardEl).not.toBeNull();
    await user.click(cardEl!);

    expect(onSelect).toHaveBeenCalledWith("id-click");
  });

  it("onSelect가 없으면 카드에 role=button이 없다", () => {
    renderGrid({ items: [makeItem("id-no-select")] });
    // role=button 은 ⋮ 메뉴 트리거와 Show/Copy 버튼만 — 카드 자체는 없음
    const cardEl = screen.getByText("Credential id-no-select").closest("div[tabindex]");
    expect(cardEl).toBeNull();
  });

  // ── grid layout ───────────────────────────────────────────────────────────

  it("data-testid='bento-grid' 래퍼가 존재한다", () => {
    renderGrid({ items: [makeItem("id-grid")] });
    expect(screen.getByTestId("bento-grid")).toBeInTheDocument();
  });
});
