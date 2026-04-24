// Mirror of Rust types from railguard module.

export type RuleKind =
  | "cursor_rules"
  | "windsurf_rules"
  | "claude_md"
  | "copilot_instructions";

export type PreviewAction = "create" | "update" | "skip";

export interface RuleFilePreview {
  kind: RuleKind;
  path: string;
  content: string;
  exists: boolean;
  action: PreviewAction;
}

export interface RuleFileApplied {
  kind: RuleKind;
  path: string;
  backup_path: string | null;
}

export type ApplyMode =
  | { tag: RuleKind; kind: "overwrite"; backup: boolean }
  | { tag: RuleKind; kind: "append" }
  | { tag: RuleKind; kind: "skip_existing" };

/** All rules use the same mode — one ApplyMode for the whole batch. */
export type BatchApplyMode =
  | { kind: "overwrite"; backup: boolean }
  | { kind: "append" }
  | { kind: "skip_existing" };

export interface RenderContext {
  project_name: string;
  frameworks: string[];
  issuers: string[];
}

/** Human-readable display name for each RuleKind. */
export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  cursor_rules: ".cursorrules",
  windsurf_rules: ".windsurfrules",
  claude_md: "CLAUDE.md",
  copilot_instructions: ".github/copilot-instructions.md",
};

export const ALL_RULE_KINDS: RuleKind[] = [
  "cursor_rules",
  "windsurf_rules",
  "claude_md",
  "copilot_instructions",
];
