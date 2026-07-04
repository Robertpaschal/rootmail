ALTER TABLE "memberships" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "scim_external_id" text;--> statement-breakpoint
ALTER TABLE "sso_connections" ADD COLUMN "scim_token_hash" text;