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

/**
 * Mirror of Rust `ApplyMode` — a single mode applied uniformly to all selected
 * rules during one `railguard_apply` call.
 *
 * Rust uses `#[serde(tag = "kind", rename_all = "snake_case")]`, so the wire
 * shape is internally tagged: `{kind: "overwrite", backup: true}`,
 * `{kind: "append"}`, `{kind: "skip_existing"}`.
 */
export type ApplyMode =
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
