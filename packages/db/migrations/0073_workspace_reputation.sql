-- Reputation enforcement for ordinary senders.
--
-- The loop existed only on sub_tenants, and sub-tenancy is a paid feature — so
-- the control we describe publicly protected only customers on the multi-tenant
-- tier, while an ordinary account mailing a purchased list was measured by
-- nothing. Same columns, same state machine, applied to the workspace.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "reputation_state" "reputation_state" DEFAULT 'ok' NOT NULL;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "reputation_score" integer;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "reputation_reason" text;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "reputation_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "reputation_checked_at" timestamp with time zone;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "reputation_changed_at" timestamp with time zone;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "reputation_resumed_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "workspaces_reputation_idx" ON "workspaces" ("environment", "reputation_state");
