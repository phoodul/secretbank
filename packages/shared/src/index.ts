/**
 * @file index.ts
 * @license AGPL-3.0-or-later
 *
 * @secretbank/shared — 데스크톱 앱과 브라우저 확장이 공유하는 타입 모음.
 */

export type { CredentialKind } from "./types/credential.js";
export type { IssuerRecipe } from "./types/recipe.js";
export type {
  PairingState,
  SessionToken,
  NMMessage,
  NMMessageInit,
  NMMessagePairRequest,
  NMMessagePairResponse,
  NMMessagePaired,
  NMMessageReveal,
  NMMessageSave,
  NMMessageCredentialListByDomain,
  NMMessageCredentialListByDomainResponse,
  NMMessageCredentialCreate,
  NMMessageCredentialUpdate,
  NMMessageCredentialSaveResponse,
  NMMessageGetRecipeForDomain,
  NMMessageGetRecipeForDomainResponse,
  NMMessageUpsertRecipeForDomain,
  NMMessageUpsertRecipeForDomainResponse,
  // E-4: credential 전체 목록 조회
  CredentialListItem,
  NMMessageGetCredentialList,
  NMMessageGetCredentialListResponse,
  // G1-1: credential mini-graph RPC
  NMMessageGraphForCredential,
  NMMessageGraphForCredentialResponse,
  // G2-1: host incident 조회 RPC
  NMMessageIncidentCheckForHost,
  NMMessageIncidentCheckForHostResponse,
  // G3-1: blast radius preview RPC
  NMMessageBlastRadiusForHost,
  NMMessageBlastRadiusForHostResponse,
  // 하위 호환
  NMMessagePair,
} from "./types/pairing.js";
// G2-1: incident 타입
export type { IncidentMatchSummary } from "./types/incident.js";
// G1-1: mini-graph 타입
export type { CredentialMiniGraph, ProjectNode, MiniGraphEdge } from "./types/graph.js";
// G3-1: blast radius preview 타입
export type {
  BlastRadiusItem,
  BlastRadiusForHostResponse,
} from "./types/blast-radius.js";

// password-generator
export {
  generateDiceware,
  getWordlist,
  estimateStrength,
  generateFromRecipe,
} from "./password-generator/index.js";
export type { DicewareLang, StrengthScore, StrengthResult } from "./password-generator/index.js";

// i18n 키 상수 (extension + desktop 공유 source of truth)
export { I18N_KEYS, SUPPORTED_LOCALES } from "./i18n-keys.js";
export type { I18nKey, SupportedLocale } from "./i18n-keys.js";

// validation (Zod schemas)
export {
  CredentialKindSchema,
  ApiKeyMetaSchema,
  PasswordMetaSchema,
  CreditCardMetaSchema,
  CredentialMetaSchema,
  IssuerRecipeSchema,
  NMMessageInitSchema,
  NMMessagePairRequestSchema,
  NMMessagePairResponseSchema,
  NMMessagePairedSchema,
  NMMessagePairSchema,
  NMMessageRevealSchema,
  NMMessageSaveSchema,
  NMMessageSchema,
} from "./validation/index.js";
export type {
  CredentialKindInferred,
  ApiKeyMeta,
  PasswordMeta,
  CreditCardMeta,
  CredentialMeta,
  IssuerRecipeValidated,
  NMMessageInitValidated,
  NMMessagePairRequestValidated,
  NMMessagePairResponseValidated,
  NMMessagePairedValidated,
  NMMessagePairValidated,
  NMMessageRevealValidated,
  NMMessageSaveValidated,
  NMMessageValidated,
} from "./validation/index.js";
