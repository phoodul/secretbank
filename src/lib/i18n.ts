import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en/common.json";
import ko from "@/locales/ko/common.json";
import ja from "@/locales/ja/common.json";
import zh from "@/locales/zh/common.json";

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      ko: { common: ko },
      ja: { common: ja },
      zh: { common: zh },
    },
    defaultNS: "common",
    fallbackLng: "en",
    supportedLngs: ["en", "ko", "ja", "zh"],
    returnNull: false,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18next;
