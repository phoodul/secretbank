import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIssuers } from "@/features/inventory/use-issuers";
import { findPreset } from "@/features/inventory/issuer-presets";
import type { CredentialSummary } from "@/features/inventory/types";

import type { DetectedKey } from "./types";
import { useImportDetected } from "./use-import-detected";

export interface DetectedKeysReviewProps {
  detected: DetectedKey[];
  /** Absolute path scanned — used as Project local_path + folder name. */
  scannedPath: string;
  /** Existing credentials, for duplicate detection via hash_hint. */
  existingCredentials: CredentialSummary[];
  onImportComplete?: (summary: { projectId: string; projectName: string; count: number }) => void;
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

export function DetectedKeysReview({
  detected,
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

  // Per-row "already tracked" flag.
  const isTracked = (dk: DetectedKey) => trackedHints.has(dk.value_hint);

  // Default selection: everything not tracked AND with a known issuer.
  const initialSelected = useMemo(() => {
    const s = new Set<number>();
    detected.forEach((dk, idx) => {
      if (!isTracked(dk) && dk.issuer_slug) s.add(idx);
    });
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detected, trackedHints]);

  const [selected, setSelected] = useState<Set<number>>(initialSelected);

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  const projectName = folderNameFromPath(scannedPath);
  const selectedCount = selected.size;
  const isImporting = state.phase === "importing";

  async function handleImport() {
    if (selectedCount === 0) return;
    const result = await importSelected({
      detected,
      selectedIndices: selected,
      projectName,
      projectLocalPath: scannedPath,
      issuerBySlug,
    });
    if (result) {
      toast.success(
        t("onboarding.importSuccess", {
          count: result.credentialsCreated,
          project: result.projectName,
        }),
      );
      onImportComplete?.({
        projectId: result.projectId,
        projectName: result.projectName,
        count: result.credentialsCreated,
      });
    } else if (state.phase === "error") {
      toast.error(t("onboarding.importFailed"));
    }
  }

  if (detected.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-medium">{t("onboarding.noDetectedKeys")}</p>
        <p className="text-sm text-muted-foreground">{t("onboarding.noDetectedHint")}</p>
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
          {isImporting
            ? t("onboarding.importing")
            : t("onboarding.importCount", { count: selectedCount })}
        </Button>
      </header>

      <div
        role="table"
        aria-label={t("onboarding.reviewTableLabel")}
        className="overflow-hidden rounded-lg border bg-card"
      >
        <div
          role="row"
          className="grid grid-cols-[auto_auto_1.2fr_2fr_auto_auto] items-center gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium uppercase text-muted-foreground"
        >
          <span role="columnheader" aria-label={t("onboarding.colSelect")} />
          <span role="columnheader">{t("onboarding.colIssuer")}</span>
          <span role="columnheader">{t("onboarding.colEnvVar")}</span>
          <span role="columnheader">{t("onboarding.colFile")}</span>
          <span role="columnheader">{t("onboarding.colLast4")}</span>
          <span role="columnheader">{t("onboarding.colConfidence")}</span>
        </div>

        {detected.map((dk, idx) => {
          const tracked = isTracked(dk);
          const preset = dk.issuer_slug ? findPreset(dk.issuer_slug) : undefined;
          const Icon = preset?.icon ?? KeyRound;
          const checked = selected.has(idx);
          const disabled = tracked || !dk.issuer_slug;

          return (
            <div
              key={`${dk.file_path}:${dk.line}:${dk.value_hint}:${idx}`}
              role="row"
              data-testid={`detected-row-${idx}`}
              className="grid grid-cols-[auto_auto_1.2fr_2fr_auto_auto] items-center gap-3 border-b px-4 py-2 text-sm last:border-b-0 hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(idx)}
                aria-label={t("onboarding.selectRow", { name: dk.env_var_name ?? dk.file_path })}
                className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div role="cell" className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs">{preset?.display_name ?? t("onboarding.unknownIssuer")}</span>
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
                {tracked ? (
                  <Badge variant="outline" className="text-[10px]">
                    {t("onboarding.alreadyTracked")}
                  </Badge>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* RAILGUARD CTA */}
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
          onClick={() =>
            navigate(`/railguard?projectPath=${encodeURIComponent(scannedPath)}`)
          }
          data-testid="railguard-cta-link"
        >
          {t("onboarding.railguardCta.action")} →
        </button>
      </div>
    </div>
  );
}
