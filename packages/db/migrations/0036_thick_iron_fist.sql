CREATE TABLE "announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"recipient_count" integer NOT NULL,
	"sent_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_sent_by_staff_id_staff_users_id_fk" FOREIGN KEY ("sent_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;