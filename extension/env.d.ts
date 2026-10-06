// TS 6.0 부터 side-effect import 에도 선언이 필요하다 (TS2882). WXT 가 CSS 를 번들하므로
// 타입은 빈 모듈로 선언한다.
declare module "*.css";
