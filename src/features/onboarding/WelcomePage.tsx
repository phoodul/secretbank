import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FolderDown, KeyRound, PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreateCredentialDialog } from "@/features/inventory/CreateCredentialDialog";

import { useOnboardingDone } from "./use-onboarding";

type Step = 1 | 2 | 3;
const TOTAL_STEPS = 3;

export function WelcomePage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { setValue: setOnboardingDone } = useOnboardingDone();
  const [step, setStep] = useState<Step>(1);
  const [createOpen, setCreateOpen] = useState(false);

  async function finish() {
    await setOnboardingDone(true);
    navigate("/", { replace: true });
  }

  function next() {
    setStep((s) => (s < TOTAL_STEPS ? ((s + 1) as Step) : s));
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-2 text-center">
          <p
            className="text-muted-foreground text-xs font-medium tracking-wider uppercase"
            aria-label={t("onboarding.stepIndicator", { current: step, total: TOTAL_STEPS })}
          >
            {t("onboarding.stepIndicator", { current: step, total: TOTAL_STEPS })}
          </p>
          <h1 className="text-2xl font-semibold">{t("onboarding.welcomeTitle")}</h1>
          <p className="text-muted-foreground text-sm">{t("onboarding.welcomeSubtitle")}</p>
        </header>

        <section
          aria-label={t("onboarding.welcomeTitle")}
          className="bg-card space-y-3 rounded-lg border p-8 text-center"
        >
          {step === 1 && (
            <>
              <FolderDown className="text-primary mx-auto size-10" aria-hidden />
              <h2 className="text-lg font-medium">{t("onboarding.stepDropTitle")}</h2>
              <p className="text-muted-foreground text-sm">
                {t("onboarding.stepDropDescription")}
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <KeyRound className="text-primary mx-auto size-10" aria-hidden />
              <h2 className="text-lg font-medium">{t("onboarding.stepManualTitle")}</h2>
              <p className="text-muted-foreground text-sm">
                {t("onboarding.stepManualDescription")}
              </p>
              <Button className="mt-2" onClick={() => setCreateOpen(true)}>
                {t("onboarding.createFirstKey")}
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <PartyPopper className="text-primary mx-auto size-10" aria-hidden />
              <h2 className="text-lg font-medium">{t("onboarding.stepDoneTitle")}</h2>
              <p className="text-muted-foreground text-sm">
                {t("onboarding.stepDoneDescription")}
              </p>
            </>
          )}
        </section>

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => void finish()}>
            {t("onboarding.skipOnboarding")}
          </Button>
          {step < TOTAL_STEPS ? (
            <Button onClick={next}>{t("onboarding.nextStep")}</Button>
          ) : (
            <Button onClick={() => void finish()}>{t("onboarding.openInventory")}</Button>
          )}
        </div>
      </div>

      <CreateCredentialDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {
          setCreateOpen(false);
          setStep(3);
        }}
      />
    </div>
  );
}
