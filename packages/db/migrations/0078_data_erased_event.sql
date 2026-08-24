-- The data-subject erasure audit event. `audit_entries.event` is a Postgres
-- ENUM, so the value must exist on the type before any row can carry it.
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'data_erased';--> statement-breakpoint
