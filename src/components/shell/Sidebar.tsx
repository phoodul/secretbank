import { NavLink } from "react-router-dom";
import {
  AlertTriangle,
  FileText,
  FolderKanban,
  Lock,
  Network,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
}

const navItems: NavItem[] = [
  { to: "/", icon: Lock, labelKey: "nav.inventory" },
  { to: "/projects", icon: FolderKanban, labelKey: "nav.projects" },
  { to: "/graph", icon: Network, labelKey: "nav.graph" },
  { to: "/incidents", icon: AlertTriangle, labelKey: "nav.incidents" },
  { to: "/audit", icon: FileText, labelKey: "nav.audit" },
  { to: "/railguard", icon: ShieldCheck, labelKey: "nav.railguard" },
  { to: "/settings", icon: Settings, labelKey: "nav.settings" },
];

export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-background">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <ShieldCheck className="size-6 text-primary" aria-hidden />
        <span className="text-sm font-semibold tracking-tight">{t("app.title")}</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {navItems.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
