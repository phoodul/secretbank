-- Migration 0002: UNIQUE constraint on incident (source, source_id)
--
-- Prior to this migration the table had no uniqueness guard on the feed-polled
-- natural key, so re-polling the same CVE / GHSA / RSS entry produced duplicate
-- rows with different ULIDs.  This migration:
--
--   1. Cascade-removes orphaned incident_match rows pointing at any duplicate
--      incidents that are about to be removed (no FK CASCADE was defined in 0001).
--   2. Removes older duplicate incidents, keeping the MIN(id) for each
--      (source, source_id) pair.  MIN on ULID text is equivalent to "oldest"
--      because ULIDs are time-sortable and lexicographically ordered.
--   3. Creates a UNIQUE index so future INSERT OR IGNORE calls are idempotent.

PRAGMA foreign_keys = ON;

-- Step 1: remove incident_match rows whose parent incident will be deleted.
DELETE FROM incident_match
WHERE incident_id NOT IN (
    SELECT MIN(id) FROM incident GROUP BY source, source_id
);

-- Step 2: remove duplicate incident rows, keep the earliest ULID per (source, source_id).
DELETE FROM incident
WHERE id NOT IN (
    SELECT MIN(id) FROM incident GROUP BY source, source_id
);

-- Step 3: add the UNIQUE index — will succeed now that duplicates are gone.
CREATE UNIQUE INDEX IF NOT EXISTS incident_source_unique
    ON incident (source, source_id);
