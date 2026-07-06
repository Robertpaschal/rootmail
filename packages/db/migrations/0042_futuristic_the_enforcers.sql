CREATE TABLE "sender_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sender_identities" ADD CONSTRAINT "sender_identities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sender_identities_email_uq" ON "sender_identities" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sender_identities_org_idx" ON "sender_identities" USING btree ("organization_id");