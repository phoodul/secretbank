import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { SecurityDot } from "./SecurityDot";
import type { CredentialSummary } from "./types";

interface CredentialCardProps {
  credential: CredentialSummary;
  onSelect?: (id: string) => void;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXPIRING_SOON_DAYS = 30;

type StatusBadgeInfo = {
  variant: "destructive" | "danger" | "warning" | "success";
  labelKey: string;
};

function getStatusBadge(credential: CredentialSummary): StatusBadgeInfo {
  if (credential.status === "revoked") {
    return { variant: "destructive", labelKey: "inventory.statusRevoked" };
  }
  if (credential.status === "compromised") {
    return { variant: "danger", labelKey: "inventory.statusCompromised" };
  }
  if (credential.expires_at !== null) {
    const now = Date.now();
    if (credential.expires_at < now) {
      return { variant: "warning", labelKey: "inventory.statusExpired" };
    }
    if (credential.expires_at - now < EXPIRING_SOON_DAYS * MS_PER_DAY) {
      return { variant: "warning", labelKey: "inventory.statusExpiringSoon" };
    }
  }
  return { variant: "success", labelKey: "inventory.statusActive" };
}

function formatEnvKey(env: CredentialSummary["env"]): string {
  const map: Record<CredentialSummary["env"], string> = {
    dev: "inventory.envDev",
    staging: "inventory.envStaging",
    prod: "inventory.envProd",
  };
  return map[env];
}

function formatExpiry(expiresAt: number | null, t: (key: string) => string): string {
  if (expiresAt === null) return t("inventory.never");
  return new Date(expiresAt).toLocaleDateString();
}

export function CredentialCard({ credential, onSelect }: CredentialCardProps) {
  const { t } = useTranslation("common");
  const statusBadge = getStatusBadge(credential);

  return (
    <Card
      className="group relative cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => onSelect?.(credential.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(credential.id);
        }
      }}
    >
      <CardContent className="p-4">
        {/* 항상 표시: 보안 점수 dot + 이름 + 상태 배지 */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <SecurityDot score={credential.score} />
            <span className="truncate text-sm leading-tight font-medium">{credential.name}</span>
          </div>
          <Badge variant={statusBadge.variant} className="shrink-0 text-xs">
            {t(statusBadge.labelKey)}
          </Badge>
        </div>

        {/* hover 시 fade-in: Issuer 배지, Env 배지, Expires */}
        <div className="mt-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex flex-wrap gap-1.5">
            {/* Issuer 배지 — T028 프리셋 연동 전까지 issuer_id 축약형으로 표시 */}
            <Badge variant="secondary" className="text-xs font-mono">
              {credential.issuer_id.slice(0, 8)}
            </Badge>
            {/* Env 배지 */}
            <Badge variant="outline" className="text-xs">
              {t(formatEnvKey(credential.env))}
            </Badge>
          </div>

          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>{t("inventory.expiresAt")}</span>
              <span className="font-mono">{formatExpiry(credential.expires_at, t)}</span>
            </div>
            <div className="flex items-center justify-between">
              {/* TODO(M3): last_rotated_at フィールドがサーバーレスポンスに追加されたら実装する */}
              <span>{t("inventory.lastRotated")}</span>
              <span className="font-mono">—</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
