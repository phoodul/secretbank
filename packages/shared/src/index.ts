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
