import { defineConfig } from "wxt";

// Secretbank 브라우저 확장 WXT 설정
// Phase A (WXT 모노레포 골격) — A1 minimal: activeTab + storage 권한만
// nativeMessaging 은 Phase B-1 에서 추가

export default defineConfig({
  // Phase F-1: Chrome + Firefox 우선 (Q1 확정)
  // Safari/Edge 는 Phase F-2 단계적 추가
  browser: "chrome",
  srcDir: ".",
  outDir: "dist",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Secretbank",
    description:
      "The secrets manager that understands your dependency graph. Save, fill, and manage API keys and passwords with Zero-Knowledge security.",
    version: "0.1.0",
    // D10: 권한 최소화 — A1 에서는 activeTab + storage 만
    // nativeMessaging 은 Phase B-1 에서 추가
    permissions: ["activeTab", "storage"],
  },
  vite: () => ({
    css: {
      postcss: {
        plugins: [],
      },
    },
  }),
});
