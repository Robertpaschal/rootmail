ALTER TYPE "public"."staff_role" ADD VALUE 'billing' BEFORE 'support';--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN "deactivated_at" timestamp with time zone;