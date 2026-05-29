-- M24 — "Other" credential kind with a user-defined type name.
--
-- kind='other' rows store a free-text type name (e.g. "Token", "SSH key",
-- "License") in custom_kind_label. NULL for the built-in kinds
-- (api_key / password / credit_card). Existing rows are unaffected.

ALTER TABLE credential ADD COLUMN custom_kind_label TEXT;
