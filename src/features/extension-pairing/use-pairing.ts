// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// T-24-E-B6 — Frontend hook for extension pairing approval flow.

import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types (must mirror Rust PairingDecision / ExtPairingError)
// ---------------------------------------------------------------------------

export interface PairingDecision {
  approved: boolean;
  desktop_pub: string | null;
  device_id: string;
}

export interface ExtPairingErrorPayload {
  code: "vault_locked" | "invalid_pub_key" | "vault_storage" | "internal";
  message?: string;
}

export type PairingPhase = "idle" | "approving" | "done" | "error";

export interface PairingState {
  phase: PairingPhase;
  decision: PairingDecision | null;
  error: ExtPairingErrorPayload | null;
}

export interface UsePairingResult extends PairingState {
  /** Send decision (approve=true / reject=false) to the Tauri backend. */
  decide: (extensionPub: string, extensionId: string, approved: boolean) => Promise<void>;
  /** Reset to idle state (call after dialog closes). */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const INITIAL: PairingState = { phase: "idle", decision: null, error: null };

function normalizeError(err: unknown): ExtPairingErrorPayload {
  if (err !== null && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e["code"] === "string") {
      return e as unknown as ExtPairingErrorPayload;
    }
    if (typeof e["message"] === "string") {
      return { code: "internal", message: String(e["message"]) };
    }
  }
  if (typeof err === "string") {
    return { code: "internal", message: err };
  }
  return { code: "internal" };
}

export function usePairing(): UsePairingResult {
  const [state, setState] = useState<PairingState>(INITIAL);

  const decide = useCallback(
    async (extensionPub: string, extensionId: string, approved: boolean) => {
      setState({ phase: "approving", decision: null, error: null });
      try {
        const decision = await invoke<PairingDecision>("ext_pairing_request_received", {
          extensionPub,
          extensionId,
          approved,
        });
        setState({ phase: "done", decision, error: null });
      } catch (err) {
        setState({ phase: "error", decision: null, error: normalizeError(err) });
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState(INITIAL);
  }, []);

  return { ...state, decide, reset };
}
