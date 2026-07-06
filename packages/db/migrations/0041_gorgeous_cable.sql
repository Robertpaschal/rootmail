ALTER TABLE "organizations" ADD COLUMN "business_types" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "previous_provider" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
-- Orgs that predate the onboarding wizard have nothing to complete.
UPDATE "organizations" SET "onboarding_completed_at" = now() WHERE "onboarding_completed_at" IS NULL;