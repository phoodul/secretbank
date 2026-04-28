/**
 * OfflineBadge — Sidebar / Settings / Status bar 에 표시되는 작은 indicator.
 *
 * navigator.onLine 가 false 일 때만 렌더 — 평소엔 보이지 않음. 사용자가
 * 자기 변경이 sync 안 되고 있다는 사실을 항상 인지하도록 한다 (그러나
 * IndexedDB persistence 로 local 변경은 안전 — 다시 online 될 때 backfill).
 */
import { CloudOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

import { useOnlineStatus } from "./use-online-status";

export function OfflineBadge() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      data-testid="offline-badge"
    >
      <CloudOff className="h-3 w-3" />
      {t("sync.offline.badge")}
    </Badge>
  );
}
