// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/__tests__/RailguardHintBanner.test.tsx — M24-E Phase G-5

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RailguardHintBanner } from "../RailguardHintBanner";

// ---------------------------------------------------------------------------
// 렌더 테스트
// ---------------------------------------------------------------------------

describe("RailguardHintBanner — 렌더", () => {
  it("role=alert 로 접근성 마크업", () => {
    render(
      <RailguardHintBanner
        host="chatgpt.com"
        onCreate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("RAILGUARD 배지가 표시된다", () => {
    render(
      <RailguardHintBanner
        host="cursor.com"
        onCreate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("RAILGUARD")).toBeInTheDocument();
  });

  it("키 노출 위험 경고 텍스트가 표시된다", () => {
    render(
      <RailguardHintBanner
        host="claude.ai"
        onCreate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/키 노출 위험/)).toBeInTheDocument();
  });

  it("'RAILGUARD 룰 생성' 버튼이 있다 (1순위 CTA)", () => {
    render(
      <RailguardHintBanner
        host="chatgpt.com"
        onCreate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "RAILGUARD 룰 자동 생성" })).toBeInTheDocument();
  });

  it("'1주 숨기기' 버튼이 있다 (secondary)", () => {
    render(
      <RailguardHintBanner
        host="chatgpt.com"
        onCreate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "이 도메인 1주일 미표시" })).toBeInTheDocument();
  });

  it("Kill Switch 경고 텍스트 포함", () => {
    render(
      <RailguardHintBanner
        host="poe.com"
        onCreate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/Kill Switch/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// severity 색상 검증
// ---------------------------------------------------------------------------

describe("RailguardHintBanner — amber severity 색상", () => {
  it("RAILGUARD 배지가 amber 배경색을 가진다", () => {
    const { container } = render(
      <RailguardHintBanner
        host="cursor.com"
        onCreate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    // style 태그에서 amber 색상 확인 (oklch hue ~65)
    const styleEl = container.querySelector("style");
    expect(styleEl?.textContent).toMatch(/oklch.*65/);
  });

  it("banner 가 position:fixed right:12px 으로 sidebar 고정", () => {
    const { container } = render(
      <RailguardHintBanner
        host="chatgpt.com"
        onCreate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const styleEl = container.querySelector("style");
    expect(styleEl?.textContent).toMatch(/position:\s*fixed/);
    expect(styleEl?.textContent).toMatch(/right:\s*12px/);
  });

  it("z-index 2147483647 (최대값)", () => {
    const { container } = render(
      <RailguardHintBanner
        host="claude.ai"
        onCreate={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const styleEl = container.querySelector("style");
    expect(styleEl?.textContent).toMatch(/z-index:\s*2147483647/);
  });
});

// ---------------------------------------------------------------------------
// 액션 핸들러 테스트
// ---------------------------------------------------------------------------

describe("RailguardHintBanner — 액션 핸들러", () => {
  it("'RAILGUARD 룰 생성' 클릭 시 onCreate 호출", () => {
    const onCreate = vi.fn();
    render(
      <RailguardHintBanner
        host="chatgpt.com"
        onCreate={onCreate}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "RAILGUARD 룰 자동 생성" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("'1주 숨기기' 클릭 시 onDismiss 호출", () => {
    const onDismiss = vi.fn();
    render(
      <RailguardHintBanner
        host="cursor.com"
        onCreate={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "이 도메인 1주일 미표시" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("onCreate 와 onDismiss 는 독립적으로 동작한다", () => {
    const onCreate = vi.fn();
    const onDismiss = vi.fn();
    render(
      <RailguardHintBanner
        host="gemini.google.com"
        onCreate={onCreate}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "RAILGUARD 룰 자동 생성" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismiss 후 create 는 독립 동작", () => {
    const onCreate = vi.fn();
    const onDismiss = vi.fn();
    render(
      <RailguardHintBanner
        host="perplexity.ai"
        onCreate={onCreate}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "이 도메인 1주일 미표시" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
