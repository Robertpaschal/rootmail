-- Customer hook-host database, NOT a Rootmail production migration.
-- Apply with a migration/admin role; do not grant this schema to browser roles.
CREATE SCHEMA IF NOT EXISTS rootmail_auth_hook;
REVOKE ALL ON SCHEMA rootmail_auth_hook FROM PUBLIC;
CREATE TABLE IF NOT EXISTS rootmail_auth_hook.events (
  event_key text PRIMARY KEY CHECK (event_key ~ '^[a-f0-9]{64}$'),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON rootmail_auth_hook.events FROM PUBLIC;
-- Grant only USAGE on this schema and SELECT, INSERT, UPDATE on this table to
-- the dedicated hook-server role. Keep credentials out of client bundles.
-- Keep expired rows as replay tombstones; do not prune/reset them automatically.
-- No email addresses, bodies, codes, URLs or unkeyed content digests are stored.
