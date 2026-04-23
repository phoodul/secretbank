import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/shell/AppShell";
import { AuditPage } from "@/pages/AuditPage";
import { GraphPage } from "@/pages/GraphPage";
import { IncidentsPage } from "@/pages/IncidentsPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { OnboardingScanPage } from "@/pages/OnboardingScanPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { AutoLockGuard } from "@/features/vault/AutoLockGuard";
import { DropZone } from "@/features/onboarding/DropZone";
import { WelcomePage } from "@/features/onboarding/WelcomePage";
import { useOnboardingDone } from "@/features/onboarding/use-onboarding";
import { LockScreen } from "@/features/vault/LockScreen";
import { useVaultStatus } from "@/features/vault/use-vault-status";

/** onboarding 미완료 시 /welcome 으로 리다이렉트하는 가드 */
function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const { value: done, loading } = useOnboardingDone();
  const location = useLocation();

  if (loading) {
    return <div className="bg-background min-h-screen" />;
  }
  if (done) return <>{children}</>;

  const path = location.pathname;
  const isOnboardingPath = path === "/welcome" || path.startsWith("/onboarding");
  if (!isOnboardingPath) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

/** 볼트 잠금/미초기화 시 표시되는 풀스크린 레이아웃 */
function VaultGate() {
  const { status, refresh } = useVaultStatus();
  const { t } = useTranslation("common");

  // 최초 로드 중 — 최소한의 중앙 스피너
  if (status === "loading") {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("vault.loading")}</p>
      </div>
    );
  }

  // 볼트 잠금 해제 완료 — 메인 앱 렌더링
  if (status.state === "unlocked") {
    return (
      <BrowserRouter>
        <AutoLockGuard />
        <DropZone />
        <Routes>
          <Route path="welcome" element={<WelcomePage />} />
          <Route path="onboarding/scan" element={<OnboardingScanPage />} />
          <Route
            element={
              <RequireOnboarding>
                <AppShell />
              </RequireOnboarding>
            }
          >
            <Route index element={<InventoryPage />} />
            <Route path="projects" element={<ProjectsPage />} />
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
