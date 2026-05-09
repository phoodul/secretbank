import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
    // @noble/* 패키지는 browser/default 조건으로 해석해야 함
    conditions: ["browser", "import", "module", "default"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest-setup.ts"],
    include: ["components/**/__tests__/**/*.test.{ts,tsx,js}", "**/__tests__/**/*.test.{ts,tsx,js}"],
    exclude: ["node_modules", "dist", ".wxt"],
  },
});
