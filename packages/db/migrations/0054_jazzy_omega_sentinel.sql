ALTER TABLE "organizations" ADD COLUMN "reply_domain" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "reply_domain_token" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "reply_domain_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "reply_domain_verified_at" timestamp with time zone;