import { useTranslation } from "react-i18next";
import { KeyRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CredentialCard } from "./CredentialCard";
import type { CredentialSummary } from "./types";

interface CredentialListProps {
  items: CredentialSummary[];
  loading: boolean;
  onSelect?: (id: string) => void;
}

function SkeletonGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-lg" />
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
        <p className="font-medium text-sm">{t("inventory.emptyTitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("inventory.emptyDescription")}</p>
      </div>
    </div>
  );
}

export function CredentialList({ items, loading, onSelect }: CredentialListProps) {
  if (loading) return <SkeletonGrid />;
  if (items.length === 0) return <EmptyState />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((c) => (
        <CredentialCard key={c.id} credential={c} onSelect={onSelect} />
      ))}
    </div>
  );
}
