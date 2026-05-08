// Tailwind CSS v4 — CSS-first 구성
// 실제 디자인 토큰은 extension/styles/globals.css 의 @theme 블록에 정의
// 이 파일은 content 경로 지정 + Tailwind v4 플러그인 설정 역할

import type { Config } from "tailwindcss";

const config: Config = {
  // Tailwind v4 content 경로 (WXT 빌드 산출물 포함)
  content: [
    "./entrypoints/**/*.{ts,tsx,html}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  // Tailwind v4: theme 는 CSS @theme 블록에서 관리 (JS config 없음)
  // darkMode 는 CSS @custom-variant 로 처리
  theme: {},
  plugins: [],
};

export default config;
