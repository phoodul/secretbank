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

  // ── A6: popup Tab 이름 ──
  /** Pairing 탭 이름 — "Pairing" */
  POPUP_TABS_PAIRING: "popup_tabs_pairing",
  /** Credentials 탭 이름 — "Credentials" */
  POPUP_TABS_CREDENTIALS: "popup_tabs_credentials",
  /** Save 탭 이름 — "Save" */
  POPUP_TABS_SAVE: "popup_tabs_save",
  /** Settings 탭 이름 — "Settings" */
  POPUP_TABS_SETTINGS: "popup_tabs_settings",
  /** Theme 토글 버튼 aria-label — "Toggle theme" */
  POPUP_THEME_TOGGLE: "popup_theme_toggle",

  // ── A6: placeholder 메시지 ──
  /** PairingDialog placeholder — "Coming in Phase B…" */
  POPUP_PLACEHOLDER_PAIRING: "popup_placeholder_pairing",
  /** CredentialList placeholder — "Coming in Phase C…" */
  POPUP_PLACEHOLDER_CREDENTIALS: "popup_placeholder_credentials",
  /** SaveDialog placeholder — "Coming in Phase D…" */
  POPUP_PLACEHOLDER_SAVE: "popup_placeholder_save",
  /** Settings placeholder — "Coming in Phase E…" */
  POPUP_PLACEHOLDER_SETTINGS: "popup_placeholder_settings",

  // ── B-5: PairingDialog 상태 메시지 ──
  /** 페어링 대기 중 상태 메시지 */
  PAIRING_PENDING: "pairing_pending",
  /** 페어링 완료 상태 배지 */
  PAIRING_PAIRED: "pairing_paired",
  /** 에러: nm-host 미설치 */
  PAIRING_ERROR_NOT_INSTALLED: "pairing_error_not_installed",
  /** 에러: 사용자 거부 */
  PAIRING_ERROR_REJECTED: "pairing_error_rejected",
  /** 에러: 타임아웃 */
  PAIRING_ERROR_TIMEOUT: "pairing_error_timeout",
  /** 에러: 프로토콜 오류 */
  PAIRING_ERROR_PROTOCOL: "pairing_error_protocol",
  /** 디바이스 ID 레이블 */
  PAIRING_FINGERPRINT_LABEL: "pairing_fingerprint_label",
  /** 다시 페어링 버튼 */
  PAIRING_REPAIR_BUTTON: "pairing_repair_button",
  /** 에러 상태 도움말 — 데스크톱 앱 실행 확인 안내 */
  PAIRING_OPEN_APP: "pairing_open_app",

  // ── B-7: Extension session settings ──
  /** Session 설정 섹션 제목 */
  SESSION_SETTINGS_TITLE: "session_settings_title",
  /** Session TTL 옵션 레이블 */
  SESSION_TTL_LABEL: "session_ttl_label",
  /** Session TTL 설명 */
  SESSION_TTL_DESCRIPTION: "session_ttl_description",
  /** TTL 옵션: 30분 */
  SESSION_TTL_MINS30: "session_ttl_mins30",
  /** TTL 옵션: 1시간 */
  SESSION_TTL_HOUR1: "session_ttl_hour1",
  /** TTL 옵션: 4시간 (기본값) */
  SESSION_TTL_HOURS4: "session_ttl_hours4",
  /** TTL 옵션: 8시간 */
  SESSION_TTL_HOURS8: "session_ttl_hours8",
  /** TTL 옵션: 사용자 잠금까지 */
  SESSION_TTL_UNTIL_LOCK: "session_ttl_until_lock",
  /** 설정 변경 확인 dialog 제목 */
  SESSION_ROTATE_CONFIRM_TITLE: "session_rotate_confirm_title",
  /** 설정 변경 확인 dialog 설명 */
  SESSION_ROTATE_CONFIRM_DESCRIPTION: "session_rotate_confirm_description",
  /** 설정 변경 확인 버튼 */
  SESSION_ROTATE_CONFIRM_OK: "session_rotate_confirm_ok",
  /** 설정 변경 취소 버튼 */
  SESSION_ROTATE_CONFIRM_CANCEL: "session_rotate_confirm_cancel",
  /** 설정 저장 성공 토스트 */
  SESSION_SETTINGS_SAVED: "session_settings_saved",
  /** 설정 저장 실패 토스트 */
  SESSION_SETTINGS_SAVE_FAILED: "session_settings_save_failed",

  // ── D-3: SaveBanner ──
  /** SaveBanner 제목 — 신규 크리덴셜 */
  SAVE_BANNER_TITLE_NEW: "save_banner_title_new",
  /** SaveBanner 제목 — 기존 크리덴셜 업데이트 */
  SAVE_BANNER_TITLE_UPDATE: "save_banner_title_update",
  /** SaveBanner 기본 버튼 — 신규 저장 */
  SAVE_BANNER_ACTION_SAVE: "save_banner_action_save",
  /** SaveBanner 기본 버튼 — 업데이트 */
  SAVE_BANNER_ACTION_UPDATE: "save_banner_action_update",
  /** SaveBanner 버튼 — 이 사이트에서 영구 숨김 */
  SAVE_BANNER_ACTION_NEVER: "save_banner_action_never",
  /** SaveBanner 버튼 — 일시 dismiss */
  SAVE_BANNER_ACTION_DISMISS: "save_banner_action_dismiss",

  // ── D-6: SaveDialog (popup) ──
  /** SaveDialog: 저장 완료 메시지 */
  SAVE_DIALOG_SAVED: "save_dialog_saved",
  /** SaveDialog: issuer 필드 라벨 */
  SAVE_DIALOG_ISSUER: "save_dialog_issuer",
  /** SaveDialog: name 필드 라벨 */
  SAVE_DIALOG_NAME: "save_dialog_name",
  /** SaveDialog: username 필드 라벨 */
  SAVE_DIALOG_USERNAME: "save_dialog_username",
  /** SaveDialog: notes 필드 라벨 */
  SAVE_DIALOG_NOTES: "save_dialog_notes",
  /** SaveDialog: 저장 중 버튼 텍스트 */
  SAVE_DIALOG_SAVING: "save_dialog_saving",

  // ── E-1: GeneratorPanel ──
  /** Generator panel 제목 */
  GENERATOR_TITLE: "generator_title",
  /** Generator 모드: Diceware */
  GENERATOR_MODE_DICEWARE: "generator_mode_diceware",
  /** Generator 모드: Random */
  GENERATOR_MODE_RANDOM: "generator_mode_random",
  /** Generator Diceware 단어 수 */
  GENERATOR_WORDS_COUNT: "generator_words_count",
  /** Generator Random 길이 */
  GENERATOR_LENGTH: "generator_length",
  /** Generator 결과 사용 버튼 */
  GENERATOR_USE_THIS: "generator_use_this",
  /** Generator 재생성 버튼 */
  GENERATOR_REGENERATE: "generator_regenerate",
  /** Generator 강도: 매우 취약 */
  GENERATOR_STRENGTH_WEAK: "generator_strength_weak",
  /** Generator 강도: 취약 */
  GENERATOR_STRENGTH_FAIR: "generator_strength_fair",
  /** Generator 강도: 보통 */
  GENERATOR_STRENGTH_GOOD: "generator_strength_good",
  /** Generator 강도: 강함 */
  GENERATOR_STRENGTH_STRONG: "generator_strength_strong",

  // ── G-2-2: SupplyChainBanner ──
  /** SupplyChainBanner 제목 — "Security incident reported" */
  SUPPLY_CHAIN_BANNER_TITLE: "supply_chain_banner_title",
  /** SupplyChainBanner 주요 CTA — "View details" */
  SUPPLY_CHAIN_BANNER_ACTION_VIEW: "supply_chain_banner_action_view",
  /** SupplyChainBanner 보조 — "Dismiss for 7 days" */
  SUPPLY_CHAIN_BANNER_ACTION_DISMISS: "supply_chain_banner_action_dismiss",
  /** SupplyChainBanner severity 배지 — HIGH */
  SUPPLY_CHAIN_BANNER_SEVERITY_HIGH: "supply_chain_banner_severity_high",
  /** SupplyChainBanner severity 배지 — MEDIUM */
  SUPPLY_CHAIN_BANNER_SEVERITY_MEDIUM: "supply_chain_banner_severity_medium",
  /** SupplyChainBanner severity 배지 — CRITICAL */
  SUPPLY_CHAIN_BANNER_SEVERITY_CRITICAL: "supply_chain_banner_severity_critical",

  // ── G-3-2: BlastRadiusPreviewCard ──
  /** BlastRadiusPreviewCard 섹션 제목 */
  BLAST_RADIUS_TITLE: "blast_radius_title",
  /** BlastRadiusPreviewCard 본문 — "이 변경이 N개 항목에 영향" ($COUNT$ 치환) */
  BLAST_RADIUS_AFFECTS: "blast_radius_affects",
  /** BlastRadiusPreviewCard 잘린 항목 표시 (+N개 더, $COUNT$ 치환) */
  BLAST_RADIUS_HIDDEN_COUNT: "blast_radius_hidden_count",
  /** BlastRadiusPreviewCard CTA — "그래프에서 보기" */
  BLAST_RADIUS_VIEW_DETAILS: "blast_radius_view_details",
  /** BlastRadiusPreviewCard 항목 종류 라벨: project */
  BLAST_RADIUS_KIND_PROJECT: "blast_radius_kind_project",
  /** BlastRadiusPreviewCard 항목 종류 라벨: deployment */
  BLAST_RADIUS_KIND_DEPLOYMENT: "blast_radius_kind_deployment",

  // ── G-4-2: MCP context push 인디케이터 ──
  /** popup 우상단 MCP 활성 인디케이터 aria-label */
  MCP_CONTEXT_INDICATOR: "mcp_context_indicator",

  // ── G-5: RailguardHintBanner ──
  /** RailguardHintBanner 제목 — "API key / password risk on AI site" */
  RAILGUARD_HINT_BANNER_TITLE: "railguard_hint_banner_title",
  /** RailguardHintBanner 주요 CTA — "Generate RAILGUARD rules →" */
  RAILGUARD_HINT_BANNER_ACTION_CREATE: "railguard_hint_banner_action_create",
  /** RailguardHintBanner 보조 — "Hide for 1 week" */
  RAILGUARD_HINT_BANNER_ACTION_DISMISS: "railguard_hint_banner_action_dismiss",
  /** RailguardHintBanner severity 배지 — "RAILGUARD" */
  RAILGUARD_HINT_BANNER_SEVERITY: "railguard_hint_banner_severity",
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
