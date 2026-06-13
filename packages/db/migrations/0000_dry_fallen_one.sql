CREATE TYPE "public"."audit_event" AS ENUM('queued', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'failed', 'suppressed', 'retried');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('active', 'unsubscribed', 'bounced', 'complained');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('transactional', 'marketing', 'sales');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."sub_tenant_status" AS ENUM('pending_verification', 'verifying', 'verified', 'failed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('bounce', 'complaint', 'unsubscribe', 'manual');--> statement-breakpoint
CREATE TYPE "public"."template_type" AS ENUM('transactional', 'marketing', 'sales', 'any');--> statement-breakpoint
CREATE TYPE "public"."workspace_environment" AS ENUM('live', 'test');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"last4" text NOT NULL,
	"key_hash" text NOT NULL,
	"mode" "workspace_environment" NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"sub_tenant_id" text,
	"message_id" text NOT NULL,
	"event" "audit_event" NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"actor_id" text,
	"ip" text,
	"user_agent" text,
	"provider" text,
	"provider_message_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"sub_tenant_id" text,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "contact_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"sub_tenant_id" text,
	"type" "message_type" DEFAULT 'transactional' NOT NULL,
	"to_email" text NOT NULL,
	"to_contact_id" text,
	"from_email" text NOT NULL,
	"from_name" text,
	"reply_to" text,
	"subject" text NOT NULL,
	"template_id" text,
	"template_version" integer,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rendered_html" text,
	"rendered_text" text,
	"content_hash" text,
	"send_at" timestamp with time zone,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"campaign_id" text,
	"sequence_id" text,
	"sequence_step" integer,
	"idempotency_key" text,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"provider" text,
	"provider_message_id" text,
	"error" text,
	"sandbox" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sub_tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"external_id" text,
	"sending_domain" text NOT NULL,
	"status" "sub_tenant_status" DEFAULT 'pending_verification' NOT NULL,
	"inherits_templates" boolean DEFAULT true NOT NULL,
	"verification_token" text NOT NULL,
	"dkim_selector" text NOT NULL,
	"dkim_public_key" text NOT NULL,
	"dkim_private_key" text NOT NULL,
	"last_checked_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"sub_tenant_id" text,
	"email" text NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"source" text,
	"message_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"sub_tenant_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "template_type" DEFAULT 'transactional' NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text,
	"variables_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"environment" "workspace_environment" DEFAULT 'live' NOT NULL,
	"region" text DEFAULT 'us' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_sub_tenant_id_sub_tenants_id_fk" FOREIGN KEY ("sub_tenant_id") REFERENCES "public"."sub_tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_sub_tenant_id_sub_tenants_id_fk" FOREIGN KEY ("sub_tenant_id") REFERENCES "public"."sub_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sub_tenant_id_sub_tenants_id_fk" FOREIGN KEY ("sub_tenant_id") REFERENCES "public"."sub_tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_to_contact_id_contacts_id_fk" FOREIGN KEY ("to_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_tenants" ADD CONSTRAINT "sub_tenants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_sub_tenant_id_sub_tenants_id_fk" FOREIGN KEY ("sub_tenant_id") REFERENCES "public"."sub_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_sub_tenant_id_sub_tenants_id_fk" FOREIGN KEY ("sub_tenant_id") REFERENCES "public"."sub_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_message_idx" ON "audit_entries" USING btree ("message_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_ws_idx" ON "audit_entries" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_scope_email_uq" ON "contacts" USING btree ("workspace_id","sub_tenant_id","email");--> statement-breakpoint
CREATE INDEX "contacts_ws_status_idx" ON "contacts" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_ws_idem_uq" ON "messages" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "messages_ws_status_idx" ON "messages" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "messages_ws_created_idx" ON "messages" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_subtenant_idx" ON "messages" USING btree ("sub_tenant_id");--> statement-breakpoint
CREATE INDEX "messages_provider_msg_idx" ON "messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_tenants_ws_domain_uq" ON "sub_tenants" USING btree ("workspace_id","sending_domain");--> statement-breakpoint
CREATE INDEX "sub_tenants_ws_external_idx" ON "sub_tenants" USING btree ("workspace_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_scope_email_uq" ON "suppressions" USING btree ("workspace_id","sub_tenant_id","email");--> statement-breakpoint
CREATE INDEX "suppressions_email_idx" ON "suppressions" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_scope_slug_uq" ON "templates" USING btree ("workspace_id","sub_tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_org_slug_uq" ON "workspaces" USING btree ("organization_id","slug");