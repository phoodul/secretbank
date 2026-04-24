import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

import type { PreviewAction, RuleFilePreview } from "./types";
import { RULE_KIND_LABELS } from "./types";

// ---------------------------------------------------------------------------
// Action badge
// ---------------------------------------------------------------------------

interface ActionBadgeProps {
  action: PreviewAction;
}

function ActionBadge({ action }: ActionBadgeProps) {
  const { t } = useTranslation("common");
  const label = t(`railguard.action.${action}`);

  const className = cn(
    "text-[10px] font-medium uppercase tracking-wide",
    action === "create" && "border-green-500/40 bg-green-500/10 text-green-600",
    action === "update" && "border-amber-500/40 bg-amber-500/10 text-amber-600",
    action === "skip" && "border-muted-foreground/30 bg-muted text-muted-foreground",
  );

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Single preview entry
// ---------------------------------------------------------------------------

const PREVIEW_CHAR_LIMIT = 200;

interface RuleFilePreviewEntryProps {
  preview: RuleFilePreview;
}

export function RuleFilePreviewEntry({ preview }: RuleFilePreviewEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const displayLabel = RULE_KIND_LABELS[preview.kind];
  const isLong = preview.content.length > PREVIEW_CHAR_LIMIT;
  const visibleContent =
    showFull || !isLong ? preview.content : `${preview.content.slice(0, PREVIEW_CHAR_LIMIT)}…`;

  return (
    <div className="rounded-lg border bg-card" data-testid={`preview-entry-${preview.kind}`}>
      {/* Header row */}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden />
          ) : (
            <ChevronRight className="size-4" aria-hidden />
          )}
        </span>
        <span className="flex-1 font-mono text-xs font-medium truncate" title={preview.path}>
          {displayLabel}
          <span className="ml-2 text-muted-foreground font-normal">{preview.path}</span>
        </span>
        <ActionBadge action={preview.action} />
      </button>

      {/* Collapsible content */}
      {expanded && (
        <div className="border-t px-4 py-3">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-relaxed">
            {visibleContent}
          </pre>
          {isLong && (
            <button
              type="button"
              className="mt-2 text-xs text-primary hover:underline"
              onClick={() => setShowFull((v) => !v)}
            >
              {showFull ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

interface RuleFilesPreviewProps {
  previews: RuleFilePreview[];
}

export function RuleFilesPreview({ previews }: RuleFilesPreviewProps) {
  return (
    <div className="flex flex-col gap-2" data-testid="rule-files-preview">
      {previews.map((p) => (
        <RuleFilePreviewEntry key={p.kind} preview={p} />
      ))}
    </div>
  );
}
