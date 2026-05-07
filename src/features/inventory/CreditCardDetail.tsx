/**
 * CreditCardDetail — Phase 3-A-5
 *
 * 신용카드 상세 뷰. reveal / copy 버튼 + 30초 자동 클리어 (GATE 2-2 / B.5-2).
 *
 * 보안 규칙:
 *   - 평문 카드번호 / CVC 를 localStorage / sessionStorage 에 저장 금지.
 *   - reveal 결과는 메모리에만 보관하고 30초 후 자동 클리어 (B.5-2).
 *   - 에러 메시지는 범용 — credential_id / vault 경로 미포함 (B.1-9).
 *   - console.log 에 평문 카드번호 / CVC 금지.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Eye, EyeOff, Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreditCardVisual } from "@/components/ui/credit-card-visual";
import { type CardBrand, maskCardNumber, formatCardNumber } from "@/lib/card-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Matches Rust `CreditCardSummary` (serde snake_case). */
export interface CreditCardSummary {
  credential_id: string;
  brand: CardBrand;
  expiry_month: number;
  expiry_year: number;
  cardholder_name?: string;
  /** billing_address is only in meta, not in CreditCardSummary — kept optional for detail views */
  billing_address?: string;
  last_4: string;
}

interface CreditCardDetailProps {
  credential: CreditCardSummary;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 30 seconds — GATE 2-2 / B.5-2 */
const REVEAL_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// FieldRow helper component
// ---------------------------------------------------------------------------

interface FieldRowProps {
  label: string;
  value: string;
  onReveal?: () => void;
  onCopy?: () => void;
  revealed?: boolean;
  loading?: boolean;
}

function FieldRow({ label, value, onReveal, onCopy, revealed, loading }: FieldRowProps) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono">{value}</p>
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-1">
        {onReveal && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
            onClick={onReveal}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : revealed ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </Button>
        )}
        {onCopy && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Copy ${label}`}
            onClick={onCopy}
          >
            <Copy className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreditCardDetail
// ---------------------------------------------------------------------------

export function CreditCardDetail({ credential }: CreditCardDetailProps) {
  const [revealedCardNumber, setRevealedCardNumber] = useState<string | null>(null);
  const [revealedCvc, setRevealedCvc] = useState<string | null>(null);
  const cardNumTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cvcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState({ cardNum: false, cvc: false });

  // Unmount: clear all timers (memory leak prevention)
  useEffect(() => {
    return () => {
      if (cardNumTimer.current) clearTimeout(cardNumTimer.current);
      if (cvcTimer.current) clearTimeout(cvcTimer.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Reveal card number (toggle)
  // -------------------------------------------------------------------------
  const handleRevealCardNumber = useCallback(async () => {
    if (revealedCardNumber !== null) {
      // Already revealed → immediate clear (toggle off)
      if (cardNumTimer.current) {
        clearTimeout(cardNumTimer.current);
        cardNumTimer.current = null;
      }
      setRevealedCardNumber(null);
      return;
    }

    setLoading((s) => ({ ...s, cardNum: true }));
    try {
      const value = await invoke<string>("reveal_card_number", {
        credentialId: credential.credential_id,
      });
      setRevealedCardNumber(value);
      // 30-second auto-clear (GATE 2-2 / B.5-2)
      cardNumTimer.current = setTimeout(() => {
        setRevealedCardNumber(null);
        cardNumTimer.current = null;
      }, REVEAL_TIMEOUT_MS);
    } catch {
      toast.error("Failed to reveal card number"); // generic (B.1-9)
    } finally {
      setLoading((s) => ({ ...s, cardNum: false }));
    }
  }, [revealedCardNumber, credential.credential_id]);

  // -------------------------------------------------------------------------
  // Reveal CVC (toggle)
  // -------------------------------------------------------------------------
  const handleRevealCvc = useCallback(async () => {
    if (revealedCvc !== null) {
      // Already revealed → immediate clear (toggle off)
      if (cvcTimer.current) {
        clearTimeout(cvcTimer.current);
        cvcTimer.current = null;
      }
      setRevealedCvc(null);
      return;
    }

    setLoading((s) => ({ ...s, cvc: true }));
    try {
      const value = await invoke<string>("reveal_cvc", {
        credentialId: credential.credential_id,
      });
      setRevealedCvc(value);
      // 30-second auto-clear (GATE 2-2 / B.5-2)
      cvcTimer.current = setTimeout(() => {
        setRevealedCvc(null);
        cvcTimer.current = null;
      }, REVEAL_TIMEOUT_MS);
    } catch {
      toast.error("Failed to reveal CVC"); // generic (B.1-9)
    } finally {
      setLoading((s) => ({ ...s, cvc: false }));
    }
  }, [revealedCvc, credential.credential_id]);

  // -------------------------------------------------------------------------
  // Copy card number (reveal-then-copy pattern)
  // -------------------------------------------------------------------------
  const handleCopyCardNumber = useCallback(async () => {
    let value: string;
    if (revealedCardNumber !== null) {
      value = revealedCardNumber;
    } else {
      // Reveal once for copy — do NOT set state (minimize memory exposure)
      try {
        value = await invoke<string>("reveal_card_number", {
          credentialId: credential.credential_id,
        });
      } catch {
        toast.error("Failed to copy card number");
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Card number copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  }, [revealedCardNumber, credential.credential_id]);

  // -------------------------------------------------------------------------
  // Copy CVC
  // -------------------------------------------------------------------------
  const handleCopyCvc = useCallback(async () => {
    let value: string;
    if (revealedCvc !== null) {
      value = revealedCvc;
    } else {
      try {
        value = await invoke<string>("reveal_cvc", {
          credentialId: credential.credential_id,
        });
      } catch {
        toast.error("Failed to copy CVC");
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success("CVC copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  }, [revealedCvc, credential.credential_id]);

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------
  const cardNumberDisplay = revealedCardNumber
    ? formatCardNumber(revealedCardNumber, credential.brand)
    : maskCardNumber(credential.last_4, credential.brand);

  const cvcDisplay = revealedCvc ?? (credential.brand === "amex" ? "••••" : "•••");

  const expiryDisplay = `${String(credential.expiry_month).padStart(2, "0")} / ${credential.expiry_year}`;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* 3D flip card preview */}
      <CreditCardVisual
        last4={credential.last_4}
        brand={credential.brand}
        cardholderName={credential.cardholder_name}
        expiryMonth={credential.expiry_month}
        expiryYear={credential.expiry_year}
        cvcRevealed={revealedCvc !== null}
        revealedCvc={revealedCvc ?? undefined}
        revealedCardNumber={revealedCardNumber ?? undefined}
        onFlipRequest={handleRevealCvc}
      />

      {/* Field list */}
      <div className="space-y-2">
        {/* Card number */}
        <FieldRow
          label="Card Number"
          value={cardNumberDisplay}
          onReveal={handleRevealCardNumber}
          onCopy={handleCopyCardNumber}
          revealed={revealedCardNumber !== null}
          loading={loading.cardNum}
        />

        {/* Expiry — plaintext, always visible */}
        <FieldRow label="Expiry" value={expiryDisplay} />

        {/* CVC */}
        <FieldRow
          label="CVC"
          value={cvcDisplay}
          onReveal={handleRevealCvc}
          onCopy={handleCopyCvc}
          revealed={revealedCvc !== null}
          loading={loading.cvc}
        />

        {/* Cardholder name — plaintext, always visible */}
        {credential.cardholder_name && (
          <FieldRow label="Cardholder" value={credential.cardholder_name} />
        )}

        {/* Billing address — plaintext, always visible */}
        {credential.billing_address && (
          <FieldRow label="Billing Address" value={credential.billing_address} />
        )}
      </div>
    </div>
  );
}
