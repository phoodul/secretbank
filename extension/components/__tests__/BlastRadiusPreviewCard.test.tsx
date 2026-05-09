// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/__tests__/BlastRadiusPreviewCard.test.tsx — M24-E Phase G-3-2

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlastRadiusPreviewCard } from "../BlastRadiusPreviewCard";
import type { BlastRadiusItem } from "@secretbank/shared";

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

const PROJECT_ITEM: BlastRadiusItem = {
  kind: "project",
  label: "my-api",
  status: "active",
};

const DEPLOYMENT_ITEM: BlastRadiusItem = {
  kind: "deployment",
  label: "prod@aws-us-east",
  status: "active",
};

function makeItems(count: number): BlastRadiusItem[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: i % 2 === 0 ? "project" : "deployment",
    label: `item-${i}`,
    status: "active",
  }));
}

// ---------------------------------------------------------------------------
// 렌더 테스트
// ---------------------------------------------------------------------------

describe("BlastRadiusPreviewCard — 렌더", () => {
  it("total=0 이면 렌더하지 않는다", () => {
    const { container } = render(
      <BlastRadiusPreviewCard
        items={[]}
        total={0}
        hiddenCount={0}
        onViewDetails={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("total=3, items 3개 → 카드 표시", () => {
    render(
      <BlastRadiusPreviewCard
        items={makeItems(3)}
        total={3}
        hiddenCount={0}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.getByTestId("blast-radius-card")).toBeInTheDocument();
  });

  it("total=1, items 1개 → 항목 라벨이 표시된다", () => {
    render(
      <BlastRadiusPreviewCard
        items={[PROJECT_ITEM]}
        total={1}
        hiddenCount={0}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.getByText("my-api")).toBeInTheDocument();
  });

  it("items 2개 (project + deployment) → 모두 표시", () => {
    render(
      <BlastRadiusPreviewCard
        items={[PROJECT_ITEM, DEPLOYMENT_ITEM]}
        total={2}
        hiddenCount={0}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.getByText("my-api")).toBeInTheDocument();
    expect(screen.getByText("prod@aws-us-east")).toBeInTheDocument();
  });

  it("hiddenCount > 0 이면 '+N개 더' 텍스트가 표시된다", () => {
    render(
      <BlastRadiusPreviewCard
        items={makeItems(5)}
        total={10}
        hiddenCount={5}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.getByText(/\+5개 더/)).toBeInTheDocument();
  });

  it("hiddenCount = 0 이면 '+N개 더' 텍스트가 없다", () => {
    render(
      <BlastRadiusPreviewCard
        items={makeItems(3)}
        total={3}
        hiddenCount={0}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.queryByText(/\+0개 더/)).not.toBeInTheDocument();
  });

  it("'그래프에서 보기' 버튼이 표시된다", () => {
    render(
      <BlastRadiusPreviewCard
        items={[PROJECT_ITEM]}
        total={1}
        hiddenCount={0}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /그래프에서/ })).toBeInTheDocument();
  });

  it("영향 수가 total 값으로 표시된다", () => {
    render(
      <BlastRadiusPreviewCard
        items={makeItems(5)}
        total={8}
        hiddenCount={3}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.getByText(/8개 항목에 영향/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 인터랙션 테스트
// ---------------------------------------------------------------------------

describe("BlastRadiusPreviewCard — 인터랙션", () => {
  it("'그래프에서 보기' 클릭 → onViewDetails 호출", () => {
    const onViewDetails = vi.fn();
    render(
      <BlastRadiusPreviewCard
        items={[PROJECT_ITEM]}
        total={1}
        hiddenCount={0}
        onViewDetails={onViewDetails}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /그래프에서/ }));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });

  it("total=0 일 때 클릭해도 onViewDetails 미호출 (렌더 안 됨)", () => {
    const onViewDetails = vi.fn();
    const { container } = render(
      <BlastRadiusPreviewCard
        items={[]}
        total={0}
        hiddenCount={0}
        onViewDetails={onViewDetails}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(onViewDetails).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 접근성 테스트
// ---------------------------------------------------------------------------

describe("BlastRadiusPreviewCard — 접근성", () => {
  it("카드에 role=note 가 있다", () => {
    render(
      <BlastRadiusPreviewCard
        items={[PROJECT_ITEM]}
        total={1}
        hiddenCount={0}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("aria-label 에 total 수가 포함된다", () => {
    render(
      <BlastRadiusPreviewCard
        items={[PROJECT_ITEM]}
        total={3}
        hiddenCount={0}
        onViewDetails={vi.fn()}
      />,
    );
    expect(screen.getByRole("note")).toHaveAttribute("aria-label", "영향 범위: 3개 항목");
  });
});
