/**
 * @file i18n.ts
 * @license AGPL-3.0-or-later
 *
 * @wxt-dev/i18n 초기화 + t() helper.
 *
 * WXT 빌드 시 `extension/locales/*.yml` 파일을 읽어
 * `_locales/{lang}/messages.json` 으로 자동 변환한다.
 *
 * 런타임에서 i18n.t(key) 는 browser.i18n.getMessage(key) 를 호출한다.
 * key 의 dot-notation 은 자동으로 underscore 로 변환된다.
 *
 * 사용 예:
 *   import { t } from '../lib/i18n';
 *   import { I18N_KEYS } from '@secretbank/shared';
 *   const title = t(I18N_KEYS.POPUP_TITLE);
 */

import { createI18n } from "@wxt-dev/i18n";

/**
 * i18n 인스턴스.
 * WXT 빌드 시 @wxt-dev/i18n/module 이 #i18n alias 를 생성하여
 * 타입 안전한 GeneratedI18nStructure 를 주입한다.
 *
 * Vitest 환경 (WXT 빌드 없음) 에서는 DefaultI18nStructure (any) 로 동작하므로
 * 키 resolution 테스트는 extension/lib/__tests__/i18n.test.ts 에서 별도로 수행한다.
 */
export const i18n = createI18n();

/**
 * 키를 받아 현재 로케일의 메시지 문자열을 반환한다.
 *
 * @param key - I18N_KEYS 상수에 정의된 키 (snake_case)
 * @returns 현재 브라우저 로케일에 맞는 번역 문자열
 */
export function t(key: string): string {
  return i18n.t(key as Parameters<typeof i18n.t>[0]);
}
