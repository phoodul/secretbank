import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ApplyMode, RenderContext, RuleFileApplied, RuleFilePreview, RuleKind } from "./types";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface IdleState {
  phase: "idle";
}
interface PreviewingState {
  phase: "previewing";
}
interface PreviewedState {
  phase: "previewed";
  previews: RuleFilePreview[];
}
interface ApplyingState {
  phase: "applying";
  previews: RuleFilePreview[];
}
interface AppliedState {
  phase: "applied";
  previews: RuleFilePreview[];
  applied: RuleFileApplied[];
}
interface ErrorState {
  phase: "error";
  message: string;
  /** Keep previews in view if error happened during apply. */
  previews?: RuleFilePreview[];
}

export type RailguardState =
  | IdleState
  | PreviewingState
  | PreviewedState
  | ApplyingState
  | AppliedState
  | ErrorState;

export interface UseRailguardResult {
  state: RailguardState;
  preview: (
    projectPath: string,
    rules: RuleKind[],
    context: RenderContext,
  ) => Promise<RuleFilePreview[]>;
  apply: (
    projectPath: string,
    rules: RuleKind[],
    context: RenderContext,
    mode: ApplyMode,
  ) => Promise<RuleFileApplied[]>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRailguard(): UseRailguardResult {
  const [state, setState] = useState<RailguardState>({ phase: "idle" });

  const preview = useCallback(
    async (
      projectPath: string,
      rules: RuleKind[],
      context: RenderContext,
    ): Promise<RuleFilePreview[]> => {
      setState({ phase: "previewing" });
      try {
        const previews = await invoke<RuleFilePreview[]>("railguard_preview", {
          projectPath,
          rules,
          context,
        });
        setState({ phase: "previewed", previews });
        return previews;
      } catch (err) {
        const message = typeof err === "string" ? err : "Preview failed";
        setState({ phase: "error", message });
        throw err;
      }
    },
    [],
  );

  const apply = useCallback(
    async (
      projectPath: string,
      rules: RuleKind[],
      context: RenderContext,
      mode: ApplyMode,
    ): Promise<RuleFileApplied[]> => {
      setState((prev) => ({
        phase: "applying",
        previews: prev.phase === "previewed" ? prev.previews : [],
      }));

      try {
        const applied = await invoke<RuleFileApplied[]>("railguard_apply", {
          projectPath,
          rules,
          context,
          mode,
        });
        setState((prev) => ({
          phase: "applied",
          previews: prev.phase === "applying" ? prev.previews : [],
          applied,
        }));
        return applied;
      } catch (err) {
        const message = typeof err === "string" ? err : "Apply failed";
        setState((prev) => ({
          phase: "error",
          message,
          previews: prev.phase === "applying" ? prev.previews : undefined,
        }));
        throw err;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  return { state, preview, apply, reset };
}
