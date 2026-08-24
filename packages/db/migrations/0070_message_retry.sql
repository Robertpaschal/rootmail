-- Re-sending a failed message. The count is load-bearing: the send queue keys
-- jobs by message id, so a retry that reused the id would be silently deduped.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0;
