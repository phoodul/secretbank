-- M24 Phase 1.5 — credential value pair (Option D).
--
-- secondary_value_ref: vault entry reference for the second secret (e.g. Secret Key,
--   Client Secret). NULL = single-secret credential. Always set/cleared together with
--   secondary_label.
-- primary_label: display label for the primary value (e.g. "API Key", "Public Key",
--   "Password"). NULL = use type-based fallback in the UI.
-- secondary_label: display label for the secondary value (e.g. "Secret Key",
--   "Client Secret"). NULL iff secondary_value_ref is NULL.
--
-- Existing rows remain fully functional: all three new columns default to NULL
-- which is interpreted as "single-secret credential with type-based label fallback".

ALTER TABLE credential ADD COLUMN secondary_value_ref TEXT;
ALTER TABLE credential ADD COLUMN primary_label TEXT;
ALTER TABLE credential ADD COLUMN secondary_label TEXT;
