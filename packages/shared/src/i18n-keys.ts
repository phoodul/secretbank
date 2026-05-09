/**
 * @file i18n-keys.ts
 * @license AGPL-3.0-or-later
 *
 * i18n 키 상수 — Source of Truth.
 *
 * 이 상수가 정의하는 키와 extension/locales/*.yml 의 키가 반드시 1:1 일치해야 한다.
 * drift (불일치) 는 extension/lib/__tests__/i18n.test.ts 의 drift detection 테스트가 검증한다.
 *
 * 사용:
 *   - Extension: `import { I18N_KEYS } from '@secretbank/shared'; t(I18N_KEYS.POPUP_TITLE)`
 *   - Desktop (Phase B 이후): `import { I18N_KEYS } from '@secretbank/shared';`
 *
 * 키 명명 규칙:
 *   - YAML 키는 snake_case (예: popup_title)
 *   - TypeScript 상수는 SCREAMING_SNAKE_CASE (예: POPUP_TITLE)
 *   - WXT i18n 은 dot-notation (예: popup.title) 을 _로 변환하여 browser.i18n.getMessage 호출
 */

/**
 * Secretbank i18n 키 상수.
 *
 * YAML 파일의 최상위 키와 정확히 일치해야 한다.
 * 누락·추가 시 drift detection 테스트가 실패한다.
 */
export const I18N_KEYS = {
  /** 팝업 제목 — "Secretbank" */
  POPUP_TITLE: "popup_title",
  /** 팝업 헤더 인사말 — "Manage your secrets" */
  POPUP_GREETING: "popup_greeting",
  /** 페어링 시작 버튼 — "Connect to Desktop" */
  PAIRING_START: "pairing_start",
  /** 저장 버튼 — "Save Secret" */
  SAVE_BUTTON: "save_button",
  /** 취소 버튼 — "Cancel" */
  CANCEL_BUTTON: "cancel_button",
  /** 설정 제목 — "Settings" */
  SETTINGS_TITLE: "settings_title",
  /** 볼트 잠김 상태 — "Vault is locked" */
  VAULT_LOCKED: "vault_locked",
  /** 볼트 잠금 해제 상태 — "Vault is unlocked" */
  VAULT_UNLOCKED: "vault_unlocked",
  /** 크리덴셜 목록 빈 상태 — "No secrets saved yet" */
  CREDENTIAL_LIST_EMPTY: "credential_list_empty",
  /** 클립보드 복사 — "Copy to clipboard" */
  COPY_TO_CLIPBOARD: "copy_to_clipboard",
} as const;

/**
 * I18N_KEYS 의 value 타입 — 유효한 i18n 키 리터럴 union.
 */
export type I18nKey = (typeof I18N_KEYS)[keyof typeof I18N_KEYS];

/**
 * 지원 로케일 목록.
 * extension/locales/ 의 파일명과 일치해야 한다.
 * zh_CN: Chrome web extension 로케일 규격 — 단순 "zh" 는 미지원.
 */
export const SUPPORTED_LOCALES = ["en", "ko", "ja", "zh_CN"] as const;

/** 지원 로케일 타입 */
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
