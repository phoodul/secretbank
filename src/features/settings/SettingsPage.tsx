import { useTranslation } from "react-i18next";

import { useTheme } from "@/components/theme/theme-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGraphNodesDraggable } from "@/features/graph/use-graph-nodes-draggable";

import { GithubIntegrationSection } from "./GithubIntegrationSection";
import { IntegrationsSection } from "./IntegrationsSection";
import { type AutoLockMinutes, useAutoLockMinutes } from "./use-settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Theme = "light" | "dark" | "system";

// ---------------------------------------------------------------------------
// Auto-lock options
// ---------------------------------------------------------------------------

const AUTO_LOCK_OPTIONS: { value: AutoLockMinutes; labelKey: string; count?: number }[] = [
  { value: 0, labelKey: "settings.autoLockNever" },
  { value: 5, labelKey: "settings.autoLockMinutes", count: 5 },
  { value: 15, labelKey: "settings.autoLockMinutes", count: 15 },
  { value: 30, labelKey: "settings.autoLockMinutes", count: 30 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openExternal(url: string): void {
  // @tauri-apps/plugin-shell openUrl — desktop 에서 외부 브라우저로 열기
  // 런타임에 import 실패(웹/테스트 환경)하면 window.open 으로 폴백
  import("@tauri-apps/plugin-shell")
    .then(({ open }) => open(url))
    .catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { value: autoLock, loading: autoLockLoading, setValue: setAutoLock } = useAutoLockMinutes();
  const [draggable, setDraggable] = useGraphNodesDraggable();

  const currentLang = i18n.language.startsWith("ko")
    ? "ko"
    : i18n.language.startsWith("ja")
      ? "ja"
      : i18n.language.startsWith("zh")
        ? "zh"
        : "en";

  return (
    <div className="max-w-2xl space-y-8 p-6">
      <h1 className="text-xl font-semibold">{t("settings.title")}</h1>

      {/* ------------------------------------------------------------------ */}
      {/* Appearance                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="appearance-heading" className="space-y-6">
        <h2 id="appearance-heading" className="text-base font-medium">
          {t("settings.appearance")}
        </h2>

        {/* Theme */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.theme")}</p>
          <p className="text-muted-foreground text-xs">{t("settings.themeDescription")}</p>
          <Tabs value={theme} onValueChange={(v) => setTheme(v as Theme)}>
            <TabsList>
              <TabsTrigger value="light">{t("settings.themeLight")}</TabsTrigger>
              <TabsTrigger value="dark">{t("settings.themeDark")}</TabsTrigger>
              <TabsTrigger value="system">{t("settings.themeSystem")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Language */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.language")}</p>
          <p className="text-muted-foreground text-xs">{t("settings.languageDescription")}</p>
          <Select value={currentLang} onValueChange={(lng) => void i18n.changeLanguage(lng)}>
            <SelectTrigger aria-label={t("settings.language")} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ko">한국어</SelectItem>
              <SelectItem value="ja">日本語</SelectItem>
              <SelectItem value="zh">中文</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Security                                                             */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="security-heading" className="space-y-6">
        <h2 id="security-heading" className="text-base font-medium">
          {t("settings.security")}
        </h2>

        {/* Auto-lock */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.autoLock")}</p>
          <p className="text-muted-foreground text-xs">{t("settings.autoLockDescription")}</p>
          {autoLockLoading ? (
            <Skeleton className="h-9 w-48" />
          ) : (
            <Select
              value={String(autoLock)}
              onValueChange={(v) => void setAutoLock(Number(v) as AutoLockMinutes)}
            >
              <SelectTrigger aria-label={t("settings.autoLock")} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_LOCK_OPTIONS.map(({ value, labelKey, count }) => (
                  <SelectItem key={value} value={String(value)}>
                    {count !== undefined ? t(labelKey, { count }) : t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Integrations                                                         */}
      {/* ------------------------------------------------------------------ */}
      <IntegrationsSection />

      {/* ------------------------------------------------------------------ */}
      {/* GitHub Integration                                                   */}
      {/* ------------------------------------------------------------------ */}
      <GithubIntegrationSection />

      {/* ------------------------------------------------------------------ */}
      {/* Graph                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="graph-heading" className="space-y-6">
        <h2 id="graph-heading" className="text-base font-medium">
          {t("settings.graph")}
        </h2>

        {/* Nodes draggable */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("settings.performance.draggableToggle")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draggable}
            onClick={() => setDraggable(!draggable)}
            className={[
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              draggable ? "bg-primary" : "bg-input",
            ].join(" ")}
          >
            <span
              className={[
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                draggable ? "translate-x-5" : "translate-x-0",
              ].join(" ")}
            />
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* About                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="about-heading" className="space-y-4">
        <h2 id="about-heading" className="text-base font-medium">
          {t("settings.about")}
        </h2>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("settings.appName")}</dt>
          <dd>API Vault</dd>

          <dt className="text-muted-foreground">{t("settings.version")}</dt>
          <dd>{import.meta.env.VITE_APP_VERSION ?? "0.1.0-dev"}</dd>

          <dt className="text-muted-foreground">{t("settings.license")}</dt>
          <dd>
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => openExternal("https://www.gnu.org/licenses/agpl-3.0.html")}
            >
              {t("settings.openAgpl")}
            </button>
          </dd>

          <dt className="text-muted-foreground">{t("settings.sourceCode")}</dt>
          <dd>
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => openExternal("https://github.com/api-vault/api-vault")}
            >
              {t("settings.openRepo")}
            </button>
          </dd>
        </dl>
      </section>
    </div>
  );
}
