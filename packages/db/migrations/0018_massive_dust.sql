CREATE TABLE "plans" (
	"id" "plan" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" integer,
	"monthly_quota" integer NOT NULL,
	"allow_overage" boolean DEFAULT false NOT NULL,
	"overage_per_1000_cents" integer DEFAULT 0 NOT NULL,
	"included_sub_tenants" integer DEFAULT 0 NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"ai_credits" integer DEFAULT 0 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"stripe_price_month_id" text,
	"stripe_price_year_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
