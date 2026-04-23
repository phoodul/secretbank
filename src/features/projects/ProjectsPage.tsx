import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, FolderKanban, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { ProjectDialog } from "./ProjectDialog";
import { ProjectDetail } from "./ProjectDetail";
import { useProjects } from "./use-projects";
import type { Project } from "./types";

export function ProjectsPage() {
  const { t } = useTranslation("common");
  const { items, loading, error, search, setSearch, refresh } = useProjects();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);

  const openCreate = () => {
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditTarget(p);
    setDialogOpen(true);
    setSelected(null);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{t("projects.title")}</h1>
        <Button variant="default" size="sm" onClick={openCreate}>
          + {t("projects.addProject")}
        </Button>
      </div>

      {/* 검색 */}
      <div className="flex flex-wrap gap-2">
        <Input
          className="h-8 w-56 text-sm"
          placeholder={t("projects.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t("projects.searchPlaceholder")}
        />
      </div>

      {/* 에러 배너 */}
      {error !== null && (
        <div className="border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3 rounded-md border px-4 py-3 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{t("projects.loadError")}</span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={refresh}>
            <RefreshCw className="h-3 w-3" />
            {t("projects.retry")}
          </Button>
        </div>
      )}

      {/* 목록 */}
      <ProjectList items={items} loading={loading} onSelect={setSelected} />

      {/* 생성/편집 Dialog */}
      <ProjectDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditTarget(null);
        }}
        onSuccess={refresh}
        editTarget={editTarget}
      />

      {/* 상세 Drawer */}
      <ProjectDetail
        open={selected !== null}
        project={selected}
        onClose={() => setSelected(null)}
        onEdit={openEdit}
        onDeleted={refresh}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ProjectListProps {
  items: Project[];
  loading: boolean;
  onSelect: (p: Project) => void;
}

function ProjectList({ items, loading, onSelect }: ProjectListProps) {
  const { t } = useTranslation("common");

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <FolderKanban className="text-muted-foreground/50 h-10 w-10" />
        <div>
          <p className="text-sm font-medium">{t("projects.emptyTitle")}</p>
          <p className="text-muted-foreground mt-1 text-xs">{t("projects.emptyDescription")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((p) => (
        <ProjectCard key={p.id} project={p} onSelect={onSelect} />
      ))}
    </div>
  );
}

function ProjectCard({ project, onSelect }: { project: Project; onSelect: (p: Project) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(project)}
      className="border-border bg-card hover:border-primary/50 focus-visible:ring-ring flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="flex items-start gap-2">
        <FolderKanban className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-sm font-medium">{project.name}</span>
      </div>
      {(project.framework || project.runtime) && (
        <p className="text-muted-foreground truncate pl-6 text-xs">
          {[project.framework, project.runtime].filter(Boolean).join(" · ")}
        </p>
      )}
      {project.repo_url && (
        <p className="text-muted-foreground truncate pl-6 text-[10px]">{project.repo_url}</p>
      )}
    </button>
  );
}
