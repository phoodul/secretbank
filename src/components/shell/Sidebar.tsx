import { NavLink } from "react-router-dom";
import {
  AlertTriangle,
  FileText,
  FolderKanban,
  KeyRound,
  Lock,
  Network,
  Settings,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

import { useTranslation } from "react-i18next";

import { OfflineBadge } from "@/features/sync/OfflineBadge";
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
  { to: "/watchtower", icon: ShieldAlert, labelKey: "nav.watchtower" },
  { to: "/audit", icon: FileText, labelKey: "nav.audit" },
  { to: "/railguard", icon: ShieldCheck, labelKey: "nav.railguard" },
  { to: "/settings", icon: Settings, labelKey: "nav.settings" },
];

export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside
      className="sticky top-0 flex h-screen w-60 shrink-0 flex-col"
      style={{
        backgroundColor: "var(--vault-bg-deep)",
        backgroundImage: [
          // Right edge: razor-thin lapis bevel
          "linear-gradient(90deg, transparent calc(100% - 2px), oklch(from var(--vault-lapis-bright) l c h / 0.18) calc(100% - 1px), oklch(0 0 0 / 0.6) 100%)",
          // Polished column conic — subtle but tactile
          "conic-gradient(from 200deg at 50% 50%, oklch(from var(--vault-bg-deep) calc(l + 0.02) c h) 0deg, oklch(from var(--vault-bg-deep) calc(l - 0.01) c h) 90deg, oklch(from var(--vault-bg-deep) calc(l + 0.02) c h) 180deg, oklch(from var(--vault-bg-deep) calc(l - 0.02) c h) 270deg, oklch(from var(--vault-bg-deep) calc(l + 0.02) c h) 360deg)",
          // Vertical brushed grain
          "repeating-linear-gradient(90deg, oklch(1 0 0 / 0) 0px, oklch(1 0 0 / 0.018) 1px, oklch(1 0 0 / 0) 2px)",
        ].join(", "),
      }}
    >
      {/* Brass logo plate */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-vault-lapis/15">
        <div
          aria-hidden
          className="surface-gold flex size-9 items-center justify-center rounded-md"
        >
          <KeyRound
            className="size-4"
            strokeWidth={2.25}
            style={{ color: "oklch(0.18 0.05 50)" }}
          />
        </div>
        <span className="text-sm font-semibold tracking-wide accent-gold">{t("app.title")}</span>
      </div>

      {/* Nav — each item is a brass-key plate when active */}
      <nav className="flex flex-1 flex-col gap-1.5 px-2.5 py-3">
        {navItems.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "nav-active text-vault-gold-bright"
                  : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active state — engraved lapis trough with gold key */}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-md"
                    style={{
                      backgroundColor: "var(--vault-lapis-deep)",
                      backgroundImage: [
                        // top sheen on the trough
                        "linear-gradient(180deg, oklch(from var(--vault-lapis-bright) l c h / 0.28) 0%, transparent 30%)",
                        // bottom shadow
                        "linear-gradient(180deg, transparent 70%, oklch(0 0 0 / 0.45) 100%)",
                        // brushed grain
                        "repeating-linear-gradient(90deg, oklch(1 0 0 / 0) 0px, oklch(1 0 0 / 0.03) 1px, oklch(1 0 0 / 0) 2px)",
                        // lapis conic
                        "conic-gradient(from 210deg, var(--vault-lapis-deep) 0deg, var(--vault-lapis) 110deg, var(--vault-lapis-deep) 200deg, oklch(from var(--vault-lapis-deep) calc(l - 0.04) c h) 280deg, var(--vault-lapis-deep) 360deg)",
                      ].join(", "),
                      boxShadow: [
                        // engraved (inset bevel — light from top)
                        "inset 0 1px 2px 0 oklch(0 0 0 / 0.7)",
                        "inset 0 -1px 0 0 oklch(from var(--vault-lapis-bright) l c h / 0.32)",
                        "inset 1px 0 0 0 oklch(0 0 0 / 0.4)",
                        "inset -1px 0 0 0 oklch(from var(--vault-lapis-bright) l c h / 0.18)",
                        // gold halo
                        "0 0 16px 0 oklch(from var(--vault-gold-glow) l c h / 0.18)",
                      ].join(", "),
                    }}
                  />
                )}
                {/* Brass left rail when active */}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm"
                    style={{
                      backgroundImage:
                        "linear-gradient(180deg, var(--vault-gold-deep) 0%, var(--vault-gold-bright) 50%, var(--vault-gold-deep) 100%)",
                      boxShadow:
                        "0 0 8px 0 oklch(from var(--vault-gold-glow) l c h / 0.6), inset 0 1px 0 0 oklch(from var(--vault-gold-bright) l c h / 0.9)",
                    }}
                  />
                )}
                {/* Hover sheen on inactive items */}
                {!isActive && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{
                      backgroundImage:
                        "linear-gradient(135deg, oklch(from var(--vault-lapis-bright) l c h / 0.08) 0%, transparent 60%)",
                      boxShadow:
                        "inset 0 1px 0 0 oklch(from var(--vault-lapis-bright) l c h / 0.12), inset 0 -1px 0 0 oklch(0 0 0 / 0.25)",
                    }}
                  />
                )}
                <Icon
                  className={cn(
                    "relative size-4 shrink-0 transition-colors",
                    isActive
                      ? "accent-gold-glow"
                      : "text-muted-foreground group-hover:text-vault-lapis-bright",
                  )}
                  aria-hidden
                />
                <span className={cn("relative", isActive && "tracking-wide")}>{t(labelKey)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-vault-lapis/15">
        <OfflineBadge />
      </div>
    </aside>
  );
}
