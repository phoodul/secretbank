import * as React from "react";
import { useTranslation } from "react-i18next";
import { Printer, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Charter DTO from Tauri backend (matches `commands::vault::CharterDto`). */
export interface CharterDto {
  words: string[];
  verifier: number;
  formatted: string;
}

/** Shamir share DTO (matches `commands::vault::ShamirShareDto`). */
export interface ShamirShareDto {
  index: number;
  words: string[];
  verifier: number;
  formatted: string;
}

/** Tagged enum from backend (`CharterIssuanceDto`). */
export type CharterIssuanceDto =
  | { kind: "none" }
  | { kind: "single"; charter: CharterDto }
  | { kind: "shamir2of3"; shares: ShamirShareDto[] };

interface CharterDisplayProps {
  issuance: CharterIssuanceDto;
  onDone: () => void;
}

/**
 * "Vault Charter" 출력 컴포넌트 — Lapis Vault 톤.
 *
 * 인쇄 버튼은 `window.print()` 를 호출하지만, 인쇄 시에는 `print:` 미디어 쿼리로
 * 다른 화면 영역을 hide 한다 (CSS 는 `globals.css` 의 `@media print`).
 *
 * 보안: charter 는 1회 화면 표시 후 React state 에서 폐기되어야 한다.
 * 이 컴포넌트는 unmount 시 자동 정리 (parent 가 issuance 를 null 로).
 */
export function CharterDisplay({ issuance, onDone }: CharterDisplayProps) {
  const { t } = useTranslation("common");
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  function handlePrint() {
    window.print();
  }

  function handleDoneClick() {
    setConfirmOpen(true);
  }

  function handleConfirmYes() {
    setConfirmOpen(false);
    onDone();
  }

  if (issuance.kind === "none") {
    // Should not be rendered in this branch — defensive.
    return null;
  }

  return (
    <div data-charter-print-region className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5 print:gap-1">
        <h2 className="text-2xl font-semibold tracking-tight text-vault-gold-bright">
          {t("vault.charter.issuanceTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("vault.charter.issuanceSubtitle")}</p>
      </header>

      {/* Warning banner — only on screen, not on print */}
      <div
        className="flex gap-3 rounded-md border border-vault-danger/40 bg-vault-danger/10 p-3 print:hidden"
        role="alert"
      >
        <ShieldAlert className="h-5 w-5 shrink-0 text-vault-danger" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-vault-danger">
            {t("vault.charter.warningHeader")}
          </p>
          <p className="text-xs text-foreground/80">{t("vault.charter.warningBody")}</p>
        </div>
      </div>

      {/* Charter body */}
      {issuance.kind === "single" && <SingleCharterCard charter={issuance.charter} />}
      {issuance.kind === "shamir2of3" && <ShamirSharesCard shares={issuance.shares} />}

      {/* Action footer — hidden on print */}
      <footer className="flex justify-end gap-2 print:hidden">
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" aria-hidden />
          {t("vault.charter.printButton")}
        </Button>
        <Button onClick={handleDoneClick}>{t("vault.charter.doneButton")}</Button>
      </footer>

      {confirmOpen && (
        <ConfirmDoneOverlay onCancel={() => setConfirmOpen(false)} onConfirm={handleConfirmYes} />
      )}
    </div>
  );
}

interface SingleCharterCardProps {
  charter: CharterDto;
}

function SingleCharterCard({ charter }: SingleCharterCardProps) {
  return (
    <div className="rounded-lg border-2 border-vault-gold/40 bg-vault-lapis-deep/40 p-6 shadow-inner print:border-black print:bg-white print:text-black">
      <CharterArtwork serialOf={charter.verifier} />
      <CharterWordsGrid words={charter.words} />
      <VerifierLine verifier={charter.verifier} />
    </div>
  );
}

interface ShamirSharesCardProps {
  shares: ShamirShareDto[];
}

function ShamirSharesCard({ shares }: ShamirSharesCardProps) {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-col gap-4">
      {shares.map((sh) => (
        <div
          key={sh.index}
          className="rounded-lg border-2 border-vault-gold/40 bg-vault-lapis-deep/40 p-5 shadow-inner break-inside-avoid print:border-black print:bg-white print:text-black"
        >
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-vault-gold-bright print:text-black">
            {t("vault.charter.shareLabel", { index: sh.index })}
          </h3>
          <CharterArtwork serialOf={(sh.index << 12) | sh.verifier} compact />
          <CharterWordsGrid words={sh.words} />
          <VerifierLine verifier={sh.verifier} />
        </div>
      ))}
    </div>
  );
}

interface CharterArtworkProps {
  serialOf: number;
  compact?: boolean;
}

/** Lapis 청금석 + 황동 봉인 모티프 SVG — 인쇄 시 monochrome. */
function CharterArtwork({ serialOf, compact }: CharterArtworkProps) {
  const sz = compact ? 60 : 80;
  return (
    <div className="mb-3 flex items-center justify-between">
      <svg
        viewBox="0 0 100 100"
        width={sz}
        height={sz}
        aria-hidden
        className="text-vault-gold print:text-black"
      >
        <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <path d="M50 14 L62 50 L50 86 L38 50 Z" fill="currentColor" opacity="0.6" />
        <text
          x="50"
          y="55"
          textAnchor="middle"
          fontSize="14"
          fontFamily="ui-monospace, monospace"
          fill="currentColor"
        >
          AV
        </text>
      </svg>
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-vault-gold/70 print:text-black/70">
        {`SN-${serialOf.toString(16).toUpperCase().padStart(4, "0")}`}
      </div>
    </div>
  );
}

interface CharterWordsGridProps {
  words: string[];
}

function CharterWordsGrid({ words }: CharterWordsGridProps) {
  // 6 단어 → 3 col × 2 row, 7 단어 → 4 col × 2 row (마지막 셀 비움).
  const cols = words.length === 7 ? 4 : 3;
  return (
    <div className={cn("grid gap-x-4 gap-y-2", cols === 4 ? "grid-cols-4" : "grid-cols-3")}>
      {words.map((w, i) => (
        <div
          key={i}
          className="flex items-baseline gap-2 rounded border border-vault-gold/20 bg-background/40 px-2 py-1.5 print:border-black/30 print:bg-transparent"
        >
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground print:text-black/60">
            {(i + 1).toString().padStart(2, "0")}
          </span>
          <span className="font-mono text-sm font-medium uppercase tracking-wide text-foreground print:text-black">
            {w}
          </span>
        </div>
      ))}
    </div>
  );
}

interface VerifierLineProps {
  verifier: number;
}

function VerifierLine({ verifier }: VerifierLineProps) {
  const { t } = useTranslation("common");
  return (
    <div className="mt-3 flex items-center justify-between border-t border-vault-gold/20 pt-2 print:border-black/30">
      <span className="text-xs uppercase tracking-wider text-muted-foreground print:text-black/60">
        {t("vault.charter.verifierLabel")}
      </span>
      <span className="font-mono text-lg font-semibold tabular-nums text-vault-gold-bright print:text-black">
        {verifier.toString().padStart(4, "0")}
      </span>
    </div>
  );
}

interface ConfirmDoneOverlayProps {
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDoneOverlay({ onCancel, onConfirm }: ConfirmDoneOverlayProps) {
  const { t } = useTranslation("common");
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm print:hidden"
      role="alertdialog"
      aria-modal="true"
    >
      <div className="m-4 max-w-md rounded-lg border bg-card p-5 shadow-lg">
        <h3 className="text-lg font-semibold">{t("vault.charter.confirmDoneTitle")}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{t("vault.charter.confirmDoneBody")}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t("vault.charter.confirmDoneCancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t("vault.charter.confirmDoneConfirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
