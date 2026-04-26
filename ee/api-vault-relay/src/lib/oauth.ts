/**
 * OAuth 2.0 helpers — GitHub + Google.
 *
 * The desktop client opens the authorize URL in the system browser, and the
 * provider redirects back to the relay's `/auth/oauth/:provider/callback`.
 * The relay exchanges the code, fetches user info, upserts a user, then
 * mints an access+refresh JWT pair.
 *
 * Why provider-specific helpers? Each provider has small but meaningful
 * differences (GitHub's email-private case, Google's `id_token`, etc.).
 * Shared abstractions blur those — keep the surface small and explicit.
 */
import type { Env } from "../env";

export type Provider = "github" | "google";

export const SUPPORTED_PROVIDERS: readonly Provider[] = ["github", "google"] as const;

export function isProvider(s: unknown): s is Provider {
  return typeof s === "string" && (SUPPORTED_PROVIDERS as readonly string[]).includes(s);
}

// ────────────────────────────────────────────────────────────
// Provider config
// ────────────────────────────────────────────────────────────
interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
}

function configFor(provider: Provider, env: Env): ProviderConfig {
  switch (provider) {
    case "github":
      return {
        clientId: env.GITHUB_OAUTH_CLIENT_ID,
        clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
        authorizeUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        scope: "read:user user:email",
      };
    case "google":
      return {
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "openid email profile",
      };
  }
}

// ────────────────────────────────────────────────────────────
// Authorize URL
// ────────────────────────────────────────────────────────────
export interface AuthorizeUrlParams {
  provider: Provider;
  env: Env;
  state: string;
  redirectUri: string;
}

export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const cfg = configFor(params.provider, params.env);
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("state", params.state);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export function isProviderEnabled(provider: Provider, env: Env): boolean {
  const cfg = configFor(provider, env);
  return cfg.clientId.length > 0 && cfg.clientSecret.length > 0;
}

// ────────────────────────────────────────────────────────────
// Code → user info
// ────────────────────────────────────────────────────────────
export interface ExchangeResult {
  /** Provider's stable user id (string for both GitHub and Google) */
  providerId: string;
  /** Verified primary email (may be null for GitHub when private/no scope) */
  email: string | null;
}

export class OAuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function exchangeCode(
  provider: Provider,
  env: Env,
  code: string,
  redirectUri: string,
): Promise<ExchangeResult> {
  if (!isProviderEnabled(provider, env)) {
    throw new OAuthError(`${provider} oauth is not configured`, "provider_disabled", 503);
  }

  switch (provider) {
    case "github":
      return exchangeGithub(env, code, redirectUri);
    case "google":
      return exchangeGoogle(env, code, redirectUri);
  }
}

// ────────────────────────────────────────────────────────────
// GitHub
// ────────────────────────────────────────────────────────────
async function exchangeGithub(env: Env, code: string, redirectUri: string): Promise<ExchangeResult> {
  const cfg = configFor("github", env);

  const tokenResp = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResp.ok) {
    throw new OAuthError(`github token exchange failed: ${tokenResp.status}`, "token_exchange_failed", 502);
  }
  const tokenJson = (await tokenResp.json()) as { access_token?: string; error?: string };
  if (!tokenJson.access_token) {
    throw new OAuthError(
      `github token exchange returned no token: ${tokenJson.error ?? "unknown"}`,
      "token_missing",
      502,
    );
  }

  const userResp = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "api-vault-relay",
    },
  });
  if (!userResp.ok) {
    throw new OAuthError(`github /user failed: ${userResp.status}`, "user_fetch_failed", 502);
  }
  const userJson = (await userResp.json()) as { id?: number | string; email?: string | null };
  if (userJson.id === undefined || userJson.id === null) {
    throw new OAuthError("github /user missing id", "user_missing_id", 502);
  }

  let email = (userJson.email ?? null) as string | null;
  if (!email) {
    // Fall back to /user/emails when the primary email is private
    const emailsResp = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "api-vault-relay",
      },
    });
    if (emailsResp.ok) {
      const emails = (await emailsResp.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      email = primary?.email ?? null;
    }
  }

  return { providerId: String(userJson.id), email };
}

// ────────────────────────────────────────────────────────────
// Google
// ────────────────────────────────────────────────────────────
async function exchangeGoogle(env: Env, code: string, redirectUri: string): Promise<ExchangeResult> {
  const cfg = configFor("google", env);

  const tokenForm = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const tokenResp = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenForm.toString(),
  });
  if (!tokenResp.ok) {
    throw new OAuthError(`google token exchange failed: ${tokenResp.status}`, "token_exchange_failed", 502);
  }
  const tokenJson = (await tokenResp.json()) as { access_token?: string; id_token?: string };
  if (!tokenJson.access_token) {
    throw new OAuthError("google token exchange returned no access_token", "token_missing", 502);
  }

  const userResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userResp.ok) {
    throw new OAuthError(`google userinfo failed: ${userResp.status}`, "user_fetch_failed", 502);
  }
  const userJson = (await userResp.json()) as { id?: string; email?: string; verified_email?: boolean };
  if (!userJson.id) {
    throw new OAuthError("google userinfo missing id", "user_missing_id", 502);
  }

  return {
    providerId: userJson.id,
    email: userJson.verified_email && userJson.email ? userJson.email : null,
  };
}
