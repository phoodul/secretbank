/**
 * IncidentsForCredential — Credential Detail drawer 내 Incidents 섹션 (T057).
 *
 * Props:
 *   credentialId        - 조회할 credential ID (null이면 빈 상태 반환)
 *   onRevokeRequested   - (선택) 상위에서 revoke 처리를 직접 할 경우 콜백
 */

import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { IncidentCard } from "./IncidentCard";
import { useIncidentsForCredential } from "./use-incidents-for-credential";

export interface IncidentsForCredentialProps {
  credentialId: string | null;
  onRevokeRequested?: () => void;
}

export function IncidentsForCredential({
  credentialId,
  onRevokeRequested,
}: IncidentsForCredentialProps) {
  const { t } = useTranslation("common");
  const { entries, loading, error, refresh } = useIncidentsForCredential(credentialId);

  // Active = at least one match that is not dismissed
  const activeEntries = entries.filter((e) =>
    e.matches.some((m) => m.dismissed_at === null),
  );

  // ---- loading ----
  if (loading) {
    return (
      <div className="flex flex-col gap-2" data-testid="incidents-for-credential-loading">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  // ---- error ----
  if (error !== null) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2"
        data-testid="incidents-for-credential-error"
      >
        <p className="text-xs text-destructive">{error}</p>
        <Button variant="ghost" size="sm" className="mt-1 h-6 text-xs" onClick={refresh}>
          <RefreshCw className="mr-1 h-3 w-3" />
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  // ---- empty ----
  if (entries.length === 0) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="incidents-for-credential-empty"
      >
        {t("incidents.credentialSection.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="incidents-for-credential-list">
      {/* Warning banner — only when there are active (non-dismissed) matches */}
      {activeEntries.length > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-vault-danger/30 bg-vault-danger/10 px-3 py-2"
          data-testid="incidents-warning-banner"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-vault-danger" aria-hidden />
            <p className="text-xs text-vault-danger">
              {t("incidents.credentialSection.warningBanner", {
                count: activeEntries.length,
              })}
            </p>
          </div>

          {onRevokeRequested ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 self-start text-xs"
              onClick={onRevokeRequested}
            >
              {t("incidents.credentialSection.revokeCta")}
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex self-start" tabIndex={0}>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs"
                      disabled
                      aria-disabled="true"
                    >
                      {t("incidents.credentialSection.revokeCta")}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {t("incidents.credentialSection.revokeUnavailable")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}

      {/* Incident cards */}
      <div className="flex flex-col gap-2">
        {entries.map((entry) => (
          <IncidentCard key={entry.incident.id} entry={entry} onDismissed={refresh} />
        ))}
      </div>
    </div>
  );
}
