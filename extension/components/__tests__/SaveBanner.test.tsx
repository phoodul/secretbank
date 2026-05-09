// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/__tests__/SaveBanner.test.tsx — M24-E Phase D-3, E-3

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SaveBanner } from "../SaveBanner";

// E-3: site-logo mock — 테스트 환경에서 chrome.runtime.getURL / IDB 미사용
vi.mock("../../lib/site-logo", () => ({
  getSiteLogo: vi.fn().mockResolvedValue({ kind: "letter", letter: "G", bg: "oklch(0.55 0.18 140)" }),
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
