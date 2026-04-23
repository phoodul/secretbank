import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AlertCircle, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { DeploymentDialog } from "./DeploymentDialog";
import type { Deployment } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettledState =
  | { phase: "ok"; data: Deployment[] }
  | { phase: "error"; message: string };

type ListState = { phase: "loading" } | SettledState;

export interface DeploymentSectionProps {
  projectId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeploymentSection({ projectId }: DeploymentSectionProps) {
  const { t } = useTranslation("common");

  // 파생 loading 패턴 — effect body 내 동기 setState 회피.
  const [settled, setSettled] = useState<SettledState | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Deployment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Deployment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentKey = `${projectId}:${tick}`;

  const state: ListState =
    currentKey !== resolvedKey ? { phase: "loading" } : settled ?? { phase: "loading" };

  useEffect(() => {
    let cancelled = false;
    const key = currentKey;

    invoke<Deployment[]>("deployment_list_for_project", { projectId })
      .then((data) => {
        if (!cancelled) {
          setSettled({ phase: "ok", data });
          setResolvedKey(key);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = typeof err === "string" ? err : t("deployments.loadError");
          setSettled({ phase: "error", message });
          setResolvedKey(key);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, tick, t, currentKey]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await invoke("deployment_delete", { id: deleteTarget.id });
      toast.success(t("deployments.deleted"));
      setDeleteTarget(null);
      refresh();
    } catch {
      toast.error(t("deployments.deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, t, refresh]);

  const openCreate = () => {
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = (d: Deployment) => {
    setEditTarget(d);
    setDialogOpen(true);
  };

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {t("deployments.sectionTitle")}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={openCreate}
          aria-label={t("deployments.addDeployment")}
        >
          <Plus className="mr-1 size-3" />
          {t("deployments.addDeployment")}
        </Button>
      </div>

      <DeploymentList
        state={state}
        onEdit={openEdit}
        onDelete={(d) => setDeleteTarget(d)}
      />

      <DeploymentDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditTarget(null);
        }}
        onSuccess={refresh}
        projectId={projectId}
        editTarget={editTarget}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deployments.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deployments.deleteDescription", { url: deleteTarget?.url ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting}
            >
              {t("deployments.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface DeploymentListProps {
  state: ListState;
  onEdit: (d: Deployment) => void;
  onDelete: (d: Deployment) => void;
}

function DeploymentList({ state, onEdit, onDelete }: DeploymentListProps) {
  const { t } = useTranslation("common");

  if (state.phase === "loading") {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-md" />
        ))}
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="text-destructive flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
        <AlertCircle className="size-3.5 shrink-0" />
        <span>{state.message}</span>
      </div>
    );
  }

  if (state.data.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-xs">
        {t("deployments.empty")}
      </p>
    );
  }

  return (
    <ul className="divide-border divide-y rounded-md border">
      {state.data.map((d) => (
        <li key={d.id} className="flex items-center gap-2 px-3 py-2">
          <ExternalLink className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium">{d.url}</span>
            <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] uppercase">
              <span>{d.platform}</span>
              <span>·</span>
              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                {t(envLabelKey(d.env))}
              </Badge>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="size-7 p-0"
            onClick={() => onEdit(d)}
            aria-label={t("deployments.edit")}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive size-7 p-0"
            onClick={() => onDelete(d)}
            aria-label={t("deployments.delete")}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function envLabelKey(env: Deployment["env"]): string {
  if (env === "dev") return "inventory.envDev";
  if (env === "staging") return "inventory.envStaging";
  return "inventory.envProd";
}
