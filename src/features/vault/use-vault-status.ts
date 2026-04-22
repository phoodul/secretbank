import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Rust `#[serde(tag = "state", rename_all = "snake_case")]` 직렬화와 일치 */
export type VaultStatus = { state: "uninitialized" } | { state: "locked" } | { state: "unlocked" };

/** 훅이 반환하는 상태 — "loading"은 최초 invoke 완료 전 */
export type VaultStatusOrLoading = VaultStatus | "loading";

export interface UseVaultStatusResult {
  /** 현재 볼트 상태. 최초 로드 전에는 "loading" */
  status: VaultStatusOrLoading;
  /** vault_status를 다시 호출하여 상태를 갱신한다. LockScreen/CreateVaultDialog 성공 후 사용. */
  refresh: () => void;
}

/**
 * vault_status Tauri 커맨드를 호출하여 볼트 상태를 관리하는 훅.
 * 마운트 시 한 번 호출하고, refresh()를 통해 재조회를 트리거한다.
 * "vault-lock" CustomEvent를 수신하면 자동으로 refresh()를 호출한다.
 */
export function useVaultStatus(): UseVaultStatusResult {
  const [status, setStatus] = useState<VaultStatusOrLoading>("loading");

  const refresh = useCallback(() => {
    setStatus("loading");
    invoke<VaultStatus>("vault_status")
      .then(setStatus)
      .catch(() => {
        // 상태 조회 실패 시 안전하게 locked로 폴백
        setStatus({ state: "locked" });
      });
  }, []);

  useEffect(() => {
    void invoke<VaultStatus>("vault_status")
      .then(setStatus)
      .catch(() => {
        setStatus({ state: "locked" });
      });
  }, []);

  // Command Palette의 "Lock vault" 액션이 dispatch하는 커스텀 이벤트 수신
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("vault-lock", handler);
    return () => window.removeEventListener("vault-lock", handler);
  }, [refresh]);

  return { status, refresh };
}
