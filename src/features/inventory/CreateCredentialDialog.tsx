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

import { ProjectCombobox } from "./ProjectCombobox";
import { linkCredentialToProject } from "./link-credential-to-project";
import { useIssuers } from "./use-issuers";
import { findPreset } from "./issuer-presets";
import { matchIssuerByUrl } from "./match-issuer-by-url";
import { CreditCardForm } from "./CreditCardForm";
import type { CreditCardFormValues } from "./CreditCardForm";
import type { CardBrand } from "@/lib/card-utils";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const schema = z
  .object({
    kind: z.enum(["api_key", "password", "credit_card", "other"]),
    issuer_id: z.string().min(1),
    name: z.string().min(1).max(100),
    url: z
      .string()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    username: z
      .string()
      .optional()
      .or(z.literal("").transform(() => undefined)),
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
    custom_kind_label: z.string().optional(),
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
  // Track whether the user manually selected an issuer — when true, URL auto-detect is disabled.
  const [issuerLockedByUser, setIssuerLockedByUser] = useState(false);
  // 선택적 "관련 Project" 묶기 — 모든 종류(카드 포함) 공통. "" = 묶지 않음.
  const [projectId, setProjectId] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: "api_key",
      issuer_id: "",
      name: "",
      url: "",
      username: "",
      env: "prod",
      scope: "",
      expires_at: "",
      value: "",
      primary_label: "",
      has_secondary: false,
      secondary_value: "",
      secondary_label: "",
      custom_kind_label: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;
  const hasSecondary = form.watch("has_secondary");
  const kind = form.watch("kind");
  const isCreditCard = kind === "credit_card";

  async function onSubmit(values: FormValues) {
    const expiresAtMs =
      values.expires_at && values.expires_at !== ""
        ? new Date(values.expires_at).getTime()
        : undefined;

    const scopeVal = values.scope === "" || values.scope === undefined ? undefined : values.scope;
    const urlVal = values.url === "" || values.url === undefined ? undefined : values.url;
    const usernameVal =
      values.username === "" || values.username === undefined ? undefined : values.username;

    const hashHint = values.value.slice(-4);

    const primaryLabelVal =
      values.primary_label === "" || values.primary_label === undefined
        ? undefined
        : values.primary_label;

    try {
      const credentialId = await invoke<string>("credential_create", {
        args: {
          kind: values.kind,
          issuer_id: values.issuer_id,
          name: values.name,
          url: urlVal,
          username: usernameVal,
          env: values.env,
          scope: scopeVal,
          expires_at: expiresAtMs,
          hash_hint: hashHint,
          primary_label: primaryLabelVal,
          secondary_label: values.has_secondary ? values.secondary_label : undefined,
          custom_kind_label:
            values.kind === "other" ? values.custom_kind_label?.trim() || undefined : undefined,
          value: values.value,
          secondary_value: values.has_secondary ? values.secondary_value : undefined,
        },
      });

      // 선택한 Project 로 묶기 — 실패해도 자격증명 생성은 유지(경고만).
      if (projectId) {
        try {
          await linkCredentialToProject(credentialId, projectId);
        } catch {
          toast.warning(t("inventory.projectLinkFailed"));
        }
      }

      toast.success(t("inventory.credentialSaved"));
      form.reset();
      setProjectId("");
      setShowValue(false);
      setShowSecondaryValue(false);
      setIssuerLockedByUser(false);
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
      setProjectId("");
      setShowValue(false);
      setShowSecondaryValue(false);
      setIssuerPopoverOpen(false);
      setIssuerLockedByUser(false);
    }
    onOpenChange(next);
  }

  /** Handle URL field change — auto-select issuer when not locked by user. */
  function handleUrlChange(rawUrl: string) {
    form.setValue("url", rawUrl);
    if (issuerLockedByUser) return;

    const matched = matchIssuerByUrl(rawUrl);
    if (!matched) return;

    const matchedIssuer = issuers.find((i) => i.slug === matched.slug);
    if (!matchedIssuer) return;

    // Only update if it actually changes to avoid unnecessary re-renders
    if (form.getValues("issuer_id") === matchedIssuer.id) return;

    form.setValue("issuer_id", matchedIssuer.id);
    form.setValue("primary_label", matchedIssuer.default_primary_label ?? "");
    form.setValue("secondary_label", matchedIssuer.default_secondary_label ?? "");
    form.setValue("has_secondary", matchedIssuer.default_secondary_label !== null);
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
            {/* Kind selector — always visible */}
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.fieldKind")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label={t("inventory.fieldKind")}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="api_key">{t("inventory.kindApiKey")}</SelectItem>
                      <SelectItem value="password">{t("inventory.kindPassword")}</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="other">{t("quickAdd.kindToggle.other")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* kind=other 일 때 사용자 정의 종류명 */}
            {kind === "other" && (
              <FormField
                control={form.control}
                name="custom_kind_label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("quickAdd.fields.customKind")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("quickAdd.fields.customKindPlaceholder")}
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* 관련 Project 묶기 (선택) — 모든 종류 공통. 한 프로젝트에 로그인·카드·API 통합 보관. */}
            <FormItem>
              <FormLabel>{t("inventory.fieldProject")}</FormLabel>
              <FormControl>
                <ProjectCombobox
                  value={projectId}
                  onChange={setProjectId}
                  disabled={isSubmitting}
                />
              </FormControl>
              <p className="text-muted-foreground text-xs">{t("inventory.fieldProjectHint")}</p>
            </FormItem>

            {/* Credit card form — replaces all other fields when kind=credit_card */}
            {isCreditCard && (
              <CreditCardForm
                onSubmit={async (
                  values: CreditCardFormValues & { brand: CardBrand; last_4: string },
                ) => {
                  const issuerId =
                    issuers.find((i) => i.slug === "unknown")?.id ?? issuers[0]?.id ?? "";
                  try {
                    const summary = await invoke<{ credential_id: string }>("create_credit_card", {
                      input: {
                        issuer_id: issuerId,
                        name: values.cardholder_name?.trim()
                          ? `${values.brand.charAt(0).toUpperCase() + values.brand.slice(1)} •••• ${values.last_4}`
                          : `${values.brand.charAt(0).toUpperCase() + values.brand.slice(1)} •••• ${values.last_4}`,
                        brand: values.brand,
                        expiry_month: values.expiry_month,
                        expiry_year: values.expiry_year,
                        cardholder_name: values.cardholder_name || null,
                        billing_address: values.billing_address || null,
                        last_4: values.last_4,
                        card_number_plain: values.card_number_plain,
                        cvc_plain: values.cvc_plain,
                      },
                    });
                    // 카드도 선택한 Project 로 묶기 (한 프로젝트에 카드·비번·API 통합 보관).
                    if (projectId && summary?.credential_id) {
                      try {
                        await linkCredentialToProject(summary.credential_id, projectId);
                      } catch {
                        toast.warning(t("inventory.projectLinkFailed"));
                      }
                    }
                    toast.success(t("inventory.credentialSaved"));
                    form.reset();
                    setProjectId("");
                    onOpenChange(false);
                    onSuccess();
                  } catch {
                    toast.error(t("inventory.createFailed"));
                  }
                }}
                onCancel={() => handleOpenChange(false)}
                submitting={isSubmitting}
              />
            )}

            {/* api_key / password fields */}
            {!isCreditCard && (
              <>
                {/* URL */}
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.fieldUrl")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            kind === "password"
                              ? t("inventory.fieldUrlPlaceholderPassword")
                              : t("inventory.fieldUrlPlaceholderApiKey")
                          }
                          autoComplete="url"
                          {...field}
                          onChange={(e) => handleUrlChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                                            // Lock issuer — user made an explicit choice
                                            setIssuerLockedByUser(true);
                                            setIssuerPopoverOpen(false);
                                          }}
                                        >
                                          <Icon className="size-4 shrink-0 text-muted-foreground" />
                                          {issuer.display_name}
                                          <Check
                                            className={cn(
                                              "ml-auto size-4",
                                              field.value === issuer.id
                                                ? "opacity-100"
                                                : "opacity-0",
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

                {/* Username — only visible when kind=password */}
                {kind === "password" && (
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.fieldUsername")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("inventory.fieldUsernamePlaceholder")}
                            autoComplete="username"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

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
                            aria-label={
                              showValue ? t("inventory.hideValue") : t("inventory.showValue")
                            }
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
              </>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
