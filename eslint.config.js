import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "src-tauri/target",
      "src-tauri/gen",
      // EE (api-vault-relay) 는 별도 lint 환경 (Cloudflare Workers + 자체 tsconfig).
      // 루트 ESLint 는 OSS frontend (src/) 만 다룸.
      "ee/**",
      // vscode-extension 의 컴파일 산출물은 lint 대상 아님 (TS 소스만 lint).
      "vscode-extension/out/**",
      "vscode-extension/node_modules/**",
      "vscode-extension/**/*.vsix",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  {
    settings: { react: { version: "detect" } },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaVersion: 2022 },
    },
    settings: { react: { version: "detect" } },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // 새로 추가된 react-hooks strict 룰들 — 기존 패턴 회귀 방지를 위해 warn 으로
      // 다운그레이드. 정식 fix 는 별도 lap (M13.5 또는 M14 의 일부) 에서.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      // _ 접두사는 "의도된 미사용" 표기 — 무시하도록 (test/mock 의 _token 등)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // scripts/ 와 e2e/ 는 Node 환경 — node globals 적용 + commonjs 허용.
  {
    files: ["scripts/**/*.{ts,js}", "e2e/**/*.{ts,js}", "*.config.{ts,js}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaVersion: 2022 },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // vscode-extension 의 TS 소스 — VS Code API 의 CancellationToken 같은 인자가
  // _token 으로 declare 되어 있음 (의도된 미사용). _ 접두사 ignore 적용.
  {
    files: ["vscode-extension/src/**/*.ts"],
    languageOptions: {
      globals: globals.node,
      parserOptions: { ecmaVersion: 2022 },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
);
