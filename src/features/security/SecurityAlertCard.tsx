/**
 * SecurityAlertCard — 개별 보안 alert 카드.
 *
 * 각 alert 종류에 맞는 메타데이터(노출 횟수 / 강도 / 재사용 개수 / 도메인)를 표시하고
 * [Fix] / [Dismiss] / [Undismiss] 액션을 제공한다.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Globe, KeyRound, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AlertKind, SecurityAlertView } from "./types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SecurityAlertCardProps {
  alert: SecurityAlertView;
  onDismissed?: (id: string) => void;
  onUndismissed?: (id: string) => void;
  onFix?: (credentialId: string) => void;
}

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const KIND_ICONS: Record<AlertKind, React.ElementType> = {
  compromised_password: ShieldX,
  weak_password: ShieldAlert,
  reused_password: Copy,
  missing_two_factor: KeyRound,
  unsecured_website: Globe,
};

const KIND_VARIANT: Record<AlertKind, "destructive" | "default" | "secondary" | "outline"> = {
  compromised_password: "destructive",
  weak_password: "default",
  reused_password: "default",
  missing_two_factor: "secondary",
  unsecured_website: "outline",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SecurityAlertCard({
  alert,
  onDismissed,
  onUndismissed,
  onFix,
}: SecurityAlertCardProps) {
  const { t } = useTranslation("security");
  const [dismissing, setDismissing] = useState(false);

  const kind = alert.alert_kind as AlertKind;
  const isDismissed = alert.dismissed_at !== null;
  const Icon = KIND_ICONS[kind] ?? ShieldAlert;

  const categoryLabel: Record<AlertKind, string> = {
    compromised_password: t("security.category.compromised"),
    weak_password: t("security.category.weak"),
    reused_password: t("security.category.reused"),
    missing_two_factor: t("security.category.two_factor"),
    unsecured_website: t("security.category.unsecured"),
  };

  async function handleDismiss() {
    if (dismissing) return;
    setDismissing(true);
    try {
      await invoke("dismiss_security_alert", { alertId: alert.id });
      onDismissed?.(alert.id);
    } catch {
      toast.error(t("security.category.compromised")); // generic error
      setDismissing(false);
    }
  }

  async function handleUndismiss() {
    if (dismissing) return;
    setDismissing(true);
    try {
      await invoke("undismiss_security_alert", { alertId: alert.id });
      onUndismissed?.(alert.id);
    } catch {
      toast.error(t("security.category.compromised"));
      setDismissing(false);
    }
  }

  // Build meta description line based on alert kind and metadata
  function buildMetaLine(): string | null {
    const meta = alert.alert_meta;
    switch (kind) {
      case "compromised_password": {
        const count = meta.exposure_count as number | undefined;
        if (count !== undefined) return t("security.alert.exposure_count", { count });
        return null;
      }
      case "weak_password": {
        const score = meta.score as number | undefined;
        if (score !== undefined) return t("security.alert.weak_score", { score });
        return null;
      }
      case "reused_password": {
        const also = meta.also_used_by as string[] | undefined;
        const count = also ? also.length : 0;
        if (count > 0) return t("security.alert.reused_with", { count });
        return null;
      }
      case "missing_two_factor": {
        const domain = meta.domain as string | undefined;
        if (domain) return t("security.alert.missing_2fa_for", { domain });
        return null;
      }
      case "unsecured_website": {
        const url = meta.url as string | undefined;
        if (url) return url;
        return null;
      }
      default:
        return null;
    }
  }

  const metaLine = buildMetaLine();

  return (
    <div
      className={cn(
        "border-border bg-card rounded-lg border p-4 transition-all duration-150",
        isDismissed && "opacity-60",
      )}
      data-testid="security-alert-card"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            kind === "compromised_password"
              ? "text-destructive"
              : kind === "weak_password" || kind === "reused_password"
                ? "text-warning"
                : "text-muted-foreground",
          )}
          aria-hidden
        />

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant={KIND_VARIANT[kind]} className="text-[10px]">
              {categoryLabel[kind]}
            </Badge>
            {isDismissed && (
              <span className="text-muted-foreground text-xs">{t("security.alert.dismissed")}</span>
            )}
          </div>

          {/* Credential ID (short display) */}
          <p className="text-sm font-mono text-muted-foreground truncate">
            {alert.credential_id.slice(-8)}
          </p>

          {/* Meta line */}
          {metaLine && <p className="text-muted-foreground mt-1 text-xs">{metaLine}</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {onFix && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs transition-all duration-150 active:scale-[0.97]"
            onClick={() => onFix(alert.credential_id)}
          >
            <ShieldCheck className="h-3 w-3" aria-hidden />
            {t("security.alert.fix")}
          </Button>
        )}

        {!isDismissed ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 gap-1 text-xs transition-all duration-150"
            onClick={() => void handleDismiss()}
            disabled={dismissing}
            data-testid="dismiss-button"
          >
            {t("security.alert.dismiss")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 gap-1 text-xs transition-all duration-150"
            onClick={() => void handleUndismiss()}
            disabled={dismissing}
          >
            {t("security.alert.dismissed")}
          </Button>
        )}
      </div>
    </div>
  );
}
