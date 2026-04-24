import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CredentialDetail } from "./CredentialDetail";
import { CredentialList } from "./CredentialList";
import { useInventory } from "./use-inventory";
import { useIssuers } from "./use-issuers";
import { CreateCredentialDialog } from "./CreateCredentialDialog";
import { BulkRevokeDialog } from "@/features/kill-switch/BulkRevokeDialog";
import type { CredentialFilter, CredentialStatus, Env } from "./types";

const HIDE_REVOKED_KEY = "apivault:inventory:hideRevoked";

function readHideRevoked(): boolean {
  try {
    const stored = localStorage.getItem(HIDE_REVOKED_KEY);
    if (stored === null) return true; // default: hide revoked
    return stored === "true";
  } catch {
    return true;
  }
}

function writeHideRevoked(value: boolean): void {
  try {
    localStorage.setItem(HIDE_REVOKED_KEY, String(value));
  } catch {
    // ignore
  }
}

export function InventoryPage() {
  const { t } = useTranslation("common");
  const { items: rawItems, loading, error, filter, setFilter, search, setSearch, refresh } = useInventory();
  const { issuers } = useIssuers();
  const [searchParams, setSearchParams] = useSearchParams();
  const [hideRevoked, setHideRevoked] = useState<boolean>(readHideRevoked);
  const [bulkRevokeOpen, setBulkRevokeOpen] = useState(false);

  const items = useMemo(() => {
    if (!hideRevoked) return rawItems;
    return rawItems.filter((c) => c.status !== "revoked");
  }, [rawItems, hideRevoked]);

  const handleHideRevokedChange = (checked: boolean) => {
    setHideRevoked(checked);
    writeHideRevoked(checked);
  };

  // Command Palette "Create credential" — navigate("/?action=create")로 트리거.
  // 초기 렌더에서 쿼리를 읽어 dialogOpen 초기값으로 사용하고, 즉시 query를 제거한다.
  const hasCreateAction = searchParams.get("action") === "create";
  const [dialogOpen, setDialogOpen] = useState(() => {
    if (hasCreateAction) {
      // setSearchParams는 렌더 외부에서 직접 호출할 수 없으므로
      // setTimeout 0으로 micro-task에서 제거한다 (setState가 아닌 router 상태 변경)
      setTimeout(() => setSearchParams({}, { replace: true }), 0);
      return true;
    }
    return false;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleEnvChange = (value: string) => {
    if (value === "__all__") {
      setFilter({ env: undefined } as Partial<CredentialFilter>);
    } else {
      setFilter({ env: value as Env });
    }
  };

  const handleStatusChange = (value: string) => {
    if (value === "__all__") {
      setFilter({ status: undefined } as Partial<CredentialFilter>);
    } else {
      setFilter({ status: value as CredentialStatus });
    }
  };

  const handleIssuerChange = (value: string) => {
    if (value === "__all__") {
      setFilter({ issuer_id: undefined } as Partial<CredentialFilter>);
    } else {
      setFilter({ issuer_id: value });
    }
  };

  // Bulk revoke is shown only when a specific issuer is filtered
  // and there is at least 1 non-revoked credential visible.
  const selectedIssuerId = filter.issuer_id ?? null;
  const selectedIssuer = issuers.find((i) => i.id === selectedIssuerId) ?? null;
  const nonRevokedCount = rawItems.filter((c) => c.status !== "revoked").length;
  const showBulkRevoke = selectedIssuerId !== null && nonRevokedCount > 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{t("inventory.title")}</h1>
        <Button variant="default" size="sm" onClick={() => setDialogOpen(true)}>
          + {t("inventory.addCredential")}
        </Button>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2">
        <Input
          className="h-8 w-56 text-sm"
          placeholder={t("inventory.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t("inventory.searchPlaceholder")}
        />

        {/* Issuer 필터 */}
        <Select onValueChange={handleIssuerChange} value={filter.issuer_id ?? "__all__"}>
          <SelectTrigger size="sm" className="w-44" aria-label={t("inventory.filterIssuer")}>
            <SelectValue placeholder={t("inventory.filterIssuer")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("inventory.allIssuers")}</SelectItem>
            {issuers.map((issuer) => (
              <SelectItem key={issuer.id} value={issuer.id}>
                {issuer.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Env 필터 */}
        <Select onValueChange={handleEnvChange} value={filter.env ?? "__all__"}>
          <SelectTrigger size="sm" className="w-40" aria-label={t("inventory.filterEnv")}>
            <SelectValue placeholder={t("inventory.filterEnv")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("inventory.allEnvs")}</SelectItem>
            <SelectItem value="dev">{t("inventory.envDev")}</SelectItem>
            <SelectItem value="staging">{t("inventory.envStaging")}</SelectItem>
            <SelectItem value="prod">{t("inventory.envProd")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Status 필터 */}
        <Select onValueChange={handleStatusChange} value={filter.status ?? "__all__"}>
          <SelectTrigger size="sm" className="w-44" aria-label={t("inventory.filterStatus")}>
            <SelectValue placeholder={t("inventory.filterStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("inventory.allStatuses")}</SelectItem>
            <SelectItem value="active">{t("inventory.statusActive")}</SelectItem>
            <SelectItem value="revoked">{t("inventory.statusRevoked")}</SelectItem>
            <SelectItem value="compromised">{t("inventory.statusCompromised")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Hide revoked 토글 */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="hide-revoked"
            checked={hideRevoked}
            onCheckedChange={(checked) => handleHideRevokedChange(checked === true)}
            aria-label={t("inventory.hideRevoked")}
          />
          <Label htmlFor="hide-revoked" className="cursor-pointer text-sm">
            {t("inventory.hideRevoked")}
          </Label>
        </div>

        {/* Bulk revoke 버튼 — issuer 필터 선택 + non-revoked 존재 시에만 */}
        {showBulkRevoke && selectedIssuer && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setBulkRevokeOpen(true)}
            data-testid="bulk-revoke-action-btn"
          >
            <ShieldOff className="h-3.5 w-3.5" aria-hidden />
            {t("killSwitch.bulk.action", {
              issuer: selectedIssuer.display_name,
              count: nonRevokedCount,
            })}
          </Button>
        )}
      </div>

      {/* 에러 배너 */}
      {error !== null && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{t("inventory.loadError")}</span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={refresh}>
            <RefreshCw className="h-3 w-3" />
            {t("inventory.retry")}
          </Button>
        </div>
      )}

      {/* 목록 */}
      <CredentialList items={items} loading={loading} onSelect={setSelectedId} />

      {/* Credential 등록 다이얼로그 */}
      <CreateCredentialDialog open={dialogOpen} onOpenChange={setDialogOpen} onSuccess={refresh} />

      {/* Credential 상세 Drawer */}
      <CredentialDetail
        open={selectedId !== null}
        credentialId={selectedId}
        onClose={() => setSelectedId(null)}
        onDeleted={() => {
          setSelectedId(null);
          refresh();
        }}
      />

      {/* Bulk Revoke 다이얼로그 */}
      {selectedIssuer && (
        <BulkRevokeDialog
          open={bulkRevokeOpen}
          onOpenChange={setBulkRevokeOpen}
          issuerId={selectedIssuerId}
          issuerName={selectedIssuer.display_name}
          credentialCount={nonRevokedCount}
          onCompleted={() => {
            setBulkRevokeOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
