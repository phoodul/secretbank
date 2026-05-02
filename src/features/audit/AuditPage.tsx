import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AuditFilterBar } from "./AuditFilterBar";
import { AuditTimeline } from "./AuditTimeline";
import { VerifyChainBanner } from "./VerifyChainBanner";
import { useAudit } from "./use-audit";
import { useVerifyChain } from "./use-verify-chain";
import type { AuditListInput } from "./types";

const DEFAULT_LIMIT = 100;

export function AuditPage() {
  const { t } = useTranslation("common");
  const [searchParams] = useSearchParams();

  // Prefill filter from query params (e.g. from AuditForCredential "View all" link).
  const paramSubjectKind = searchParams.get("subject_kind") ?? undefined;
  const paramSubjectId = searchParams.get("subject_id") ?? undefined;

  const [filter, setFilter] = useState<AuditListInput>({
    limit: DEFAULT_LIMIT,
    offset: 0,
    subject_kind: paramSubjectKind,
    subject_id: paramSubjectId,
  });
  const [page, setPage] = useState(0);

  // Keep filter + pagination in sync.
  const effectiveFilter: AuditListInput = {
    ...filter,
    offset: page * DEFAULT_LIMIT,
  };

  const { entries, loading, error, refresh } = useAudit(effectiveFilter);
  const verifyChain = useVerifyChain();

  function handleFilterChange(next: AuditListInput) {
    setFilter(next);
    setPage(0);
  }

  function handleLoadMore() {
    setPage((p) => p + 1);
  }

  const hasMore = entries.length === DEFAULT_LIMIT;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("audit.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("audit.subtitle")}</p>
      </div>

      {/* Breadcrumb — shown when filtered by a specific credential */}
      {paramSubjectKind === "credential" && paramSubjectId && (
        <p
          className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="audit-filtered-breadcrumb"
        >
          {t("audit.filteredByCredential", { id: paramSubjectId })}
        </p>
      )}

      {/* Integrity verify banner */}
      <VerifyChainBanner verifyChain={verifyChain} />

      {/* Filter bar */}
      <AuditFilterBar filter={filter} onChange={handleFilterChange} />

      {/* Timeline */}
      <AuditTimeline entries={entries} loading={loading} error={error} onRetry={refresh} />

      {/* Load more */}
      {!loading && error === null && hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={handleLoadMore}
            data-testid="load-more-btn"
          >
            {t("audit.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
