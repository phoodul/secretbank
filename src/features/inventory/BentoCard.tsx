/**
 * BentoCard — M24 Unified Bento Inventory 카드 컴포넌트 (C-2 정정, 1.5-E 확장)
 *
 * 레이아웃:
 *   Row 1 — name (라벨 없이 평문) + ⋮ 메뉴
 *   Row 2 — "URL:" 라벨 + 값 (password only, 평문)
 *   Row 3 — "ID:" 라벨 + 마스킹/평문 + [보기] 토글 (password: username 마스킹, api_key: issuer name 평문)
 *   Row 4 — primary_label ?? ("PW:" | "API Key:") + 마스킹/평문 + [보기] + [복사]
 *   Row 5 — (has_secondary 일 때) secondary_label ?? "Secret" + 마스킹/평문 + [보기] + [복사]
 *
 * - ID reveal: client-side useState toggle (Tauri 호출 없음), 30s 후 자동 마스킹
 * - PW/SK reveal: credential_reveal Tauri command + 30s 자동 마스킹 (독립 타이머)
 * - slot: "primary" / "secondary" 로 Tauri 호출 시 명시
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  ExternalLink,
  GitFork,
  MoreHorizontal,
  Eye,
  EyeOff,
  Copy,
  Crosshair,
  ShieldAlert,
  User,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useIssuers } from "./use-issuers";
import { MiniGraph } from "./MiniGraph";
import type { CredentialSummary } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REVEAL_TIMEOUT_MS = 30_000;
const MASKED = "•••••••••••••";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BentoCardProps {
  credential: CredentialSummary;
  onSelect?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BentoCard({ credential, onSelect }: BentoCardProps) {
  const { t } = useTranslation("common");
  const { issuers } = useIssuers();

  // PW reveal state (Tauri command, primary slot)
  const [revealedPw, setRevealedPw] = useState<string | null>(null);
  const pwTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ID reveal state (client-side toggle, password only)
  const [idRevealed, setIdRevealed] = useState(false);
  const idTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Secondary reveal state (Tauri command, secondary slot)
  const [revealedSk, setRevealedSk] = useState<string | null>(null);
  const skTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hover state for mini-graph expand
  const [hovered, setHovered] = useState(false);
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Issuer lookup
  const issuer = issuers.find((i) => i.id === credential.issuer_id);

  // ---------------------------------------------------------------------------
  // Cleanup timers on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (pwTimerRef.current !== null) clearTimeout(pwTimerRef.current);
      if (idTimerRef.current !== null) clearTimeout(idTimerRef.current);
      if (skTimerRef.current !== null) clearTimeout(skTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // ID reveal (client-side, password only)
  // ---------------------------------------------------------------------------

  const handleIdReveal = useCallback(() => {
    if (idRevealed) {
      if (idTimerRef.current !== null) clearTimeout(idTimerRef.current);
      setIdRevealed(false);
      return;
    }

    setIdRevealed(true);
    idTimerRef.current = setTimeout(() => {
      setIdRevealed(false);
      idTimerRef.current = null;
    }, REVEAL_TIMEOUT_MS);
  }, [idRevealed]);

  // ---------------------------------------------------------------------------
  // PW Show / Hide (Tauri command)
  // ---------------------------------------------------------------------------

  const handlePwShow = useCallback(async () => {
    if (revealedPw !== null) {
      if (pwTimerRef.current !== null) clearTimeout(pwTimerRef.current);
      setRevealedPw(null);
      return;
    }

    try {
      const value = await invoke<string>("credential_reveal", {
        id: credential.id,
        slot: "primary",
      });
      setRevealedPw(value);

      pwTimerRef.current = setTimeout(() => {
        setRevealedPw(null);
        pwTimerRef.current = null;
      }, REVEAL_TIMEOUT_MS);
    } catch {
      toast.error(t("inventory.loadDetailFailed"));
    }
  }, [revealedPw, credential.id, t]);

  // ---------------------------------------------------------------------------
  // Secondary Key Show / Hide (Tauri command)
  // ---------------------------------------------------------------------------

  const handleSkShow = useCallback(async () => {
    if (revealedSk !== null) {
      if (skTimerRef.current !== null) clearTimeout(skTimerRef.current);
      setRevealedSk(null);
      return;
    }

    try {
      const value = await invoke<string>("credential_reveal", {
        id: credential.id,
        slot: "secondary",
      });
      setRevealedSk(value);

      skTimerRef.current = setTimeout(() => {
        setRevealedSk(null);
        skTimerRef.current = null;
      }, REVEAL_TIMEOUT_MS);
    } catch {
      toast.error(t("inventory.loadDetailFailed"));
    }
  }, [revealedSk, credential.id, t]);

  // ---------------------------------------------------------------------------
  // Copy
  // ---------------------------------------------------------------------------

  const handleCopy = useCallback(async () => {
    try {
      await invoke("credential_copy_to_clipboard", { id: credential.id, slot: "primary" });
    } catch {
      toast.error(t("inventory.copyFailed"));
    }
  }, [credential.id, t]);

  const handleSkCopy = useCallback(async () => {
    try {
      await invoke("credential_copy_to_clipboard", { id: credential.id, slot: "secondary" });
    } catch {
      toast.error(t("inventory.copyFailed"));
    }
  }, [credential.id, t]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const isPwRevealed = revealedPw !== null;
  const isSkRevealed = revealedSk !== null;

  // PW row 라벨: primary_label 우선, 없으면 kind fallback
  const pwLabel =
    credential.primary_label ??
    (credential.kind === "api_key" ? t("inventory.card.keyLabel") : t("inventory.card.pwLabel"));

  // Secondary row 라벨: secondary_label 우선, 없으면 "Secret" fallback
  const skLabel = credential.secondary_label ?? t("inventory.card.secondaryLabel");

  // ID row: password → username 마스킹, api_key → issuer name 평문
  const hasIdRow =
    credential.kind === "password"
      ? credential.username !== null
      : issuer?.display_name !== undefined;

  const idPlainText = credential.kind === "api_key" ? (issuer?.display_name ?? null) : null;

  // password username (평문이지만 표시용으로만; 값은 credential.username)
  const usernameValue = credential.kind === "password" ? (credential.username ?? null) : null;

  // Card-level click opens Detail
  const handleCardClick = () => {
    onSelect?.(credential.id);
  };

  return (
    <Card
      className="group flex flex-col gap-0 overflow-hidden border-border bg-card text-card-foreground transition-shadow hover:shadow-md hover:border-[var(--color-vault-accent,hsl(var(--border)))]"
      role={onSelect !== undefined ? "button" : undefined}
      tabIndex={onSelect !== undefined ? 0 : undefined}
      onClick={handleCardClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onKeyDown={
        onSelect !== undefined
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(credential.id);
              }
            }
          : undefined
      }
    >
      <CardContent className="flex flex-col gap-2 p-4">
        {/* ── Row 1: name + ⋮ menu ── */}
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-medium leading-tight">{credential.name}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={t("inventory.bentoMoreOptions")}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* ── 공통 ── */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(credential.id);
                }}
              >
                <ExternalLink className="mr-2 h-3.5 w-3.5" aria-hidden />
                {t("inventory.bentoViewDetail")}
              </DropdownMenuItem>

              {/* ── password 전용 ── */}
              {credential.kind === "password" && credential.username !== null && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    void navigator.clipboard.writeText(credential.username!);
                  }}
                >
                  <User className="mr-2 h-3.5 w-3.5" aria-hidden />
                  {t("inventory.bentoCopyUsername")}
                </DropdownMenuItem>
              )}
              {credential.kind === "password" && credential.url !== null && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    void navigator.clipboard.writeText(credential.url!);
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" aria-hidden />
                  {t("inventory.bentoCopyUrl")}
                </DropdownMenuItem>
              )}
              {credential.kind === "password" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info(t("inventory.m7ComingSoon"));
                    }}
                  >
                    <ShieldAlert className="mr-2 h-3.5 w-3.5" aria-hidden />
                    {t("inventory.bentoCheckBreach")}
                  </DropdownMenuItem>
                </>
              )}

              {/* ── api_key 전용 ── */}
              {credential.kind === "api_key" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info(t("inventory.m7ComingSoon"));
                    }}
                  >
                    <GitFork className="mr-2 h-3.5 w-3.5" aria-hidden />
                    {t("inventory.bentoViewGraph")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info(t("inventory.m7ComingSoon"));
                    }}
                  >
                    <Crosshair className="mr-2 h-3.5 w-3.5" aria-hidden />
                    {t("inventory.bentoBlastRadius")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── Row 2: URL (password only, when present) ── */}
        {credential.url !== null && (
          <div className="flex items-center gap-1 min-w-0">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {t("inventory.card.urlLabel")}
            </span>
            <span className="truncate text-xs text-muted-foreground">{credential.url}</span>
          </div>
        )}

        {/* ── Row 3: ID (username masked / issuer plain) ── */}
        {hasIdRow && (
          <div className="flex items-center gap-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {t("inventory.card.idLabel")}
            </span>
            {credential.kind === "api_key" ? (
              /* api_key: issuer name 평문 — reveal 버튼 없음 */
              <span className="truncate text-xs text-muted-foreground">{idPlainText}</span>
            ) : (
              /* password: username 마스킹 + reveal 토글 */
              <>
                <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                  {idRevealed ? usernameValue : MASKED}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={handleIdReveal}
                  aria-label={idRevealed ? t("inventory.card.hide") : t("inventory.card.show")}
                >
                  {idRevealed ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {/* ── Row 4: PW / Key + reveal + copy (primary slot) ── */}
        <div className="flex items-center gap-1 min-w-0" onClick={(e) => e.stopPropagation()}>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">{pwLabel}</span>
          <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
            {isPwRevealed ? revealedPw : MASKED}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handlePwShow}
            aria-label={isPwRevealed ? t("inventory.card.hide") : t("inventory.card.show")}
          >
            {isPwRevealed ? (
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            aria-label={t("inventory.copyValue")}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>

        {/* ── Row 5: Secondary key + reveal + copy (secondary slot, has_secondary only) ── */}
        {credential.has_secondary && (
          <div className="flex items-center gap-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{skLabel}</span>
            <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
              {isSkRevealed ? revealedSk : MASKED}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={handleSkShow}
              aria-label={isSkRevealed ? t("inventory.card.hide") : t("inventory.card.show")}
            >
              {isSkRevealed ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={handleSkCopy}
              aria-label={t("inventory.copyValue")}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        )}

        {/* ── Mini dependency graph (hover/focus expand) ── */}
        {hovered && (
          <div
            className={reducedMotion ? "" : "overflow-hidden transition-all duration-200"}
            onClick={(e) => e.stopPropagation()}
          >
            <MiniGraph credentialId={credential.id} credentialName={credential.name} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
