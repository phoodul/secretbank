import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChainVerifyReport } from "./types";

type VerifyPhase = "idle" | "verifying" | "done" | "error";

export interface VerifyState {
  phase: VerifyPhase;
  report?: ChainVerifyReport;
  error?: string;
}

export interface UseVerifyChainResult {
  state: VerifyState;
  verify: () => Promise<void>;
}

export function useVerifyChain(): UseVerifyChainResult {
  const [state, setState] = useState<VerifyState>({ phase: "idle" });

  const verify = useCallback(async () => {
    setState({ phase: "verifying" });
    try {
      const report = await invoke<ChainVerifyReport>("audit_verify_chain");
      setState({ phase: "done", report });
    } catch (err: unknown) {
      const error = typeof err === "string" ? err : "Failed to verify chain";
      setState({ phase: "error", error });
    }
  }, []);

  return { state, verify };
}
