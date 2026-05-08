-- M24 T-24-A/B — General password vault.
-- Adds three columns to credential so the same row can store either an
-- API key (default, M0) or a general password (M24). Existing rows get
-- kind='api_key' so all M0 functionality is unchanged.
--
-- url + username are CLEARTEXT in DB (matched by browser autofill without
-- unlocking the vault). The actual password value still lives encrypted in
-- the age vault, referenced by `vault_ref`.

ALTER TABLE credential ADD COLUMN kind TEXT NOT NULL DEFAULT 'api_key';
ALTER TABLE credential ADD COLUMN url TEXT;
ALTER TABLE credential ADD COLUMN username TEXT;

CREATE INDEX idx_credential_kind ON credential(kind);
-- Optional autofill lookup index — strip protocol when matching, but the
-- raw value is still useful for prefix scans.
CREATE INDEX idx_credential_url ON credential(url) WHERE url IS NOT NULL;
