/**
 * QuickAddDialog — 5초 이내 신규 자격증명 등록 (M24 Phase 2-4-a).
 *
 * 필드: URL / username / password / name(선택) / kind(toggle)
 * - mount 시 클립보드에서 URL 자동 채움 (한 번만, URL 패턴 일치 시)
 * - URL onChange → matchIssuerByUrl → issuer 슬러그 표시
 * - "전체 옵션 보기" → CreateCredentialDialog(풀 폼)로 전환
 * - submit 직후 password state 비움
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, ExternalLink, Zap } from "lucide-react";

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

import { matchIssuerByUrl } from "./match-issuer-by-url";
import { useIssuers } from "./use-issuers";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const URL_PATTERN = /^https?:\/\/.+/;

const schema = z.object({
  url: z.string().optional(),
  username: z.string().optional(),
  kind: z.enum(["api_key", "password"]),
  value: z.string().min(1, { message: "__required__" }),
  name: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** "전체 옵션 보기" 클릭 시 호출 — prefill 값 전달 */
  onShowFullForm: (prefill: {
    url?: string;
    username?: string;
    value?: string;
    name?: string;
    kind: "api_key" | "password";
  }) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickAddDialog({
  open,
  onOpenChange,
  onSuccess,
  onShowFullForm,
}: QuickAddDialogProps) {
  const { t } = useTranslation("common");
  const { issuers } = useIssuers();

  const [showValue, setShowValue] = useState(false);
  const [fromClipboard, setFromClipboard] = useState(false);
  const [detectedIssuerName, setDetectedIssuerName] = useState<string | null>(null);

  const clipboardReadDone = useRef(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      url: "",
      username: "",
      kind: "password",
      value: "",
      name: "",
    },
  });

  const kind = form.watch("kind");
  const isSubmitting = form.formState.isSubmitting;

  // ---------------------------------------------------------------------------
  // 클립보드 prefill — mount 시 한 번만 (URL 패턴 일치 시)
  // ---------------------------------------------------------------------------

  const tryPrefillFromClipboard = useCallback(async () => {
    if (clipboardReadDone.current) return;
    clipboardReadDone.current = true;

    try {
      const text = await readText();
      if (text && URL_PATTERN.test(text.trim())) {
        form.setValue("url", text.trim());
        setFromClipboard(true);
        // URL 감지 후 issuer 자동 매칭
        detectIssuer(text.trim());
      }
    } catch {
      // 클립보드 권한 없음 또는 빈 클립보드 — 무시
    }
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) {
      clipboardReadDone.current = false;
      void tryPrefillFromClipboard();
    } else {
      // 닫힐 때 상태 초기화
      setFromClipboard(false);
      setDetectedIssuerName(null);
      setShowValue(false);
      form.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Issuer 자동 감지
  // ---------------------------------------------------------------------------

  function detectIssuer(rawUrl: string) {
    const preset = matchIssuerByUrl(rawUrl);
    if (preset) {
      setDetectedIssuerName(preset.display_name);
      // github, openai 등 api_key 형 issuer 는 kind 를 api_key 로 자동 설정
      // (domains 가 있는 모든 preset 이 api_key 는 아니므로 간단히 preset slug 기반 판단)
      const API_KEY_ISSUERS = new Set([
        "openai",
        "stripe",
        "github",
        "aws",
        "vercel",
        "supabase",
        "resend",
        "sendgrid",
        "twilio",
      ]);
      if (API_KEY_ISSUERS.has(preset.slug)) {
        form.setValue("kind", "api_key");
      }
    } else {
      setDetectedIssuerName(null);
    }
  }

  function handleUrlChange(rawUrl: string) {
    form.setValue("url", rawUrl);
    detectIssuer(rawUrl);
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function onSubmit(values: FormValues) {
    // name fallback: issuer name or URL host
    let name = values.name?.trim();
    if (!name) {
      if (detectedIssuerName) {
        name = detectedIssuerName;
      } else if (values.url) {
        try {
          const u = new URL(values.url.startsWith("http") ? values.url : "https://" + values.url);
          name = u.hostname.replace(/^www\./, "");
        } catch {
          name = "Credential";
        }
      } else {
        name = "Credential";
      }
    }

    // issuer_id: issuer slug 로 DB 에서 찾기
    const preset = values.url ? matchIssuerByUrl(values.url) : undefined;
    const matchedIssuer = preset ? issuers.find((i) => i.slug === preset.slug) : undefined;

    // issuer 미인식 시 "Uncategorized" 버킷으로 (이전엔 issuers[0]=AWS 로 오분류).
    const uncategorizedId = issuers.find((i) => i.slug === "unknown")?.id;
    const issuer_id = matchedIssuer?.id ?? uncategorizedId ?? issuers[0]?.id ?? "";

    const urlVal = values.url?.trim() || undefined;
    const usernameVal = values.username?.trim() || undefined;
    const hashHint = values.value.slice(-4);

    try {
      await invoke<string>("credential_create", {
        args: {
          kind: values.kind,
          issuer_id,
          name,
          url: urlVal,
          username: usernameVal,
          env: "prod",
          scope: undefined,
          expires_at: undefined,
          hash_hint: hashHint,
          primary_label: undefined,
          secondary_label: undefined,
          value: values.value,
          secondary_value: undefined,
        },
      });

      toast.success(t("quickAdd.success", { name }));

      // password state 즉시 비움
      form.setValue("value", "");
      form.reset();

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error(t("inventory.createFailed"));
    }
  }

  // ---------------------------------------------------------------------------
  // "전체 옵션 보기" 전환
  // ---------------------------------------------------------------------------

  function handleShowFullForm() {
    const values = form.getValues();
    onShowFullForm({
      url: values.url?.trim() || undefined,
      username: values.username?.trim() || undefined,
      value: values.value,
      name: values.name?.trim() || undefined,
      kind: values.kind,
    });
    // password state 비움
    form.setValue("value", "");
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.setValue("value", "");
      form.reset();
    }
    onOpenChange(next);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-muted-foreground" aria-hidden />
            <DialogTitle>{t("quickAdd.title")}</DialogTitle>
          </div>
          <DialogDescription>{t("quickAdd.description")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            {/* URL */}
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("quickAdd.fields.url")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com"
                      autoComplete="url"
                      {...field}
                      onChange={(e) => handleUrlChange(e.target.value)}
                    />
                  </FormControl>
                  {/* 클립보드 자동 채움 표시 */}
                  {fromClipboard && field.value && (
                    <p className="text-xs text-muted-foreground">{t("quickAdd.fromClipboard")}</p>
                  )}
                  {/* Issuer 자동 감지 표시 */}
                  {detectedIssuerName && (
                    <p className="text-xs text-muted-foreground" data-testid="issuer-detected">
                      {t("quickAdd.issuerDetected", { issuer: detectedIssuerName })}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Username */}
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("quickAdd.fields.username")}</FormLabel>
                  <FormControl>
                    <Input placeholder="user@example.com" autoComplete="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Password / API Key */}
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("quickAdd.fields.password")}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showValue ? "text" : "password"}
                        placeholder={
                          kind === "api_key"
                            ? t("quickAdd.kindToggle.apiKey")
                            : t("quickAdd.kindToggle.password")
                        }
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

            {/* Name (선택) */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("quickAdd.fields.name")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={detectedIssuerName ?? "My credential"}
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Kind toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Kind:</span>
              <div className="flex rounded-md border">
                <button
                  type="button"
                  className={`px-3 py-1 text-sm rounded-l-md transition-colors ${
                    kind === "password"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => form.setValue("kind", "password")}
                  aria-pressed={kind === "password"}
                >
                  {t("quickAdd.kindToggle.password")}
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 text-sm rounded-r-md transition-colors ${
                    kind === "api_key"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => form.setValue("kind", "api_key")}
                  aria-pressed={kind === "api_key"}
                >
                  {t("quickAdd.kindToggle.apiKey")}
                </button>
              </div>
            </div>

            <DialogFooter className="mt-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {/* 전체 옵션 보기 */}
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={handleShowFullForm}
                data-testid="show-full-options"
              >
                <ExternalLink className="size-3" aria-hidden />
                {t("quickAdd.fullOptions")}
              </button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                  disabled={isSubmitting}
                >
                  {t("quickAdd.cancel")}
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? t("inventory.submitting") : t("quickAdd.submit")}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
