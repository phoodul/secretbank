// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/__tests__/SupplyChainBanner.test.tsx — M24-E Phase G-2-2

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SupplyChainBanner } from "../SupplyChainBanner";
import type { IncidentMatchSummary } from "@secretbank/shared";

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

const highIncident: IncidentMatchSummary = {
  incident_id: "01HZ_HIGH",
  severity: "high",
  title: "GitHub credential exposure (CVE-2024-1234)",
  published_at: Date.now() - 3 * 24 * 3600 * 1000, // 3일 전
  source: "nvd",
};

const mediumIncident: IncidentMatchSummary = {
  incident_id: "01HZ_MED",
  severity: "medium",
  title: "Stripe API key leak",
  published_at: Date.now() - 10 * 24 * 3600 * 1000, // 10일 전
  source: "ghsa",
};

const criticalIncident: IncidentMatchSummary = {
  incident_id: "01HZ_CRIT",
  severity: "critical",
  title: "LastPass master password breach",
  published_at: null, // 날짜 미상
  source: "hibp",
};

const lowIncident: IncidentMatchSummary = {
  incident_id: "01HZ_LOW",
  severity: "low",
  title: "Minor issue",
  published_at: null,
  source: "rss",
};

// ---------------------------------------------------------------------------
// 렌더 테스트
// ---------------------------------------------------------------------------

describe("SupplyChainBanner — 렌더", () => {
  it("host 이름이 표시된다", () => {
    render(
      <SupplyChainBanner
        host="github.com"
        incident={highIncident}
        onView={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/github\.com/)).toBeInTheDocument();
  });

  it("incident title 이 표시된다", () => {
    render(
      <SupplyChainBanner
        host="github.com"
        incident={highIncident}
        onView={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/GitHub credential exposure/)).toBeInTheDocument();
  });

  it("'자세히 보기' 버튼이 있다 (1순위 CTA)", () => {
    render(
      <SupplyChainBanner
        host="github.com"
        incident={highIncident}
        onView={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "자세히 보기" })).toBeInTheDocument();
  });

  it("'7일간 숨기기' 버튼이 있다 (secondary)", () => {
    render(
      <SupplyChainBanner
        host="github.com"
        incident={highIncident}
        onView={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "7일간 숨기기" })).toBeInTheDocument();
  });

  it("role=alert 로 접근성 마크업", () => {
    render(
      <SupplyChainBanner
        host="github.com"
        incident={highIncident}
        onView={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("published_at 있으면 N일 전 텍스트 표시", () => {
    render(
      <SupplyChainBanner
        host="github.com"
        incident={highIncident}
        onView={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    // "3일 전" 또는 "N일 전" 패턴
    expect(screen.getByText(/일 전/)).toBeInTheDocument();
  });

  it("published_at null 이면 날짜 텍스트 없음 — 대신 '에서' 텍스트", () => {
    render(
      <SupplyChainBanner
        host="lastpass.com"
        incident={criticalIncident}
        onView={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByText(/일 전/)).toBeNull();
    expect(screen.getByText(/에서 보안 사고가 보고됐습니다/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// severity 색상 테스트
// ---------------------------------------------------------------------------

describe("SupplyChainBanner — severity 표시", () => {
  it("HIGH incident 은 HIGH 배지 표시", () => {
    render(
      <SupplyChainBanner
        host="github.com"
        incident={highIncident}
        onView={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("HIGH")).toBeInTheDocument();
  });

  it("MEDIUM incident 은 MEDIUM 배지 표시", () => {
    render(
      <SupplyChainBanner
        host="stripe.com"
        incident={mediumIncident}
        onView={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
  });

  it("CRITICAL incident 은 CRITICAL 배지 표시", () => {
    render(
      <SupplyChainBanner
        host="lastpass.com"
        incident={criticalIncident}
        onView={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
  });

  it("LOW severity 는 렌더하지 않는다 (defensive skip)", () => {
    const { container } = render(
      <SupplyChainBanner
        host="example.com"
        incident={lowIncident}
        onView={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    // LOW 는 null 반환 → 아무것도 렌더 안 됨
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 액션 핸들러 테스트
// ---------------------------------------------------------------------------

describe("SupplyChainBanner — 액션 핸들러", () => {
  it("'자세히 보기' 클릭 시 onView 호출", () => {
    const onView = vi.fn();
    render(
      <SupplyChainBanner
        host="github.com"
        incident={highIncident}
        onView={onView}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "자세히 보기" }));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("'7일간 숨기기' 클릭 시 onDismiss 호출", () => {
    const onDismiss = vi.fn();
    render(
      <SupplyChainBanner
        host="github.com"
        incident={highIncident}
        onView={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "7일간 숨기기" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("onView 는 onDismiss 와 독립적으로 동작한다", () => {
    const onView = vi.fn();
    const onDismiss = vi.fn();
    render(
      <SupplyChainBanner
        host="stripe.com"
        incident={mediumIncident}
        onView={onView}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "자세히 보기" }));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
