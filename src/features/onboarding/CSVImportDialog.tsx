/**
 * CSVImportDialog — Google Chrome/Edge/Brave CSV 비밀번호 import UI (M24 2-3-a-5)
 *
 * 단계 머신: idle → loading → preview → committing → result → done
 *                                         ↓ error  ↓ error
 *                                         error (재시도 버튼)
 *
 * 차별화:
 *   1. Bento 카드 preview — 원본 CSV 형식·총 row 수·만료 카운트다운 표시
 *   2. alreadyExists row 자동 해제 + 노란 badge
 *   3. 원본 CSV 파일 즉시 삭제 버튼 (@tauri-apps/plugin-fs::remove)
 *   4. per-row 결과 요약
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { CheckCircle2, Clock, FileX2, KeyRound, Loader2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { findPreset } from "@/features/inventory/issuer-presets";

// ---------------------------------------------------------------------------
// Types (mirrors Rust CsvImportPreview / ImportCommitResult)
// ---------------------------------------------------------------------------

export interface CsvImportPreviewRow {
  rowIndex: number;
  name: string;
  url: string;
  host: string | null;
  username: string | null;
  note: string | null;
  matchedIssuerSlug: string | null;
  valueHint: string;
  env: string;
  alreadyExists: boolean;
}

export interface CsvImportPreview {
  sessionId: string;
  format: "ChromeBrave" | "Edge";
  totalRows: number;
  skippedEmptyPassword: number;
  skippedEmptyUrl: number;
  expiresAtUnixMs: number;
  rows: CsvImportPreviewRow[];
}

export interface ImportRowResult {
  rowIndex: number;
  credentialId: string | null;
  error: string | null;
}

export interface ImportCommitResult {
  imported: number;
  failed: number;
  rows: ImportRowResult[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CSVImportDialogProps {
  /** Absolute path to the CSV file dropped by the user. */
  csvPath: string;
  /** Called after the dialog is fully closed (done state). */
  onDone?: () => void;
}

// ---------------------------------------------------------------------------
// Phase state machine
// ---------------------------------------------------------------------------

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "preview"; preview: CsvImportPreview }
  | { kind: "committing"; preview: CsvImportPreview }
  | { kind: "result"; result: ImportCommitResult; csvPath: string }
  | { kind: "error"; message: string; canRetry: boolean };

// ---------------------------------------------------------------------------
// Countdown hook
// ---------------------------------------------------------------------------

function useCountdown(expiresAtUnixMs: number | null): {
  minutes: string;
  seconds: string;
  isWarning: boolean;
} {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (expiresAtUnixMs === null) return;
    const update = () => {
      const ms = Math.max(0, expiresAtUnixMs - Date.now());
      setRemaining(ms);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAtUnixMs]);

  const totalSec = Math.floor(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return {
    minutes: String(m).padStart(2, "0"),
    seconds: String(s).padStart(2, "0"),
    isWarning: totalSec < 30,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CSVImportDialog({ csvPath, onDone }: CSVImportDialogProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // selected row indices (set of rowIndex)
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Trigger prepare on mount
  const hasFetched = useRef(false);
  const fetchPreview = useCallback(async () => {
    setPhase({ kind: "loading" });
    try {
      const preview = await invoke<CsvImportPreview>("import_csv_prepare", { path: csvPath });
      // Default: all checked, alreadyExists = off
      const defaultSelected = new Set<number>();
      for (const row of preview.rows) {
        if (!row.alreadyExists) {
          defaultSelected.add(row.rowIndex);
        }
      }
      setSelected(defaultSelected);
      setPhase({ kind: "preview", preview });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("vaultLocked")) {
        toast.error(t("import.csv.errors.vaultLocked"));
        setOpen(false);
        onDone?.();
        return;
      }
      // Invalid format
      toast.error(t("import.csv.errors.invalidFormat"));
      setOpen(false);
      onDone?.();
    }
  }, [csvPath, t, onDone]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    void fetchPreview();
  }, [fetchPreview]);

  const handleClose = useCallback(() => {
    setOpen(false);
    onDone?.();
  }, [onDone]);

  async function handleCommit() {
    if (phase.kind !== "preview") return;
    const { preview } = phase;
    const selectedRowIndices = [...selected];
    setPhase({ kind: "committing", preview });
    try {
      const result = await invoke<ImportCommitResult>("import_csv_commit", {
        sessionId: preview.sessionId,
        selectedRowIndices,
      });
      setPhase({ kind: "result", result, csvPath });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("vaultLocked")) {
        toast.error(t("import.csv.errors.vaultLocked"));
        setPhase({ kind: "preview", preview });
        return;
      }
      if (msg.includes("sessionNotFound")) {
        toast.error(t("import.csv.errors.sessionExpired"));
        setPhase({ kind: "error", message: t("import.csv.errors.sessionExpired"), canRetry: true });
        return;
      }
      setPhase({
        kind: "error",
        message: msg,
        canRetry: false,
      });
    }
  }

  async function handleDeleteCsv() {
    try {
      const { remove } = await import("@tauri-apps/plugin-fs");
      await remove(csvPath);
      toast.success(csvPath.split(/[\\/]/).pop() + " 삭제됨");
    } catch (err) {
      toast.error(String(err));
    }
  }

  // Render
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-0 p-0"
        showCloseButton
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{t("import.csv.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {phase.kind === "idle" || phase.kind === "loading" ? (
            <LoadingState />
          ) : phase.kind === "preview" || phase.kind === "committing" ? (
            <PreviewState
              preview={phase.kind === "preview" ? phase.preview : phase.preview}
              selected={selected}
              setSelected={setSelected}
              isCommitting={phase.kind === "committing"}
              onCommit={handleCommit}
              onCancel={handleClose}
            />
          ) : phase.kind === "result" ? (
            <ResultState
              result={phase.result}
              csvPath={phase.csvPath}
              rows={[]}
              onClose={handleClose}
              onDeleteCsv={handleDeleteCsv}
            />
          ) : (
            <ErrorState
              message={phase.message}
              canRetry={phase.canRetry}
              onRetry={phase.canRetry ? () => void fetchPreview() : undefined}
              onClose={handleClose}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

// ---------------------
// PreviewState
// ---------------------

interface PreviewStateProps {
  preview: CsvImportPreview;
  selected: Set<number>;
  setSelected: React.Dispatch<React.SetStateAction<Set<number>>>;
  isCommitting: boolean;
  onCommit: () => void;
  onCancel: () => void;
}

function PreviewState({
  preview,
  selected,
  setSelected,
  isCommitting,
  onCommit,
  onCancel,
}: PreviewStateProps) {
  const { t } = useTranslation("common");
  const skipped = preview.skippedEmptyPassword + preview.skippedEmptyUrl;
  const formatLabel = preview.format === "ChromeBrave" ? "Chrome/Brave" : "Edge";

  const { minutes, seconds, isWarning } = useCountdown(preview.expiresAtUnixMs);

  function selectAll() {
    setSelected(new Set(preview.rows.map((r) => r.rowIndex)));
  }
  function unselectAll() {
    setSelected(new Set());
  }
  function excludeDuplicates() {
    setSelected(new Set(preview.rows.filter((r) => !r.alreadyExists).map((r) => r.rowIndex)));
  }
  function toggleRow(rowIndex: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }

  const selectedCount = selected.size;

  return (
    <>
      {/* Summary bar */}
      <div className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {t("import.csv.summary", { format: formatLabel, total: preview.totalRows, skipped })}
          </p>
          <span
            className={`flex items-center gap-1 text-xs font-medium tabular-nums ${
              isWarning ? "text-destructive" : "text-muted-foreground"
            }`}
            aria-live="polite"
          >
            <Clock className="size-3" aria-hidden />
            {t("import.csv.expiresIn", { minutes, seconds })}
          </span>
        </div>
        {/* Bulk actions */}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={selectAll}
          >
            {t("import.csv.selectAll")}
          </button>
          <button
            type="button"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={unselectAll}
          >
            {t("import.csv.unselectAll")}
          </button>
          <button
            type="button"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={excludeDuplicates}
          >
            {t("import.csv.excludeDuplicates")}
          </button>
        </div>
      </div>

      {/* Row list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-4" role="list" aria-label="import rows">
          {preview.rows.map((row) => (
            <CsvRowCard
              key={row.rowIndex}
              row={row}
              checked={selected.has(row.rowIndex)}
              onToggle={() => toggleRow(row.rowIndex)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-end gap-2 border-t px-6 py-4">
        <Button variant="outline" onClick={onCancel} disabled={isCommitting}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={onCommit}
          disabled={selectedCount === 0 || isCommitting}
          data-testid="import-submit-btn"
        >
          {isCommitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {t("import.csv.importNSelected", { count: selectedCount })}
        </Button>
      </div>
    </>
  );
}

// ---------------------
// CsvRowCard (mini bento card)
// ---------------------

interface CsvRowCardProps {
  row: CsvImportPreviewRow;
  checked: boolean;
  onToggle: () => void;
}

function CsvRowCard({ row, checked, onToggle }: CsvRowCardProps) {
  const { t } = useTranslation("common");
  const preset = row.matchedIssuerSlug ? findPreset(row.matchedIssuerSlug) : undefined;
  const Icon = preset?.icon ?? KeyRound;

  return (
    <div
      role="listitem"
      data-testid={`csv-row-${row.rowIndex}`}
      className={`flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors ${
        checked ? "border-primary/50" : "opacity-60"
      }`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={row.name}
        className="mt-0.5 size-4 cursor-pointer accent-primary"
        data-testid={`csv-row-checkbox-${row.rowIndex}`}
      />

      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{row.name}</span>
          {preset ? (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {preset.display_name}
            </Badge>
          ) : null}
          {row.alreadyExists ? (
            <Badge
              variant="warning"
              className="shrink-0 text-[10px]"
              data-testid={`already-exists-badge-${row.rowIndex}`}
            >
              {t("import.csv.alreadyExists")}
            </Badge>
          ) : null}
        </div>

        {/* URL */}
        {(row.host ?? row.url) ? (
          <p className="truncate text-xs text-muted-foreground">{row.host ?? row.url}</p>
        ) : null}

        {/* Username */}
        {row.username ? (
          <p className="truncate text-xs text-muted-foreground">{row.username}</p>
        ) : null}

        {/* Password hint */}
        <p className="font-mono text-xs text-muted-foreground">••••{row.valueHint}</p>

        {/* Note */}
        {row.note ? <p className="truncate text-xs text-muted-foreground">{row.note}</p> : null}
      </div>
    </div>
  );
}

// ---------------------
// ResultState
// ---------------------

interface ResultStateProps {
  result: ImportCommitResult;
  csvPath: string;
  rows: CsvImportPreviewRow[];
  onClose: () => void;
  onDeleteCsv: () => Promise<void>;
}

function ResultState({ result, csvPath, onClose, onDeleteCsv }: ResultStateProps) {
  const { t } = useTranslation("common");
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const fileName = csvPath.split(/[\\/]/).pop() ?? csvPath;

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDeleteCsv();
      setDeleted(true);
    } finally {
      setDeleting(false);
    }
  }

  const failedRows = result.rows.filter((r) => r.error !== null);

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Success header */}
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-8 shrink-0 text-green-500" aria-hidden />
        <p className="text-lg font-semibold" data-testid="result-success-header">
          {t("import.csv.successHeader", { count: result.imported })}
          {result.failed > 0 ? ` / ${result.failed} 실패` : ""}
        </p>
      </div>

      {/* Failed rows */}
      {failedRows.length > 0 ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-destructive">실패 항목</p>
          <ul className="space-y-1">
            {failedRows.map((r) => (
              <li key={r.rowIndex} className="flex items-start gap-2 text-xs">
                <XCircle className="mt-0.5 size-3 shrink-0 text-destructive" aria-hidden />
                <span>
                  {t("import.csv.failureLine", { name: `row ${r.rowIndex}`, error: r.error ?? "" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Delete original CSV */}
      {!deleted ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              className="self-start"
              data-testid="delete-csv-btn"
              disabled={deleting}
            >
              <FileX2 className="mr-2 size-4" aria-hidden />
              {t("import.csv.deleteOriginalCsv")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{fileName}</AlertDialogTitle>
              <AlertDialogDescription>{t("import.csv.deleteConfirmBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleDelete()}
                data-testid="delete-csv-confirm-btn"
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <p className="text-xs text-muted-foreground">원본 CSV 삭제 완료.</p>
      )}

      {/* Close */}
      <div className="flex justify-end">
        <Button onClick={onClose} data-testid="result-close-btn">
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------
// ErrorState
// ---------------------

interface ErrorStateProps {
  message: string;
  canRetry: boolean;
  onRetry?: () => void;
  onClose: () => void;
}

function ErrorState({ message, canRetry, onRetry, onClose }: ErrorStateProps) {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <XCircle className="size-10 text-destructive" aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        {canRetry && onRetry ? <Button onClick={onRetry}>{t("common.retry")}</Button> : null}
        <Button variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
