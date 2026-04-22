import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useTheme } from "@/components/theme/theme-provider";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ACTIONS } from "./actions";
import { useRecentCommands } from "./use-recent-commands";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const { recent, record } = useRecentCommands();

  const handleSelect = (actionId: string) => {
    const action = ACTIONS.find((a) => a.id === actionId);
    if (!action) return;

    record(actionId);

    void action.run({
      navigate,
      setTheme,
      t,
      closePalette: () => onOpenChange(false),
    });
  };

  const navigationActions = ACTIONS.filter((a) => a.category === "navigation");
  const otherActions = ACTIONS.filter((a) => a.category === "action");
  const recentActions = recent
    .map((id) => ACTIONS.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => a !== undefined)
    .slice(0, 5);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description={t("commandPalette.searchPlaceholder")}
      showCloseButton={false}
    >
      <CommandInput placeholder={t("commandPalette.searchPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("commandPalette.noResults")}</CommandEmpty>

        {recentActions.length > 0 && (
          <CommandGroup heading={t("commandPalette.recent")}>
            {recentActions.map((action) => {
              const Icon = action.icon;
              return (
                <CommandItem
                  key={`recent-${action.id}`}
                  value={`recent-${action.id}-${t(action.labelKey)}`}
                  onSelect={() => handleSelect(action.id)}
                >
                  <Icon aria-hidden />
                  {t(action.labelKey)}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        <CommandGroup heading={t("commandPalette.navigation")}>
          {navigationActions.map((action) => {
            const Icon = action.icon;
            return (
              <CommandItem
                key={action.id}
                value={`nav-${action.id}-${t(action.labelKey)}`}
                onSelect={() => handleSelect(action.id)}
              >
                <Icon aria-hidden />
                {t(action.labelKey)}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandGroup heading={t("commandPalette.actions")}>
          {otherActions.map((action) => {
            const Icon = action.icon;
            return (
              <CommandItem
                key={action.id}
                value={`action-${action.id}-${t(action.labelKey)}`}
                onSelect={() => handleSelect(action.id)}
              >
                <Icon aria-hidden />
                {t(action.labelKey)}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
