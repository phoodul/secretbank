import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, RefreshCw, ShieldOff } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { IncidentCard } from "./IncidentCard";
import { useIncidents } from "./use-incidents";
import type { IncidentFilter, IncidentListEntry, IncidentTab } from "./types";

/** Translate a UI tab to the `IncidentFilter` sent to Rust. */
function tabToFilter(tab: IncidentTab): IncidentFilter {
  switch (tab) {
    case "all":
      return { include_dismissed: false };
    case "critical":
      return { severity: "critical", include_dismissed: false };
    case "affecting":
      // All incidents; narrow client-side to those with at least one active match.
      return { include_dismissed: false };
    case "dismissed":
      // All including dismissed; narrow client-side.
      return { include_dismissed: true };
  }
}

/** Client-side filter applied on top of the server result for Affecting/Dismissed tabs. */
function clientFilter(tab: IncidentTab, entries: IncidentListEntry[]): IncidentListEntry[] {
  switch (tab) {
    case "affecting":
      return entries.filter(
        (e) => e.matches.length > 0 && e.matches.some((m) => m.dismissed_at === null),
      );
    case "dismissed":
      return entries.filter(
        (e) => e.matches.length > 0 && e.matches.every((m) => m.dismissed_at !== null),
      );
    default:
      return entries;
  }
}

export function IncidentsPage() {
  const { t } = useTranslation("common");
  const [activeTab, setActiveTab] = useState<IncidentTab>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [searchParams] = useSearchParams();

  // G-2-2: deep-link ?host=<host> 파라미터 — 해당 호스트 관련 incident 클라이언트 필터
  const hostFilter = searchParams.get("host") ?? null;

  const filter = tabToFilter(activeTab);
  const { entries, loading, error, refresh, triggerFeedRefresh } = useIncidents(filter);

  // hostFilter 적용: incident.domain 또는 title 에 host 가 포함된 항목만
  const filteredByHost = hostFilter
    ? entries.filter(
        (e) =>
          (e.incident.domain !== null &&
            (e.incident.domain === hostFilter ||
              e.incident.domain.endsWith(`.${hostFilter}`) ||
              hostFilter.endsWith(`.${e.incident.domain}`))) ||
          e.incident.title.toLowerCase().includes(hostFilter.toLowerCase()),
      )
    : entries;

  const visibleEntries = clientFilter(activeTab, filteredByHost);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const count = await triggerFeedRefresh();
      toast.success(t("incidents.toast.refreshSuccess", { count }));
    } catch {
      toast.error(t("incidents.toast.refreshError"));
    } finally {
      setRefreshing(false);
    }
  }

  const tabs: { id: IncidentTab; label: string }[] = [
    { id: "all", label: t("incidents.tabs.all") },
    { id: "critical", label: t("incidents.tabs.critical") },
    { id: "affecting", label: t("incidents.tabs.affecting") },
    { id: "dismissed", label: t("incidents.tabs.dismissed") },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* G-2-2: host 필터 배너 */}
      {hostFilter !== null && (
        <div className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-2 rounded-md border px-4 py-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            {t("incidents.hostFilter", {
              host: hostFilter,
              defaultValue: `호스트 필터: ${hostFilter}`,
            })}
          </span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{t("incidents.title")}</h1>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? t("incidents.refreshing") : t("incidents.refresh")}
        </Button>
      </div>

      {/* Filter tabs */}
      <div
        className="border-border flex gap-1 rounded-lg border p-1"
        role="tablist"
        aria-label={t("incidents.title")}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error !== null && (
        <div
          className="border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3 rounded-md border px-4 py-3 text-sm"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{t("incidents.error")}</span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={refresh}>
            <RefreshCw className="h-3 w-3" />
            {t("common.retry")}
          </Button>
        </div>
      )}

      {/* Content */}
      <IncidentList entries={visibleEntries} loading={loading} onDismissed={refresh} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface IncidentListProps {
  entries: IncidentListEntry[];
  loading: boolean;
  onDismissed: () => void;
}

function IncidentList({ entries, loading, onDismissed }: IncidentListProps) {
  const { t } = useTranslation("common");

  if (loading) {
    return (
      <div className="flex flex-col gap-3" data-testid="incidents-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-20 text-center"
        data-testid="incidents-empty"
      >
        <ShieldOff className="text-muted-foreground/50 h-10 w-10" aria-hidden />
        <p className="text-muted-foreground text-sm">{t("incidents.empty")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="incidents-list">
      {entries.map((entry) => (
        <IncidentCard key={entry.incident.id} entry={entry} onDismissed={onDismissed} />
      ))}
    </div>
  );
}
