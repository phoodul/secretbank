/**
 * SecurityBadge — BentoCard 통합용 최고 우선순위 보안 배지.
 *
 * credential 의 활성 alert 중 우선순위가 가장 높은 1개만 표시한다.
 * alert 가 없으면 null 반환 (렌더링 없음).
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { ALERT_KIND_PRIORITY, type AlertKind, type SecurityAlertView } from "./types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SecurityBadgeProps {
  credentialId: string;
  alerts: SecurityAlertView[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickTopPriority(alerts: SecurityAlertView[]): SecurityAlertView | null {
  const active = alerts.filter((a) => a.dismissed_at === null);
  if (active.length === 0) return null;

  return active.reduce((best, cur) => {
    const bestPrio = ALERT_KIND_PRIORITY[best.alert_kind as AlertKind] ?? 999;
    const curPrio = ALERT_KIND_PRIORITY[cur.alert_kind as AlertKind] ?? 999;
    return curPrio < bestPrio ? cur : best;
  });
}

function getBadgeVariant(kind: AlertKind): "destructive" | "default" | "secondary" | "outline" {
  switch (kind) {
    case "compromised_password":
      return "destructive";
    case "weak_password":
    case "reused_password":
      return "default";
    case "missing_two_factor":
      return "secondary";
    case "unsecured_website":
      return "outline";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SecurityBadge({ credentialId: _credentialId, alerts }: SecurityBadgeProps) {
  const { t } = useTranslation("security");

  const top = useMemo(() => pickTopPriority(alerts), [alerts]);

  if (!top) return null;

  const kind = top.alert_kind as AlertKind;

  const labelMap: Record<AlertKind, string> = {
    compromised_password: t("security.category.compromised"),
    weak_password: t("security.category.weak"),
    reused_password: t("security.category.reused"),
    missing_two_factor: t("security.category.two_factor"),
    unsecured_website: t("security.category.unsecured"),
  };

  return (
    <Badge variant={getBadgeVariant(kind)} className="text-[10px] transition-all duration-150">
      {labelMap[kind]}
    </Badge>
  );
}
