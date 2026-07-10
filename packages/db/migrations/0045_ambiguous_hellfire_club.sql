ALTER TABLE "organizations" ADD COLUMN "transactional_blocks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "marketing_sent" integer DEFAULT 0 NOT NULL;