import { Outlet } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { usePlatform } from "@/lib/platform";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  const platform = usePlatform();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const isMobile = platform === "mobile";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop/web only */}
      {!isMobile && <Sidebar />}

      {/* Main area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          {isMobile && (
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden />
              <span className="text-sm font-semibold">{t("app.title")}</span>
            </div>
          )}
          {!isMobile && <div />}

          <div className="flex items-center gap-2">
            {/* Cmd+K placeholder — implemented in M3 */}
            <Button variant="ghost" size="sm" onClick={toggleTheme}>
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className={`flex-1 overflow-auto p-6 ${isMobile ? "pb-20" : ""}`}>
          <Outlet />
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      {isMobile && <BottomNav />}
    </div>
  );
}
