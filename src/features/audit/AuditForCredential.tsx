/**
 * AuditForCredential — compact audit section inside CredentialDetail (T074).
 *
 * Shows the 10 most recent audit entries for a specific credential.
 * Navigates to /audit?subject_kind=credential&subject_id=<id> for the full log.
 */

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useAudit } from "./use-audit";
import { actionFamily, ACTION_FAMILY_CLASS } from "./action-family";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(ms: number): string {
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return new Date(ms).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AuditForCredentialProps {
  credentialId: string | null;
  onViewAll?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AuditForCredential({
  credentialId,
  onViewAll,
}: AuditForCredentialProps) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();

  const { entries, loading, error } = useAudit(
    credentialId !== null
      ? { subject_kind: "credential", subject_id: credentialId, limit: 10 }
      : { limit: 0 },
  );

  // Null credentialId — render nothing.
  if (credentialId === null) return null;

  function handleViewAll() {
    if (onViewAll) {
      onViewAll();
    } else {
      void navigate(
        `/audit?subject_kind=credential&subject_id=${credentialId}`,
      );
    }
  }

  // ---- loading ----
  if (loading) {
    return (
      <div
        className="flex flex-col gap-2"
        data-testid="audit-for-credential-loading"
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  // ---- error ----
  if (error !== null) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        data-testid="audit-for-credential-error"
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t("inventory.auditError")}
      </div>
    );
  }

  // ---- empty ----
  if (entries.length === 0) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="audit-for-credential-empty"
      >
        {t("inventory.auditEmpty")}
      </p>
    );
  }

  // ---- list ----
  return (
    <div className="flex flex-col gap-1" data-testid="audit-for-credential-list">
      <ul className="divide-y divide-border rounded-md border" role="list">
        {entries.map((entry) => {
          const family = actionFamily(entry.action);
          const badgeCls = ACTION_FAMILY_CLASS[family];

          return (
            <li
              key={entry.id}
              className="flex items-center gap-2 px-3 py-1.5 text-xs"
              data-testid="audit-for-credential-row"
            >
              {/* Action badge */}
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium",
                  badgeCls,
                )}
                data-testid="audit-action-badge"
              >
                {entry.action}
              </span>

              {/* Relative time */}
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatRelative(entry.created_at_ms)}
              </span>

              {/* Actor */}
              <span className="truncate text-muted-foreground">
                {entry.actor}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Footer link */}
      <button
        type="button"
        onClick={handleViewAll}
        className="mt-1 self-start text-xs text-primary underline-offset-4 hover:underline"
        data-testid="audit-for-credential-view-all"
      >
        {t("inventory.auditViewAll")}
      </button>
    </div>
  );
}
