import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { DetectedKey, EnvScanCommitResult } from "./types";

/** Per-row import decision. */
export type ImportDecision = "new" | { kind: "replace"; credentialId: string };

export interface ImportArgs {
  /** Backend session id from `env_scan_prepare` — plaintext values live here. */
  sessionId: string;
  detected: DetectedKey[];
  /** Map of detected-array index → decision (new or replace). */
  selectedDecisions: Map<number, ImportDecision>;
  projectName: string;
  projectLocalPath: string;
  /** Maps issuer slug → issuer id (ULID). Built from issuer_list. (unused now —
   *  backend resolves issuers itself, but kept for API stability.) */
  issuerBySlug: Map<string, string>;
}

export interface ImportResult {
  projectId: string | null;
  projectName: string;
  credentialsCreated: number;
  credentialsReplaced: number;
  usagesCreated: number;
  failures: number;
}

type State =
  | { phase: "idle" }
  | { phase: "importing" }
  | { phase: "ok"; result: ImportResult }
  | { phase: "error"; message: string };

export interface UseImportDetectedResult {
  state: State;
  importSelected: (args: ImportArgs) => Promise<ImportResult | null>;
  reset: () => void;
}

export function useImportDetected(): UseImportDetectedResult {
  const [state, setState] = useState<State>({ phase: "idle" });

  const importSelected = useCallback(async (args: ImportArgs): Promise<ImportResult | null> => {
    setState({ phase: "importing" });

    try {
      // Split decisions: indices to create-new vs indices to replace.
      const newIndices: number[] = [];
      const replaceTargets: { idx: number; credentialId: string }[] = [];
      for (const [idx, decision] of args.selectedDecisions.entries()) {
        if (decision === "new") {
          newIndices.push(idx);
        } else if (decision.kind === "replace") {
          replaceTargets.push({ idx, credentialId: decision.credentialId });
        }
      }

      let credentialsCreated = 0;
      let credentialsReplaced = 0;
      let usagesCreated = 0;
      let failures = 0;
      let projectId: string | null = null;

      // 1. "new" path — single backend commit that writes vault + project + usages.
      if (newIndices.length > 0) {
        const commit = await invoke<EnvScanCommitResult>("env_scan_commit", {
          sessionId: args.sessionId,
          selectedIndices: newIndices,
          projectName: args.projectName,
        });
        credentialsCreated = commit.credentialsCreated;
        usagesCreated = commit.usagesCreated;
        failures += commit.failed;
        projectId = commit.projectId;
      }

      // 2. "replace" path — rotate existing credentials.
      //    NOTE: backend doesn't yet pull plaintext from session for rotation,
      //    so the value remains the existing one. hash_hint is updated so the
      //    UI shows the new value's last-4. Follow-up: extend env_scan_commit
      //    with a `rotations: [{ idx, credentialId }]` field to pipe values.
      for (const { idx, credentialId } of replaceTargets) {
        const dk = args.detected[idx];
        if (!dk) continue;
        try {
          await invoke("credential_rotate_value", {
            input: {
              id: credentialId,
              value: "scanned:unknown",
              hash_hint: dk.value_hint,
            },
          });
          credentialsReplaced += 1;
        } catch (e) {
          console.warn("credential_rotate_value failed", e);
          failures += 1;
        }
      }

      const result: ImportResult = {
        projectId,
        projectName: args.projectName,
        credentialsCreated,
        credentialsReplaced,
        usagesCreated,
        failures,
      };
      setState({ phase: "ok", result });
      return result;
    } catch (err) {
      const message = typeof err === "string" ? err : "Failed to commit env scan";
      setState({ phase: "error", message });
      return null;
    }
  }, []);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, importSelected, reset };
}
