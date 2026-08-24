-- Workspace-level suppressions could duplicate without limit.
--
-- `suppressions_scope_email_uq` is (workspace_id, sub_tenant_id, email), and
-- Postgres treats NULLs as DISTINCT — so two workspace-level rows for the same
-- address never conflict with each other, `onConflictDoNothing` never matched,
-- and every repeat bounce or complaint inserted another row. Enforcement was
-- unaffected (`.some` short-circuits) but `suppressionCounts` feeds
-- computeDeliverability, so the score was computed from inflated numbers.
--
-- `.nullsNotDistinct()` is unavailable in this Drizzle version, hence a partial
-- unique index — which is the correct tool anyway: it enforces in the DATABASE
-- rather than in app code that has to remember to select-then-write.

-- Collapse existing duplicates, keeping the earliest of each group so the
-- original suppression date (and its message link) survives.
DELETE FROM "suppressions" a
USING "suppressions" b
WHERE a."sub_tenant_id" IS NULL
  AND b."sub_tenant_id" IS NULL
  AND a."workspace_id" = b."workspace_id"
  AND a."email" = b."email"
  AND a."created_at" > b."created_at";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "suppressions_workspace_email_uq"
  ON "suppressions" ("workspace_id", "email")
  WHERE "sub_tenant_id" IS NULL;
