import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, Wand2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIssuers } from "@/features/inventory/use-issuers";
import { findPreset } from "@/features/inventory/issuer-presets";
import type { CredentialSummary, Usage } from "@/features/inventory/types";
import type { Project } from "@/features/projects/types";
import { ALL_RULE_KINDS } from "@/features/railguard/types";
import type { RuleFilePreview } from "@/features/railguard/types";

import type { DetectedKey } from "./types";
import type { ImportDecision } from "./use-import-detected";
import { useImportDetected } from "./use-import-detected";

export interface DetectedKeysReviewProps {
  detected: DetectedKey[];
  /** Backend session id returned by `env_scan_prepare` — required for commit. */
  sessionId: string;
  /** Absolute path scanned — used as Project local_path + folder name. */
  scannedPath: string;
  /** Existing credentials, for duplicate detection via hash_hint. */
  existingCredentials: CredentialSummary[];
  onImportComplete?: (summary: {
    projectId: string | null;
    projectName: string;
    count: number;
  }) => void;
}

function folderNameFromPath(p: string): string {
  if (!p) return "imported-project";
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "imported-project";
}

function confidenceTone(c: number): "default" | "warning" | "info" {
  if (c >= 0.9) return "default";
  if (c >= 0.6) return "info";
  return "warning";
}

/** Per-detected-key classification for the rotation scan. */
type RowStatus =
  | "new"
  | "already_tracked"
  | { kind: "rotated"; credentialId: string; credentialName: string };

export function DetectedKeysReview({
  detected,
  sessionId,
  scannedPath,
  existingCredentials,
  onImportComplete,
}: DetectedKeysReviewProps) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { issuers } = useIssuers();
  const { state, importSelected } = useImportDetected();

  // Build slug → issuer_id map.
  const issuerBySlug = useMemo(() => {
    const m = new Map<string, string>();
    issuers.forEach((i) => m.set(i.slug, i.id));
    return m;
  }, [issuers]);

  // Set of hash_hints already tracked.
  const trackedHints = useMemo(() => {
    const s = new Set<string>();
    existingCredentials.forEach((c) => {
      if (c.hash_hint) s.add(c.hash_hint);
    });
    return s;
  }, [existingCredentials]);

  // ---------------------------------------------------------------------------
  // Rotation detection: fetch project + usages for scannedPath
  // ---------------------------------------------------------------------------
  // Maps env_var_name → { credentialId, credentialName, hashHint } for the
  // matching project.
  const [existingByEnvVar, setExistingByEnvVar] = useState<
    Map<string, { credentialId: string; credentialName: string; hashHint: string | null }>
  >(new Map());

  useEffect(() => {
    if (!scannedPath) return;
    let cancelled = false;

    async function fetchProjectUsages() {
      try {
        const projects = await invoke<Project[]>("project_list");
        const matchingProject = projects.find((p) => p.local_path === scannedPath);
        if (!matchingProject) return;

        const usages = await invoke<Usage[]>("usage_list_for_project", {
          projectId: matchingProject.id,
        });

        // Build a lookup: env_var_name → { credentialId, credentialName, hashHint }
        // We need hash_hint from existingCredentials (already available as prop).
        const byEnvVar = new Map<
          string,
          { credentialId: string; credentialName: string; hashHint: string | null }
        >();
        for (const usage of usages) {
          if (usage.where_kind !== "env_var") continue;
          const envVarName = usage.where_value;
          const cred = existingCredentials.find((c) => c.id === usage.credential_id);
          if (!cred) continue;
          byEnvVar.set(envVarName, {
            credentialId: cred.id,
            credentialName: cred.name,
            hashHint: cred.hash_hint,
          });
        }
        if (!cancelled) {
          setExistingByEnvVar(byEnvVar);
        }
      } catch {
        // Graceful skip: vault may be locked or project not found — keep defaults.
      }
    }

    void fetchProjectUsages();
    return () => {
      cancelled = true;
    };
  }, [scannedPath, existingCredentials]);

  // ---------------------------------------------------------------------------
  // Per-row status classification
  // ---------------------------------------------------------------------------
  const rowStatuses = useMemo((): RowStatus[] => {
    return detected.map((dk) => {
      if (trackedHints.has(dk.value_hint)) {
        return "already_tracked";
      }
      if (dk.env_var_name) {
        const existing = existingByEnvVar.get(dk.env_var_name);
        if (existing && existing.hashHint !== dk.value_hint) {
          return {
            kind: "rotated",
            credentialId: existing.credentialId,
            credentialName: existing.credentialName,
          };
        }
      }
      return "new";
    });
  }, [detected, trackedHints, existingByEnvVar]);

  // User-driven overrides: tracks which rows are deselected (false) or have
  // their mode explicitly overridden ("new" for a rotated row).
  // Shape: Map<idx, false | "new">
  //   - false  → user deselected the row
  //   - "new"  → user chose "Add as new" for a rotated row
  //   - absent → default behaviour (selected, mode = status-driven)
  const [userOverrides, setUserOverrides] = useState<Map<number, false | "new">>(new Map());

  // Effective decisions derived from rowStatuses + userOverrides.
  // issuer-less entries are now allowed — backend uses a fallback issuer.
  const decisions = useMemo((): Map<number, ImportDecision> => {
    const m = new Map<number, ImportDecision>();
    detected.forEach((_dk, idx) => {
      const status = rowStatuses[idx];
      if (status === "already_tracked") return;
      const override = userOverrides.get(idx);
      if (override === false) return; // user deselected
      if (status === "new") {
        m.set(idx, "new");
      } else {
        // rotated — default replace unless user explicitly chose "new"
        if (override === "new") {
          m.set(idx, "new");
        } else {
          m.set(idx, { kind: "replace", credentialId: status.credentialId });
        }
      }
    });
    return m;
  }, [detected, rowStatuses, userOverrides]);

  function toggleSelected(idx: number) {
    setUserOverrides((prev) => {
      const next = new Map(prev);
      if (decisions.has(idx)) {
        // Currently selected → deselect.
        next.set(idx, false);
      } else {
        // Currently deselected → re-select (remove override).
        next.delete(idx);
      }
      return next;
    });
  }

  function setRowMode(idx: number, mode: "replace" | "new") {
    setUserOverrides((prev) => {
      const next = new Map(prev);
      if (mode === "new") {
        next.set(idx, "new");
      } else {
        // Replace: remove the "new" override so status-driven default takes over.
        next.delete(idx);
      }
      return next;
    });
  }

  const projectName = folderNameFromPath(scannedPath);
  const selectedCount = decisions.size;
  const replaceCount = [...decisions.values()].filter((d) => d !== "new").length;
  const newCount = selectedCount - replaceCount;
  const isImporting = state.phase === "importing";

  // T068: probe the project folder for existing RAILGUARD rule files.
  const [railguardMissing, setRailguardMissing] = useState<boolean>(true);
  useEffect(() => {
    if (!scannedPath) return;
    let cancelled = false;
    invoke<RuleFilePreview[]>("railguard_preview", {
      projectPath: scannedPath,
      rules: ALL_RULE_KINDS,
      context: { project_name: projectName, frameworks: [], issuers: [] },
    })
      .then((previews) => {
        if (cancelled) return;
        setRailguardMissing(previews.some((p) => !p.exists));
      })
      .catch(() => {
        // Probe failed — keep CTA visible.
      });
    return () => {
      cancelled = true;
    };
  }, [scannedPath, projectName]);

  async function handleImport() {
    if (selectedCount === 0) return;
    const result = await importSelected({
      sessionId,
      detected,
      selectedDecisions: decisions,
      projectName,
      projectLocalPath: scannedPath,
      issuerBySlug,
    });
    if (result) {
      if (result.credentialsReplaced > 0 && result.credentialsCreated === 0) {
        toast.success(t("onboarding.toast.replacedSummary", { count: result.credentialsReplaced }));
      } else if (result.credentialsReplaced > 0) {
        toast.success(
          t("onboarding.importMixed", {
            total: result.credentialsCreated + result.credentialsReplaced,
            replace: result.credentialsReplaced,
            new: result.credentialsCreated,
          }),
        );
      } else {
        toast.success(
          t("onboarding.importSuccess", {
            count: result.credentialsCreated,
            project: result.projectName,
          }),
        );
      }
      onImportComplete?.({
        projectId: result.projectId,
        projectName: result.projectName,
        count: result.credentialsCreated + result.credentialsReplaced,
      });
    } else if (state.phase === "error") {
      toast.error(t("onboarding.importFailed"));
    }
  }

  // Import button label.
  function importButtonLabel() {
    if (isImporting) return t("onboarding.importing");
    if (replaceCount > 0 && newCount > 0) {
      return t("onboarding.importMixed", {
        total: selectedCount,
        replace: replaceCount,
        new: newCount,
      });
    }
    return t("onboarding.importCount", { count: selectedCount });
  }

  if (detected.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-medium">{t("onboarding.noDetectedKeys")}</p>
        <p className="max-w-md text-sm text-muted-foreground">{t("onboarding.noDetectedHint")}</p>
        <div className="mt-2 flex gap-2">
          <Button variant="outline" onClick={() => navigate("/")}>
            {t("onboarding.noDetectedBackHome")}
          </Button>
          <Button variant="secondary" onClick={() => navigate("/welcome")}>
            {t("onboarding.noDetectedScanAnother")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {t("onboarding.reviewTitle", { count: detected.length })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("onboarding.reviewSubtitle", { project: projectName })}
          </p>
        </div>
        <Button onClick={handleImport} disabled={selectedCount === 0 || isImporting}>
          {importButtonLabel()}
        </Button>
      </header>

      <div
        role="table"
        aria-label={t("onboarding.reviewTableLabel")}
        className="overflow-hidden rounded-lg border bg-card"
      >
        <div
          role="row"
          className="grid grid-cols-[auto_auto_1.2fr_2fr_auto_auto_auto] items-center gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium uppercase text-muted-foreground"
        >
          <span role="columnheader" aria-label={t("onboarding.colSelect")} />
          <span role="columnheader">{t("onboarding.colIssuer")}</span>
          <span role="columnheader">{t("onboarding.colEnvVar")}</span>
          <span role="columnheader">{t("onboarding.colFile")}</span>
          <span role="columnheader">{t("onboarding.colLast4")}</span>
          <span role="columnheader">{t("onboarding.colConfidence")}</span>
          <span role="columnheader" />
        </div>

        {detected.map((dk, idx) => {
          const status = rowStatuses[idx];
          const isAlreadyTracked = status === "already_tracked";
          const isRotated = status !== "already_tracked" && status !== "new";
          const preset = dk.issuer_slug ? findPreset(dk.issuer_slug) : undefined;
          const Icon = preset?.icon ?? KeyRound;
          const checked = decisions.has(idx);
          const disabled = isAlreadyTracked;
          const currentDecision = decisions.get(idx);
          const isReplaceMode =
            currentDecision !== undefined &&
            currentDecision !== "new" &&
            currentDecision.kind === "replace";

          return (
            <div
              key={`${dk.file_path}:${dk.line}:${dk.value_hint}:${idx}`}
              role="row"
              data-testid={`detected-row-${idx}`}
              className="grid grid-cols-[auto_auto_1.2fr_2fr_auto_auto_auto] items-center gap-3 border-b px-4 py-2 text-sm last:border-b-0 hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggleSelected(idx)}
                aria-label={t("onboarding.selectRow", { name: dk.env_var_name ?? dk.file_path })}
                className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div role="cell" className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs">
                  {preset?.display_name ?? t("onboarding.unknownIssuer")}
                </span>
              </div>
              <span role="cell" className="truncate font-mono text-xs">
                {dk.env_var_name ?? <span className="text-muted-foreground">—</span>}
              </span>
              <span
                role="cell"
                className="truncate text-xs text-muted-foreground"
                title={dk.file_path}
              >
                {dk.file_path}:{dk.line}
              </span>
              <span role="cell" className="font-mono text-xs text-muted-foreground">
                ••••{dk.value_hint}
              </span>
              <div role="cell" className="flex items-center gap-2">
                <Badge variant={confidenceTone(dk.confidence)} className="tabular-nums">
                  {Math.round(dk.confidence * 100)}%
                </Badge>
                {isAlreadyTracked ? (
                  <Badge variant="outline" className="text-[10px]">
                    {t("onboarding.alreadyTracked")}
                  </Badge>
                ) : null}
                {isRotated ? (
                  <Badge
                    variant="warning"
                    className="text-[10px]"
                    title={t("onboarding.rotatedExplain")}
                    data-testid={`rotated-badge-${idx}`}
                  >
                    {t("onboarding.rotatedBadge")}
                  </Badge>
                ) : null}
              </div>
              {/* Replace / Add-as-new radio — only shown for rotated rows that are selected */}
              <div role="cell" className="flex items-center gap-2">
                {isRotated && checked ? (
                  <div className="flex gap-2 text-[10px]" data-testid={`rotation-mode-${idx}`}>
                    <label className="flex cursor-pointer items-center gap-1">
                      <input
                        type="radio"
                        name={`rotation-mode-${idx}`}
                        value="replace"
                        checked={isReplaceMode}
                        onChange={() => setRowMode(idx, "replace")}
                        className="size-3 accent-primary"
                        aria-label={t("onboarding.replaceMode")}
                        data-testid={`replace-radio-${idx}`}
                      />
                      {t("onboarding.replaceMode")}
                    </label>
                    <label className="flex cursor-pointer items-center gap-1">
                      <input
                        type="radio"
                        name={`rotation-mode-${idx}`}
                        value="new"
                        checked={!isReplaceMode}
                        onChange={() => setRowMode(idx, "new")}
                        className="size-3 accent-primary"
                        aria-label={t("onboarding.addAsNewMode")}
                        data-testid={`add-as-new-radio-${idx}`}
                      />
                      {t("onboarding.addAsNewMode")}
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* RAILGUARD CTA — shown only when ≥1 rule file is missing (T068). */}
      {railguardMissing ? (
        <div
          className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm"
          data-testid="railguard-cta"
        >
          <Wand2 className="size-4 shrink-0 text-blue-500" aria-hidden />
          <div className="flex-1">
            <span className="font-medium text-blue-700 dark:text-blue-300">
              {t("onboarding.railguardCta.title")}
            </span>{" "}
            <span className="text-muted-foreground">{t("onboarding.railguardCta.body")}</span>
          </div>
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            onClick={() => navigate(`/railguard?projectPath=${encodeURIComponent(scannedPath)}`)}
            data-testid="railguard-cta-link"
          >
            {t("onboarding.railguardCta.action")} →
          </button>
        </div>
      ) : null}
    </div>
  );
}
