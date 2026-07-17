ALTER TABLE "campaigns" ADD COLUMN "segment_tag" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "variants" jsonb DEFAULT '[]'::jsonb NOT NULL;
