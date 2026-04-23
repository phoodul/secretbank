import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import "@/lib/i18n";

// ---------------------------------------------------------------------------
// Tauri mocks
// ---------------------------------------------------------------------------

const invokeSpy = vi.fn();
const listenSpy = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeSpy(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: unknown) => {
    listenSpy(event, handler);
    // Return an unlisten fn.
    return Promise.resolve(() => undefined);
  },
}));

vi.mock("@/features/inventory/use-issuers", () => ({
  useIssuers: () => ({ issuers: [], loading: false, error: null }),
}));

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
  beforeEach(() => {
    invokeSpy.mockReset();
    listenSpy.mockReset();
    // Default: credential_list returns empty so useInventory resolves in every test.
    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === "credential_list") return Promise.resolve([]);
      return new Promise(() => undefined);
    });
  });

  it("path 쿼리가 없으면 scanMissingPath 메시지를 표시한다", () => {
    renderWithPath("");
    expect(
      screen.getByText(/no path supplied|경로가 없습니다|パスが指定されていません/i),
    ).toBeInTheDocument();
  });

  it("path 쿼리가 있으면 env_scan_folder 를 호출하고 스캐닝 표시한다", async () => {
    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === "credential_list") return Promise.resolve([]);
      if (cmd === "env_scan_folder") return new Promise(() => undefined); // pending
      return Promise.resolve(null);
    });

    renderWithPath("?path=/foo/bar");

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("env_scan_folder", { path: "/foo/bar" });
    });
    expect(screen.getByText(/scanning|스캔 중|スキャン中/i)).toBeInTheDocument();
  });

  it("스캔 완료 시 DetectedKeysReview 로 전환된다", async () => {
    invokeSpy.mockImplementation((cmd: string) => {
      if (cmd === "credential_list") return Promise.resolve([]);
      if (cmd === "env_scan_folder")
        return Promise.resolve([
          {
            file_path: "/foo/bar/.env",
            line: 1,
            env_var_name: "OPENAI_API_KEY",
            issuer_slug: "openai",
            value_hint: "aaaa",
            confidence: 0.95,
          },
        ]);
      return Promise.resolve(null);
    });

    renderWithPath("?path=/foo/bar");

    await waitFor(() => {
      expect(screen.getByText("OPENAI_API_KEY")).toBeInTheDocument();
    });
  });

  it("scan:progress 이벤트 리스너를 구독한다", async () => {
    invokeSpy.mockImplementation(() => new Promise(() => undefined));
    renderWithPath("?path=/foo/bar");

    await waitFor(() => {
      expect(listenSpy).toHaveBeenCalledWith("scan:progress", expect.any(Function));
    });
  });
});
