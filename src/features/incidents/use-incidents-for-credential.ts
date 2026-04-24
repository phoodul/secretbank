import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { IncidentListEntry } from "./types";

export interface UseIncidentsForCredentialResult {
  entries: IncidentListEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

type FetchState =
  | { phase: "loading" }
  | { phase: "ok"; data: IncidentListEntry[] }
  | { phase: "error"; message: string };

/**
 * Fetches incidents for a specific credential via `incident_matches_for_credential`
 * and subscribes to `incidents:updated` for automatic refresh.
 *
 * If `credentialId` is null, returns empty state without invoking.
 */
export function useIncidentsForCredential(
  credentialId: string | null,
): UseIncidentsForCredentialResult {
  const [fetchState, setFetchState] = useState<FetchState>({ phase: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!credentialId) {
      // Use a microtask to avoid synchronous setState inside effect
      Promise.resolve().then(() => {
        if (!cancelled) setFetchState({ phase: "ok", data: [] });
      });
      return () => {
        cancelled = true;
      };
    }

    invoke<IncidentListEntry[]>("incident_matches_for_credential", {
      credentialId,
    })
      .then((data) => {
        if (!cancelled) setFetchState({ phase: "ok", data: data ?? [] });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            typeof err === "string" ? err : "Failed to load incidents for credential";
          setFetchState({ phase: "error", message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [credentialId, tick]);

  // Subscribe to `incidents:updated` Tauri event.
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void listen("incidents:updated", () => {
      setTick((n) => n + 1);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const refresh = useCallback(() => {
    setFetchState({ phase: "loading" });
    setTick((n) => n + 1);
  }, []);

  return {
    entries: fetchState.phase === "ok" ? fetchState.data : [],
    loading: fetchState.phase === "loading",
    error: fetchState.phase === "error" ? fetchState.message : null,
    refresh,
  };
}
