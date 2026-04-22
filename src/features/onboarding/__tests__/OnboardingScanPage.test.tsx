import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import "@/lib/i18n";
import { OnboardingScanPage } from "@/pages/OnboardingScanPage";

function renderWithPath(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/onboarding/scan${search}`]}>
      <Routes>
        <Route path="/onboarding/scan" element={<OnboardingScanPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OnboardingScanPage", () => {
  it("?path=/foo/bar 쿼리가 있으면 경로를 표시한다", () => {
    renderWithPath("?path=/foo/bar");
    expect(screen.getByText(/\/foo\/bar/)).toBeInTheDocument();
  });

  it("path 쿼리가 없으면 scanMissingPath 메시지를 표시한다", () => {
    renderWithPath("");
    expect(
      screen.getByText(/no path supplied|경로가 없습니다|パスが指定されていません/i),
    ).toBeInTheDocument();
  });
});
