/**
 * useKillSwitch — multi-phase hook for the Kill Switch two-step revoke flow (T076).
 * useBulkKillSwitch — bulk issuer revoke flow with progress tracking (T078).
 *
 * Phase transitions:
 *   idle → requesting → awaiting_confirm → revoking → done
 *                                        ↘ error (at any async step)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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

// ---------------------------------------------------------------------------
// Bulk issuer kill switch (T078)
// ---------------------------------------------------------------------------

export interface KillSwitchProgress {
  revoked: number;
  total: number;
}

export interface FailedRevoke {
  credential_id: string;
  message: string;
}

export interface KillSwitchBulkResult {
  revoked: number;
  failed: FailedRevoke[];
}

interface BulkKillSwitchState {
  phase: KillSwitchPhase;
  token: string | null;
  error: string | null;
  progress: KillSwitchProgress | null;
  result: KillSwitchBulkResult | null;
}

export interface UseBulkKillSwitchResult {
  phase: KillSwitchPhase;
  token: string | null;
  error: string | null;
  progress: KillSwitchProgress | null;
  result: KillSwitchBulkResult | null;
  requestConfirm: () => Promise<void>;
  revoke: (alsoDeleteValues: boolean, expectedCount?: number) => Promise<void>;
  reset: () => void;
}

const BULK_INITIAL: BulkKillSwitchState = {
  phase: "idle",
  token: null,
  error: null,
  progress: null,
  result: null,
};

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  if (typeof err === "string") return err;
  return fallback;
}

export function useBulkKillSwitch(issuerId: string | null): UseBulkKillSwitchResult {
  const [state, setState] = useState<BulkKillSwitchState>(BULK_INITIAL);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Subscribe to progress events when revoking starts.
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  const requestConfirm = useCallback(async () => {
    if (!issuerId) return;

    setState({ phase: "requesting", token: null, error: null, progress: null, result: null });
    try {
      const token = await invoke<string>("kill_switch_request_confirm_issuer", {
        issuerId,
      });
      setState({ phase: "awaiting_confirm", token, error: null, progress: null, result: null });
    } catch (err) {
      setState({
        phase: "error",
        token: null,
        error: extractErrorMessage(err, "Failed to request issuer confirmation"),
        progress: null,
        result: null,
      });
    }
  }, [issuerId]);

  const revoke = useCallback(
    async (alsoDeleteValues: boolean, expectedCount?: number) => {
      if (state.phase !== "awaiting_confirm" || !state.token || !issuerId) return;

      const token = state.token;
      setState({ phase: "revoking", token, error: null, progress: null, result: null });

      // Subscribe to progress events.
      const unlisten = await listen<KillSwitchProgress>("kill-switch:progress", (event) => {
        setState((prev) => ({ ...prev, progress: event.payload }));
      });
      unlistenRef.current = unlisten;

      try {
        const result = await invoke<KillSwitchBulkResult>("kill_switch_revoke_issuer", {
          input: {
            issuerId,
            token,
            alsoDeleteValues,
            expectedCount: expectedCount ?? null,
          },
        });
        setState({ phase: "done", token: null, error: null, progress: null, result });
      } catch (err) {
        setState({
          phase: "error",
          token,
          error: extractErrorMessage(err, "Failed to revoke issuer credentials"),
          progress: null,
          result: null,
        });
      } finally {
        unlisten();
        unlistenRef.current = null;
      }
    },
    [issuerId, state.phase, state.token],
  );

  const reset = useCallback(() => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    setState(BULK_INITIAL);
  }, []);

  return {
    phase: state.phase,
    token: state.token,
    error: state.error,
    progress: state.progress,
    result: state.result,
    requestConfirm,
    revoke,
    reset,
  };
}

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
