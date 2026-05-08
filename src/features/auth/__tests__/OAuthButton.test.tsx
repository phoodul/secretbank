import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

import { OAuthButton } from "../OAuthButton";

const mockInvoke = vi.mocked(invoke);

describe("OAuthButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders provider label and invokes auth_oauth_start with redirect_uri", async () => {
    mockInvoke.mockResolvedValue({
      state: "deadbeef",
      authorize_url: "https://github.com/login/oauth/authorize?...",
    });

    const onStart = vi.fn();
    const onError = vi.fn();
    render(<OAuthButton provider="github" busy={false} onStart={onStart} onError={onError} />);

    expect(screen.getByRole("button")).toHaveTextContent(/GitHub/i);
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("auth_oauth_start", {
        provider: "github",
        redirectUri: "Secretbank://auth/callback",
      }),
    );
    expect(onStart).toHaveBeenCalledWith("github", "deadbeef");
    expect(onError).not.toHaveBeenCalled();
  });

  it("propagates error from invoke via onError", async () => {
    mockInvoke.mockRejectedValue(new Error("boom"));

    const onStart = vi.fn();
    const onError = vi.fn();
    render(<OAuthButton provider="google" busy={false} onStart={onStart} onError={onError} />);

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("boom"));
    expect(onStart).not.toHaveBeenCalled();
  });

  it("disabled when busy", () => {
    render(<OAuthButton provider="github" busy onStart={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
