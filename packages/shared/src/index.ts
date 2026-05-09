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
  NMMessagePair,
  NMMessageReveal,
  NMMessageSave,
} from "./types/pairing.js";

// password-generator
export {
  generateDiceware,
  getWordlist,
  estimateStrength,
  generateFromRecipe,
} from "./password-generator/index.js";
export type { DicewareLang, StrengthScore, StrengthResult } from "./password-generator/index.js";

// validation (Zod schemas)
export {
  CredentialKindSchema,
  ApiKeyMetaSchema,
  PasswordMetaSchema,
  CreditCardMetaSchema,
  CredentialMetaSchema,
  IssuerRecipeSchema,
  NMMessageInitSchema,
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
  NMMessagePairValidated,
  NMMessageRevealValidated,
  NMMessageSaveValidated,
  NMMessageValidated,
} from "./validation/index.js";
