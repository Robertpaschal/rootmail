CREATE TABLE "marketing_daily_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"day" text NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "marketing_contacts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ADD COLUMN "per_thousand_cents" integer;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ADD COLUMN "sends_per_contact" integer;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ADD COLUMN "daily_per_contact" integer;--> statement-breakpoint
ALTER TABLE "marketing_daily_usage" ADD CONSTRAINT "marketing_daily_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_daily_org_day_uq" ON "marketing_daily_usage" USING btree ("organization_id","day");