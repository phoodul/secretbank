// PostCSS 설정 — Secretbank Browser Extension
// postcss-rem-to-responsive-pixel: Shadow DOM content script 에서 rem 이 host 페이지
//   root font-size 영향 받지 않도록 px 변환 (Phase C 에서 활성 사용 예정)
// 2026-05-10: postcss-rem-to-pixel (2017년 마지막 release, postcss 5.x peer)
//   → postcss-rem-to-responsive-pixel (postcss 8 peer, active maintained)
//   교체. API 호환 (rootValue + propList 동일, transformUnit default 'px').
//   GHSA-qx2v-qp2m-jg93 / 7fh5-64p2-3v2j / 566m-qj78-rww5 (postcss 5.2.18 transitive) 해소.

/** @type {import('postcss-load-config').Config} */
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-rem-to-responsive-pixel": {
      // 브라우저 기본 16px 기준으로 변환
      // content script Shadow DOM 에서 host 페이지 영향 차단
      propList: ["*"],
      rootValue: 16,
    },
  },
};
