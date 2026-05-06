/**
 * URL-based issuer auto-detection (M24 2-1a).
 *
 * Given a raw URL string, returns the first IssuerPreset whose `domains` list
 * contains a domain that matches the URL's hostname.
 *
 * Matching rules:
 * - Subdomain-safe: `host === domain || host.endsWith("." + domain)`.
 *   This prevents "evil-stripe.com" from matching "stripe.com".
 * - Case-insensitive: host is lowercased before comparison.
 * - www-stripping: leading "www." is removed from the host.
 * - Protocol-tolerant: if parsing fails, "https://" is prepended and retried.
 */

import { ISSUER_PRESETS, type IssuerPreset } from "./issuer-presets";

/**
 * Attempt to parse a URL, optionally prepending "https://" if no protocol
 * is present. Returns `undefined` if parsing fails even after the retry.
 */
function parseUrl(rawUrl: string): URL | undefined {
  try {
    return new URL(rawUrl);
  } catch {
    // No protocol or malformed — try with https://
    try {
      return new URL("https://" + rawUrl);
    } catch {
      return undefined;
    }
  }
}

/**
 * Normalize a URL hostname for domain comparison:
 * - Lowercase
 * - Strip leading "www."
 */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/**
 * Returns true if `host` is exactly `domain` or is a proper subdomain of it.
 * Uses "." + domain suffix check to prevent partial matches like
 * "evil-stripe.com" matching "stripe.com".
 */
function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

/**
 * Find the first IssuerPreset whose domains match the given URL.
 *
 * @param rawUrl - A URL string, with or without protocol (e.g. "supabase.com").
 * @returns The matching IssuerPreset, or `undefined` if none match.
 */
export function matchIssuerByUrl(rawUrl: string): IssuerPreset | undefined {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) return undefined;

  const parsed = parseUrl(trimmed);
  if (parsed === undefined) return undefined;

  const host = normalizeHost(parsed.hostname);
  if (host.length === 0) return undefined;

  return ISSUER_PRESETS.find((preset) =>
    preset.domains.some((domain) => hostMatchesDomain(host, domain)),
  );
}
