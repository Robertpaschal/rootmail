ALTER TABLE "plans" ADD COLUMN "sale_percent_off" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "sale_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "sale_stripe_coupon_id" text;