CREATE TYPE "public"."wing" AS ENUM('transactional', 'marketing', 'platform');--> statement-breakpoint
CREATE TABLE "pricing_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"wing" "wing" NOT NULL,
	"name" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"price_monthly" integer,
	"price_yearly" integer,
	"ai_credits" integer DEFAULT 0 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"included_sends" integer,
	"block_size" integer,
	"allow_overage" boolean DEFAULT false NOT NULL,
	"overage_per_1000_cents" integer DEFAULT 0 NOT NULL,
	"included_sub_tenants" integer DEFAULT 0 NOT NULL,
	"included_contacts" integer,
	"seats" integer,
	"workspace_limit" integer,
	"sale_percent_off" integer,
	"sale_ends_at" timestamp with time zone,
	"sale_stripe_coupon_id" text,
	"stripe_price_month_id" text,
	"stripe_price_year_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pricing_tiers_wing_rank_idx" ON "pricing_tiers" USING btree ("wing","rank");