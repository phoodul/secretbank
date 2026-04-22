import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CredentialFilter, CredentialSummary } from "./types";

export interface UseInventoryResult {
  items: CredentialSummary[];
  loading: boolean;
  error: string | null;
  filter: CredentialFilter;
  setFilter: (next: Partial<CredentialFilter>) => void;
  search: string;
  setSearch: (q: string) => void;
  refresh: () => void;
}

/** credential_list 호출의 결과 상태 */
type FetchState =
  | { phase: "loading" }
  | { phase: "ok"; data: CredentialSummary[] }
  | { phase: "error"; message: string };

export function useInventory(): UseInventoryResult {
  const [fetchState, setFetchState] = useState<FetchState>({ phase: "loading" });
  const [filter, setFilterState] = useState<CredentialFilter>({});
  const [search, setSearch] = useState("");
  // refresh 트리거 카운터 — filter 변경 없이 재조회할 때 사용
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    invoke<CredentialSummary[]>("credential_list", { filter })
      .then((data) => {
        if (!cancelled) setFetchState({ phase: "ok", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = typeof err === "string" ? err : "Failed to load credentials";
          setFetchState({ phase: "error", message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filter, tick]);

  const refresh = useCallback(() => {
    setFetchState({ phase: "loading" });
    setTick((n) => n + 1);
  }, []);

  const setFilter = useCallback((next: Partial<CredentialFilter>) => {
    setFetchState({ phase: "loading" });
    setFilterState((prev) => {
      const merged = { ...prev, ...next };
      const cleaned: CredentialFilter = {};
      for (const [k, v] of Object.entries(merged)) {
        if (v !== undefined) {
          (cleaned as Record<string, unknown>)[k] = v;
        }
      }
      return cleaned;
    });
  }, []);

  // 이름 검색은 클라이언트 사이드 필터링
  const items = useMemo(() => {
    const raw = fetchState.phase === "ok" ? fetchState.data : [];
    if (!search.trim()) return raw;
    const q = search.toLowerCase();
    return raw.filter((c) => c.name.toLowerCase().includes(q));
  }, [fetchState, search]);

  return {
    items,
    loading: fetchState.phase === "loading",
    error: fetchState.phase === "error" ? fetchState.message : null,
    filter,
    setFilter,
    search,
    setSearch,
    refresh,
  };
}
