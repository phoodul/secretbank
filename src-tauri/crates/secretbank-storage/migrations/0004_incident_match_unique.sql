-- Migration 0004: dedup incident_match + UNIQUE INDEX on (incident_id, credential_id, reason)
--
-- Hotfix H1.  Prior to this migration `insert_match` was a plain INSERT, so
-- every `incident_feed_refresh` re-inserted the same `(incident, credential,
-- reason)` row whenever the matcher rule still fired.  This produced visibly
-- inflated counters in the UI ("2465 active incidents", a single incident
-- showing the same credential badge 27 times) that grow with every refresh.
--
-- The matcher in `api-vault-feeds` already collapses to one reason per
-- credential per incident (Rule 3 — IssuerMatch wins over Keyword), so the
-- correct database invariant is exactly that: at most one row per
-- `(incident_id, credential_id, reason)` triple.  Multiple reasons for the
-- same `(incident_id, credential_id)` pair remain allowed (the existing test
-- suite intentionally exercises that shape, e.g. one IssuerMatch row plus one
-- Keyword row when both rules independently fire across calls).
--
-- The dedup keeps:
--   1. The dismissed row if any duplicate in the group is dismissed — the
--      user's dismissal intent must survive the cleanup.
--   2. Otherwise MIN(id), which on a ULID column is the oldest row.
--
-- Because we may need to MOVE the dismissed_at flag onto the row we are
-- about to keep (the dismissed row may not be MIN(id)), we propagate first
-- and then delete.

PRAGMA foreign_keys = ON;

-- Step 1: propagate dismissed_at onto the surviving (MIN(id)) row of every
-- group whose surviving row is currently active but the group has at least
-- one dismissed sibling.
UPDATE incident_match
SET dismissed_at = (
    SELECT MAX(dismissed_at) FROM incident_match m2
    WHERE m2.incident_id   = incident_match.incident_id
      AND m2.credential_id = incident_match.credential_id
      AND m2.reason        = incident_match.reason
      AND m2.dismissed_at IS NOT NULL
)
WHERE id IN (
    SELECT MIN(id) FROM incident_match
    GROUP BY incident_id, credential_id, reason
)
AND dismissed_at IS NULL
AND EXISTS (
    SELECT 1 FROM incident_match m3
    WHERE m3.incident_id   = incident_match.incident_id
      AND m3.credential_id = incident_match.credential_id
      AND m3.reason        = incident_match.reason
      AND m3.dismissed_at IS NOT NULL
);

-- Step 2: delete every duplicate that is not the surviving MIN(id) row.
DELETE FROM incident_match
WHERE id NOT IN (
    SELECT MIN(id) FROM incident_match
    GROUP BY incident_id, credential_id, reason
);

-- Step 3: enforce uniqueness so future inserts must be idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_incident_match_unique
    ON incident_match (incident_id, credential_id, reason);
