-- The audit event column is a Postgres ENUM (audit_event), so new event names must
-- be added to the type before any row can carry them. Discovered the hard way:
-- the insert fails with 22P02 at runtime, and nothing in TypeScript points at it.
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'tenant_dns_drifted';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'tenant_dns_suspended';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'tenant_dns_recovered';--> statement-breakpoint

-- DNS drift detection. Verification was one-shot: nothing re-checked a tenant's
-- records after the first pass, so a deleted DKIM record left a "verified" badge
-- above mail that fails authentication at every receiver.
ALTER TABLE "sub_tenants" ADD COLUMN IF NOT EXISTS "dns_failing_since" timestamp with time zone;
ALTER TABLE "sub_tenants" ADD COLUMN IF NOT EXISTS "dns_drift_detail" text;

-- The sweep re-checks the oldest-checked verified tenants first, so it reads
-- last_checked_at ordered and filtered by status on every run.
CREATE INDEX IF NOT EXISTS "sub_tenants_dns_recheck_idx"
  ON "sub_tenants" ("status", "last_checked_at");
