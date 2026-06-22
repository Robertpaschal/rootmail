/**
 * One-off DEV cleanup — purge orphaned throwaway test users (and their orgs).
 *   pnpm --filter @rootmail/api cleanup:test-users          (deletes)
 *   pnpm --filter @rootmail/api cleanup:test-users --dry-run (preview only)
 *
 * Ad-hoc signup/oauth testing leaves behind real `users` rows with verified
 * "owner" memberships (e.g. social-*@example.com, authmail_*@example.com). They
 * pollute anything that queries customers — most visibly the admin announcement
 * broadcast, whose recipient list is "verified account owners".
 *
 * This matches users on RFC-reserved, non-routable test domains only
 * (example.com/.org/.net and any *.test domain), deletes the orgs they belong to
 * — which cascades memberships/workspaces/api-keys/etc. — then the users
 * themselves (cascading sessions/auth-tokens). The seeded demo org ("acme") has
 * no members, so it is never in scope; it is also explicitly guarded.
 *
 * Dev tooling only — it does not touch production code paths.
 */
import { and, eq, inArray, isNotNull, like, ne, or } from "drizzle-orm";
import { closeDb, db, memberships, organizations, users } from "@rootmail/db";

const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("--dry");

// Reserved, non-routable test domains (RFC 2606 / RFC 6761). A real customer can
// never own one of these, so matching them is safe.
const THROWAWAY_EMAIL_PATTERNS = [
  "%@example.com",
  "%@example.org",
  "%@example.net",
  "%@%.test", // rootmail.test, hopper.test, …
];

// The seeded demo org — never delete it (defensive; it has no members anyway).
const SEED_ORG_SLUG = "acme";

// Mirrors announcementRecipients() in apps/api/src/routes/admin.ts.
async function recipientsCount(): Promise<number> {
  const rows = await db
    .selectDistinct({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.role, "owner"), isNotNull(users.emailVerifiedAt)));
  return rows.length;
}

async function main(): Promise<void> {
  const emailMatches = or(...THROWAWAY_EMAIL_PATTERNS.map((p) => like(users.email, p)));
  const targets = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(emailMatches)
    .orderBy(users.email);

  console.log(`Announcement recipients before: ${await recipientsCount()}`);
  console.log(`Throwaway test users matched: ${targets.length}`);
  for (const t of targets) console.log(`  - ${t.email}`);

  if (targets.length === 0) {
    console.log("Nothing to clean up.");
    await closeDb();
    return;
  }

  const targetIds = targets.map((t) => t.id);
  const orgRows = await db
    .selectDistinct({ orgId: memberships.organizationId })
    .from(memberships)
    .where(inArray(memberships.userId, targetIds));
  const orgIds = orgRows.map((r) => r.orgId);

  if (DRY_RUN) {
    console.log(`\n[dry-run] would delete ${orgIds.length} org(s) and ${targetIds.length} user(s).`);
    console.log("[dry-run] no rows changed.");
    await closeDb();
    return;
  }

  // Delete the orgs first — cascades memberships, workspaces, api keys, messages,
  // etc. — then any users left over (cascades sessions/auth tokens).
  if (orgIds.length > 0) {
    await db
      .delete(organizations)
      .where(and(inArray(organizations.id, orgIds), ne(organizations.slug, SEED_ORG_SLUG)));
  }
  await db.delete(users).where(inArray(users.id, targetIds));

  console.log(`\nDeleted ${orgIds.length} org(s) and ${targetIds.length} user(s).`);
  console.log(`Announcement recipients after: ${await recipientsCount()}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
