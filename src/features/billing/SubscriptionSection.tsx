/**
 * SubscriptionSection — shows current tier and developer Pro-simulation tools.
 *
 * Placed at the top of SettingsPage so users see it first.
 *
 * # Sections
 * 1. Header: title + "Current plan: <Badge>" group (label and badge adjacent — I1)
 * 2. What's in Pro? feature list
 * 3. Upgrade placeholder (Free users only — hidden when isPro — I2; disabled stub for M10)
 * 4. Developer Tools — simulate Pro / reset to Free
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Lock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { useEntitlement } from "./use-entitlement";

// ---------------------------------------------------------------------------
// Sub-component: What's in Pro list
// ---------------------------------------------------------------------------

function ProFeatureList() {
  const { t } = useTranslation("common");
  const features = [
    t("subscription.whatsInPro.feature1"),
    t("subscription.whatsInPro.feature2"),
    t("subscription.whatsInPro.feature3"),
    t("subscription.whatsInPro.feature4"),
  ];
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("subscription.whatsInPro.title")}</p>
      <ul className="space-y-1">
        {features.map((feat) => (
          <li key={feat} className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" aria-hidden />
            {feat}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Developer Tools
// ---------------------------------------------------------------------------

interface DevToolsProps {
  onSetPro: (ms: number) => Promise<void>;
  onReset: () => Promise<void>;
}

function DevTools({ onSetPro, onReset }: DevToolsProps) {
  const { t } = useTranslation("common");
  // Default: 30 days from now — computed once in useState initialiser
  const [dateValue, setDateValue] = useState(() =>
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [working, setWorking] = useState(false);

  async function handleSet() {
    const ts = new Date(dateValue).getTime();
    if (Number.isNaN(ts)) return;
    setWorking(true);
    try {
      await onSetPro(ts);
      toast.success(t("subscription.dev.setSuccess"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }

  async function handleReset() {
    setWorking(true);
    try {
      await onReset();
      toast.success(t("subscription.dev.resetSuccess"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed border-amber-400/50 bg-amber-50/40 p-4 space-y-3 dark:bg-amber-950/20">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
        {t("subscription.dev.title")}
      </p>
      <p className="text-xs text-muted-foreground">{t("subscription.dev.warning")}</p>

      {/* Simulate Pro date picker */}
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="pro-until-date" className="text-xs">
            {t("subscription.dev.simulatePro")}
          </Label>
          <Input
            id="pro-until-date"
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className="h-8 w-40 text-xs"
            aria-label={t("subscription.dev.simulatePro")}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => void handleSet()}
          disabled={working}
        >
          {t("subscription.dev.set")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-muted-foreground"
          onClick={() => void handleReset()}
          disabled={working}
        >
          {t("subscription.dev.reset")}
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">{t("subscription.dev.notice")}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SubscriptionSection() {
  const { t } = useTranslation("common");
  const { entitlement, loading, setDev } = useEntitlement();

  const isPro = entitlement?.tier === "pro";
  const proUntilDate = entitlement?.pro_until
    ? format(new Date(entitlement.pro_until), "yyyy-MM-dd")
    : null;

  return (
    <section aria-labelledby="subscription-heading" className="space-y-5">
      {/* Header — title left, "Current plan: <Badge>" right (label and badge adjacent for clarity) */}
      <div className="flex items-center justify-between gap-2">
        <h2 id="subscription-heading" className="text-base font-medium">
          {t("subscription.title")}
        </h2>

        {!loading && (
          <div className="flex shrink-0 items-center gap-2" data-testid="current-plan-group">
            <span className="text-muted-foreground text-xs">{t("subscription.currentTier")}</span>
            <Badge
              variant={isPro ? "default" : "outline"}
              aria-label={t("subscription.currentTier")}
            >
              {isPro
                ? proUntilDate
                  ? t("subscription.tierPro") + " · " + t("subscription.proUntil", { date: proUntilDate })
                  : t("subscription.tierPro")
                : t("subscription.tierFree")}
            </Badge>
          </div>
        )}
      </div>

      {/* What's in Pro */}
      <ProFeatureList />

      {/* Upgrade CTA placeholder — only shown to Free users (Pro users don't need to upgrade) */}
      {!isPro && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button variant="outline" size="sm" disabled>
                  <Lock className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                  {t("subscription.upgrade")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{t("subscription.upgradeDisabled")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <Separator />

      {/* Developer Tools */}
      <DevTools
        onSetPro={async (ms) => { await setDev(ms); }}
        onReset={async () => { await setDev(null); }}
      />
    </section>
  );
}
