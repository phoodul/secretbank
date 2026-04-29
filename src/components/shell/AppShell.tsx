import { useState } from "react";
import { Outlet } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useHotkeys } from "react-hotkeys-hook";

import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { usePlatform } from "@/lib/platform";
import { CommandPalette } from "@/features/command-palette/CommandPalette";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  const platform = usePlatform();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const [cmdkOpen, setCmdkOpen] = useState(false);

  const isDesktop = platform === "desktop";

  // "mod+k" automatically maps to Cmd+K on Mac and Ctrl+K on Win/Linux.
  // enabled: false on mobile — hook is always called to satisfy Rules of Hooks.
  useHotkeys("mod+k", () => setCmdkOpen((o) => !o), { enabled: isDesktop, preventDefault: true });

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const isMobile = platform === "mobile";

  return (
    <div className="window-frame flex min-h-screen">
      {/* Sidebar — desktop/web only */}
      {!isMobile && <Sidebar />}

      {/* Main area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header
          className="flex h-12 shrink-0 items-center justify-between px-4"
          style={{
            borderBottom: "1px solid oklch(from var(--vault-lapis-deep) l c h / 0.85)",
            boxShadow:
              "inset 0 -1px 0 0 oklch(from var(--vault-lapis-bright) l c h / 0.18), 0 1px 0 0 oklch(from var(--vault-lapis-bright) l c h / 0.06)",
          }}
        >
          {isMobile && (
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden />
              <span className="text-sm font-semibold">{t("app.title")}</span>
            </div>
          )}
          {!isMobile && <div />}

          <div className="flex items-center gap-2">
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

      {/* Command Palette — desktop only */}
      {isDesktop && <CommandPalette open={cmdkOpen} onOpenChange={setCmdkOpen} />}
    </div>
  );
}
