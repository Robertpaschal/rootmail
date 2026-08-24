-- DKIM key rotation with dual-selector overlap. The new key is published beside
-- the old one and only becomes the signing key once its record actually resolves;
-- the old record outlives the cutover so deferred mail still verifies.
ALTER TABLE "sub_tenants" ADD COLUMN IF NOT EXISTS "next_dkim_selector" text;
ALTER TABLE "sub_tenants" ADD COLUMN IF NOT EXISTS "next_dkim_public_key" text;
ALTER TABLE "sub_tenants" ADD COLUMN IF NOT EXISTS "next_dkim_private_key" text;
ALTER TABLE "sub_tenants" ADD COLUMN IF NOT EXISTS "dkim_rotation_started_at" timestamp with time zone;
ALTER TABLE "sub_tenants" ADD COLUMN IF NOT EXISTS "dkim_rotated_at" timestamp with time zone;
ALTER TABLE "sub_tenants" ADD COLUMN IF NOT EXISTS "previous_dkim_selector" text;
ALTER TABLE "sub_tenants" ADD COLUMN IF NOT EXISTS "previous_dkim_retire_at" timestamp with time zone;

-- New audit events. `audit_entries.event` is an ENUM, so a name the TS array
-- knows about still fails at runtime with 22P02 until the type carries it.
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'dkim_rotation_started';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'dkim_rotation_completed';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'dkim_rotation_cancelled';--> statement-breakpoint
