CREATE TYPE "public"."retention_mode" AS ENUM('redact', 'delete');--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "redacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "retention_days" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "retention_mode" "retention_mode" DEFAULT 'redact' NOT NULL;