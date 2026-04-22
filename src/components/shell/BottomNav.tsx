import { NavLink } from "react-router-dom";
import { AlertTriangle, FileText, Lock, Network, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
}

const navItems: NavItem[] = [
  { to: "/", icon: Lock, labelKey: "nav.inventory" },
  { to: "/graph", icon: Network, labelKey: "nav.graph" },
  { to: "/incidents", icon: AlertTriangle, labelKey: "nav.incidents" },
  { to: "/audit", icon: FileText, labelKey: "nav.audit" },
  { to: "/settings", icon: Settings, labelKey: "nav.settings" },
];

export function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background">
      <div className="grid grid-cols-5">
        {navItems.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
