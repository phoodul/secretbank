-- Reset audit_log: canonical_bytes format changed (sentinel → existence flag).
-- All previously stored entry_hash/signature values would fail verification
-- under the new format. Safe at this dev stage; in production this would
-- require a versioning strategy (e.g. re-sign with migration key).
DELETE FROM audit_log;
