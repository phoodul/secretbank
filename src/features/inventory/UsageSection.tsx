import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AlertCircle, FolderKanban, Link2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Project } from "@/features/projects/types";
import type { Usage, UsageWhereKind } from "./types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface UsageSectionProps {
  credentialId: string;
  usages: Usage[];
  onChanged: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UsageSection({ credentialId, usages, onChanged }: UsageSectionProps) {
  const { t } = useTranslation("common");

  const [formOpen, setFormOpen] = useState(false);

  // Project 목록은 Add form 을 열 때만 로드.
  type ProjectsState =
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ok"; data: Project[] }
    | { phase: "error"; message: string };

  const [projectsState, setProjectsState] = useState<ProjectsState>({ phase: "idle" });
  const projectsKey = formOpen ? "load" : null;
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!formOpen) return;
    let cancelled = false;
    invoke<Project[]>("project_list")
      .then((data) => {
        if (!cancelled) {
          setProjectsState({ phase: "ok", data });
          setResolvedKey("load");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = typeof err === "string" ? err : t("inventory.loadProjectsFailed");
          setProjectsState({ phase: "error", message });
          setResolvedKey("load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [formOpen, t]);

  const isLoadingProjects =
    formOpen && (projectsState.phase === "idle" || resolvedKey !== projectsKey);

  // Form state
  const [projectId, setProjectId] = useState<string>("");
  const [whereKind, setWhereKind] = useState<UsageWhereKind>("env_var");
  const [whereValue, setWhereValue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // project map — 목록 항목에서 이름 표시용. form 을 열지 않아도 필요하므로 별도 로드.
  const [projectMap, setProjectMap] = useState<Map<string, Project>>(new Map());

  useEffect(() => {
    // usages 가 비어있으면 project 조회 불필요.
    if (usages.length === 0) return;
    let cancelled = false;
    invoke<Project[]>("project_list")
      .then((list) => {
        if (!cancelled) setProjectMap(new Map(list.map((p) => [p.id, p])));
      })
      .catch(() => {
        // 조용히 실패 — id slice 로 폴백
      });
    return () => {
      cancelled = true;
    };
  }, [usages]);

  const resetForm = useCallback(() => {
    setProjectId("");
    setWhereKind("env_var");
    setWhereValue("");
  }, []);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    resetForm();
  }, [resetForm]);

  async function handleAdd() {
    if (!projectId.trim() || !whereValue.trim()) return;
    setSubmitting(true);
    try {
      await invoke("usage_create", {
        input: {
          credential_id: credentialId,
          project_id: projectId,
          deployment_id: null,
          where_kind: whereKind,
          where_value: whereValue,
        },
      });
      toast.success(t("inventory.usageCreated"));
      closeForm();
      onChanged();
    } catch {
      toast.error(t("inventory.usageCreateFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(usageId: string) {
    try {
      await invoke("usage_delete", { id: usageId });
      toast.success(t("inventory.usageDeleted"));
      onChanged();
    } catch {
      toast.error(t("inventory.usageDeleteFailed"));
    }
  }

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {t("inventory.sectionUsages")}
        </h3>
        {!formOpen && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => setFormOpen(true)}
          >
            <Plus className="mr-1 size-3" />
            {t("inventory.linkUsage")}
          </Button>
        )}
      </div>

      {/* Add form */}
      {formOpen && (
        <div className="bg-muted/30 mb-2 flex flex-col gap-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">{t("inventory.linkUsageTitle")}</p>
            <Button
              size="sm"
              variant="ghost"
              className="size-6 p-0"
              onClick={closeForm}
              aria-label={t("common.cancel")}
            >
              <X className="size-3.5" />
            </Button>
          </div>

          {/* Project select */}
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t("inventory.linkProject")}</span>
            <Select value={projectId} onValueChange={setProjectId} disabled={isLoadingProjects}>
              <SelectTrigger size="sm" aria-label={t("inventory.linkProject")}>
                <SelectValue placeholder={t("inventory.linkProjectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {projectsState.phase === "ok" && projectsState.data.length === 0 && (
                  <div className="text-muted-foreground px-3 py-2 text-xs">
                    {t("inventory.noProjectsAvailable")}
                  </div>
                )}
                {projectsState.phase === "ok" &&
                  projectsState.data.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {projectsState.phase === "error" && (
              <span className="text-destructive flex items-center gap-1 text-[10px]">
                <AlertCircle className="size-3" />
                {projectsState.message}
              </span>
            )}
          </label>

          {/* Where kind select */}
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t("inventory.linkWhereKind")}</span>
            <Select value={whereKind} onValueChange={(v) => setWhereKind(v as UsageWhereKind)}>
              <SelectTrigger size="sm" aria-label={t("inventory.linkWhereKind")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="env_var">{t("inventory.whereKindEnvVar")}</SelectItem>
                <SelectItem value="file_path">{t("inventory.whereKindFilePath")}</SelectItem>
                <SelectItem value="code_ref">{t("inventory.whereKindCodeRef")}</SelectItem>
              </SelectContent>
            </Select>
          </label>

          {/* Where value input */}
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t("inventory.linkWhereValue")}</span>
            <Input
              value={whereValue}
              onChange={(e) => setWhereValue(e.target.value)}
              placeholder={placeholderForKind(whereKind)}
              className="h-8 text-xs"
              autoComplete="off"
            />
          </label>

          <div className="mt-1 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={closeForm} disabled={submitting}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleAdd()}
              disabled={submitting || !projectId.trim() || !whereValue.trim()}
            >
              {submitting ? t("inventory.linking") : t("inventory.linkAdd")}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {usages.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-xs">
          {t("inventory.noUsages")}
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-md border">
          {usages.map((u) => {
            const proj = projectMap.get(u.project_id);
            return (
              <li key={u.id} className="flex items-center gap-2 px-3 py-2">
                <FolderKanban className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium">
                    {proj?.name ?? (
                      <span className="text-muted-foreground font-mono">
                        {u.project_id.slice(0, 8)}…
                      </span>
                    )}
                  </span>
                  <div className="text-muted-foreground flex items-center gap-1.5 text-[10px]">
                    <Badge variant="outline" className="h-4 px-1 text-[9px]">
                      {t(whereKindLabelKey(u.where_kind))}
                    </Badge>
                    <Link2 className="size-2.5 shrink-0" aria-hidden />
                    <span className="truncate font-mono">{u.where_value}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive size-7 p-0"
                  onClick={() => void handleDelete(u.id)}
                  aria-label={t("inventory.removeUsage")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function whereKindLabelKey(k: UsageWhereKind): string {
  if (k === "env_var") return "inventory.whereKindEnvVar";
  if (k === "file_path") return "inventory.whereKindFilePath";
  return "inventory.whereKindCodeRef";
}

function placeholderForKind(k: UsageWhereKind): string {
  if (k === "env_var") return "OPENAI_API_KEY";
  if (k === "file_path") return "/apps/web/.env.local";
  return "src/lib/auth.ts:42";
}
