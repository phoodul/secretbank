import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ApplyMode, RenderContext, RuleKind } from "./types";
import { ALL_RULE_KINDS, RULE_KIND_LABELS } from "./types";
import { useRailguard } from "./use-railguard";
import { RuleFilesPreview } from "./RuleFilesPreview";

// ---------------------------------------------------------------------------
// Local-storage key for last-used project path
// ---------------------------------------------------------------------------

const LS_KEY = "Secretbank:railguard:lastPath";

function loadLastPath(): string {
  try {
    return localStorage.getItem(LS_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveLastPath(p: string) {
  try {
    localStorage.setItem(LS_KEY, p);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Apply mode options
// ---------------------------------------------------------------------------

type ApplyModeKey = "overwrite_backup" | "overwrite_no_backup" | "append" | "skip_existing";

function applyModeKeyToMode(key: ApplyModeKey): ApplyMode {
  switch (key) {
    case "overwrite_backup":
      return { kind: "overwrite", backup: true };
    case "overwrite_no_backup":
      return { kind: "overwrite", backup: false };
    case "append":
      return { kind: "append" };
    case "skip_existing":
      return { kind: "skip_existing" };
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function RailguardPage() {
  const { t } = useTranslation("common");
  const [searchParams] = useSearchParams();

  // Project path — pre-fill from query param or last localStorage value.
  const [projectPath, setProjectPath] = useState<string>(
    () => searchParams.get("projectPath") ?? loadLastPath(),
  );

  // Selected rule kinds (all checked by default).
  const [selectedRules, setSelectedRules] = useState<Set<RuleKind>>(() => new Set(ALL_RULE_KINDS));

  // Advanced accordion.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [frameworksRaw, setFrameworksRaw] = useState("");
  const [issuersRaw, setIssuersRaw] = useState("");

  // Apply mode.
  const [applyModeKey, setApplyModeKey] = useState<ApplyModeKey>("overwrite_backup");

  const { state, preview, apply } = useRailguard();

  function buildContext(): RenderContext {
    const frameworks = frameworksRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const issuers = issuersRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const parts = projectPath.replace(/\\/g, "/").split("/").filter(Boolean);
    const project_name = parts[parts.length - 1] ?? "project";
    return { project_name, frameworks, issuers };
  }

  async function handlePreview() {
    if (!projectPath.trim()) {
      toast.error(t("railguard.error.projectPathRequired"));
      return;
    }
    saveLastPath(projectPath);
    const rules = [...selectedRules];
    try {
      await preview(projectPath.trim(), rules, buildContext());
    } catch {
      // error state shown via state.phase === "error"
    }
  }

  async function handleApply() {
    if (!projectPath.trim()) return;
    const rules = [...selectedRules];
    const mode = applyModeKeyToMode(applyModeKey);
    try {
      const applied = await apply(projectPath.trim(), rules, buildContext(), mode);
      const backupPaths = applied
        .filter((a) => a.backup_path !== null)
        .map((a) => a.backup_path as string);
      if (applied.length === 0) {
        toast.info(t("railguard.applied.empty"));
      } else {
        toast.success(t("railguard.applied.title", { count: applied.length }));
        if (backupPaths.length > 0) {
          backupPaths.forEach((p) => toast.info(t("railguard.applied.backupCreated", { path: p })));
        }
      }
    } catch {
      // error state shown via state.phase === "error"
    }
  }

  function toggleRule(kind: RuleKind) {
    setSelectedRules((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }

  const isPreviewing = state.phase === "previewing";
  const isApplying = state.phase === "applying";
  const previews =
    state.phase === "previewed" || state.phase === "applying" || state.phase === "applied"
      ? state.previews
      : state.phase === "error" && state.previews
        ? state.previews
        : null;
  const applied = state.phase === "applied" ? state.applied : null;
  const errorMsg = state.phase === "error" ? state.message : null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-6 text-primary shrink-0" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("railguard.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("railguard.subtitle")}</p>
        </div>
      </div>

      {/* Project path */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="railguard-path">{t("railguard.projectPath")}</Label>
        <div className="flex gap-2">
          <Input
            id="railguard-path"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            placeholder={t("railguard.projectPathPlaceholder")}
            className="flex-1 font-mono text-sm"
            data-testid="railguard-path-input"
          />
        </div>
      </div>

      {/* Rule kind checkboxes */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t("railguard.rules.label")}</p>
        <div className="grid grid-cols-2 gap-2">
          {ALL_RULE_KINDS.map((kind) => (
            <label
              key={kind}
              className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <input
                type="checkbox"
                id={`rule-${kind}`}
                checked={selectedRules.has(kind)}
                onChange={() => toggleRule(kind)}
                data-testid={`rule-checkbox-${kind}`}
                className="size-4 cursor-pointer accent-primary"
                aria-checked={selectedRules.has(kind)}
              />
              <span className="font-mono text-xs">{RULE_KIND_LABELS[kind]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Advanced accordion */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-fit"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          <span>{showAdvanced ? "▾" : "▸"}</span>
          {t("railguard.advanced")}
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="railguard-frameworks">{t("railguard.frameworks")}</Label>
              <Input
                id="railguard-frameworks"
                value={frameworksRaw}
                onChange={(e) => setFrameworksRaw(e.target.value)}
                placeholder={t("railguard.frameworksHelp")}
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="railguard-issuers">{t("railguard.issuers")}</Label>
              <Input
                id="railguard-issuers"
                value={issuersRaw}
                onChange={(e) => setIssuersRaw(e.target.value)}
                placeholder={t("railguard.issuersHelp")}
                className="text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {errorMsg !== null && (
        <div
          className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
          data-testid="railguard-error"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Preview results */}
      {previews !== null && previews.length > 0 && <RuleFilesPreview previews={previews} />}

      {/* Apply mode selector + action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => void handlePreview()}
          disabled={isPreviewing || isApplying}
          data-testid="railguard-preview-btn"
        >
          {isPreviewing ? t("railguard.previewing") : t("railguard.preview")}
        </Button>

        {(state.phase === "previewed" ||
          state.phase === "applied" ||
          (state.phase === "error" && previews)) && (
          <>
            <select
              value={applyModeKey}
              onChange={(e) => setApplyModeKey(e.target.value as ApplyModeKey)}
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="railguard-mode-select"
            >
              <option value="overwrite_backup">{t("railguard.mode.overwriteWithBackup")}</option>
              <option value="overwrite_no_backup">{t("railguard.mode.overwriteNoBackup")}</option>
              <option value="append">{t("railguard.mode.append")}</option>
              <option value="skip_existing">{t("railguard.mode.skipExisting")}</option>
            </select>

            <Button
              variant="default"
              onClick={() => void handleApply()}
              disabled={isApplying}
              data-testid="railguard-apply-btn"
            >
              {isApplying ? t("railguard.applying") : t("railguard.apply")}
            </Button>
          </>
        )}
      </div>

      {/* Applied results */}
      {applied !== null && applied.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="railguard-applied-list">
          <p className="text-sm font-medium text-green-600">
            {t("railguard.applied.title", { count: applied.length })}
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {applied.map((a) => (
              <li key={a.kind} className="font-mono text-xs text-muted-foreground">
                {a.path}
                {a.backup_path && <span className="ml-2 text-amber-600">→ {a.backup_path}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
