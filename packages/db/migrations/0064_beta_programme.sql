-- Closed beta: an access code is the door, and every account records the one
-- it came through so "who are our testers" is a join, not a spreadsheet.
CREATE TABLE IF NOT EXISTS "beta_invites" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "label" text,
  "max_uses" integer DEFAULT 1 NOT NULL,
  "used_count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_by_staff_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "beta_invites_code_uq" ON "beta_invites" ("code");
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "is_beta" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "beta_invite_id" text;
