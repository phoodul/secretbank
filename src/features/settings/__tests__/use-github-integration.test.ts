import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

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

import { useGithubIntegration } from "../use-github-integration";

const mockInvoke = vi.mocked(invoke);

describe("useGithubIntegration deep-link callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deepLinkListeners.length = 0;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves installation when deep-link payload matches Secretbank://github/callback", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "github_list_installations") return Promise.resolve([]);
      if (cmd === "github_install_url")
        return Promise.resolve("https://github.com/apps/secretbank/installations/new");
      if (cmd === "github_save_installation") return Promise.resolve(undefined);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useGithubIntegration());

    // Wait for initial load to complete
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Trigger connect
    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => expect(deepLinkListeners.length).toBeGreaterThan(0));

    // Fire a synthetic deep-link event with a github callback URL
    await act(async () => {
      deepLinkListeners[0]({
        payload: ["Secretbank://github/callback?installation_id=42&setup_action=install"],
      });
      // wait for the await save inside the listener to flush
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("github_save_installation", {
        installationId: 42,
      }),
    );
  });

  it("ignores deep-link events that do not match the github callback prefix", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "github_list_installations") return Promise.resolve([]);
      if (cmd === "github_install_url")
        return Promise.resolve("https://github.com/apps/secretbank/installations/new");
      return Promise.resolve(undefined);
    });

    const { result } = renderHook(() => useGithubIntegration());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => expect(deepLinkListeners.length).toBeGreaterThan(0));

    deepLinkListeners[0]({
      payload: ["Secretbank://auth/callback?provider=github&code=x&state=y"],
    });

    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 10));

    const saveCalls = mockInvoke.mock.calls.filter((c) => c[0] === "github_save_installation");
    expect(saveCalls).toHaveLength(0);
  });
});
