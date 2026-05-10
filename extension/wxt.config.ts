import { defineConfig } from "wxt";

// Secretbank 브라우저 확장 WXT 설정
// Phase A (WXT 모노레포 골격) — A1 minimal: activeTab + storage 권한만
// nativeMessaging 은 Phase B-1 에서 추가
// A5: @wxt-dev/i18n 모듈 활성화 (4 lang: en/ko/ja/zh)

export default defineConfig({
  // Phase F-1: Chrome + Firefox 우선 (Q1 확정)
  // Safari/Edge 는 Phase F-2 단계적 추가
  browser: "chrome",
  srcDir: ".",
  outDir: "dist",
  modules: ["@wxt-dev/module-react", "@wxt-dev/i18n/module"],
  manifest: {
    name: "Secretbank",
    description:
      "The secrets manager that understands your dependency graph. Save, fill, and manage API keys and passwords with Zero-Knowledge security.",
    version: "0.1.0",
    // A5: i18n 모듈이 동작하려면 default_locale 이 반드시 설정되어야 함
    default_locale: "en",
    // D10: 권한 최소화 — F-1 검증 시점 nativeMessaging 누락 발견 (B-3 NMClient 부터 사용 중이었음)
    permissions: ["activeTab", "storage", "nativeMessaging"],
    // D-1: content_scripts 에 MAIN world entry 명시 (WXT unlisted script + manifest 직접 등록).
    // content-main.ts 는 MAIN world (XHR/fetch hook) — ISOLATED content.ts 와 분리.
    content_scripts: [
      {
        js: ["content-scripts/content-main.js"],
        matches: ["<all_urls>"],
        run_at: "document_start",
        world: "MAIN",
      },
    ],
  },
  // A5: i18n — localesDir 기본값은 srcDir/locales (extension/locales).
  //     @wxt-dev/i18n/module 이 default_locale + locales/ 디렉토리 자동 감지.
  //     WXT UserConfig 에는 i18n 명시 옵션이 없어 module 기본값에 의존.
  vite: () => ({
    css: {
      postcss: {
        plugins: [],
      },
    },
  }),
});
