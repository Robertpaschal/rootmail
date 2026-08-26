-- A customer's own sending provider.
--
-- The buyer is a platform that already sends email; what they lack is the
-- per-client layer. When they connect their own provider, mail leaves on their
-- account and their reputation, under approval they already hold — so our own
-- provider approval stops gating anyone's launch.
CREATE TABLE IF NOT EXISTS "org_sending_providers" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "credentials" text NOT NULL,
  "sending_domain" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "last_error" text,
  "last_checked_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "org_sending_providers_org_uq"
  ON "org_sending_providers" ("organization_id");
