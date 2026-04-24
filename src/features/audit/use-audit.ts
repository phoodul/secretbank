import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AuditEntry, AuditListInput } from "./types";

export interface UseAuditResult {
  entries: AuditEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

type FetchState =
  | { phase: "loading" }
  | { phase: "ok"; data: AuditEntry[] }
  | { phase: "error"; message: string };

const DEFAULT_LIMIT = 100;

/**
 * Fetches audit entries via `audit_list`.
 * Re-fetches when the serialised filter string or tick changes.
 * Matches the pattern used in use-incidents.ts.
 */
export function useAudit(filter: AuditListInput): UseAuditResult {
  const [fetchState, setFetchState] = useState<FetchState>({ phase: "loading" });
  const [tick, setTick] = useState(0);

  const effectiveFilter: AuditListInput = { limit: DEFAULT_LIMIT, ...filter };

  // Serialise filter for stable dep comparison — same pattern as use-incidents.
  const filterKey = JSON.stringify(effectiveFilter);

  useEffect(() => {
    let cancelled = false;

    invoke<AuditEntry[]>("audit_list", { input: effectiveFilter })
      .then((data) => {
        if (!cancelled) setFetchState({ phase: "ok", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            typeof err === "string" ? err : "Failed to load audit log";
          setFetchState({ phase: "error", message });
        }
      });

    return () => {
      cancelled = true;
    };
    // filterKey serialises the filter object for stable comparison.
    // tick causes a re-fetch on manual refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, tick]);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  return {
    entries: fetchState.phase === "ok" ? fetchState.data : [],
    loading: fetchState.phase === "loading",
    error: fetchState.phase === "error" ? fetchState.message : null,
    refresh,
  };
}
