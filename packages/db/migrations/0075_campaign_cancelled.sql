-- A campaign fans out to its entire audience inside one job, so there was no
-- point at which a mistake could be stopped. `cancelled` is the state the
-- fan-out re-reads and bails on.
ALTER TYPE "public"."campaign_status" ADD VALUE IF NOT EXISTS 'cancelled';--> statement-breakpoint
