/**
 * useAuthSession — 현재 릴레이 세션 상태를 invoke 로 조회.
 *
 * 로컬 vault unlock 과는 별개. M9 Sync 가 활성화될 때 호출되며, 호출 시점에
 * `vault_unlock` 직후 `hydrate_session_from_vault` 로 메모리에 세션이 이미 적재된
 * 상태이므로 네트워크 호출 없이 메모리 캐시만 읽는다.
 */

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

export interface AuthSession {
  user_id: string;
  /** UNIX seconds — when the access token expires. */
  expires_at: number;
}

type FetchState =
  | { phase: "loading" }
  | { phase: "ok"; data: AuthSession | null }
  | { phase: "error"; message: string };

export interface UseAuthSessionResult {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  signOut: () => Promise<void>;
}

export function useAuthSession(): UseAuthSessionResult {
  const [fetchState, setFetchState] = useState<FetchState>({ phase: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    invoke<AuthSession | null>("auth_status")
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

  const signOut = useCallback(async () => {
    await invoke("auth_signout");
    setFetchState({ phase: "ok", data: null });
  }, []);

  return {
    session: fetchState.phase === "ok" ? fetchState.data : null,
    loading: fetchState.phase === "loading",
    error: fetchState.phase === "error" ? fetchState.message : null,
    refresh,
    signOut,
  };
}
