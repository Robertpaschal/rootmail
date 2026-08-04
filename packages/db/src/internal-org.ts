import { and, eq } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { db } from "./client";
import { organizations, workspaces } from "./schema";

/**
 * rootmail's own account — the one we reach our customers from.
 *
 * We sell a product for reaching customers by email and, until now, reached our
 * own customers with something else: `sendSystemEmail` handed every welcome,
 * receipt, quota warning and win-back straight to the provider, with (its own
 * words) "no DB message, no thread, no quota". So we could not see our own
 * bounce rate, our own complaints did not suppress anything, and a customer
 * replying to us was replying into a void.
 *
 * The fix is not a sending tool bolted onto the staff console — that would be a
 * second email product, built by the people who already have one. It is to be a
 * TENANT OF OURSELVES: a real org, a real workspace, real contacts, addressed
 * with the real dashboard. Everything that scopes by org then works for us with
 * no new code, and anything that is awkward for us is awkward for every
 * customer — which is the point of doing it this way.
 *
 * The slug is fixed, so this is idempotent and safe on every boot: it adopts
 * the existing org rather than minting a second one.
 */

/** Fixed so the bootstrap can find its own work. Never change it. */
export const INTERNAL_ORG_SLUG = "rootmail-hq";

export interface InternalAccount {
  organizationId: string;
  /** Where our customer outreach lives — real sends, real deliverability. */
  workspaceId: string;
  created: boolean;
}

/**
 * Find or create rootmail's own org + workspace.
 *
 * Idempotent by slug. Returns `created: false` on every run after the first, so
 * a caller can log the difference without needing to check first.
 */
export async function ensureInternalAccount(): Promise<InternalAccount> {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, INTERNAL_ORG_SLUG))
    .limit(1);

  if (existing) {
    const workspaceId = await ensureInternalWorkspace(existing.id);
    // Older rows predate the flag, and an unflagged internal org is worse than
    // no internal org: it shows up in MRR as a customer paying nothing.
    await db
      .update(organizations)
      .set({ isInternal: true })
      .where(and(eq(organizations.id, existing.id), eq(organizations.isInternal, false)));
    return { organizationId: existing.id, workspaceId, created: false };
  }

  const orgId = newId("organization");
  await db.insert(organizations).values({
    id: orgId,
    name: "rootmail",
    slug: INTERNAL_ORG_SLUG,
    isInternal: true,
    // No tier, no Stripe customer, no subscription. Entitlement checks read the
    // internal flag rather than a plan — we are not a customer of ourselves and
    // giving this org a fake Enterprise subscription would put a number that
    // does not exist into our own revenue reporting.
  });

  const workspaceId = await ensureInternalWorkspace(orgId);
  return { organizationId: orgId, workspaceId, created: true };
}

/**
 * One LIVE workspace. No sandbox twin on purpose: a test-mode workspace here
 * would tempt us into "testing" our customer outreach against our real customer
 * list, and the sandbox already exists for everyone including us — via a normal
 * account, the way a customer would reach it.
 */
async function ensureInternalWorkspace(organizationId: string): Promise<string> {
  const [existing] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.organizationId, organizationId), eq(workspaces.slug, "customers")))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(workspaces)
    .values({
      id: newId("workspace"),
      organizationId,
      name: "Customers",
      slug: "customers",
      environment: "live",
    })
    .returning({ id: workspaces.id });
  return created.id;
}

/** The org id, if we've been bootstrapped. Null before the first run. */
export async function internalOrgId(): Promise<string | null> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, INTERNAL_ORG_SLUG))
    .limit(1);
  return row?.id ?? null;
}
