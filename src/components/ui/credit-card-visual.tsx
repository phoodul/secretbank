/**
 * CreditCardVisual — Phase 3-A-3
 *
 * 3D flip 카드 컴포넌트.
 *
 * 보안 규칙 (GATE 2-4 + THREAT_MODEL §4):
 *   - cvcRevealed=false 상태에서 절대 flip 금지.
 *   - revealedCvc / revealedCardNumber 내부 state 보관 금지 (parent 30s 타이머 관리).
 *   - 평문 카드번호 / CVC 를 console.log 금지.
 *
 * 스타일 규칙 (F.2-1):
 *   - hex 하드코딩 ❌. oklch() + Tailwind 디자인 토큰만 사용.
 */

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type CardBrand,
  formatCardNumber,
  getBrandGradient,
  maskCardNumber,
} from "@/lib/card-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreditCardVisualProps {
  /** 마지막 4자 — 항상 표시 (B.5-3) */
  last4: string;
  brand: CardBrand;
  cardholderName?: string;
  expiryMonth: number; // 1-12
  expiryYear: number; // 4자리 (2025+)

  /** parent 에서 제어. true 일 때만 flip 허용 (THREAT_MODEL §4 + GATE 2-4) */
  cvcRevealed: boolean;
  /** cvcRevealed=true 일 때만 전달 (B.5-1, parent 30s 타이머 관리) */
  revealedCvc?: string;
  /** full 카드번호 reveal 상태 (optional, parent 30s 타이머 관리) */
  revealedCardNumber?: string;

  /**
   * 사용자가 CVC 영역 클릭 또는 Enter 키 눌렀을 때 parent 에 알림.
   * cvcRevealed=false 면 parent 가 reveal 절차 진행 (Tauri command 호출 등).
   * cvcRevealed=true 면 flip toggle.
   */
  onFlipRequest?: () => void;

  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreditCardVisual({
  last4,
  brand,
  cardholderName,
  expiryMonth,
  expiryYear,
  cvcRevealed,
  revealedCvc,
  revealedCardNumber,
  onFlipRequest,
  className,
}: CreditCardVisualProps) {
  // 사용자가 뒤집으려는 의도 (내부 raw state)
  const [flipIntent, setFlipIntent] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // GATE 2-4: cvcRevealed=false 면 실제 flip 은 항상 false
  // useEffect 없이 렌더 시 파생 — 불필요한 cascading render 방지
  const flipped = cvcRevealed && flipIntent;

  const handleClick = () => {
    onFlipRequest?.();
    if (cvcRevealed) {
      // cvcRevealed=true 일 때만 flip 허용 (GATE 2-4)
      setFlipIntent((f) => !f);
    }
    // cvcRevealed=false 면 flip 안 함 (THREAT_MODEL §4)
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const gradient = getBrandGradient(brand);

  const displayedNumber = revealedCardNumber
    ? formatCardNumber(revealedCardNumber, brand)
    : maskCardNumber(last4, brand);

  const expiryDisplay = `${String(expiryMonth).padStart(2, "0")} / ${String(expiryYear % 100).padStart(2, "0")}`;

  // Amex CID 는 4자리, 나머지 CVC 는 3자리
  const cvcDisplay = cvcRevealed && revealedCvc ? revealedCvc : brand === "amex" ? "••••" : "•••";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Credit card ending in ${last4}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative w-full max-w-sm cursor-pointer rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        className,
      )}
      style={{ aspectRatio: "1.586 / 1", perspective: 1000 }}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={
          prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }
        }
      >
        {/* 앞면 */}
        <div
          className="absolute inset-0 flex flex-col justify-between rounded-xl p-6 text-white shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
            backfaceVisibility: "hidden",
          }}
        >
          {/* 칩 + 카드사 */}
          <div className="flex items-start justify-between">
            <Cpu className="h-7 w-10 opacity-90" aria-hidden="true" />
            <span className="text-sm font-semibold uppercase tracking-wider">
              {brand !== "unknown" ? brand : ""}
            </span>
          </div>

          {/* 카드 번호 */}
          <div className="font-mono text-xl tracking-wider">{displayedNumber}</div>

          {/* 카드홀더 이름 + 만료일 */}
          <div className="flex items-end justify-between">
            <span className="text-xs uppercase tracking-wider opacity-90">
              {cardholderName ?? "CARD HOLDER"}
            </span>
            <span className="font-mono text-xs">{expiryDisplay}</span>
          </div>
        </div>

        {/* 뒷면 */}
        <div
          className="absolute inset-0 rounded-xl text-white shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {/* magnetic stripe */}
          <div className="absolute left-0 right-0 top-6 h-12 bg-black/70" />

          {/* CVC */}
          <div className="absolute bottom-6 right-6 text-right">
            <div className="text-[10px] uppercase opacity-75">CVC</div>
            <div className="font-mono text-lg">{cvcDisplay}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
