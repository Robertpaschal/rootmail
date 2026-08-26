-- Recipients a customer may email while the sending account is provider-limited.
--
-- Our provider refuses unverified destinations until the account leaves its
-- sandbox, and that approval is not ours to grant. Rather than surface a raw
-- provider error mid-send, the product owns the flow: nominate an address, the
-- person confirms, the dashboard shows who is ready.
CREATE TABLE IF NOT EXISTS "verified_recipients" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "label" text,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "verified_recipients_ws_email_uq"
  ON "verified_recipients" ("workspace_id", "email");
