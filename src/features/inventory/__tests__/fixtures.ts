import type { CredentialSummary } from "../types";

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

/** 테스트용 mock credential 10개 — 다양한 env/status/expires_at 조합 */
export const MOCK_CREDENTIALS: CredentialSummary[] = [
  {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
    name: "OpenAI API Key",
    env: "prod",
    status: "active",
    expires_at: NOW + 60 * DAY,
  },
  {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAB",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBC",
    name: "Stripe Secret Key",
    env: "prod",
    status: "active",
    expires_at: NOW + 10 * DAY, // expiring soon
  },
  {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAC",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBD",
    name: "GitHub Token Dev",
    env: "dev",
    status: "active",
    expires_at: null,
  },
  {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAD",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
    name: "Vercel Deploy Token",
    env: "staging",
    status: "active",
    expires_at: NOW - 5 * DAY, // expired
  },
  {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAE",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBC",
    name: "AWS Access Key",
    env: "prod",
    status: "revoked",
    expires_at: null,
  },
  {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAF",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBD",
    name: "Supabase Service Key",
    env: "dev",
    status: "active",
    expires_at: NOW + 90 * DAY,
  },
  {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAG",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
    name: "SendGrid API Key",
    env: "staging",
    status: "compromised",
    expires_at: null,
  },
  {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAH",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBC",
    name: "Twilio Auth Token",
    env: "prod",
    status: "active",
    expires_at: NOW + 20 * DAY, // expiring soon
  },
  {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAI",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBD",
    name: "Cloudflare API Key",
    env: "dev",
    status: "revoked",
    expires_at: null,
  },
  {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAJ",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
    name: "Doppler Token",
    env: "staging",
    status: "active",
    expires_at: NOW + 120 * DAY,
  },
];
