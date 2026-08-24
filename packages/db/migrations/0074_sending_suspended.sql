-- Staff stop-switch. There was previously no way to halt a sender without a
-- manual SQL update, which is not an answer when a provider forwards a phishing
-- complaint. Set only by a person; checked at the API front door and in the
-- worker's send gate so queued mail stops too.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sending_suspended" boolean DEFAULT false NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sending_suspended_reason" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sending_suspended_at" timestamp with time zone;
