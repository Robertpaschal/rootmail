-- Per-tenant reputation enforcement (brief P1.1).
--
-- NOTE FOR THE NEXT PERSON WHO RUNS db:generate: the generator also re-emitted
-- migration 0064's `beta_invites` table and `organizations.is_beta` / `beta_invite_id`
-- columns, because 0064 was hand-written and so no `meta/0064_snapshot.json` was
-- ever recorded — drizzle diffed against 0063 and could not see them. Those
-- statements were removed here (they would fail on any database that has run
-- 0064). `meta/0065_snapshot.json` DOES contain them, so the drift stops here.

CREATE TYPE "public"."reputation_state" AS ENUM('ok', 'warn', 'throttled', 'paused');--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'tenant_warned';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'tenant_throttled';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'tenant_paused';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'tenant_resumed';--> statement-breakpoint
-- Tenant-level reputation events are not about any one message.
ALTER TABLE "audit_entries" ALTER COLUMN "message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_tenants" ADD COLUMN "reputation_state" "reputation_state" DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_tenants" ADD COLUMN "reputation_score" integer;--> statement-breakpoint
ALTER TABLE "sub_tenants" ADD COLUMN "reputation_reason" text;--> statement-breakpoint
ALTER TABLE "sub_tenants" ADD COLUMN "reputation_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_tenants" ADD COLUMN "reputation_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sub_tenants" ADD COLUMN "reputation_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sub_tenants" ADD COLUMN "reputation_resumed_at" timestamp with time zone;
