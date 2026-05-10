// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/__tests__/MiniGraph.test.tsx — M24-E Phase G-1-2

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MiniGraph } from "../MiniGraph";
import { CredentialCard } from "../CredentialCard";
import type { CredentialMiniGraph } from "@secretbank/shared";

// ---------------------------------------------------------------------------
// deep-link mock
// ---------------------------------------------------------------------------

vi.mock("../../lib/deep-link", () => ({
  openSecretbankDeepLink: vi.fn(),
}));

// site-logo mock (CredentialCard 통합 테스트용)
vi.mock("../../lib/site-logo", () => ({
  getSiteLogo: vi
    .fn()
    .mockResolvedValue({ kind: "letter", letter: "G", bg: "oklch(0.55 0.18 140)" }),
  domainToSlug: (d: string) => d.split(".")[0] ?? d,
}));

// ---------------------------------------------------------------------------
// 픽스처 헬퍼
// ---------------------------------------------------------------------------

function makeProject(i: number) {
  return { id: `proj-${i}`, label: `Project ${i}`, env: "prod" };
}

function makeGraph(projectCount: number, hiddenCount = 0): CredentialMiniGraph {
  return {
    center_id: "cred-abc",
    center_label: "GitHub",
    project_nodes: Array.from({ length: projectCount }, (_, i) => makeProject(i + 1)),
    edges: Array.from({ length: projectCount }, (_, i) => ({
      from: "cred-abc",
      to: `proj-${i + 1}`,
    })),
    hidden_count: hiddenCount,
  };
}

// ---------------------------------------------------------------------------
// MiniGraph 렌더 테스트
// ---------------------------------------------------------------------------

describe("MiniGraph — 렌더", () => {
  it("5개 projects → project-node 5개가 렌더된다", () => {
    render(<MiniGraph data={makeGraph(5)} />);
    const nodes = screen.getAllByTestId("project-node");
    expect(nodes).toHaveLength(5);
  });

  it("7개 projects (5 visible + hidden_count=2) → project-node 5개 + extra-node 1개", () => {
    // G-1-1 은 최대 5개 반환 + hidden_count 2 → 총 5 project-node + 1 extra-node
    render(<MiniGraph data={makeGraph(5, 2)} />);
    const projectNodes = screen.getAllByTestId("project-node");
    const extraNodes = screen.getAllByTestId("extra-node");
    expect(projectNodes).toHaveLength(5);
    expect(extraNodes).toHaveLength(1);
    // "+2 more" 텍스트 확인
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("0개 projects → empty state 텍스트가 표시된다", () => {
    render(<MiniGraph data={makeGraph(0, 0)} />);
    expect(screen.getByText("No linked projects")).toBeInTheDocument();
  });

  it("center node 가 렌더된다", () => {
    render(<MiniGraph data={makeGraph(3)} />);
    expect(screen.getByTestId("center-node")).toBeInTheDocument();
  });

  it("SVG aria-label 이 있다", () => {
    render(<MiniGraph data={makeGraph(3)} />);
    expect(screen.getByLabelText("Dependency graph")).toBeInTheDocument();
  });

  it("onClick 이 있으면 클릭 가능 영역에 role=button 이 있다", () => {
    render(<MiniGraph data={makeGraph(3)} onClick={vi.fn()} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("onClick 이 없으면 role=button 이 없다", () => {
    render(<MiniGraph data={makeGraph(3)} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("클릭 시 onClick 이 호출된다", () => {
    const onClick = vi.fn();
    render(<MiniGraph data={makeGraph(3)} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("Enter 키로도 onClick 이 호출된다", () => {
    const onClick = vi.fn();
    render(<MiniGraph data={makeGraph(3)} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter", code: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("1개 project → project-node 1개가 렌더된다", () => {
    render(<MiniGraph data={makeGraph(1)} />);
    expect(screen.getAllByTestId("project-node")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// CredentialCard hover 200ms delay + MiniGraph 통합 테스트
// ---------------------------------------------------------------------------

describe("CredentialCard — hover 200ms delay + MiniGraph 통합", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeCardProps(overrides: Partial<React.ComponentProps<typeof CredentialCard>> = {}) {
    return {
      id: "cred-1",
      issuer: "GitHub",
      domain: "github.com",
      username: "testuser",
      onAutofill: vi.fn(),
      onCopy: vi.fn(),
      ...overrides,
    };
  }

  it("hover 200ms 이전에는 MiniGraph 가 표시되지 않는다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeGraph(3));
    render(<CredentialCard {...makeCardProps({ onFetchMiniGraph: fetchFn })} />);
    const card = screen.getByRole("article");

    fireEvent.mouseEnter(card);
    // 200ms 미만 경과 (100ms)
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.queryByTestId("project-node")).not.toBeInTheDocument();
  });

  it("hover 200ms 후 onFetchMiniGraph 가 호출되고 MiniGraph 가 렌더된다", async () => {
    const graphData = makeGraph(3);
    const fetchFn = vi.fn().mockResolvedValue(graphData);
    render(<CredentialCard {...makeCardProps({ onFetchMiniGraph: fetchFn })} />);
    const card = screen.getByRole("article");

    fireEvent.mouseEnter(card);
    await act(async () => {
      vi.advanceTimersByTime(200);
      // Promise 해결 대기
      await Promise.resolve();
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("project-node")).toHaveLength(3);
  });

  it("hover 해제 시 MiniGraph 가 사라진다", async () => {
    const graphData = makeGraph(3);
    const fetchFn = vi.fn().mockResolvedValue(graphData);
    render(<CredentialCard {...makeCardProps({ onFetchMiniGraph: fetchFn })} />);
    const card = screen.getByRole("article");

    // hover → 200ms → MiniGraph 렌더
    fireEvent.mouseEnter(card);
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(screen.getAllByTestId("project-node")).toHaveLength(3);

    // hover 해제
    fireEvent.mouseLeave(card);
    expect(screen.queryByTestId("project-node")).not.toBeInTheDocument();
  });

  it("hover 200ms 이내 mouseLeave 시 fetch 가 호출되지 않는다 (실수 hover 방지)", () => {
    const fetchFn = vi.fn().mockResolvedValue(makeGraph(3));
    render(<CredentialCard {...makeCardProps({ onFetchMiniGraph: fetchFn })} />);
    const card = screen.getByRole("article");

    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(card);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("onFetchMiniGraph 없으면 hover 시 아무것도 표시되지 않는다", () => {
    render(<CredentialCard {...makeCardProps()} />);
    const card = screen.getByRole("article");

    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByTestId("project-node")).not.toBeInTheDocument();
    expect(screen.queryByTestId("minigraph-loading")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// deep-link 클릭 테스트
// ---------------------------------------------------------------------------

describe("CredentialCard — deep-link 클릭", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("MiniGraph 클릭 시 openSecretbankDeepLink('graph', { credential: id }) 가 호출된다", async () => {
    const { openSecretbankDeepLink } = await import("../../lib/deep-link");
    const mockDeepLink = vi.mocked(openSecretbankDeepLink);
    mockDeepLink.mockClear();

    const graphData = makeGraph(3);
    const fetchFn = vi.fn().mockResolvedValue(graphData);
    render(
      <CredentialCard
        id="cred-xyz"
        issuer="GitHub"
        domain="github.com"
        onAutofill={vi.fn()}
        onCopy={vi.fn()}
        onFetchMiniGraph={fetchFn}
      />,
    );
    const card = screen.getByRole("article");

    // hover → 200ms → MiniGraph 렌더
    fireEvent.mouseEnter(card);
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    // MiniGraph 클릭 (role=button)
    const miniGraphBtn = screen.getByRole("button", { name: /open dependency graph/i });
    fireEvent.click(miniGraphBtn);

    expect(mockDeepLink).toHaveBeenCalledWith("graph", { credential: "cred-xyz" });
  });
});
