-- Staff password reset.
--
-- The staff console had no way back in for someone who forgot their password
-- short of another superadmin generating one. These are the single-use,
-- 30-minute tokens behind "Forgot password?" on the console and the
-- `staff:reset-link` recovery command. Only the token's SHA-256 is stored.
CREATE TABLE IF NOT EXISTS "staff_reset_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "staff_user_id" text NOT NULL REFERENCES "staff_users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
CREATE INDEX IF NOT EXISTS "staff_reset_tokens_staff_idx"
  ON "staff_reset_tokens" ("staff_user_id");
