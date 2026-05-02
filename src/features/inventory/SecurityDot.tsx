import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import type { FactorCode, ScoreBreakdown, ScoreFactor, ScoreLevel } from "./types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SecurityDotProps {
  score: ScoreBreakdown;
  /** Override dot size. Default: "sm" (size-2). */
  size?: "sm" | "md";
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SecurityDot({ score, size = "sm", className }: SecurityDotProps) {
  const { t } = useTranslation("common");

  const sizeClass = size === "md" ? "size-3" : "size-2";
  const colorClass = dotColor(score.level);
  const levelLabel = t(levelLabelKey(score.level));

  const accessibleName = score.factors.length
    ? `${levelLabel} (${score.total}/100) — ${score.factors.map((f) => formatFactorShort(t, f)).join(", ")}`
    : `${levelLabel} (${score.total}/100)`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={accessibleName}
            data-level={score.level}
            className={cn("inline-block shrink-0 rounded-full", sizeClass, colorClass, className)}
          />
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-xs">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold">
              {t("inventory.scoreTooltipTitle", { total: score.total, level: levelLabel })}
            </p>
            {score.factors.length === 0 ? (
              <p className="text-xs opacity-90">{t("inventory.scoreAllGood")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {score.factors.map((f, i) => (
                  <li key={`${f.code}-${i}`} className="text-xs opacity-90">
                    • {formatFactorLong(t, f)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dotColor(level: ScoreLevel): string {
  // Tailwind semantic tokens (vault-success/warning/danger).
  if (level === "safe") return "bg-vault-success";
  if (level === "warn") return "bg-vault-warning";
  return "bg-vault-danger";
}

function levelLabelKey(level: ScoreLevel): string {
  if (level === "safe") return "inventory.scoreLevelSafe";
  if (level === "warn") return "inventory.scoreLevelWarn";
  return "inventory.scoreLevelDanger";
}

function factorKey(code: FactorCode): string {
  return `inventory.factor.${code}` as const;
}

type Translate = ReturnType<typeof useTranslation>["t"];

function formatFactorLong(t: Translate, f: ScoreFactor): string {
  const key = factorKey(f.code);
  // Each factor has its own key; some support `{{days}}` interpolation.
  const days = f.days ?? undefined;
  return days !== undefined ? t(key, { count: days, days }) : t(key);
}

function formatFactorShort(t: Translate, f: ScoreFactor): string {
  const key = `inventory.factorShort.${f.code}`;
  const days = f.days ?? undefined;
  return days !== undefined ? t(key, { count: days, days }) : t(key);
}
