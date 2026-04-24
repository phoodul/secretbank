/**
 * useKillSwitch — multi-phase hook for the Kill Switch two-step revoke flow (T076).
 *
 * Phase transitions:
 *   idle → requesting → awaiting_confirm → revoking → done
 *                                        ↘ error (at any async step)
 */

import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type KillSwitchPhase =
  | "idle"
  | "requesting"
  | "awaiting_confirm"
  | "revoking"
  | "done"
  | "error";

interface KillSwitchState {
  phase: KillSwitchPhase;
  token: string | null;
  error: string | null;
}

export interface UseKillSwitchResult {
  phase: KillSwitchPhase;
  token: string | null;
  error: string | null;
  requestConfirm: () => Promise<void>;
  revoke: (alsoDeleteValue: boolean) => Promise<void>;
  reset: () => void;
}

const INITIAL_STATE: KillSwitchState = {
  phase: "idle",
  token: null,
  error: null,
};

export function useKillSwitch(credentialId: string | null): UseKillSwitchResult {
  const [state, setState] = useState<KillSwitchState>(INITIAL_STATE);

  const requestConfirm = useCallback(async () => {
    if (!credentialId) return;

    setState({ phase: "requesting", token: null, error: null });
    try {
      const token = await invoke<string>("kill_switch_request_confirm", {
        credId: credentialId,
      });
      setState({ phase: "awaiting_confirm", token, error: null });
    } catch (err) {
      const message =
        err !== null && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : typeof err === "string"
            ? err
            : "Failed to request confirmation";
      setState({ phase: "error", token: null, error: message });
    }
  }, [credentialId]);

  const revoke = useCallback(
    async (alsoDeleteValue: boolean) => {
      if (state.phase !== "awaiting_confirm" || !state.token || !credentialId) return;

      const token = state.token;
      setState({ phase: "revoking", token, error: null });
      try {
        await invoke("kill_switch_revoke", {
          input: { credId: credentialId, token, alsoDeleteValue },
        });
        setState({ phase: "done", token: null, error: null });
      } catch (err) {
        const message =
          err !== null && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : typeof err === "string"
              ? err
              : "Failed to revoke credential";
        setState({ phase: "error", token, error: message });
      }
    },
    [credentialId, state.phase, state.token],
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    phase: state.phase,
    token: state.token,
    error: state.error,
    requestConfirm,
    revoke,
    reset,
  };
}
