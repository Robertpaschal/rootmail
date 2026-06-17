CREATE TABLE "impersonation_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"staff_user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impersonation_grants_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "staff_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "impersonated_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "impersonation_grants" ADD CONSTRAINT "impersonation_grants_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_grants" ADD CONSTRAINT "impersonation_grants_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_audit" ADD CONSTRAINT "staff_audit_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "impersonation_grants_target_idx" ON "impersonation_grants" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "staff_audit_staff_idx" ON "staff_audit" USING btree ("staff_user_id","created_at");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_staff_id_staff_users_id_fk" FOREIGN KEY ("impersonated_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;