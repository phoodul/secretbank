import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UseVerifyChainResult } from "./use-verify-chain";

interface VerifyChainBannerProps {
  verifyChain: UseVerifyChainResult;
}

export function VerifyChainBanner({ verifyChain }: VerifyChainBannerProps) {
  const { t } = useTranslation("common");
  const { state, verify } = verifyChain;

  if (state.phase === "idle") {
    return (
      <div className="flex items-center gap-3 rounded-md border px-4 py-3">
        <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-sm text-muted-foreground">{t("audit.subtitle")}</span>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void verify()}>
          {t("audit.verify.action")}
        </Button>
      </div>
    );
  }

  if (state.phase === "verifying") {
    return (
      <div className="flex items-center gap-3 rounded-md border px-4 py-3">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">{t("audit.verify.verifying")}</span>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div
        className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3"
        role="alert"
      >
        <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <span className="flex-1 text-sm text-destructive">{state.error}</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void verify()}>
          {t("audit.verify.action")}
        </Button>
      </div>
    );
  }

  // phase === "done"
  const { report } = state;
  if (!report) return null;

  if (report.all_valid) {
    return (
      <div
        className="flex items-center gap-3 rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3"
        role="status"
        data-testid="verify-success-banner"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
        <span className="text-sm text-green-800 dark:text-green-300">
          {t("audit.verify.success", {
            entries: report.total_entries,
            devices: report.devices.length,
          })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 text-xs"
          onClick={() => void verify()}
        >
          {t("audit.verify.action")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3"
      role="alert"
      data-testid="verify-failed-banner"
    >
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <span className="flex-1 text-sm font-medium text-destructive">
          {t("audit.verify.failed")}
        </span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void verify()}>
          {t("audit.verify.action")}
        </Button>
      </div>

      {/* Per-device details */}
      <div className="ml-7 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">{t("audit.verify.devicePanel")}</p>
        <ul className="flex flex-col gap-1">
          {report.devices.map((d) => (
            <li key={d.device_id} className="flex items-center gap-2 font-mono">
              <span className="truncate max-w-[24ch]">{d.device_id}</span>
              <span className="text-muted-foreground">—</span>
              <span>{d.valid_count} valid</span>
              {d.first_invalid_seq != null && (
                <span className="text-destructive">first invalid seq: {d.first_invalid_seq}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
