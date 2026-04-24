import { useTranslation } from "react-i18next";
import { AlertCircle, FileText } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AuditEntry } from "./types";
import { actionFamily, ACTION_FAMILY_CLASS } from "./action-family";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(ms: number): string {
  const diffMs = Date.now() - ms;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return new Date(ms).toLocaleDateString();
}

function formatAbsolute(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function shortId(id: string): string {
  return id.slice(-6);
}

// ---------------------------------------------------------------------------
// Actor badge
// ---------------------------------------------------------------------------

const ACTOR_CLASS: Record<string, string> = {
  "local-user": "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  system: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  connector: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

interface ActorBadgeProps {
  actor: string;
  label: string;
}

function ActorBadge({ actor, label }: ActorBadgeProps) {
  const cls = ACTOR_CLASS[actor] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", cls)}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Action badge
// ---------------------------------------------------------------------------

// Use the shared constant from action-family.ts.
const FAMILY_CLASS = ACTION_FAMILY_CLASS;

interface ActionBadgeProps {
  action: string;
  familyLabel: string;
}

function ActionBadge({ action, familyLabel }: ActionBadgeProps) {
  const family = actionFamily(action);
  const cls = FAMILY_CLASS[family];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
            cls,
          )}
        >
          {action}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span>{familyLabel}</span>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Row hash tooltip
// ---------------------------------------------------------------------------

interface HashTooltipProps {
  entry: AuditEntry;
}

function HashTooltip({ entry }: HashTooltipProps) {
  return (
    <TooltipContent side="left" className="max-w-xs p-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 font-mono text-xs">
        <dt className="text-muted-foreground">prev</dt>
        <dd className="break-all">{entry.prev_hash_hex}</dd>
        <dt className="text-muted-foreground">hash</dt>
        <dd className="break-all">{entry.entry_hash_hex}</dd>
        <dt className="text-muted-foreground">sig</dt>
        <dd className="break-all">{entry.signature_hex.slice(0, 32)}…</dd>
      </dl>
    </TooltipContent>
  );
}

// ---------------------------------------------------------------------------
// AuditTimeline
// ---------------------------------------------------------------------------

interface AuditTimelineProps {
  entries: AuditEntry[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

export function AuditTimeline({ entries, loading, error, onRetry }: AuditTimelineProps) {
  const { t } = useTranslation("common");

  if (error !== null) {
    return (
      <div
        className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        role="alert"
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">{t("audit.error")}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs underline underline-offset-2 hover:opacity-80"
          >
            {t("common.retry")}
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex flex-col divide-y divide-border rounded-md border"
        data-testid="audit-loading"
        aria-busy="true"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
        data-testid="audit-empty"
      >
        <FileText className="h-10 w-10 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">{t("audit.empty")}</p>
      </div>
    );
  }

  const actorLabel = (actor: string) => {
    switch (actor) {
      case "local-user": return t("audit.actor.localUser");
      case "system": return t("audit.actor.system");
      case "connector": return t("audit.actor.connector");
      default: return actor;
    }
  };

  const familyLabel = (action: string) => {
    const f = actionFamily(action);
    switch (f) {
      case "create": return t("audit.actionFamily.create");
      case "update": return t("audit.actionFamily.update");
      case "delete": return t("audit.actionFamily.delete");
      case "reveal": return t("audit.actionFamily.reveal");
      default: return t("audit.actionFamily.default");
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="overflow-hidden rounded-md border"
        data-testid="audit-table"
      >
        {/* Header */}
        <div className="grid grid-cols-[160px_90px_1fr_160px_100px] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("audit.table.time")}</span>
          <span>{t("audit.table.actor")}</span>
          <span>{t("audit.table.action")}</span>
          <span>{t("audit.table.subject")}</span>
          <span>{t("audit.table.device")}</span>
        </div>

        {/* Rows */}
        <ul className="divide-y divide-border" role="list">
          {entries.map((entry) => (
            <Tooltip key={entry.id}>
              <TooltipTrigger asChild>
                <li
                  className="grid grid-cols-[160px_90px_1fr_160px_100px] items-center gap-3 px-4 py-2 text-xs hover:bg-muted/30 cursor-default"
                  data-testid="audit-row"
                >
                  {/* Time */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="tabular-nums text-muted-foreground">
                        {formatRelative(entry.created_at_ms)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <span className="font-mono text-xs">{formatAbsolute(entry.created_at_ms)}</span>
                    </TooltipContent>
                  </Tooltip>

                  {/* Actor */}
                  <ActorBadge actor={entry.actor} label={actorLabel(entry.actor)} />

                  {/* Action */}
                  <ActionBadge action={entry.action} familyLabel={familyLabel(entry.action)} />

                  {/* Subject */}
                  <span className="font-mono text-muted-foreground">
                    {entry.subject_kind}:{shortId(entry.subject_id)}
                  </span>

                  {/* Device */}
                  <span className="font-mono truncate text-muted-foreground">
                    {entry.device_id ? shortId(entry.device_id) : "system"}
                  </span>
                </li>
              </TooltipTrigger>
              <HashTooltip entry={entry} />
            </Tooltip>
          ))}
        </ul>
      </div>
    </TooltipProvider>
  );
}
