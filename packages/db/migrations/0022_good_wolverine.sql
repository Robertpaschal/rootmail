CREATE TABLE "custom_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" text,
	"name" text NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"interval" "billing_interval" DEFAULT 'month' NOT NULL,
	"monthly_quota" integer NOT NULL,
	"allow_overage" boolean DEFAULT true NOT NULL,
	"overage_per_1000_cents" integer DEFAULT 0 NOT NULL,
	"included_sub_tenants" integer DEFAULT -1 NOT NULL,
	"seats" integer DEFAULT -1 NOT NULL,
	"ai_credits" integer DEFAULT -1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_plans" ADD CONSTRAINT "custom_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_plans" ADD CONSTRAINT "custom_plans_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_plans_org_uq" ON "custom_plans" USING btree ("organization_id");