import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { DetectedKey } from "./types";

export interface ImportArgs {
  detected: DetectedKey[];
  selectedIndices: Set<number>;
  projectName: string;
  projectLocalPath: string;
  /** Maps issuer slug → issuer id (ULID). Built from issuer_list. */
  issuerBySlug: Map<string, string>;
}

export interface ImportResult {
  projectId: string;
  projectName: string;
  credentialsCreated: number;
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

  const importSelected = useCallback(
    async (args: ImportArgs): Promise<ImportResult | null> => {
      setState({ phase: "importing" });

      try {
        const projectId = await invoke<string>("project_create", {
          input: {
            name: args.projectName,
            repo_url: null,
            framework: null,
            runtime: null,
            local_path: args.projectLocalPath,
          },
        });

        let credentialsCreated = 0;
        let usagesCreated = 0;
        let failures = 0;

        for (const idx of args.selectedIndices) {
          const dk = args.detected[idx];
          if (!dk) continue;

          const issuerId = dk.issuer_slug ? args.issuerBySlug.get(dk.issuer_slug) : undefined;
          if (!issuerId) {
            // Entropy-only or unknown issuer: cannot register without an issuer FK.
            failures += 1;
            continue;
          }

          const credName = dk.env_var_name ?? `${dk.issuer_slug ?? "key"}-${dk.line}`;

          try {
            const credentialId = await invoke<string>("credential_create", {
              args: {
                issuer_id: issuerId,
                name: credName,
                env: "prod",
                scope: null,
                expires_at: null,
                hash_hint: dk.value_hint,
                // Scanned values are not captured — store a placeholder. The
                // real rotation flow will replace this when the user verifies.
                value: "scanned:unknown",
              },
            });
            credentialsCreated += 1;

            try {
              await invoke("usage_create", {
                input: {
                  credential_id: credentialId,
                  project_id: projectId,
                  deployment_id: null,
                  where_kind: "env_var",
                  where_value: dk.env_var_name ?? dk.file_path,
                },
              });
              usagesCreated += 1;
            } catch (e) {
              console.warn("usage_create failed", e);
              failures += 1;
            }
          } catch (e) {
            console.warn("credential_create failed", e);
            failures += 1;
          }
        }

        const result: ImportResult = {
          projectId,
          projectName: args.projectName,
          credentialsCreated,
          usagesCreated,
          failures,
        };
        setState({ phase: "ok", result });
        return result;
      } catch (err) {
        const message = typeof err === "string" ? err : "Failed to create project";
        setState({ phase: "error", message });
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, importSelected, reset };
}
