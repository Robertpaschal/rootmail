-- The consent affirmation recorded on a contacts import. `audit_entries.event`
-- is a Postgres ENUM, so the value must exist on the type before any row uses it.
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'contacts_imported';--> statement-breakpoint
