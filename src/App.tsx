import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/shell/AppShell";
import { AuditPage } from "@/pages/AuditPage";
import { GraphPage } from "@/pages/GraphPage";
import { IncidentsPage } from "@/pages/IncidentsPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LockScreen } from "@/features/vault/LockScreen";
import { useVaultStatus } from "@/features/vault/use-vault-status";

/** 볼트 잠금/미초기화 시 표시되는 풀스크린 레이아웃 */
function VaultGate() {
  const { status, refresh } = useVaultStatus();
  const { t } = useTranslation("common");

  // 최초 로드 중 — 최소한의 중앙 스피너
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{t("vault.loading")}</p>
      </div>
    );
  }

  // 볼트 잠금 해제 완료 — 메인 앱 렌더링
  if (status.state === "unlocked") {
    return (
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<InventoryPage />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="incidents" element={<IncidentsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    );
  }

  // uninitialized → CreateVault 링크 표시, locked → 잠금 해제 폼만 표시
  const showCreate = status.state === "uninitialized";
  return <LockScreen showCreate={showCreate} onSuccess={refresh} />;
}

function App() {
  return <VaultGate />;
}

export default App;
