import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types matching the Rust command signatures
// ---------------------------------------------------------------------------

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface GithubInstallation {
  installation_id: number;
  installed_at: number; // unix ms
  repos: RepoRef[];
}

export interface RemoteKey {
  id: string;
  provider: string;
  secret_type: string;
  first_detected: string | null; // ISO datetime string from Rust
  locations_count: number;
  url: string | null;
}

// ---------------------------------------------------------------------------
// Deep-link callback parser
// ---------------------------------------------------------------------------

const GITHUB_CALLBACK_PREFIX = "Secretbank://github/callback";

/**
 * `Secretbank://github/callback?installation_id=N[&setup_action=install]` URL 을
 * 파싱해 installation_id 를 추출한다. 매칭 실패 시 null.
 *
 * GitHub App 의 "Setup URL" 이 이 deep-link 로 설정되어 있어야 동작한다 —
 * `docs/runbooks/github-app-registration.md` 참조.
 */
export function parseGithubCallbackUrl(raw: string): number | null {
  if (!raw.startsWith(GITHUB_CALLBACK_PREFIX)) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const installationParam = parsed.searchParams.get("installation_id");
  if (!installationParam) return null;
  const id = Number(installationParam);
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) return null;
  return id;
}

// ---------------------------------------------------------------------------
// IPC wrappers
// ---------------------------------------------------------------------------

async function ipcInstallUrl(): Promise<string> {
  return invoke<string>("github_install_url");
}

async function ipcSaveInstallation(installationId: number): Promise<void> {
  return invoke("github_save_installation", { installationId });
}

async function ipcListInstallations(): Promise<GithubInstallation[]> {
  return invoke<GithubInstallation[]>("github_list_installations");
}

async function ipcRemoveInstallation(installationId: number): Promise<void> {
  return invoke("github_remove_installation", { installationId });
}

async function ipcScanRepo(
  installationId: number,
  owner: string,
  repo: string,
): Promise<RemoteKey[]> {
  return invoke<RemoteKey[]>("github_scan_repo", {
    input: { installation_id: installationId, owner, repo },
  });
}

// ---------------------------------------------------------------------------
// Internal fetch state
// ---------------------------------------------------------------------------

type FetchState =
  | { phase: "loading" }
  | { phase: "ok"; data: GithubInstallation[] }
  | { phase: "error"; message: string };

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseGithubIntegrationReturn {
  installations: GithubInstallation[];
  loading: boolean;
  error: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  refresh: () => void;
  remove: (installationId: number) => Promise<void>;
  scan: (installationId: number, owner: string, repo: string) => Promise<RemoteKey[]>;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useGithubIntegration(): UseGithubIntegrationReturn {
  const [fetchState, setFetchState] = useState<FetchState>({ phase: "loading" });
  // Incrementing tick triggers a re-fetch via the useEffect dependency.
  const [tick, setTick] = useState(0);
  const [connecting, setConnecting] = useState(false);

  // Track if a deep-link listener is already registered to prevent duplicates.
  const deepLinkRegistered = useRef(false);

  // Load installations whenever tick changes (covers initial load + refresh).
  useEffect(() => {
    let cancelled = false;

    ipcListInstallations()
      .then((data) => {
        if (!cancelled) setFetchState({ phase: "ok", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setFetchState({ phase: "error", message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => {
    setFetchState({ phase: "loading" });
    setTick((n) => n + 1);
  }, []);

  const connect = useCallback(async () => {
    if (connecting || deepLinkRegistered.current) return;
    setConnecting(true);
    try {
      const url = await ipcInstallUrl();

      // Open GitHub in external browser.
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);

      // Register a one-time deep-link listener. lib.rs emits `deep-link` with
      // a `Vec<String>` payload containing the matched URLs — we filter for
      // ones starting with `Secretbank://github/callback`.
      if (!deepLinkRegistered.current) {
        deepLinkRegistered.current = true;
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen<string[]>("deep-link", async (event) => {
          const urls = Array.isArray(event.payload) ? event.payload : [];
          let installationId: number | null = null;
          for (const u of urls) {
            const parsed = parseGithubCallbackUrl(u);
            if (parsed !== null) {
              installationId = parsed;
              break;
            }
          }
          if (installationId === null) return; // ignore unrelated deep-links
          try {
            await ipcSaveInstallation(installationId);
            setFetchState({ phase: "loading" });
            setTick((n) => n + 1);
          } catch {
            // save error surfaced via next refresh
          }
          unlisten();
          deepLinkRegistered.current = false;
          setConnecting(false);
        });
      }
    } catch {
      setConnecting(false);
      deepLinkRegistered.current = false;
    }
  }, [connecting]);

  const remove = useCallback(async (installationId: number) => {
    await ipcRemoveInstallation(installationId);
    setFetchState({ phase: "loading" });
    setTick((n) => n + 1);
  }, []);

  const scan = useCallback(
    async (installationId: number, owner: string, repo: string): Promise<RemoteKey[]> => {
      return ipcScanRepo(installationId, owner, repo);
    },
    [],
  );

  return {
    installations: fetchState.phase === "ok" ? fetchState.data : [],
    loading: fetchState.phase === "loading",
    error: fetchState.phase === "error" ? fetchState.message : null,
    connecting,
    connect,
    refresh,
    remove,
    scan,
  };
}
