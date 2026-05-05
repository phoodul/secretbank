/**
 * BentoGrid — M24 C-3
 *
 * BentoCard 를 responsive auto-fill grid 로 렌더링한다.
 * Empty state + loading skeleton 처리 포함.
 */

import { useTranslation } from "react-i18next";
import { KeyRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BentoCard } from "./BentoCard";
import type { CredentialSummary } from "./types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BentoGridProps {
  items: CredentialSummary[];
  loading: boolean;
  onSelect?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonBento() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <KeyRound className="h-10 w-10 text-muted-foreground/50" />
      <div>
        <p className="text-sm font-medium">{t("inventory.emptyTitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("inventory.emptyDescription")}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BentoGrid
// ---------------------------------------------------------------------------

export function BentoGrid({ items, loading, onSelect }: BentoGridProps) {
  if (loading) return <SkeletonBento />;
  if (items.length === 0) return <EmptyState />;

  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"
      data-testid="bento-grid"
    >
      {items.map((c) => (
        <BentoCard key={c.id} credential={c} onSelect={onSelect} />
      ))}
    </div>
  );
}
