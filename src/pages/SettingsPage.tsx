import { useTranslation } from "react-i18next";

import { useTheme } from "@/components/theme/theme-provider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Theme = "light" | "dark" | "system";

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const languages = [
    { code: "en", label: "English" },
    { code: "ko", label: "한국어" },
    { code: "ja", label: "日本語" },
  ];

  return (
    <div className="max-w-md space-y-8">
      <h1 className="text-xl font-semibold">{t("nav.settings")}</h1>

      {/* Theme */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("settings.theme")}</h2>
        <Tabs value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <TabsList>
            <TabsTrigger value="light">{t("settings.themeLight")}</TabsTrigger>
            <TabsTrigger value="dark">{t("settings.themeDark")}</TabsTrigger>
            <TabsTrigger value="system">{t("settings.themeSystem")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      {/* Language */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("settings.language")}</h2>
        <Tabs
          value={
            i18n.language.startsWith("ko") ? "ko" : i18n.language.startsWith("ja") ? "ja" : "en"
          }
          onValueChange={(lng) => void i18n.changeLanguage(lng)}
        >
          <TabsList>
            {languages.map(({ code, label }) => (
              <TabsTrigger key={code} value={code}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </section>
    </div>
  );
}
