// PostCSS 설정 — Secretbank Browser Extension
// postcss-rem-to-pixel: Shadow DOM content script 에서 rem 이 host 페이지
//   root font-size 영향 받지 않도록 px 변환 (Phase C 에서 활성 사용 예정)
// A1 에서는 셋업만 (popup 은 기본 rem 사용 가능, px 변환 포함)

/** @type {import('postcss-load-config').Config} */
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-rem-to-pixel": {
      // 브라우저 기본 16px 기준으로 변환
      // content script Shadow DOM 에서 host 페이지 영향 차단
      propList: ["*"],
      rootValue: 16,
    },
  },
};
