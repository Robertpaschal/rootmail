-- RFC-header threading. Replies were matched only by a plus-addressed recipient,
-- so a reply sent from a forwarded copy — or from a client that ignores Reply-To —
-- had no token and was silently discarded.
ALTER TABLE "thread_messages" ADD COLUMN IF NOT EXISTS "rfc_message_id" text;
ALTER TABLE "thread_messages" ADD COLUMN IF NOT EXISTS "rfc_references" text;

-- The lookup an inbound reply falls back to when it has no token to go on.
CREATE INDEX IF NOT EXISTS "thread_messages_rfc_id_idx"
  ON "thread_messages" ("rfc_message_id");
