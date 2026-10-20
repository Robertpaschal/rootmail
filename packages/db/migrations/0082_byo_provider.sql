-- Bring your own provider (beta), PR (a). Additive only: new nullable columns
-- and one boolean defaulting to false, so every existing row behaves exactly
-- as before until the global switch AND the org flag are both on.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "byo_provider" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "org_sending_providers" ADD COLUMN IF NOT EXISTS "credential_hint" text;
--> statement-breakpoint
ALTER TABLE "org_sending_providers" ADD COLUMN IF NOT EXISTS "webhook_token" text;
--> statement-breakpoint
ALTER TABLE "org_sending_providers" ADD COLUMN IF NOT EXISTS "sns_topic_arn" text;
--> statement-breakpoint
ALTER TABLE "org_sending_providers" ADD COLUMN IF NOT EXISTS "configuration_set" text;
--> statement-breakpoint
ALTER TABLE "org_sending_providers" ADD COLUMN IF NOT EXISTS "sending_domains" jsonb;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_sending_providers_webhook_token_uq"
  ON "org_sending_providers" ("webhook_token");
