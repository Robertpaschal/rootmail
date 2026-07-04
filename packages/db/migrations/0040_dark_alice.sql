ALTER TABLE "organizations" ADD COLUMN "dedicated_ip_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "dedicated_ip_address" text;