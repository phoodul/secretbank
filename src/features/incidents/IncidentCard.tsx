import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  ExternalLink,
  Globe,
  Info,
  Pin,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IncidentListEntry, IncidentSeverity, IncidentSource, MatchReason } from "./types";

// ---------------------------------------------------------------------------
// Reason icon map
// ---------------------------------------------------------------------------

const REASON_ICONS: Record<MatchReason, React.ElementType> = {
  issuer_match: Tag,
  domain: Globe,
  keyword: Search,
  explicit: Pin,
};

interface IncidentCardProps {
  entry: IncidentListEntry;
  onDismissed?: (id: string) => void;
}

export function IncidentCard({ entry, onDismissed }: IncidentCardProps) {
  const { t } = useTranslation("common");
  const { incident, matches } = entry;
  const [dismissing, setDismissing] = useState(false);

  const allDismissed = matches.length > 0 && matches.every((m) => m.dismissed_at !== null);

  const displayDate = incident.published_at ?? incident.detected_at;
  const relativeDate = formatDistanceToNow(new Date(displayDate), { addSuffix: true });

  async function handleDismiss() {
    if (dismissing) return;
    setDismissing(true);
    try {
      await invoke("incident_dismiss", { id: incident.id });
      toast.success(t("incidents.toast.dismissSuccess"));
      onDismissed?.(incident.id);
    } catch {
      toast.error(t("incidents.toast.dismissError"));
      setDismissing(false);
    }
  }

  function handleView() {
    if (!incident.url) return;
    // Use shell open if available, otherwise window.open
    void (async () => {
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(incident.url!);
      } catch {
        window.open(incident.url!, "_blank", "noopener,noreferrer");
      }
    })();
  }

  return (
    <div
      className={cn(
        "border-border bg-card rounded-lg border p-4 transition-opacity",
        allDismissed && "opacity-60",
      )}
      data-testid="incident-card"
    >
      {/* Top row: severity bar + source badge + title */}
      <div className="flex items-start gap-3">
        <SeverityIcon severity={incident.severity} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <SourceBadge source={incident.source} />
            <SeverityBadge severity={incident.severity} />
            <span className="text-muted-foreground ml-auto whitespace-nowrap text-xs">
              {relativeDate}
            </span>
          </div>
          <p className="line-clamp-2 text-sm font-medium leading-snug">{incident.title}</p>
        </div>
      </div>

      {/* Matched credential chips */}
      {matches.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {matches.map((m) => {
            const label = m.issuer_display_name
              ? `${m.issuer_display_name} / ${m.credential_label}`
              : m.credential_label;
            const ReasonIcon = REASON_ICONS[m.reason] ?? Pin;
            return (
              <span
                key={m.id}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                  m.dismissed_at !== null
                    ? "bg-muted text-muted-foreground ring-muted"
                    : "bg-vault-danger/10 text-vault-danger ring-vault-danger/30",
                )}
                title={t(`incidents.match.reason.${m.reason}`, { defaultValue: m.reason })}
              >
                <ReasonIcon className="mr-1 h-2.5 w-2.5 shrink-0" aria-hidden />
                {label}
              </span>
            );
          })}
        </div>
      )}

      {matches.length === 0 && (
        <p className="text-muted-foreground mt-2 text-xs">{t("incidents.card.noMatches")}</p>
      )}

      {/* HIBP description */}
      {incident.source === "hibp" && incident.body && (
        <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">{incident.body}</p>
      )}

      {/* Domain line */}
      {incident.domain && (
        <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
          <Globe className="h-3 w-3 shrink-0" aria-hidden />
          {incident.domain}
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {incident.url && (
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleView}>
            <ExternalLink className="h-3 w-3" />
            {t("incidents.card.view")}
          </Button>
        )}
        {!allDismissed ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 gap-1 text-xs"
            onClick={() => void handleDismiss()}
            disabled={dismissing}
          >
            <ShieldCheck className="h-3 w-3" />
            {t("incidents.card.dismiss")}
          </Button>
        ) : (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <ShieldCheck className="h-3 w-3" />
            {t("incidents.card.dismissed")}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SeverityIcon({ severity }: { severity: IncidentSeverity }) {
  const cls = {
    critical: "text-vault-danger",
    high: "text-vault-danger",
    medium: "text-vault-warning",
    low: "text-vault-info",
    info: "text-muted-foreground",
  }[severity];

  const Icon = {
    critical: ShieldX,
    high: ShieldAlert,
    medium: ShieldAlert,
    low: ShieldOff,
    info: Info,
  }[severity];

  return <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cls)} aria-hidden />;
}

function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const { t } = useTranslation("common");

  const variantMap: Record<IncidentSeverity, "destructive" | "default" | "secondary" | "outline"> =
    {
      critical: "destructive",
      high: "destructive",
      medium: "default",
      low: "secondary",
      info: "outline",
    };

  return (
    <Badge variant={variantMap[severity]} className="text-[10px]">
      {t(`incidents.severity.${severity}`)}
    </Badge>
  );
}

const SOURCE_LABELS: Record<IncidentSource, string> = {
  nvd: "NVD",
  ghsa: "GHSA",
  rss: "RSS",
  hibp: "HIBP",
};

function SourceBadge({ source }: { source: IncidentSource }) {
  return (
    <Badge variant="outline" className="text-[10px] font-mono">
      {SOURCE_LABELS[source]}
    </Badge>
  );
}
