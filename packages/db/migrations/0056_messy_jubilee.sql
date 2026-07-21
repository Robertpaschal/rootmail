ALTER TABLE "contacts" ADD COLUMN "stage" text DEFAULT 'subscriber' NOT NULL;--> statement-breakpoint
CREATE INDEX "contacts_ws_stage_idx" ON "contacts" USING btree ("workspace_id","stage");