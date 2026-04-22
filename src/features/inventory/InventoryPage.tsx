import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { CreateCredentialDialog } from "./CreateCredentialDialog";
import type { CredentialFilter, CredentialStatus, Env } from "./types";

export function InventoryPage() {
  const { t } = useTranslation("common");
  const { items, loading, error, filter, setFilter, search, setSearch, refresh } = useInventory();
  const [searchParams, setSearchParams] = useSearchParams();

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
    </div>
  );
}
