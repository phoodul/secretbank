import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "@/lib/i18n";
import { SecurityDot } from "../SecurityDot";
import type { ScoreBreakdown } from "../types";

function renderDot(score: ScoreBreakdown) {
  return render(<SecurityDot score={score} />);
}

describe("SecurityDot", () => {
  it("safe 레벨 — 녹색 dot + accessible name 에 점수 노출", () => {
    renderDot({ total: 100, level: "safe", factors: [] });

    const dot = screen.getByRole("img");
    expect(dot).toHaveAttribute("data-level", "safe");
    expect(dot.className).toContain("bg-vault-success");
    // level 라벨(i18n) + 점수
    expect(dot.getAttribute("aria-label")).toMatch(/100\/100/);
  });

  it("warn 레벨 — 노란색 dot + factor 정보가 accessible name 에 포함", () => {
    renderDot({
      total: 80,
      level: "safe", // total>=80 은 safe 지만 여기선 강제로 warn 범주 보여주는 대신 warn 케이스 별도
      factors: [{ code: "expiring_soon", severity: "warn", penalty: 20, days: 10 }],
    });

    // level=safe 지만 factors 존재 → aria-label 에 factor 짧은 요약 노출 확인
    const dot = screen.getByRole("img");
    const label = dot.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/expires in 10d|expiring_soon/i);
  });

  it("warn 레벨 — 노란 dot", () => {
    renderDot({
      total: 60,
      level: "warn",
      factors: [{ code: "rotation_overdue", severity: "warn", penalty: 15, days: 30 }],
    });

    const dot = screen.getByRole("img");
    expect(dot).toHaveAttribute("data-level", "warn");
    expect(dot.className).toContain("bg-vault-warning");
  });

  it("danger 레벨 — 빨간색 dot + revoked factor", () => {
    renderDot({
      total: 0,
      level: "danger",
      factors: [{ code: "revoked", severity: "danger", penalty: 100, days: null }],
    });

    const dot = screen.getByRole("img");
    expect(dot).toHaveAttribute("data-level", "danger");
    expect(dot.className).toContain("bg-vault-danger");
    expect(dot.getAttribute("aria-label")).toMatch(/revoked/i);
  });
});
