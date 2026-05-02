/**
 * T048: Mobile-only alternate view for the Dependency Graph.
 *
 * Renders a two-pane stacked list:
 *  1. Credentials list — one Card per credential, tap to select.
 *  2. Impact tree — appears when a credential is selected; shows
 *     primary / secondary / tertiary blast-radius buckets.
 *
 * This is a read-only triage view for small screens.
 * The interactive React Flow graph is rendered only on desktop.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Building2, FolderGit2, KeyRound, Server, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BlastRadius, BlastRadiusNode, GraphNode, GraphPayload, NodeKind } from "./types";
import { useBlastRadiusSelection } from "./use-blast-radius-selection";

// ---------------------------------------------------------------------------
// Icon lookup by node kind
// ---------------------------------------------------------------------------

function KindIcon({ kind, className }: { kind: NodeKind; className?: string }) {
  const cls = cn("h-4 w-4 shrink-0", className);
  switch (kind) {
    case "issuer":
      return <Building2 className={cls} />;
    case "credential":
      return <KeyRound className={cls} />;
    case "project":
      return <FolderGit2 className={cls} />;
    case "deployment":
      return <Server className={cls} />;
  }
}

// ---------------------------------------------------------------------------
// ImpactItem — single item card in the blast-radius tree
// ---------------------------------------------------------------------------

interface ImpactItemProps {
  node: BlastRadiusNode;
  /** Full GraphNode for the label — undefined if id not found in payload. */
  graphNode: GraphNode | undefined;
}

function ImpactItem({ node, graphNode }: ImpactItemProps) {
  const label = graphNode?.label ?? node.id;
  const env = graphNode?.meta_json?.env as string | undefined;

  return (
    <Card className="flex items-center gap-3 px-3 py-2">
      <KindIcon kind={node.kind} className="text-muted-foreground" />
      <span className="flex-1 truncate text-sm font-medium">{label}</span>
      {env && (
        <Badge variant="outline" className="shrink-0 text-xs">
          {env}
        </Badge>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ImpactTree — blast-radius bucket sections
// ---------------------------------------------------------------------------

interface ImpactTreeProps {
  buckets: BlastRadius;
  nodesById: Map<string, GraphNode>;
  credentialLabel: string;
  onClear: () => void;
}

function ImpactTree({ buckets, nodesById, credentialLabel, onClear }: ImpactTreeProps) {
  const { t } = useTranslation("common");

  const sections: Array<{ key: keyof BlastRadius; labelKey: string }> = [
    { key: "primary", labelKey: "graph.mobile.bucket.primary" },
    { key: "secondary", labelKey: "graph.mobile.bucket.secondary" },
    { key: "tertiary", labelKey: "graph.mobile.bucket.tertiary" },
  ];

  return (
    <section data-testid="impact-tree" className="flex flex-col gap-4 p-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold leading-tight">
          {t("graph.mobile.impactTitle", { name: credentialLabel })}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-7 gap-1 text-xs"
          aria-label={t("graph.mobile.clear")}
        >
          <X className="h-3 w-3" />
          {t("graph.mobile.clear")}
        </Button>
      </div>

      {/* Bucket sections */}
      {sections.map(({ key, labelKey }) => {
        const items = buckets[key];
        if (items.length === 0) return null;

        return (
          <div key={key} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t(labelKey)}
              </span>
              <Badge variant="secondary" className="text-xs">
                {items.length}
              </Badge>
            </div>
            <ul className="flex flex-col gap-1.5">
              {items.map((node) => (
                <li key={`${node.kind}:${node.id}`}>
                  <ImpactItem node={node} graphNode={nodesById.get(node.id)} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// CredentialCard — tappable credential entry
// ---------------------------------------------------------------------------

interface CredentialCardProps {
  node: GraphNode;
  selected: boolean;
  onSelect: () => void;
}

function CredentialCard({ node, selected, onSelect }: CredentialCardProps) {
  const env = node.meta_json?.env as string | undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Card
        className={cn(
          "flex items-center gap-3 px-3 py-3 transition-colors",
          selected && "border-primary bg-primary/5",
        )}
      >
        <KindIcon
          kind="credential"
          className={selected ? "text-primary" : "text-muted-foreground"}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{node.label}</span>
        </div>
        {env && (
          <Badge variant="outline" className="shrink-0 text-xs">
            {env}
          </Badge>
        )}
      </Card>
    </button>
  );
}

// ---------------------------------------------------------------------------
// MobileGraphList — public component
// ---------------------------------------------------------------------------

export interface MobileGraphListProps {
  payload: GraphPayload;
}

export function MobileGraphList({ payload }: MobileGraphListProps) {
  const { t } = useTranslation("common");
  const selection = useBlastRadiusSelection();

  // Build an id→node lookup for the impact tree
  const nodesById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of payload.nodes) m.set(n.id, n);
    return m;
  }, [payload.nodes]);

  // Flat list of credential nodes only
  const credentials = useMemo(
    () => payload.nodes.filter((n) => n.kind === "credential"),
    [payload.nodes],
  );

  // Empty state — no credentials in the vault yet
  if (credentials.length === 0) {
    return (
      <div
        data-testid="mobile-graph-empty"
        className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center"
      >
        <KeyRound className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t("graph.mobile.empty")}</p>
      </div>
    );
  }

  const selectedCredId = selection.state.phase !== "idle" ? selection.state.credentialId : null;

  const selectedCredNode = selectedCredId ? nodesById.get(selectedCredId) : undefined;

  return (
    <div className="flex flex-col" data-testid="mobile-graph-list">
      {/* Credentials section */}
      <section className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {t("graph.mobile.credentialsTitle")}
        </h2>
        <ul className="flex flex-col gap-2">
          {credentials.map((cred) => (
            <li key={cred.id}>
              <CredentialCard
                node={cred}
                selected={selectedCredId === cred.id}
                onSelect={() => {
                  if (selectedCredId === cred.id) {
                    selection.clear();
                  } else {
                    selection.select(cred.id);
                  }
                }}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Divider — only visible when impact tree is shown */}
      {selection.state.phase !== "idle" && <hr className="border-border" />}

      {/* Impact tree — shown when a credential is selected */}
      {selection.state.phase === "loading" && (
        <div className="p-4 text-sm text-muted-foreground">{t("graph.blastRadius.loading")}</div>
      )}

      {selection.state.phase === "error" && (
        <div className="p-4 text-sm text-destructive">
          {t("graph.blastRadius.error")}: {selection.state.message}
        </div>
      )}

      {selection.state.phase === "ok" && (
        <ImpactTree
          buckets={selection.state.buckets}
          nodesById={nodesById}
          credentialLabel={selectedCredNode?.label ?? selection.state.credentialId}
          onClear={selection.clear}
        />
      )}
    </div>
  );
}
