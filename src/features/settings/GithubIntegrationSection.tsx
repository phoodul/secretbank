import { formatDistanceToNow } from "date-fns";
import { GitBranch, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import {
  type GithubInstallation,
  type RemoteKey,
  useGithubIntegration,
} from "./use-github-integration";

// ---------------------------------------------------------------------------
// Installation card
// ---------------------------------------------------------------------------

interface RemoveDialogState {
  open: boolean;
  installationId: number | null;
}

interface InstallationCardProps {
  installation: GithubInstallation;
  onRemove: (id: number) => void;
}

function InstallationCard({ installation, onRemove }: InstallationCardProps) {
  const { t } = useTranslation();

  const shortId = String(installation.installation_id).slice(0, 8);
  const installedAt = formatDistanceToNow(new Date(installation.installed_at), {
    addSuffix: true,
  });
  const repoCount = installation.repos.length;

  return (
    <div className="rounded-md border p-3 space-y-1 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {t("githubIntegration.installationCard.id", { id: shortId })}
        </span>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" disabled className="h-7 px-2 text-xs">
                  {t("githubIntegration.installationCard.manage")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t("githubIntegration.installationCard.manageDisabled")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => onRemove(installation.installation_id)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {t("githubIntegration.installationCard.remove")}
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("githubIntegration.installationCard.installedAt", { time: installedAt })}
      </p>
      <p className="text-xs">
        {repoCount === 0
          ? t("githubIntegration.installationCard.noRepos")
          : t("githubIntegration.installationCard.repoCount", { count: repoCount })}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alert card (scan result)
// ---------------------------------------------------------------------------

interface AlertCardProps {
  alert: RemoteKey;
}

function AlertCard({ alert }: AlertCardProps) {
  const { t } = useTranslation();

  const detectedAt = alert.first_detected
    ? formatDistanceToNow(new Date(alert.first_detected), { addSuffix: true })
    : null;

  return (
    <div className="rounded-md border p-3 space-y-1 text-sm">
      <div className="flex items-center gap-2">
        <Badge variant="default" className="text-xs font-mono">
          {t("githubIntegration.scan.alertCard.secretType", { type: alert.secret_type })}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {t("githubIntegration.scan.alertCard.locations", {
            count: alert.locations_count,
          })}
        </span>
      </div>
      {detectedAt && (
        <p className="text-muted-foreground text-xs">
          {t("githubIntegration.scan.alertCard.firstDetected", { time: detectedAt })}
        </p>
      )}
      {alert.url && (
        <button
          type="button"
          className="text-primary text-xs underline-offset-4 hover:underline"
          onClick={() =>
            import("@tauri-apps/plugin-shell")
              .then(({ open }) => open(alert.url!))
              .catch(() => window.open(alert.url!, "_blank", "noopener,noreferrer"))
          }
        >
          {t("githubIntegration.scan.alertCard.viewOnGithub")}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scan panel
// ---------------------------------------------------------------------------

interface ScanPanelProps {
  installations: GithubInstallation[];
  scan: (installationId: number, owner: string, repo: string) => Promise<RemoteKey[]>;
}

function ScanPanel({ installations, scan }: ScanPanelProps) {
  const { t } = useTranslation();
  const [selectedInstallationId, setSelectedInstallationId] = useState<number>(
    installations[0]?.installation_id ?? 0,
  );
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<RemoteKey[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  if (installations.length === 0) return null;

  async function handleScan() {
    if (!owner.trim() || !repo.trim()) return;
    setScanning(true);
    setScanError(null);
    setResults(null);
    try {
      const alerts = await scan(selectedInstallationId, owner.trim(), repo.trim());
      setResults(alerts);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
      toast.error(t("githubIntegration.scan.error"));
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-3">
      <Separator />
      <p className="text-sm font-medium">{t("githubIntegration.scan.heading")}</p>

      {/* Installation selector (simple — future: dropdown) */}
      {installations.length > 1 && (
        <select
          className="text-sm border rounded px-2 py-1"
          value={selectedInstallationId}
          onChange={(e) => setSelectedInstallationId(Number(e.target.value))}
        >
          {installations.map((i) => (
            <option key={i.installation_id} value={i.installation_id}>
              {String(i.installation_id).slice(0, 8)}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-2">
        <Input
          aria-label={t("githubIntegration.scan.ownerPlaceholder")}
          placeholder={t("githubIntegration.scan.ownerPlaceholder")}
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="w-32"
        />
        <span className="text-muted-foreground">/</span>
        <Input
          aria-label={t("githubIntegration.scan.repoPlaceholder")}
          placeholder={t("githubIntegration.scan.repoPlaceholder")}
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="w-40"
        />
        <Button
          size="sm"
          disabled={scanning || !owner.trim() || !repo.trim()}
          onClick={() => void handleScan()}
        >
          {scanning ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
              {t("githubIntegration.scan.scanning")}
            </>
          ) : (
            t("githubIntegration.scan.action")
          )}
        </Button>
      </div>

      {scanError && <p className="text-sm text-destructive">{scanError}</p>}

      {results !== null && (
        <div className="space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("githubIntegration.scan.empty")}</p>
          ) : (
            results.map((alert) => <AlertCard key={alert.id} alert={alert} />)
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section component
// ---------------------------------------------------------------------------

export function GithubIntegrationSection() {
  const { t } = useTranslation();
  const { installations, loading, error, connecting, connect, refresh, remove, scan } =
    useGithubIntegration();

  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState>({
    open: false,
    installationId: null,
  });

  const isConnected = installations.length > 0;

  async function handleConnect() {
    try {
      await connect();
    } catch {
      toast.error(t("githubIntegration.connectError"));
    }
  }

  async function handleRemoveConfirm() {
    if (removeDialog.installationId === null) return;
    try {
      await remove(removeDialog.installationId);
      setRemoveDialog({ open: false, installationId: null });
    } catch {
      toast.error(t("githubIntegration.removeError"));
    }
  }

  return (
    <section aria-labelledby="github-integration-heading" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 id="github-integration-heading" className="text-base font-medium">
            {t("githubIntegration.sectionTitle")}
          </h2>
          <p className="text-muted-foreground text-xs">
            {t("githubIntegration.sectionDescription")}
          </p>
        </div>
        <Badge variant={isConnected ? "default" : "outline"} className="shrink-0">
          {isConnected
            ? t("githubIntegration.connected")
            : t("githubIntegration.notConnected")}
        </Badge>
      </div>

      {/* Connect button */}
      {!isConnected && (
        <Button
          variant="outline"
          size="sm"
          disabled={connecting}
          onClick={() => void handleConnect()}
        >
          <GitBranch className="h-4 w-4 mr-2" />
          {connecting
            ? t("githubIntegration.connecting")
            : t("githubIntegration.connectGithub")}
        </Button>
      )}

      {/* Error state */}
      {error && !loading && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* Installation list */}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!loading && installations.length > 0 && (
        <div className="space-y-2">
          {installations.map((inst) => (
            <InstallationCard
              key={inst.installation_id}
              installation={inst}
              onRemove={(id) => setRemoveDialog({ open: true, installationId: id })}
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => refresh()}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      )}

      {/* Scan panel */}
      {isConnected && <ScanPanel installations={installations} scan={scan} />}

      {/* Remove confirmation dialog */}
      <Dialog
        open={removeDialog.open}
        onOpenChange={(open) => {
          if (!open) setRemoveDialog({ open: false, installationId: null });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("githubIntegration.removeConfirm.title")}</DialogTitle>
            <DialogDescription>
              {t("githubIntegration.removeConfirm.body", {
                id: String(removeDialog.installationId ?? "").slice(0, 8),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveDialog({ open: false, installationId: null })}
            >
              {t("githubIntegration.removeConfirm.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleRemoveConfirm()}>
              {t("githubIntegration.removeConfirm.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
