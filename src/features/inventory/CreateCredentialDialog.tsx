import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, ChevronsUpDown, Check, KeyRound } from "lucide-react";

import { cn } from "@/lib/utils";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";

import { useIssuers } from "./use-issuers";
import { findPreset } from "./issuer-presets";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const schema = z
  .object({
    issuer_id: z.string().min(1),
    name: z.string().min(1).max(100),
    env: z.enum(["dev", "staging", "prod"]),
    scope: z
      .string()
      .max(200)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    expires_at: z.string().optional(),
    value: z.string().min(1),
    primary_label: z
      .string()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    has_secondary: z.boolean(),
    secondary_value: z.string().optional(),
    secondary_label: z.string().optional(),
  })
  .refine(
    (data) =>
      !data.has_secondary ||
      (data.secondary_value !== undefined && data.secondary_value.length > 0),
    {
      message: "Secondary value required when secondary enabled",
      path: ["secondary_value"],
    },
  )
  .refine(
    (data) =>
      !data.has_secondary ||
      (data.secondary_label !== undefined && data.secondary_label.length > 0),
    {
      message: "Secondary label required when secondary enabled",
      path: ["secondary_label"],
    },
  );

type FormValues = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CreateCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateCredentialDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateCredentialDialogProps) {
  const { t } = useTranslation("common");
  const { issuers } = useIssuers();
  const [showValue, setShowValue] = useState(false);
  const [showSecondaryValue, setShowSecondaryValue] = useState(false);
  const [issuerPopoverOpen, setIssuerPopoverOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      issuer_id: "",
      name: "",
      env: "prod",
      scope: "",
      expires_at: "",
      value: "",
      primary_label: "",
      has_secondary: false,
      secondary_value: "",
      secondary_label: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;
  const hasSecondary = form.watch("has_secondary");

  async function onSubmit(values: FormValues) {
    const expiresAtMs =
      values.expires_at && values.expires_at !== ""
        ? new Date(values.expires_at).getTime()
        : undefined;

    const scopeVal = values.scope === "" || values.scope === undefined ? undefined : values.scope;

    const hashHint = values.value.slice(-4);

    const primaryLabelVal =
      values.primary_label === "" || values.primary_label === undefined
        ? undefined
        : values.primary_label;

    try {
      await invoke<string>("credential_create", {
        args: {
          issuer_id: values.issuer_id,
          name: values.name,
          env: values.env,
          scope: scopeVal,
          expires_at: expiresAtMs,
          hash_hint: hashHint,
          primary_label: primaryLabelVal,
          secondary_label: values.has_secondary ? values.secondary_label : undefined,
          value: values.value,
          secondary_value: values.has_secondary ? values.secondary_value : undefined,
        },
      });

      toast.success(t("inventory.credentialSaved"));
      form.reset();
      setShowValue(false);
      setShowSecondaryValue(false);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error(t("inventory.createFailed"));
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset();
      setShowValue(false);
      setShowSecondaryValue(false);
      setIssuerPopoverOpen(false);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inventory.createTitle")}</DialogTitle>
          <DialogDescription>{t("inventory.createDescription")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* Issuer combobox */}
            <FormField
              control={form.control}
              name="issuer_id"
              render={({ field }) => {
                const selectedIssuer = issuers.find((i) => i.id === field.value);
                const preset = selectedIssuer ? findPreset(selectedIssuer.slug) : undefined;
                const IssuerIcon = preset?.icon ?? KeyRound;

                return (
                  <FormItem>
                    <FormLabel>{t("inventory.fieldIssuer")}</FormLabel>
                    <FormControl>
                      <Popover open={issuerPopoverOpen} onOpenChange={setIssuerPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={issuerPopoverOpen}
                            aria-label={t("inventory.fieldIssuer")}
                            className="w-full justify-between font-normal"
                          >
                            {selectedIssuer ? (
                              <span className="flex items-center gap-2">
                                <IssuerIcon className="size-4 shrink-0 text-muted-foreground" />
                                {selectedIssuer.display_name}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                {t("inventory.fieldIssuerPlaceholder")}
                              </span>
                            )}
                            <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder={t("inventory.searchIssuers")} />
                            <CommandList>
                              <CommandEmpty>{t("inventory.noIssuersFound")}</CommandEmpty>
                              <CommandGroup>
                                {issuers.map((issuer) => {
                                  const p = findPreset(issuer.slug);
                                  const Icon = p?.icon ?? KeyRound;
                                  return (
                                    <CommandItem
                                      key={issuer.id}
                                      value={issuer.display_name}
                                      onSelect={() => {
                                        field.onChange(issuer.id);
                                        form.setValue(
                                          "primary_label",
                                          issuer.default_primary_label ?? "",
                                        );
                                        form.setValue(
                                          "secondary_label",
                                          issuer.default_secondary_label ?? "",
                                        );
                                        form.setValue(
                                          "has_secondary",
                                          issuer.default_secondary_label !== null,
                                        );
                                        setIssuerPopoverOpen(false);
                                      }}
                                    >
                                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                                      {issuer.display_name}
                                      <Check
                                        className={cn(
                                          "ml-auto size-4",
                                          field.value === issuer.id ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.fieldName")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("inventory.fieldNamePlaceholder")}
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Value (password field with show/hide) */}
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.fieldValue")}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showValue ? "text" : "password"}
                        placeholder={t("inventory.fieldValuePlaceholder")}
                        autoComplete="new-password"
                        aria-autocomplete="none"
                        className="pr-10"
                        {...field}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={showValue ? t("inventory.hideValue") : t("inventory.showValue")}
                        onClick={() => setShowValue((v) => !v)}
                      >
                        {showValue ? (
                          <EyeOff className="size-4" aria-hidden />
                        ) : (
                          <Eye className="size-4" aria-hidden />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Primary label (optional) */}
            <FormField
              control={form.control}
              name="primary_label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.fieldPrimaryLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("inventory.fieldPrimaryLabelPlaceholder")}
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* has_secondary toggle */}
            <FormField
              control={form.control}
              name="has_secondary"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="has_secondary"
                    />
                  </FormControl>
                  <FormLabel htmlFor="has_secondary" className="cursor-pointer font-normal">
                    {t("inventory.toggleSecondary")}
                  </FormLabel>
                </FormItem>
              )}
            />

            {/* Secondary fields — shown only when has_secondary is true */}
            {hasSecondary && (
              <>
                <FormField
                  control={form.control}
                  name="secondary_label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.fieldSecondaryLabel")}</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="secondary_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.fieldSecondaryValue")}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showSecondaryValue ? "text" : "password"}
                            autoComplete="new-password"
                            aria-autocomplete="none"
                            className="pr-10"
                            {...field}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={
                              showSecondaryValue
                                ? t("inventory.hideValue")
                                : t("inventory.showValue")
                            }
                            onClick={() => setShowSecondaryValue((v) => !v)}
                          >
                            {showSecondaryValue ? (
                              <EyeOff className="size-4" aria-hidden />
                            ) : (
                              <Eye className="size-4" aria-hidden />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* Environment */}
            <FormField
              control={form.control}
              name="env"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.fieldEnv")}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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

            {/* Scope (optional) */}
            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.fieldScope")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("inventory.fieldScopePlaceholder")}
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Expires at (optional) */}
            <FormField
              control={form.control}
              name="expires_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.fieldExpiresAt")}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
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
                {isSubmitting ? t("inventory.submitting") : t("inventory.submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
