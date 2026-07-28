CREATE TABLE "campaign_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"email" text NOT NULL,
	"subject" text,
	"html" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_overrides" ADD CONSTRAINT "campaign_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_overrides" ADD CONSTRAINT "campaign_overrides_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_overrides_unique" ON "campaign_overrides" USING btree ("campaign_id","email");