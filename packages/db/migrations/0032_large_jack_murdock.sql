CREATE TYPE "public"."cms_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."post_category" AS ENUM('Company', 'Guide', 'Things we like');--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" "post_category" DEFAULT 'Company' NOT NULL,
	"author" text DEFAULT 'rootmail' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"cover_image_url" text,
	"status" "cms_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "changelog_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"entry_date" timestamp with time zone DEFAULT now() NOT NULL,
	"changes" jsonb NOT NULL,
	"status" "cms_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "blog_posts_status_published_idx" ON "blog_posts" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "changelog_status_date_idx" ON "changelog_entries" USING btree ("status","entry_date");