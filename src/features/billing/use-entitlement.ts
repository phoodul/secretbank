/**
 * useEntitlement — resolves and refreshes the current subscription tier.
 *
 * Stub phase (pre-M10): reads `settings/pro_until` from the vault via
 * `entitlement_current`.  Refreshes every 5 minutes to simulate the
 * relay KV-cache TTL pattern that will be used in M10.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types (must match Rust Entitlement / EntitlementError)
// ---------------------------------------------------------------------------

export type Tier = "free" | "pro";

export interface Entitlement {
  tier: Tier;
  /** Unix ms timestamp if Pro, null if Free */
  pro_until: number | null;
  /** true if the result came from a local cache */
  from_cache: boolean;
}

export interface UseEntitlementResult {
  entitlement: Entitlement | null;
  loading: boolean;
  error: string | null;
  /** Manually trigger a refresh (e.g. after setDev). */
  refresh: () => void;
  /**
   * Developer helper — set or clear the Pro entitlement stub.
   * @param proUntilMs Unix ms timestamp, or null to reset to Free.
   */
  setDev: (proUntilMs: number | null) => Promise<void>;
}

// Refresh interval: 5 minutes (simulating M10 relay KV-cache TTL)
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Fetch state (single object to avoid multiple setState calls in effect body)
// ---------------------------------------------------------------------------

type FetchState =
  | { phase: "loading" }
  | { phase: "ok"; data: Entitlement }
  | { phase: "error"; message: string };

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEntitlement(): UseEntitlementResult {
  const [fetchState, setFetchState] = useState<FetchState>({ phase: "loading" });

  // tick increments trigger a re-fetch (manual refresh / interval)
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch when tick changes. All setState calls live inside async callbacks
  // (not directly in the effect body) — satisfies react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;

    invoke<Entitlement>("entitlement_current")
      .then((ent) => {
        if (!cancelled) setFetchState({ phase: "ok", data: ent });
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

  // Set up 5-minute auto-refresh interval on mount.
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTick((t) => t + 1);
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const refresh = useCallback(() => {
    setFetchState({ phase: "loading" });
    setTick((t) => t + 1);
  }, []);

  const setDev = useCallback(async (proUntilMs: number | null) => {
    await invoke("entitlement_set_dev", {
      input: { pro_until_unix_ms: proUntilMs },
    });
    setFetchState({ phase: "loading" });
    setTick((t) => t + 1);
  }, []);

  return {
    entitlement: fetchState.phase === "ok" ? fetchState.data : null,
    loading: fetchState.phase === "loading",
    error: fetchState.phase === "error" ? fetchState.message : null,
    refresh,
    setDev,
  };
}
