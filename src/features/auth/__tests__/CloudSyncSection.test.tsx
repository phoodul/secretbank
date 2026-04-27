import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { invoke } from "@tauri-apps/api/core";

import { CloudSyncSection } from "../CloudSyncSection";

const mockInvoke = vi.mocked(invoke);

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderSection() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<CloudSyncSection />} />
        <Route path="/auth/sign-in" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CloudSyncSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("not signed in: shows Sign in button that navigates to /auth/sign-in", async () => {
    mockInvoke.mockResolvedValue(null);
    renderSection();

    await waitFor(() =>
      expect(screen.getByText(/Not signed in/i)).toBeInTheDocument(),
    );
    const button = screen.getByRole("button", { name: /^Sign in$/i });
    await userEvent.click(button);

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/auth/sign-in"),
    );
  });

  it("signed in: shows truncated user_id and Sign out button", async () => {
    mockInvoke.mockResolvedValue({
      user_id: "usr_alice_xxxxxxxxxxxxxxxxxxxx",
      expires_at: 1700000000,
    });
    renderSection();

    await waitFor(() =>
      expect(screen.getByText(/Signed in/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/User: usr_alice_xx…/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sign out/i }),
    ).toBeInTheDocument();
  });

  it("signed in: clicking Sign out calls auth_signout and clears UI", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "auth_status") {
        return Promise.resolve({ user_id: "usr_bob", expires_at: 1 });
      }
      if (cmd === "auth_signout") {
        return Promise.resolve(undefined);
      }
      throw new Error(`unexpected command: ${cmd}`);
    });

    renderSection();

    await waitFor(() =>
      expect(screen.getByText(/Signed in/i)).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: /Sign out/i }));

    await waitFor(() =>
      expect(screen.getByText(/Not signed in/i)).toBeInTheDocument(),
    );
    expect(mockInvoke).toHaveBeenCalledWith("auth_signout");
  });
});
