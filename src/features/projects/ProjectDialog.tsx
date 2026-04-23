import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import type { Project } from "./types";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const schema = z.object({
  name: z.string().min(1).max(100),
  repo_url: z
    .string()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  framework: z
    .string()
    .max(50)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  runtime: z
    .string()
    .max(50)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  local_path: z
    .string()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

type FormValues = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** When provided, dialog enters edit mode and prefills the form. */
  editTarget?: Project | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectDialog({ open, onOpenChange, onSuccess, editTarget }: ProjectDialogProps) {
  const { t } = useTranslation("common");
  const isEditing = editTarget != null;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      repo_url: "",
      framework: "",
      runtime: "",
      local_path: "",
    },
  });

  // Edit 타겟이 바뀌면 폼을 재설정
  useEffect(() => {
    if (open && editTarget) {
      form.reset({
        name: editTarget.name,
        repo_url: editTarget.repo_url ?? "",
        framework: editTarget.framework ?? "",
        runtime: editTarget.runtime ?? "",
        local_path: editTarget.local_path ?? "",
      });
    } else if (open && !editTarget) {
      form.reset({
        name: "",
        repo_url: "",
        framework: "",
        runtime: "",
        local_path: "",
      });
    }
    // form 은 render 사이 안정 참조가 보장되지 않음. open/editTarget 변경 시에만 갱신.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTarget]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      repo_url: values.repo_url ?? null,
      framework: values.framework ?? null,
      runtime: values.runtime ?? null,
      local_path: values.local_path ?? null,
    };

    try {
      if (isEditing && editTarget) {
        await invoke<Project>("project_update", {
          id: editTarget.id,
          patch: payload,
        });
        toast.success(t("projects.updated"));
      } else {
        await invoke<string>("project_create", { input: payload });
        toast.success(t("projects.created"));
      }
      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error(isEditing ? t("projects.updateFailed") : t("projects.createFailed"));
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) form.reset();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("projects.editTitle") : t("projects.createTitle")}</DialogTitle>
          <DialogDescription>
            {isEditing ? t("projects.editDescription") : t("projects.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.fieldName")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("projects.fieldNamePlaceholder")}
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="repo_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.fieldRepoUrl")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://github.com/org/repo"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="framework"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.fieldFramework")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("projects.fieldFrameworkPlaceholder")}
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="runtime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.fieldRuntime")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("projects.fieldRuntimePlaceholder")}
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="local_path"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("projects.fieldLocalPath")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="/Users/me/code/my-app"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? t("projects.submitting")
                  : isEditing
                    ? t("projects.saveEdit")
                    : t("projects.submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
