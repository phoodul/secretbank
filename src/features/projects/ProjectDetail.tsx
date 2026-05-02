import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AlertCircle, KeyRound, Pencil, Trash2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { DeploymentSection } from "./DeploymentSection";
import type { CredentialSummary } from "@/features/inventory/types";
import type { Project, ProjectUsage } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ListState =
  | { phase: "loading" }
  | { phase: "ok"; usages: ProjectUsage[]; credentials: CredentialSummary[] }
  | { phase: "error"; message: string };

type SettledState =
  | { phase: "ok"; usages: ProjectUsage[]; credentials: CredentialSummary[] }
  | { phase: "error"; message: string };

export interface ProjectDetailProps {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onEdit: (p: Project) => void;
  onDeleted: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectDetail({ open, project, onClose, onEdit, onDeleted }: ProjectDetailProps) {
  const { t } = useTranslation("common");
  // Loading 은 effect 내 동기 setState 를 피하기 위해 파생값으로 계산한다.
  // (react-hooks/set-state-in-effect 규칙 — CredentialDetail 과 동일 패턴)
  const [settled, setSettled] = useState<SettledState | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentKey = open && project ? project.id : null;

  const state: ListState =
    currentKey === null
      ? { phase: "loading" }
      : currentKey !== resolvedKey
        ? { phase: "loading" }
        : settled !== null
          ? settled
          : { phase: "loading" };

  // 선택된 project 의 소속 credential = usage.project_id 매칭 + credential_id 로 조인
  useEffect(() => {
    if (!open || !project) return;
    const key = project.id;
    let cancelled = false;

    Promise.all([
      invoke<ProjectUsage[]>("usage_list_for_project", { projectId: project.id }),
      invoke<CredentialSummary[]>("credential_list", { filter: {} }),
    ])
      .then(([usages, credentials]) => {
        if (!cancelled) {
          setSettled({ phase: "ok", usages, credentials });
          setResolvedKey(key);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = typeof err === "string" ? err : t("projects.loadUsagesFailed");
          setSettled({ phase: "error", message });
          setResolvedKey(key);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, project, t]);

  const handleDelete = useCallback(async () => {
    if (!project) return;
    setIsDeleting(true);
    try {
      await invoke("project_delete", { id: project.id });
      toast.success(t("projects.deleted"));
      setDeleteOpen(false);
      onDeleted();
      onClose();
    } catch {
      toast.error(t("projects.deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  }, [project, t, onDeleted, onClose]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setDeleteOpen(false);
      onClose();
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader className="pb-0">
          <SheetTitle>{t("projects.detailTitle")}</SheetTitle>
          <SheetDescription className="sr-only">{t("projects.detailTitle")}</SheetDescription>
        </SheetHeader>

        {project && (
          <div className="flex flex-col gap-5 p-4">
            {/* Header */}
            <div className="flex flex-col gap-2">
              <h2 className="text-lg leading-tight font-semibold">{project.name}</h2>
              {project.repo_url && (
                <p className="text-muted-foreground truncate text-xs">{project.repo_url}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(project)}>
                <Pencil className="mr-1.5 size-3.5" />
                {t("projects.edit")}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-1.5 size-3.5" />
                {t("projects.delete")}
              </Button>
            </div>

            {/* Metadata */}
            <section>
              <h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">
                {t("projects.sectionMetadata")}
              </h3>
              <div className="divide-border divide-y rounded-md border px-3">
                <MetaRow label={t("projects.fieldFramework")} value={project.framework ?? "—"} />
                <MetaRow label={t("projects.fieldRuntime")} value={project.runtime ?? "—"} />
                <MetaRow
                  label={t("projects.fieldLocalPath")}
                  value={
                    project.local_path ? (
                      <span className="font-mono text-xs break-all">{project.local_path}</span>
                    ) : (
                      "—"
                    )
                  }
                />
              </div>
            </section>

            {/* Deployments */}
            <DeploymentSection projectId={project.id} />

            {/* Linked credentials */}
            <section>
              <h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">
                {t("projects.sectionLinkedCredentials")}
              </h3>
              <LinkedCredentials state={state} />
            </section>
          </div>
        )}
      </SheetContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projects.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("projects.deleteDescription", { name: project?.name ?? "" })}
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
              {t("projects.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right text-xs">{value}</span>
    </div>
  );
}

function LinkedCredentials({ state }: { state: ListState }) {
  const { t } = useTranslation("common");

  if (state.phase === "loading") {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
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

  // 프로젝트에 연결된 credential 은 usage.credential_id unique 기준.
  const credMap = new Map(state.credentials.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const linked: CredentialSummary[] = [];
  for (const u of state.usages) {
    if (seen.has(u.credential_id)) continue;
    const cred = credMap.get(u.credential_id);
    if (cred) {
      seen.add(u.credential_id);
      linked.push(cred);
    }
  }

  if (linked.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-xs">
        {t("projects.noLinkedCredentials")}
      </p>
    );
  }

  return (
    <ul className="divide-border divide-y rounded-md border">
      {linked.map((c) => (
        <li key={c.id} className="flex items-center gap-2 px-3 py-2">
          <KeyRound className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          <span className="flex-1 truncate text-xs font-medium">{c.name}</span>
          <span className="text-muted-foreground text-[10px] uppercase">{c.env}</span>
        </li>
      ))}
    </ul>
  );
}
