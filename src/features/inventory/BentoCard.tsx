/**
 * BentoCard — M24 Unified Bento Inventory 카드 컴포넌트 (C-2)
 *
 * 모든 credential(api_key / password)을 동일한 카드 레이아웃으로 표시한다.
 * - api_key: issuer display_name 표시
 * - password: username 표시 + URL autofill 표시
 * - 30s reveal timer (Show/Hide 토글)
 * - Copy → credential_copy_to_clipboard
 * - ⋮ DropdownMenu (Sub-task 4에서 채워짐)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, Eye, EyeOff, Copy } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useIssuers } from "./use-issuers";
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

  // Reveal state
  const [revealed, setRevealed] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Issuer lookup for api_key kind
  const issuer = issuers.find((i) => i.id === credential.issuer_id);

  // Subtitle line: issuer name for api_key, username for password
  const subtitle =
    credential.kind === "password" ? (credential.username ?? null) : (issuer?.display_name ?? null);

  // ---------------------------------------------------------------------------
  // Cleanup timer on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Show / Hide
  // ---------------------------------------------------------------------------

  const handleShow = useCallback(async () => {
    if (revealed !== null) {
      // Already revealed — hide
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setRevealed(null);
      return;
    }

    try {
      const value = await invoke<string>("credential_reveal", { id: credential.id });
      setRevealed(value);

      // Auto-mask after 30s
      timerRef.current = setTimeout(() => {
        setRevealed(null);
        timerRef.current = null;
      }, REVEAL_TIMEOUT_MS);
    } catch {
      toast.error(t("inventory.loadDetailFailed"));
    }
  }, [revealed, credential.id, t]);

  // ---------------------------------------------------------------------------
  // Copy
  // ---------------------------------------------------------------------------

  const handleCopy = useCallback(async () => {
    try {
      await invoke("credential_copy_to_clipboard", { id: credential.id });
    } catch {
      toast.error(t("inventory.copyFailed"));
    }
  }, [credential.id, t]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isRevealed = revealed !== null;

  // Card-level click opens Detail — individual buttons stop propagation
  const handleCardClick = () => {
    onSelect?.(credential.id);
  };

  return (
    <Card
      className="group flex flex-col gap-0 overflow-hidden border-border bg-card text-card-foreground transition-shadow hover:shadow-md hover:border-[var(--color-vault-accent,hsl(var(--border)))]"
      role={onSelect !== undefined ? "button" : undefined}
      tabIndex={onSelect !== undefined ? 0 : undefined}
      onClick={handleCardClick}
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
        {/* ── Row 1: name + menu ── */}
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
            <DropdownMenuContent align="end" className="w-44">
              {/* Sub-task 4에서 채워짐 */}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── Row 2: subtitle (issuer or username) ── */}
        {subtitle !== null && (
          <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        )}

        {/* ── Row 3: masked value + Show + Copy ── */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
            {isRevealed ? revealed : MASKED}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleShow}
            aria-label={isRevealed ? t("inventory.hideValue") : t("inventory.showValue")}
          >
            {isRevealed ? (
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

        {/* ── Row 4: URL (password only, when present) ── */}
        {credential.url !== null && (
          <span className="truncate text-xs text-muted-foreground">{credential.url}</span>
        )}
      </CardContent>
    </Card>
  );
}
