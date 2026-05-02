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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Deployment, DeploymentPlatform } from "./types";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const PLATFORMS = ["vercel", "railway", "fly", "netlify", "other"] as const;
const ENVS = ["dev", "staging", "prod"] as const;

const schema = z.object({
  url: z.string().min(1).max(500).url(),
  platform: z.enum(PLATFORMS),
  env: z.enum(ENVS),
});

type FormValues = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DeploymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId: string;
  /** Edit mode 시 prefill 타겟 */
  editTarget?: Deployment | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeploymentDialog({
  open,
  onOpenChange,
  onSuccess,
  projectId,
  editTarget,
}: DeploymentDialogProps) {
  const { t } = useTranslation("common");
  const isEditing = editTarget != null;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      url: "",
      platform: "vercel",
      env: "prod",
    },
  });

  useEffect(() => {
    if (open && editTarget) {
      form.reset({
        url: editTarget.url,
        platform: editTarget.platform,
        env: editTarget.env,
      });
    } else if (open && !editTarget) {
      form.reset({ url: "", platform: "vercel", env: "prod" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTarget]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: FormValues) {
    try {
      if (isEditing && editTarget) {
        await invoke<Deployment>("deployment_update", {
          id: editTarget.id,
          patch: values,
        });
        toast.success(t("deployments.updated"));
      } else {
        await invoke<string>("deployment_create", {
          input: {
            project_id: projectId,
            url: values.url,
            platform: values.platform,
            env: values.env,
          },
        });
        toast.success(t("deployments.created"));
      }
      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error(isEditing ? t("deployments.updateFailed") : t("deployments.createFailed"));
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
          <DialogTitle>
            {isEditing ? t("deployments.editTitle") : t("deployments.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? t("deployments.editDescription") : t("deployments.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("deployments.fieldUrl")}</FormLabel>
                  <FormControl>
                    <Input placeholder="https://app.example.com" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="platform"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("deployments.fieldPlatform")}</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v as DeploymentPlatform)}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label={t("deployments.fieldPlatform")}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="vercel">Vercel</SelectItem>
                      <SelectItem value="railway">Railway</SelectItem>
                      <SelectItem value="fly">Fly.io</SelectItem>
                      <SelectItem value="netlify">Netlify</SelectItem>
                      <SelectItem value="other">{t("deployments.platformOther")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="env"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.fieldEnv")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label={t("inventory.fieldEnv")}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="dev">{t("inventory.envDev")}</SelectItem>
                      <SelectItem value="staging">{t("inventory.envStaging")}</SelectItem>
                      <SelectItem value="prod">{t("inventory.envProd")}</SelectItem>
                    </SelectContent>
                  </Select>
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
                  ? t("deployments.submitting")
                  : isEditing
                    ? t("deployments.saveEdit")
                    : t("deployments.submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
