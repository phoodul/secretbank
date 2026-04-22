/**
 * Built-in issuer preset definitions (T028).
 *
 * - `key_pattern_regex` values are approximate patterns for drop-and-scan
 *   matching (T033). Accuracy will be re-validated in T033.
 * - `icon` is a Lucide component used for UI rendering. Brand logos are not
 *   available in Lucide, so cloud providers use `Cloud` and the rest use
 *   `KeyRound`.
 * - `brand_color` is intentionally omitted until T026 UI needs it.
 */

import type { LucideIcon } from "lucide-react";
import { Cloud, KeyRound } from "lucide-react";

export interface IssuerPreset {
  /** Matches `issuer.slug` in the SQLite database. */
  slug: string;
  display_name: string;
  docs_url?: string;
  issue_url?: string;
  status_url?: string;
  security_feed_url?: string;
  /** Matches `issuer.icon_key` in the SQLite database. */
  icon_key: string;
  /** Lucide icon component for UI rendering. */
  icon: LucideIcon;
  /**
   * Regex string for drop-and-scan secret detection (T033).
   * These are approximate patterns — precision will be re-validated in T033.
   */
  key_pattern_regex: string;
}

export const ISSUER_PRESETS: IssuerPreset[] = [
  {
    slug: "openai",
    display_name: "OpenAI",
    docs_url: "https://platform.openai.com/docs/api-reference",
    issue_url: "https://platform.openai.com/account/api-keys",
    status_url: "https://status.openai.com",
    security_feed_url: undefined,
    icon_key: "openai",
    icon: KeyRound,
    key_pattern_regex: "^sk-(proj-)?[A-Za-z0-9_-]{20,}$",
  },
  {
    slug: "stripe",
    display_name: "Stripe",
    docs_url: "https://stripe.com/docs/api",
    issue_url: "https://dashboard.stripe.com/apikeys",
    status_url: "https://status.stripe.com",
    security_feed_url: "https://stripe.com/blog/rss.xml",
    icon_key: "stripe",
    icon: KeyRound,
    key_pattern_regex: "^(sk|rk|pk)_(test|live)_[A-Za-z0-9]{24,}$",
  },
  {
    slug: "github",
    display_name: "GitHub",
    docs_url: "https://docs.github.com/rest",
    issue_url: "https://github.com/settings/tokens",
    status_url: "https://www.githubstatus.com",
    security_feed_url: "https://github.blog/category/security/feed/",
    icon_key: "github",
    icon: KeyRound,
    key_pattern_regex: "^(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})$",
  },
  {
    slug: "aws",
    display_name: "AWS",
    docs_url: "https://docs.aws.amazon.com",
    issue_url: "https://console.aws.amazon.com/iam/home",
    status_url: "https://health.aws.amazon.com/health/status",
    security_feed_url: "https://aws.amazon.com/security/security-bulletins/rss/",
    icon_key: "aws",
    icon: Cloud,
    // Access Key ID pattern
    key_pattern_regex: "^AKIA[0-9A-Z]{16}$",
  },
  {
    slug: "vercel",
    display_name: "Vercel",
    docs_url: "https://vercel.com/docs/rest-api",
    issue_url: "https://vercel.com/account/tokens",
    status_url: "https://www.vercel-status.com",
    security_feed_url: undefined,
    icon_key: "vercel",
    icon: Cloud,
    key_pattern_regex: "^[A-Za-z0-9]{24}$",
  },
  {
    slug: "supabase",
    display_name: "Supabase",
    docs_url: "https://supabase.com/docs/reference",
    issue_url: "https://supabase.com/dashboard/account/tokens",
    status_url: "https://status.supabase.com",
    security_feed_url: undefined,
    icon_key: "supabase",
    icon: KeyRound,
    // JWT pattern (service role / anon key)
    key_pattern_regex: "^eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$",
  },
  {
    slug: "google",
    display_name: "Google Cloud",
    docs_url: "https://cloud.google.com/apis/docs/overview",
    issue_url: "https://console.cloud.google.com/apis/credentials",
    status_url: "https://status.cloud.google.com",
    security_feed_url: undefined,
    icon_key: "google",
    icon: Cloud,
    key_pattern_regex: "^AIza[0-9A-Za-z_-]{35}$",
  },
  {
    slug: "anthropic",
    display_name: "Anthropic",
    docs_url: "https://docs.anthropic.com",
    issue_url: "https://console.anthropic.com/settings/keys",
    status_url: "https://status.anthropic.com",
    security_feed_url: undefined,
    icon_key: "anthropic",
    icon: KeyRound,
    key_pattern_regex: "^sk-ant-api03-[A-Za-z0-9_-]{90,}$",
  },
  {
    slug: "paddle",
    display_name: "Paddle",
    docs_url: "https://developer.paddle.com",
    issue_url: "https://vendors.paddle.com/authentication",
    status_url: "https://status.paddle.com",
    security_feed_url: undefined,
    icon_key: "paddle",
    icon: KeyRound,
    key_pattern_regex: "^[A-Za-z0-9]{40,}$",
  },
  {
    slug: "cloudflare",
    display_name: "Cloudflare",
    docs_url: "https://developers.cloudflare.com/api",
    issue_url: "https://dash.cloudflare.com/profile/api-tokens",
    status_url: "https://www.cloudflarestatus.com",
    security_feed_url: "https://www.cloudflarestatus.com/history.rss",
    icon_key: "cloudflare",
    icon: Cloud,
    key_pattern_regex: "^[A-Za-z0-9_-]{40}$",
  },
];

/** Find a preset by slug. Returns `undefined` if not found. */
export function findPreset(slug: string): IssuerPreset | undefined {
  return ISSUER_PRESETS.find((p) => p.slug === slug);
}
