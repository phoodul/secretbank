export interface Env {
  DB: D1Database;
  TOKEN_CACHE: KVNamespace;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  LOG_LEVEL: string;
}
