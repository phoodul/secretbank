import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

import { PasskeyButton } from "../PasskeyButton";

const mockInvoke = vi.mocked(invoke);
const mockStartAuth = vi.mocked(startAuthentication);
const mockStartReg = vi.mocked(startRegistration);

function makeRelay404(body: string) {
  return { code: "relay", status: 404, body };
}

describe("PasskeyButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("disabled when email is blank", () => {
    render(
      <PasskeyButton
        email=""
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("happy path: existing user → assert flow → onSuccess", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "auth_passkey_assert_start") {
        return Promise.resolve({
          user_id: "usr_alice",
          options: { challenge: "abc" },
          salt_auth: "AAAA",
          salt_enc: "BBBB",
        });
      }
      if (cmd === "auth_passkey_assert_verify") {
        return Promise.resolve({ user_id: "usr_alice", expires_at: 1700000000 });
      }
      throw new Error(`unexpected command: ${cmd}`);
    });
    mockStartAuth.mockResolvedValue({ id: "raw-auth" } as never);

    const onSuccess = vi.fn();
    const onError = vi.fn();
    render(
      <PasskeyButton
        email="alice@example.com"
        onSuccess={onSuccess}
        onError={onError}
      />,
    );

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess).toHaveBeenCalledWith({
      user_id: "usr_alice",
      expires_at: 1700000000,
    });
    expect(mockStartAuth).toHaveBeenCalled();
    expect(mockStartReg).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("first-time user: assert 404 → register fallback → onSuccess", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "auth_passkey_assert_start") {
        return Promise.reject(makeRelay404("user_not_found"));
      }
      if (cmd === "auth_passkey_register_start") {
        return Promise.resolve({
          user_id: "usr_new",
          options: { challenge: "xyz" },
          salt_auth: "AAAA",
          salt_enc: "BBBB",
        });
      }
      if (cmd === "auth_passkey_register_verify") {
        return Promise.resolve({ user_id: "usr_new", expires_at: 1 });
      }
      throw new Error(`unexpected command: ${cmd}`);
    });
    mockStartReg.mockResolvedValue({ id: "raw-reg" } as never);

    const onSuccess = vi.fn();
    render(
      <PasskeyButton
        email="new@example.com"
        onSuccess={onSuccess}
        onError={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockStartReg).toHaveBeenCalled();
    expect(mockStartAuth).not.toHaveBeenCalled();
  });

  it("non-404 relay error during assert → onError, no fallback to register", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "auth_passkey_assert_start") {
        return Promise.reject({
          code: "relay",
          status: 410,
          body: "challenge_expired",
        });
      }
      throw new Error(`unexpected command: ${cmd}`);
    });

    const onError = vi.fn();
    const onSuccess = vi.fn();
    render(
      <PasskeyButton
        email="alice@example.com"
        onSuccess={onSuccess}
        onError={onError}
      />,
    );

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toContain("challenge_expired");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockStartReg).not.toHaveBeenCalled();
  });

  it("disabled while busy (single-flight)", async () => {
    let resolveAssert: (v: unknown) => void = () => undefined;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "auth_passkey_assert_start") {
        return new Promise((r) => {
          resolveAssert = r;
        });
      }
      throw new Error(`unexpected command: ${cmd}`);
    });

    render(
      <PasskeyButton
        email="alice@example.com"
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const button = screen.getByRole("button");
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    resolveAssert(makeRelay404("user_not_found"));
  });
});
