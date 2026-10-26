ALTER TABLE "messages" ADD COLUMN "auth_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "auth_request_fingerprint" text;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_auth_content_private" CHECK (
  "auth_expires_at" IS NULL OR (
    "rendered_html" IS NULL AND "rendered_text" IS NULL AND "content_hash" IS NULL
    AND "subject" IN ('Authentication email', '[redacted]') AND "variables" = '{}'::jsonb
    AND "metadata" = '{}'::jsonb AND "tags" = '[]'::jsonb AND "attachments" = '[]'::jsonb
    AND "template_id" IS NULL AND "campaign_id" IS NULL AND "sequence_id" IS NULL
    AND "type" = 'transactional' AND NOT "sandbox"
  )
);
