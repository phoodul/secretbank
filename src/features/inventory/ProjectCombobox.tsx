/**
 * ProjectCombobox — 자격증명 생성 시 "관련 Project" 로 묶기 위한 선택/생성 콤보박스.
 *
 * - 모든 종류(API 키 / 비밀번호 / 카드 / 기타)에서 공통 사용.
 * - 기존 Project 선택 + 검색창에 입력 시 인라인 생성("+ 새 프로젝트") 지원.
 * - 선택은 선택사항(value="" = 묶지 않음).
 *
 * 선택된 Project 는 부모가 credential 생성 직후 `linkCredentialToProject` 로
 * Usage(그룹 전용, where_value 빈 값) 레코드를 만들어 연결한다. 이렇게 하면
 * ProjectDetail 의 "Linked credentials" 에 해당 자격증명이 프로젝트별로 묶여 보인다.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, FolderKanban, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import type { Project } from "@/features/projects/types";

export interface ProjectComboboxProps {
  /** 선택된 project id. "" = 미선택(묶지 않음). */
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean;
  /** trigger 버튼 aria-label override */
  ariaLabel?: string;
}

export function ProjectCombobox({ value, onChange, disabled, ariaLabel }: ProjectComboboxProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    invoke<Project[]>("project_list")
      .then((data) => {
        if (!cancelled) setProjects(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // 조용히 실패 — 빈 목록으로 폴백 (인라인 생성은 여전히 가능)
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = projects.find((p) => p.id === value);
  const q = query.trim();
  const exactMatch = projects.some((p) => p.name.toLowerCase() === q.toLowerCase());

  async function handleCreate() {
    if (!q || creating) return;
    setCreating(true);
    try {
      const id = await invoke<string>("project_create", {
        input: { name: q, repo_url: null, framework: null, runtime: null, local_path: null },
      });
      // 낙관적 항목 — 타임스탬프는 콤보박스 표시에 쓰이지 않으므로 0 으로 둔다
      // (Date.now() 는 react-compiler lint 의 impure-call 규칙에 걸린다).
      const newProj: Project = {
        id,
        name: q,
        repo_url: null,
        framework: null,
        runtime: null,
        local_path: null,
        created_at: 0,
        updated_at: 0,
      };
      setProjects((prev) => [...prev, newProj]);
      onChange(id);
      setQuery("");
      setOpen(false);
    } catch {
      toast.error(t("inventory.projectCreateFailed"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? t("inventory.fieldProject")}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <FolderKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("inventory.projectSelectPlaceholder")}</span>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput
            placeholder={t("inventory.projectSearchPlaceholder")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {/* q 가 있으면 항상 "생성" 항목이 보이므로 empty 는 q 가 없을 때만 의미 있음 */}
            <CommandEmpty>{q ? null : t("inventory.noProjectsAvailable")}</CommandEmpty>
            <CommandGroup>
              {/* 선택 해제 (이미 선택된 경우만) */}
              {value && (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <span className="text-muted-foreground">{t("inventory.projectNone")}</span>
                </CommandItem>
              )}
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <FolderKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {p.name}
                  <Check
                    className={cn("ml-auto size-4", value === p.id ? "opacity-100" : "opacity-0")}
                  />
                </CommandItem>
              ))}
              {/* 인라인 생성 — query 가 기존 이름과 정확히 일치하지 않을 때 */}
              {q && !exactMatch && (
                <CommandItem
                  value={`create ${q}`}
                  disabled={creating}
                  onSelect={() => void handleCreate()}
                >
                  <Plus className="size-4 shrink-0" aria-hidden />
                  {t("inventory.projectCreateNew", { name: q })}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
