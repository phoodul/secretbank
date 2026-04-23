import { useSetting } from "@/features/settings/use-settings";

export const ONBOARDING_DONE_KEY = "apivault.settings.onboarding.done";

export function useOnboardingDone() {
  return useSetting<boolean>({
    key: ONBOARDING_DONE_KEY,
    defaultValue: false,
    parse: (raw) => raw === "true",
    serialize: (v) => (v ? "true" : "false"),
  });
}
