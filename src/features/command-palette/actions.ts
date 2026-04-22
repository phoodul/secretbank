import {
  AlertTriangle,
  KeyRound,
  Lock,
  Monitor,
  Moon,
  Network,
  Plus,
  ScrollText,
  Settings,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TFunction } from "i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

export type ActionCategory = "navigation" | "action";

export interface ActionContext {
  navigate: (to: string) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  t: TFunction;
  closePalette: () => void;
}

export interface CommandAction {
  id: string;
  category: ActionCategory;
  labelKey: string;
  icon: LucideIcon;
  run: (ctx: ActionContext) => void | Promise<void>;
}

export const ACTIONS: CommandAction[] = [
  {
    id: "nav.inventory",
    category: "navigation",
    labelKey: "nav.inventory",
    icon: KeyRound,
    run: ({ navigate, closePalette }) => {
      navigate("/");
      closePalette();
    },
  },
  {
    id: "nav.graph",
    category: "navigation",
    labelKey: "nav.graph",
    icon: Network,
    run: ({ navigate, closePalette }) => {
      navigate("/graph");
      closePalette();
    },
  },
  {
    id: "nav.incidents",
    category: "navigation",
    labelKey: "nav.incidents",
    icon: AlertTriangle,
    run: ({ navigate, closePalette }) => {
      navigate("/incidents");
      closePalette();
    },
  },
  {
    id: "nav.audit",
    category: "navigation",
    labelKey: "nav.audit",
    icon: ScrollText,
    run: ({ navigate, closePalette }) => {
      navigate("/audit");
      closePalette();
    },
  },
  {
    id: "nav.settings",
    category: "navigation",
    labelKey: "nav.settings",
    icon: Settings,
    run: ({ navigate, closePalette }) => {
      navigate("/settings");
      closePalette();
    },
  },
  {
    id: "action.create-credential",
    category: "action",
    labelKey: "commandPalette.createCredential",
    icon: Plus,
    run: ({ navigate, closePalette }) => {
      navigate("/?action=create");
      closePalette();
    },
  },
  {
    id: "action.lock-vault",
    category: "action",
    labelKey: "commandPalette.lockVault",
    icon: Lock,
    run: async ({ t, closePalette }) => {
      try {
        await invoke("vault_lock");
        window.dispatchEvent(new CustomEvent("vault-lock"));
        toast.success(t("vault.lockedToast"));
      } catch {
        toast.error(t("vault.internalError"));
      }
      closePalette();
    },
  },
  {
    id: "action.theme-light",
    category: "action",
    labelKey: "commandPalette.themeLight",
    icon: Sun,
    run: ({ setTheme, closePalette }) => {
      setTheme("light");
      closePalette();
    },
  },
  {
    id: "action.theme-dark",
    category: "action",
    labelKey: "commandPalette.themeDark",
    icon: Moon,
    run: ({ setTheme, closePalette }) => {
      setTheme("dark");
      closePalette();
    },
  },
  {
    id: "action.theme-system",
    category: "action",
    labelKey: "commandPalette.themeSystem",
    icon: Monitor,
    run: ({ setTheme, closePalette }) => {
      setTheme("system");
      closePalette();
    },
  },
];
