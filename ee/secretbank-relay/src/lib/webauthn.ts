/**
 * WebAuthn (Passkey) helpers.
 *
 * Wraps @simplewebauthn/server with Secretbank's D1 user/passkey schema and
 * extracts the bits the route handlers need (no business logic in routes).
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { Env } from "../env";

// ────────────────────────────────────────────────────────────
// Origin parsing
// ────────────────────────────────────────────────────────────
export function parseOrigins(env: Env): string[] {
  return env.RP_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

// ────────────────────────────────────────────────────────────
// Encode / decode helpers
// ────────────────────────────────────────────────────────────
export function bufferToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBuffer(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// ────────────────────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────────────────────
export interface BeginRegistrationParams {
  env: Env;
  /** D1 user.id — used as the WebAuthn userHandle */
  userId: string;
  /** The user's identifier shown in the authenticator UI (typically email) */
  userName: string;
  /** Already-registered credential IDs (base64url) — exclude from registration */
  excludeCredentialIds?: string[];
}

export async function beginRegistration(params: BeginRegistrationParams) {
  return generateRegistrationOptions({
    rpName: params.env.RP_NAME,
    rpID: params.env.RP_ID,
    userName: params.userName,
    // simplewebauthn expects Uint8Array<ArrayBuffer>; TextEncoder returns
    // Uint8Array<ArrayBufferLike> on TS 5.6+, hence the cast.
    userID: new TextEncoder().encode(params.userId) as Uint8Array<ArrayBuffer>,
    attestationType: "none",
    excludeCredentials: (params.excludeCredentialIds ?? []).map((id) => ({ id })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
}

export async function finishRegistration(
  env: Env,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: parseOrigins(env),
    expectedRPID: env.RP_ID,
    requireUserVerification: false,
  });
}

// ────────────────────────────────────────────────────────────
// Authentication (assert / login)
// ────────────────────────────────────────────────────────────
export interface BeginAuthenticationParams {
  env: Env;
  allowCredentialIds: string[];
}

export async function beginAuthentication(params: BeginAuthenticationParams) {
  return generateAuthenticationOptions({
    rpID: params.env.RP_ID,
    allowCredentials: params.allowCredentialIds.map((id) => ({ id })),
    userVerification: "preferred",
  });
}

export interface FinishAuthenticationParams {
  env: Env;
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  /** From the DB row keyed by `response.id` */
  storedCredential: {
    id: string;
    publicKey: Uint8Array;
    counter: number;
  };
}

export async function finishAuthentication(
  params: FinishAuthenticationParams,
): Promise<VerifiedAuthenticationResponse> {
  return verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: parseOrigins(params.env),
    expectedRPID: params.env.RP_ID,
    // WebAuthnCredential expects Uint8Array<ArrayBuffer>; cast publicKey to
    // satisfy the nominal type narrowing introduced in TS 5.6+.
    credential: {
      id: params.storedCredential.id,
      publicKey: params.storedCredential.publicKey as Uint8Array<ArrayBuffer>,
      counter: params.storedCredential.counter,
    },
    requireUserVerification: false,
  });
}
