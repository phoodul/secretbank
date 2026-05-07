/**
 * WatchtowerPage — Phase 2-2B-5 메인 페이지.
 *
 * - 수동 [Run Check] 버튼
 * - 5카테고리 Summary Cards
 * - SecurityAlertCard 목록 (활성 alert)
 * - 빈 상태 3종 (no_history / all_clear / vault_locked)
 * - HIBP opt-in 안내 배너
 * - 스켈레톤 로딩
 * - 에러 배너 (vault_locked / network_error / internal)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Globe,
  KeyRound,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { SecurityAlertCard } from "./SecurityAlertCard";
import { useHibpOptIn } from "./use-hibp-opt-in";
import type { SecurityAlertView, SecurityCheckError, SecurityCheckSummary } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState =
  | { stage: "idle_no_history" }
  | { stage: "loading" }
  | { stage: "running" }
  | { stage: "loaded"; summary: SecurityCheckSummary; alerts: SecurityAlertView[] }
  | { stage: "error_vault_locked" }
  | { stage: "error_network" }
  | { stage: "error_internal" };

// ---------------------------------------------------------------------------
// Summary category config
// ---------------------------------------------------------------------------

interface SummaryCategory {
  key: string;
  alertKind: string;
  icon: React.ElementType;
  colorClass: string;
}

const SUMMARY_CATEGORIES: SummaryCategory[] = [
  {
    key: "compromised",
    alertKind: "compromised_password",
    icon: ShieldX,
    colorClass: "text-destructive",
  },
  {
    key: "weak",
    alertKind: "weak_password",
    icon: ShieldAlert,
    colorClass: "text-warning",
  },
  {
    key: "reused",
    alertKind: "reused_password",
    icon: Copy,
    colorClass: "text-warning",
  },
  {
    key: "two_factor",
    alertKind: "missing_two_factor",
    icon: KeyRound,
    colorClass: "text-muted-foreground",
  },
  {
    key: "unsecured",
    alertKind: "unsecured_website",
    icon: Globe,
    colorClass: "text-muted-foreground",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WatchtowerPage() {
  const { t } = useTranslation("security");
  const { optIn, toggle } = useHibpOptIn();

  const [pageState, setPageState] = useState<PageState>({ stage: "idle_no_history" });

  // ---------------------------------------------------------------------------
  // Load alerts on mount (if prior checks exist in DB)
  // ---------------------------------------------------------------------------

  const loadAlerts = useCallback(async () => {
    setPageState({ stage: "loading" });
    try {
      const alerts = await invoke<SecurityAlertView[]>("list_security_alerts", {
        filter: { kind: "all" },
      });
      // If no alerts and no prior checked_at, keep idle_no_history
      if (alerts.length === 0) {
        setPageState({ stage: "idle_no_history" });
        return;
      }
      setPageState({
        stage: "loaded",
        summary: {
          total_credentials_checked: 0,
          alerts_count_by_kind: {},
          hibp_called: false,
          hibp_failed: false,
          completed_at: alerts[0]?.checked_at ?? new Date().toISOString(),
        },
        alerts,
      });
    } catch (err) {
      const e = err as SecurityCheckError | undefined;
      if (e?.code === "vault_locked") {
        setPageState({ stage: "error_vault_locked" });
      } else {
        setPageState({ stage: "idle_no_history" });
      }
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  // ---------------------------------------------------------------------------
  // Run security check
  // ---------------------------------------------------------------------------

  const handleRunCheck = useCallback(async () => {
    setPageState({ stage: "running" });
    try {
      const summary = await invoke<SecurityCheckSummary>("run_security_check", {
        forceHibp: optIn,
      });

      const alerts = await invoke<SecurityAlertView[]>("list_security_alerts", {
        filter: { kind: "all" },
      });

      setPageState({ stage: "loaded", summary, alerts });
    } catch (err) {
      const e = err as SecurityCheckError | undefined;
      if (e?.code === "vault_locked") {
        setPageState({ stage: "error_vault_locked" });
      } else {
        setPageState({ stage: "error_internal" });
      }
    }
  }, [optIn]);

  // ---------------------------------------------------------------------------
  // Dismiss / undismiss callbacks
  // ---------------------------------------------------------------------------

  const handleDismissed = useCallback((alertId: string) => {
    setPageState((prev) => {
      if (prev.stage !== "loaded") return prev;
      return {
        ...prev,
        alerts: prev.alerts.map((a) =>
          a.id === alertId ? { ...a, dismissed_at: new Date().toISOString() } : a,
        ),
      };
    });
  }, []);

  const handleUndismissed = useCallback((alertId: string) => {
    setPageState((prev) => {
      if (prev.stage !== "loaded") return prev;
      return {
        ...prev,
        alerts: prev.alerts.map((a) => (a.id === alertId ? { ...a, dismissed_at: null } : a)),
      };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const isRunning = pageState.stage === "running";
  const isLoading = pageState.stage === "loading";

  const activeAlerts = useMemo(() => {
    if (pageState.stage !== "loaded") return [];
    return pageState.alerts.filter((a) => a.dismissed_at === null);
  }, [pageState]);

  const lastCheckedAt = useMemo(() => {
    if (pageState.stage !== "loaded") return null;
    return pageState.summary.completed_at;
  }, [pageState]);

  const countByKind = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of activeAlerts) {
      counts[a.alert_kind] = (counts[a.alert_kind] ?? 0) + 1;
    }
    return counts;
  }, [activeAlerts]);

  const allClear = pageState.stage === "loaded" && activeAlerts.length === 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("security.title_full")}</h1>
          <p className="text-muted-foreground text-xs mt-0.5">
            {lastCheckedAt
              ? t("security.last_checked", {
                  date: new Date(lastCheckedAt).toLocaleString(),
                })
              : t("security.never_checked")}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs transition-all duration-150 active:scale-[0.97]"
          onClick={() => void handleRunCheck()}
          disabled={isRunning || isLoading}
          data-testid="run-check-button"
        >
          <RefreshCw
            className={`h-3 w-3 motion-safe:${isRunning ? "animate-spin" : ""}`}
            aria-hidden
          />
          {isRunning ? t("security.running") : t("security.run_check")}
        </Button>
      </div>

      {/* ── HIBP opt-in banner ── */}
      {!optIn && (
        <div
          className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
          data-testid="hibp-opt-in-banner"
          role="note"
        >
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground text-xs">{t("security.opt_in_banner")}</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            onClick={() => toggle(true)}
          >
            {t("security.enable_hibp")}
          </Button>
        </div>
      )}

      {/* ── Error states ── */}
      {pageState.stage === "error_vault_locked" && (
        <div
          className="border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3 rounded-md border px-4 py-3 text-sm"
          role="alert"
          data-testid="vault-locked-error"
        >
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{t("security.vault_locked")}</span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
            {t("security.vault_locked_cta")}
          </Button>
        </div>
      )}

      {pageState.stage === "error_network" && (
        <div
          className="border-muted bg-muted/30 flex items-center gap-3 rounded-md border px-4 py-3 text-sm"
          role="alert"
          data-testid="network-error"
        >
          <AlertCircle className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
          <span className="text-muted-foreground flex-1">{t("security.network_error")}</span>
        </div>
      )}

      {pageState.stage === "error_internal" && (
        <div
          className="border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3 rounded-md border px-4 py-3 text-sm"
          role="alert"
          data-testid="internal-error"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{t("security.vault_locked")}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => void handleRunCheck()}
          >
            {t("security.run_check")}
          </Button>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {isLoading && (
        <div className="flex flex-col gap-3" data-testid="watchtower-loading">
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {/* ── Summary Cards ── */}
      {(pageState.stage === "loaded" || isRunning) && !isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SUMMARY_CATEGORIES.map(({ key, alertKind, icon: Icon, colorClass }) => {
            const count = countByKind[alertKind] ?? 0;
            return (
              <Card key={key} className="border-border bg-card transition-shadow hover:shadow-sm">
                <CardContent className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <Icon className={`h-5 w-5 ${colorClass}`} aria-hidden />
                  <p className="text-2xl font-semibold tabular-nums">{count}</p>
                  <p className="text-muted-foreground text-[11px] leading-tight">
                    {t(`security.category.${key}`)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Content area ── */}
      {!isLoading && (
        <AlertContent
          stage={pageState.stage}
          allClear={allClear}
          activeAlerts={activeAlerts}
          onRunCheck={() => void handleRunCheck()}
          onDismissed={handleDismissed}
          onUndismissed={handleUndismissed}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlertContent sub-component
// ---------------------------------------------------------------------------

interface AlertContentProps {
  stage: PageState["stage"];
  allClear: boolean;
  activeAlerts: SecurityAlertView[];
  onRunCheck: () => void;
  onDismissed: (id: string) => void;
  onUndismissed: (id: string) => void;
}

function AlertContent({
  stage,
  allClear,
  activeAlerts,
  onRunCheck,
  onDismissed,
  onUndismissed,
}: AlertContentProps) {
  const { t } = useTranslation("security");

  // No history yet
  if (stage === "idle_no_history") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-20 text-center"
        data-testid="no-history-empty"
      >
        <Shield className="text-muted-foreground/50 h-10 w-10" aria-hidden />
        <p className="text-muted-foreground text-sm">{t("security.no_history")}</p>
        <p className="text-muted-foreground text-xs">{t("security.no_history_cta")}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 h-8 gap-1.5 text-xs transition-all duration-150 active:scale-[0.97]"
          onClick={onRunCheck}
          data-testid="no-history-run-check"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          {t("security.run_check")}
        </Button>
      </div>
    );
  }

  // All clear
  if (allClear) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
        data-testid="all-clear-state"
      >
        <CheckCircle2 className="h-10 w-10 text-green-500" aria-hidden />
        <p className="text-sm font-medium">{t("security.all_clear")}</p>
      </div>
    );
  }

  // Running — show spinner placeholder
  if (stage === "running") {
    return (
      <div className="flex flex-col gap-3" data-testid="running-state">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  // Error states without content
  if (stage === "error_vault_locked" || stage === "error_network" || stage === "error_internal") {
    return null;
  }

  // Loaded with alerts
  if (stage === "loaded" && activeAlerts.length > 0) {
    return (
      <div className="flex flex-col gap-3" data-testid="alerts-list">
        {activeAlerts.map((alert) => (
          <SecurityAlertCard
            key={alert.id}
            alert={alert}
            onDismissed={onDismissed}
            onUndismissed={onUndismissed}
          />
        ))}
      </div>
    );
  }

  return null;
}
