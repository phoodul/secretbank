import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en/common.json";
import ko from "@/locales/ko/common.json";
import ja from "@/locales/ja/common.json";
import zh from "@/locales/zh/common.json";
import es from "@/locales/es/common.json";
import fr from "@/locales/fr/common.json";
import de from "@/locales/de/common.json";
import it from "@/locales/it/common.json";
import el from "@/locales/el/common.json";
import pt from "@/locales/pt/common.json";
import ru from "@/locales/ru/common.json";

/**
 * 지원 언어 목록 — UI 의 LanguageSwitcher 가 이 배열을 그대로 표시한다.
 * `nativeName` 은 모국어 표기 (글로벌 UX 베스트 프랙티스 — "한국어" 가 "Korean" 보다 인지 정확).
 * 새 locale 을 추가할 때 이 목록과 i18next.resources / supportedLngs 동시에 갱신.
 */
export const SUPPORTED_LANGUAGES = [
  { code: "en", nativeName: "English", englishName: "English" },
  { code: "ko", nativeName: "한국어", englishName: "Korean" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese" },
  { code: "zh", nativeName: "中文", englishName: "Chinese" },
  { code: "es", nativeName: "Español", englishName: "Spanish" },
  { code: "fr", nativeName: "Français", englishName: "French" },
  { code: "de", nativeName: "Deutsch", englishName: "German" },
  { code: "it", nativeName: "Italiano", englishName: "Italian" },
  { code: "el", nativeName: "Ελληνικά", englishName: "Greek" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese" },
  { code: "ru", nativeName: "Русский", englishName: "Russian" },
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      ko: { common: ko },
      ja: { common: ja },
      zh: { common: zh },
      es: { common: es },
      fr: { common: fr },
      de: { common: de },
      it: { common: it },
      el: { common: el },
      pt: { common: pt },
      ru: { common: ru },
    },
    defaultNS: "common",
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    returnNull: false,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18next;
