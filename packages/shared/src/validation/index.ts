/**
 * @file validation/index.ts
 * @license AGPL-3.0-or-later
 *
 * @secretbank/shared validation — Zod schema re-exports.
 */

export {
  CredentialKindSchema,
  ApiKeyMetaSchema,
  PasswordMetaSchema,
  CreditCardMetaSchema,
  CredentialMetaSchema,
} from "./credential.js";
export type {
  CredentialKindInferred,
  ApiKeyMeta,
  PasswordMeta,
  CreditCardMeta,
  CredentialMeta,
} from "./credential.js";

export { IssuerRecipeSchema } from "./recipe.js";
export type { IssuerRecipeValidated } from "./recipe.js";

export {
  NMMessageInitSchema,
  NMMessagePairRequestSchema,
  NMMessagePairResponseSchema,
  NMMessagePairedSchema,
  NMMessagePairSchema,
  NMMessageRevealSchema,
  NMMessageSaveSchema,
  NMMessageSchema,
} from "./pairing.js";
export type {
  NMMessageInitValidated,
  NMMessagePairRequestValidated,
  NMMessagePairResponseValidated,
  NMMessagePairedValidated,
  NMMessagePairValidated,
  NMMessageRevealValidated,
  NMMessageSaveValidated,
  NMMessageValidated,
} from "./pairing.js";
