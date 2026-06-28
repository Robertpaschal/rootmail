ALTER TABLE "plans" ADD COLUMN "workspace_limit" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "plans" SET "workspace_limit" = 1 WHERE "id" = 'free';--> statement-breakpoint
UPDATE "plans" SET "workspace_limit" = 3 WHERE "id" = 'pro';--> statement-breakpoint
UPDATE "plans" SET "workspace_limit" = 10 WHERE "id" = 'scale';--> statement-breakpoint
UPDATE "plans" SET "workspace_limit" = -1 WHERE "id" = 'enterprise';