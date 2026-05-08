/**
 * TypeScript mirrors of Rust Incident domain types (T056).
 *
 * Matches:
 *   secretbank-core/src/models/incident.rs
 *   secretbank-storage/src/sqlite/repositories/incident.rs (IncidentListEntry/IncidentMatchDetail)
 */

export type IncidentSource = "nvd" | "ghsa" | "rss" | "hibp";

export type IncidentSeverity = "info" | "low" | "medium" | "high" | "critical";

export type MatchReason = "issuer_match" | "domain" | "keyword" | "explicit";

/** Mirrors Rust `Incident`. Timestamps are Unix milliseconds (i64). */
export interface Incident {
  id: string;
  source: IncidentSource;
  source_id: string;
  issuer_id: string | null;
  severity: IncidentSeverity;
  title: string;
  body: string | null;
  url: string | null;
  /** Breach domain for HIBP incidents; null for NVD/GHSA/RSS. */
  domain: string | null;
  /** Unix timestamp in milliseconds */
  detected_at: number;
  /** Unix timestamp in milliseconds, or null */
  published_at: number | null;
}

/** Mirrors Rust `IncidentMatchDetail`. `dismissed_at` is RFC 3339 string or null. */
export interface IncidentMatchDetail {
  id: string;
  credential_id: string;
  credential_label: string;
  issuer_display_name: string | null;
  reason: MatchReason;
  /** Unix timestamp in milliseconds */
  matched_at: number;
  /** RFC 3339 string, or null if active */
  dismissed_at: string | null;
}

/** Mirrors Rust `IncidentListEntry` — the shape returned by `incident_list`. */
export interface IncidentListEntry {
  incident: Incident;
  matches: IncidentMatchDetail[];
}

/** Mirrors Rust `IncidentFilter`. All fields optional. */
export interface IncidentFilter {
  source?: IncidentSource;
  severity?: IncidentSeverity;
  issuer_id?: string;
  include_dismissed?: boolean;
}

/** UI-level tab identifiers — not a direct Rust mapping. */
export type IncidentTab = "all" | "critical" | "affecting" | "dismissed";
