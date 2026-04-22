import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function OnboardingScanPage() {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("common");
  const path = searchParams.get("path");

  if (!path) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-muted-foreground">{t("onboarding.scanMissingPath")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t("onboarding.scanPlaceholderTitle")}</h1>
      <p className="max-w-md text-muted-foreground">
        {t("onboarding.scanPlaceholderDescription", { path })}
      </p>
    </div>
  );
}
