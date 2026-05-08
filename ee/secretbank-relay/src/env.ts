export interface Env {
  DB: D1Database;
  TOKEN_CACHE: KVNamespace;

  // M5 GitHub Connector
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  LOG_LEVEL: string;

  // M8 Auth (Passkey + OAuth + JWT)
  /** WebAuthn Relying Party ID — production: secretbank.app, dev: localhost */
  RP_ID: string;
  /** WebAuthn Relying Party display name */
  RP_NAME: string;
  /**
   * Allowed origins (comma-separated). Tauri prod webview origin is
   * `tauri://localhost`; vite dev server is `http://localhost:1420`.
   */
  RP_ORIGINS: string;
  /**
   * JWT signing key. ES256 PKCS#8 PEM string (wrangler secret put).
   * In dev/test the empty string falls back to a deterministic key
   * derived from RP_ID so that local tests don't require a real secret.
   */
  JWT_SIGNING_KEY: string;

  // OAuth (T082) — empty means provider disabled
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
}
