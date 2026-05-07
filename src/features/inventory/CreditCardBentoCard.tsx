/**
 * CreditCardBentoCard — Phase 3-A-6
 *
 * BentoCard 에서 kind="credit_card" 일 때 렌더되는 전용 카드.
 * 카드사별 oklch 그레이디언트 + 마스킹된 번호 + 브랜드 배지 표시.
 *
 * 보안 규칙 (B.5-3): last_4 만 표시. 전체 카드번호 노출 금지.
 * 스타일 규칙 (F.2-1): oklch / Tailwind 토큰만. hex 하드코딩 금지.
 */

import { CreditCard as CreditCardIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBrandGradient, maskCardNumber, type CardBrand } from "@/lib/card-utils";
import { SecurityBadge } from "@/features/security/SecurityBadge";
import type { CredentialSummary } from "./types";
import type { SecurityAlertView } from "@/features/security/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CreditCardBentoCardProps {
  /** kind="credit_card" 인 credential 을 전제함 */
  credential: CredentialSummary;
  /** 해당 credential 의 보안 alerts. 최고 우선순위 1개 배지로 표시. */
  securityAlerts?: SecurityAlertView[];
  onClick?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreditCardBentoCard({
  credential,
  securityAlerts,
  onClick,
}: CreditCardBentoCardProps) {
  const { t } = useTranslation("creditCard");

  const brand: CardBrand = credential.card_brand ?? "unknown";
  const last4 = credential.card_last_4 ?? "0000";
  const gradient = getBrandGradient(brand);

  const expiry =
    credential.card_expiry_month != null && credential.card_expiry_year != null
      ? `${String(credential.card_expiry_month).padStart(2, "0")}/${String(credential.card_expiry_year % 100).padStart(2, "0")}`
      : null;

  const brandLabel =
    brand !== "unknown"
      ? t(`creditCard.brand.${brand}`, { defaultValue: brand.toUpperCase() })
      : t("creditCard.brand.unknown");

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="overflow-hidden cursor-pointer motion-safe:hover:scale-[1.01] transition-transform duration-150 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <CardContent className="p-0">
        {/* ── 헤더: 이름 + 보안 배지 ── */}
        <div className="flex items-start justify-between p-4 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <CreditCardIcon className="w-5 h-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h3 className="font-medium text-sm truncate" title={credential.name}>
              {credential.name}
            </h3>
          </div>
          {securityAlerts && securityAlerts.length > 0 && (
            <div className="shrink-0 ml-2">
              <SecurityBadge credentialId={credential.id} alerts={securityAlerts} />
            </div>
          )}
        </div>

        {/* ── 카드사별 그레이디언트 영역 ── */}
        <div
          className="p-4 text-white"
          style={{
            background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
          }}
        >
          <div className="flex items-end justify-between gap-2">
            <div className="space-y-1 min-w-0">
              {/* 마스킹된 카드번호 (B.5-3: last_4 만) */}
              <div className="text-base font-mono tracking-wider truncate">
                {maskCardNumber(last4, brand)}
              </div>
              {expiry && <div className="text-xs opacity-90 font-mono">{expiry}</div>}
            </div>
            {/* 브랜드 배지 */}
            <Badge
              variant="outline"
              className="shrink-0 border-white/40 text-white uppercase text-[10px]"
            >
              {brandLabel}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
