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

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

// Capture the registered deep-link listener so tests can fire synthetic events.
const deepLinkListeners: Array<(event: { payload: string[] }) => void> = [];
const mockListen = vi.fn(async (_event: string, cb: unknown) => {
  deepLinkListeners.push(cb as (event: { payload: string[] }) => void);
  return () => {
    const idx = deepLinkListeners.indexOf(cb as never);
    if (idx >= 0) deepLinkListeners.splice(idx, 1);
  };
});
vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

import { SignInPage } from "../SignInPage";

const mockInvoke = vi.mocked(invoke);

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/auth/sign-in"]}>
      <Routes>
        <Route path="/auth/sign-in" element={<SignInPage />} />
        <Route path="/settings" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deepLinkListeners.length = 0;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders title, email input, and three sign-in options", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /Connect to API Vault/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /passkey/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /GitHub/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Google/i })).toBeInTheDocument();
  });

  it("Keep offline → navigates to /settings", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /Keep this device offline/i }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/settings"));
  });

  it("OAuth happy path: start → deep-link → callback → success toast → /settings", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "auth_oauth_start") {
        return Promise.resolve({
          state: "deadbeef",
          authorize_url: "https://github.com/login/oauth/authorize?...",
        });
      }
      if (cmd === "auth_oauth_callback") {
        return Promise.resolve({ user_id: "usr_alice", expires_at: 1 });
      }
      throw new Error(`unexpected command: ${cmd}`);
    });

    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /GitHub/i }));

    // listener should be registered after mount + click
    await waitFor(() => expect(deepLinkListeners.length).toBeGreaterThan(0));

    // Fire a synthetic deep-link event with the matching state
    const fire = deepLinkListeners[0];
    fire({
      payload: ["apivault://auth/callback?provider=github&code=the-code&state=deadbeef"],
    });

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("auth_oauth_callback", {
        provider: "github",
        code: "the-code",
        oauthState: "deadbeef",
      }),
    );
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/settings"));
    expect(toast.success).toHaveBeenCalled();
  });

  it("OAuth state mismatch → error toast + no callback invoke", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "auth_oauth_start") {
        return Promise.resolve({
          state: "expected-state",
          authorize_url: "https://github.com/login/oauth/authorize",
        });
      }
      throw new Error(`unexpected command: ${cmd}`);
    });

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /GitHub/i }));
    await waitFor(() => expect(deepLinkListeners.length).toBeGreaterThan(0));

    const fire = deepLinkListeners[0];
    fire({
      payload: ["apivault://auth/callback?provider=github&code=the-code&state=BAD"],
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // auth_oauth_callback must NOT have been invoked
    const callbackCalls = mockInvoke.mock.calls.filter((c) => c[0] === "auth_oauth_callback");
    expect(callbackCalls).toHaveLength(0);
  });
});
