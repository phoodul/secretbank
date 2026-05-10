// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/__tests__/SaveBanner.test.tsx — M24-E Phase D-3, E-3, G-3-2

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SaveBanner } from "../SaveBanner";
import type { BlastRadiusForHostResponse } from "@secretbank/shared";

// E-3: site-logo mock — 테스트 환경에서 chrome.runtime.getURL / IDB 미사용
vi.mock("../../lib/site-logo", () => ({
  getSiteLogo: vi
    .fn()
    .mockResolvedValue({ kind: "letter", letter: "G", bg: "oklch(0.55 0.18 140)" }),
  domainToSlug: (d: string) => d.split(".")[0] ?? d,
}));

describe("SaveBanner — 렌더", () => {
  it("kind=new 일 때 'Save to Secretbank?' 제목이 표시된다", () => {
    render(
      <SaveBanner
        kind="new"
        siteName="github.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Save to Secretbank?")).toBeInTheDocument();
  });

  it("kind=update 일 때 'Update saved password?' 제목이 표시된다", () => {
    render(
      <SaveBanner
        kind="update"
        siteName="github.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Update saved password?")).toBeInTheDocument();
  });

  it("siteName 이 표시된다", () => {
    render(
      <SaveBanner
        kind="new"
        siteName="example.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("kind=new 이면 'Save' 버튼이 있다", () => {
    render(
      <SaveBanner
        kind="new"
        siteName="x.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("kind=update 이면 'Update' 버튼이 있다", () => {
    render(
      <SaveBanner
        kind="update"
        siteName="x.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("'Never for this site' 버튼이 있다", () => {
    render(
      <SaveBanner
        kind="new"
        siteName="x.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Never for this site" })).toBeInTheDocument();
  });

  it("'Not now' 버튼이 있다", () => {
    render(
      <SaveBanner
        kind="new"
        siteName="x.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });
});

describe("SaveBanner — 액션 핸들러", () => {
  it("Save 버튼 클릭 시 onSave 호출", () => {
    const onSave = vi.fn();
    render(
      <SaveBanner
        kind="new"
        siteName="x.com"
        onSave={onSave}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Update 버튼 클릭 시 onSave 호출", () => {
    const onSave = vi.fn();
    render(
      <SaveBanner
        kind="update"
        siteName="x.com"
        onSave={onSave}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Never for this site 클릭 시 onNever 호출", () => {
    const onNever = vi.fn();
    render(
      <SaveBanner
        kind="new"
        siteName="x.com"
        onSave={vi.fn()}
        onNever={onNever}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Never for this site" }));
    expect(onNever).toHaveBeenCalledTimes(1);
  });

  it("Not now 클릭 시 onDismiss 호출", () => {
    const onDismiss = vi.fn();
    render(
      <SaveBanner
        kind="new"
        siteName="x.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("SaveBanner — auto-dismiss timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("5초 후 onDismiss 자동 호출", () => {
    const onDismiss = vi.fn();
    render(
      <SaveBanner
        kind="new"
        siteName="x.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("4999ms 에는 auto-dismiss 아직 미발화", () => {
    const onDismiss = vi.fn();
    render(
      <SaveBanner
        kind="new"
        siteName="x.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("mouseenter 시 타이머 일시정지 — 5초 지나도 dismiss 안 됨", () => {
    const onDismiss = vi.fn();
    render(
      <SaveBanner
        kind="new"
        siteName="x.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseEnter(dialog);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("mouseleave 후 5초 뒤 dismiss 재개", () => {
    const onDismiss = vi.fn();
    render(
      <SaveBanner
        kind="new"
        siteName="x.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseEnter(dialog);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(dialog);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// G-3-2: blast radius 통합 테스트
// ---------------------------------------------------------------------------

const BLAST_RADIUS_FIXTURE: BlastRadiusForHostResponse = {
  credential_id: "01JWBLASTCRED000001",
  affected: [
    { kind: "project", label: "my-api", status: "active" },
    { kind: "deployment", label: "prod@aws", status: "active" },
  ],
  total: 5,
  hidden_count: 3,
};

describe("SaveBanner — G-3-2 blast radius 통합", () => {
  it("kind=update + blastRadius 로딩 중(undefined) → skeleton 표시", () => {
    render(
      <SaveBanner
        kind="update"
        siteName="github.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
        blastRadius={undefined}
      />,
    );
    expect(screen.getByTestId("blast-radius-skeleton")).toBeInTheDocument();
  });

  it("kind=update + blastRadius null → skeleton 없고 카드 없음", () => {
    render(
      <SaveBanner
        kind="update"
        siteName="github.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
        blastRadius={null}
      />,
    );
    expect(screen.queryByTestId("blast-radius-skeleton")).not.toBeInTheDocument();
    expect(screen.queryByTestId("blast-radius-card")).not.toBeInTheDocument();
  });

  it("kind=update + blastRadius total>0 → 카드 표시", () => {
    render(
      <SaveBanner
        kind="update"
        siteName="github.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
        blastRadius={BLAST_RADIUS_FIXTURE}
      />,
    );
    expect(screen.getByTestId("blast-radius-card")).toBeInTheDocument();
  });

  it("kind=update + blastRadius total=0 → 카드 숨김", () => {
    render(
      <SaveBanner
        kind="update"
        siteName="github.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
        blastRadius={{ credential_id: null, affected: [], total: 0, hidden_count: 0 }}
      />,
    );
    expect(screen.queryByTestId("blast-radius-card")).not.toBeInTheDocument();
  });

  it("kind=new → blast radius 카드/skeleton 모두 숨김", () => {
    render(
      <SaveBanner
        kind="new"
        siteName="github.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
        blastRadius={BLAST_RADIUS_FIXTURE}
      />,
    );
    // kind=new 이면 블록 자체가 렌더되지 않음
    expect(screen.queryByTestId("blast-radius-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("blast-radius-skeleton")).not.toBeInTheDocument();
  });

  it("카드 내 '그래프에서 보기' 클릭 → onViewBlastRadius 호출", () => {
    const onViewBlastRadius = vi.fn();
    render(
      <SaveBanner
        kind="update"
        siteName="github.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
        blastRadius={BLAST_RADIUS_FIXTURE}
        onViewBlastRadius={onViewBlastRadius}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /그래프에서/ }));
    expect(onViewBlastRadius).toHaveBeenCalledTimes(1);
  });

  it("카드에 affected items 라벨이 표시된다", () => {
    render(
      <SaveBanner
        kind="update"
        siteName="github.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
        blastRadius={BLAST_RADIUS_FIXTURE}
      />,
    );
    expect(screen.getByText("my-api")).toBeInTheDocument();
    expect(screen.getByText("prod@aws")).toBeInTheDocument();
  });

  it("hiddenCount 가 카드에 표시된다", () => {
    render(
      <SaveBanner
        kind="update"
        siteName="github.com"
        onSave={vi.fn()}
        onNever={vi.fn()}
        onDismiss={vi.fn()}
        blastRadius={BLAST_RADIUS_FIXTURE}
      />,
    );
    expect(screen.getByText(/\+3개 더/)).toBeInTheDocument();
  });
});
