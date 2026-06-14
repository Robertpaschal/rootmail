CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('open', 'needs_reply', 'closed');--> statement-breakpoint
CREATE TABLE "thread_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"direction" "message_direction" NOT NULL,
	"message_id" text,
	"from_email" text NOT NULL,
	"to_email" text NOT NULL,
	"body_html" text,
	"body_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"sub_tenant_id" text,
	"contact_email" text NOT NULL,
	"subject" text NOT NULL,
	"status" "thread_status" DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_sub_tenant_id_sub_tenants_id_fk" FOREIGN KEY ("sub_tenant_id") REFERENCES "public"."sub_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "thread_messages_thread_idx" ON "thread_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "threads_ws_status_idx" ON "threads" USING btree ("workspace_id","status","last_message_at");