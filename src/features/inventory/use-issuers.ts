import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Issuer {
  id: string; // ULID
  slug: string;
  display_name: string;
  docs_url: string | null;
  issue_url: string | null;
  status_url: string | null;
  security_feed_url: string | null;
  connector_id: string | null;
  icon_key: string | null;
  /** Default label for primary value slot (e.g. "Public Key"). null = "API Key" fallback. */
  default_primary_label: string | null;
  /** Default label for secondary value slot. null = single-secret issuer. */
  default_secondary_label: string | null;
  created_at: number; // ms
  updated_at: number; // ms
}

type FetchState =
  | { phase: "loading" }
  | { phase: "ok"; data: Issuer[] }
  | { phase: "error"; message: string };

export interface UseIssuersResult {
  issuers: Issuer[];
  loading: boolean;
  error: string | null;
}

export function useIssuers(): UseIssuersResult {
  const [fetchState, setFetchState] = useState<FetchState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    invoke<Issuer[]>("issuer_list")
      .then((data) => {
        if (!cancelled) setFetchState({ phase: "ok", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = typeof err === "string" ? err : "Failed to load issuers";
          setFetchState({ phase: "error", message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    issuers: fetchState.phase === "ok" ? fetchState.data : [],
    loading: fetchState.phase === "loading",
    error: fetchState.phase === "error" ? fetchState.message : null,
  };
}
