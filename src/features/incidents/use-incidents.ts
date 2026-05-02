import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { IncidentFilter, IncidentListEntry } from "./types";

export interface UseIncidentsResult {
  entries: IncidentListEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Manually trigger feed refresh (calls incident_feed_refresh). */
  triggerFeedRefresh: () => Promise<number>;
}

type FetchState =
  | { phase: "loading" }
  | { phase: "ok"; data: IncidentListEntry[] }
  | { phase: "error"; message: string };

/**
 * Fetches incidents via `incident_list` and subscribes to the
 * `incidents:updated` Tauri event for automatic refresh.
 */
export function useIncidents(filter: IncidentFilter): UseIncidentsResult {
  const [fetchState, setFetchState] = useState<FetchState>({ phase: "loading" });
  // tick bumps cause a re-fetch without a filter change (manual refresh / event)
  const [tick, setTick] = useState(0);

  // Fetch on filter (serialised) or tick change.
  // Matches the pattern in use-inventory.ts: state updates only inside async callbacks.
  const filterKey = JSON.stringify(filter);
  useEffect(() => {
    let cancelled = false;

    invoke<IncidentListEntry[]>("incident_list", { filter })
      .then((data) => {
        if (!cancelled) setFetchState({ phase: "ok", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = typeof err === "string" ? err : "Failed to load incidents";
          setFetchState({ phase: "error", message });
        }
      });

    return () => {
      cancelled = true;
    };
    // filterKey serialises the filter object for stable comparison.
    // tick causes a re-fetch on manual refresh / event push.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, tick]);

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

  const triggerFeedRefresh = useCallback(async (): Promise<number> => {
    const count = await invoke<number>("incident_feed_refresh");
    // Refresh list regardless of count so UI is always up to date.
    setTick((n) => n + 1);
    return count;
  }, []);

  return {
    entries: fetchState.phase === "ok" ? fetchState.data : [],
    loading: fetchState.phase === "loading",
    error: fetchState.phase === "error" ? fetchState.message : null,
    refresh,
    triggerFeedRefresh,
  };
}
