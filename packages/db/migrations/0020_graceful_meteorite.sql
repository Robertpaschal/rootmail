CREATE TABLE "addons" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"unit_amount" integer DEFAULT 0 NOT NULL,
	"grant" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"stripe_price_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
