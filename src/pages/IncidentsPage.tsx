import { useTranslation } from "react-i18next";

export function IncidentsPage() {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="text-xl font-semibold">{t("nav.incidents")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("common.empty")}</p>
    </div>
  );
}
