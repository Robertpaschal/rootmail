ALTER TABLE "organizations" ADD COLUMN "transactional_tier" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "marketing_tier" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "platform_tier" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_tx_subscription_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_mk_subscription_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_platform_subscription_id" text;