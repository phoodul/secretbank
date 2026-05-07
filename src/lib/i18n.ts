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
import ar from "@/locales/ar/common.json";
import hi from "@/locales/hi/common.json";
import vi from "@/locales/vi/common.json";
import pl from "@/locales/pl/common.json";

import enSecurity from "@/locales/en/security.json";
import koSecurity from "@/locales/ko/security.json";
import jaSecurity from "@/locales/ja/security.json";
import zhSecurity from "@/locales/zh/security.json";

import enCreditCard from "@/locales/en/creditCard.json";
import koCreditCard from "@/locales/ko/creditCard.json";
import jaCreditCard from "@/locales/ja/creditCard.json";
import zhCreditCard from "@/locales/zh/creditCard.json";

/**
 * 지원 언어 목록 — UI 의 LanguageSwitcher 가 이 배열을 그대로 표시한다.
 * `nativeName` 은 모국어 표기 (글로벌 UX 베스트 프랙티스 — "한국어" 가 "Korean" 보다 인지 정확).
 * `dir` 은 텍스트 방향 — 아랍어는 "rtl", 그 외는 "ltr".
 * 새 locale 을 추가할 때 이 목록과 i18next.resources / supportedLngs 동시에 갱신.
 */
export const SUPPORTED_LANGUAGES = [
  { code: "en", nativeName: "English", englishName: "English", dir: "ltr" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", dir: "ltr" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese", dir: "ltr" },
  { code: "zh", nativeName: "中文", englishName: "Chinese", dir: "ltr" },
  { code: "es", nativeName: "Español", englishName: "Spanish", dir: "ltr" },
  { code: "fr", nativeName: "Français", englishName: "French", dir: "ltr" },
  { code: "de", nativeName: "Deutsch", englishName: "German", dir: "ltr" },
  { code: "it", nativeName: "Italiano", englishName: "Italian", dir: "ltr" },
  { code: "el", nativeName: "Ελληνικά", englishName: "Greek", dir: "ltr" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese", dir: "ltr" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", dir: "ltr" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic", dir: "rtl" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", dir: "ltr" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", dir: "ltr" },
  { code: "pl", nativeName: "Polski", englishName: "Polish", dir: "ltr" },
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en, security: enSecurity, creditCard: enCreditCard },
      ko: { common: ko, security: koSecurity, creditCard: koCreditCard },
      ja: { common: ja, security: jaSecurity, creditCard: jaCreditCard },
      zh: { common: zh, security: zhSecurity, creditCard: zhCreditCard },
      es: { common: es },
      fr: { common: fr },
      de: { common: de },
      it: { common: it },
      el: { common: el },
      pt: { common: pt },
      ru: { common: ru },
      ar: { common: ar },
      hi: { common: hi },
      vi: { common: vi },
      pl: { common: pl },
    },
    defaultNS: "common",
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    returnNull: false,
    interpolation: {
      escapeValue: false,
    },
  });

/**
 * 언어 변경 시 `<html lang>` + `<html dir>` 을 자동 동기화.
 * SSR 이 아니라 브라우저/Tauri webview 환경이라 document 직접 접근.
 * RTL 언어 (아랍어) 가 LayoutDirection 을 자동 뒤집도록 보장.
 */
function applyDocumentLanguage(lng: string) {
  if (typeof document === "undefined") return;
  const meta =
    SUPPORTED_LANGUAGES.find((l) => l.code === lng) ??
    SUPPORTED_LANGUAGES.find((l) => lng.startsWith(l.code)) ??
    SUPPORTED_LANGUAGES[0];
  document.documentElement.lang = meta.code;
  document.documentElement.dir = meta.dir;
}

applyDocumentLanguage(i18next.resolvedLanguage ?? i18next.language ?? "en");
i18next.on("languageChanged", applyDocumentLanguage);

export default i18next;
