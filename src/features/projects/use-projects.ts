import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { Project } from "./types";

type FetchState =
  | { phase: "loading" }
  | { phase: "ok"; data: Project[] }
  | { phase: "error"; message: string };

export interface UseProjectsResult {
  items: Project[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (q: string) => void;
  refresh: () => void;
}

export function useProjects(): UseProjectsResult {
  const [fetchState, setFetchState] = useState<FetchState>({ phase: "loading" });
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    invoke<Project[]>("project_list")
      .then((data) => {
        if (!cancelled) setFetchState({ phase: "ok", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = typeof err === "string" ? err : "Failed to load projects";
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

  const items = useMemo(() => {
    const raw = fetchState.phase === "ok" ? fetchState.data : [];
    if (!search.trim()) return raw;
    const q = search.toLowerCase();
    return raw.filter((p) => p.name.toLowerCase().includes(q));
  }, [fetchState, search]);

  return {
    items,
    loading: fetchState.phase === "loading",
    error: fetchState.phase === "error" ? fetchState.message : null,
    search,
    setSearch,
    refresh,
  };
}
