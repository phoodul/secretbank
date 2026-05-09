/**
 * @file incident.ts
 * @license AGPL-3.0-or-later
 *
 * T-24-E-G2-1: extension content-script incident banner 용 공유 타입.
 *
 * Rust 백엔드의 `IncidentMatchSummary` 구조체 및
 * nm-bridge `incident_check_for_host_response` 응답과 1:1 매핑된다.
 */

// ---------------------------------------------------------------------------
// severity ≥ MEDIUM 필터링 후 반환되는 incident 요약
// ---------------------------------------------------------------------------

/**
 * Extension content-script 가 수신하는 incident 요약 항목.
 *
 * - `incident_id`: ULID 문자열
 * - `severity`: "medium" | "high" | "critical" (LOW/INFO 는 서버에서 제거)
 * - `title`: incident 제목
 * - `published_at`: epoch ms (null = unknown)
 * - `source`: "nvd" | "ghsa" | "rss" | "hibp"
 */
export interface IncidentMatchSummary {
  incident_id: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  published_at: number | null;
  source: "nvd" | "ghsa" | "rss" | "hibp";
}
