import { and, eq, isNull } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { db } from "./client";
import { contacts, organizations, suppressions, workspaces } from "./schema";

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
    // The wizard is for customers. Ours was landing staff in "Welcome to
    // rootmail 👋 — pick your plan", which we cannot answer (we have no tier)
    // and which blocked every link into the product behind it.
    await db
      .update(organizations)
      .set({ onboardingCompletedAt: new Date() })
      .where(and(eq(organizations.id, existing.id), isNull(organizations.onboardingCompletedAt)));
    return { organizationId: existing.id, workspaceId, created: false };
  }

  const orgId = newId("organization");
  await db.insert(organizations).values({
    id: orgId,
    name: "rootmail",
    slug: INTERNAL_ORG_SLUG,
    isInternal: true,
    // Already onboarded: the wizard exists to collect a plan and a compliance
    // address from a new customer, and we are not one. The postal address it
    // would ask for is still REQUIRED on our marketing footers — deliberately
    // left null rather than invented, and surfaced as a gap on the bridge page
    // so a person supplies the real one.
    onboardingCompletedAt: new Date(),
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

/**
 * One opt-out, not two.
 *
 * We shipped a second unsubscribe by accident. Product announcements carried
 * their own link, which set `users.announcement_opt_out_at`, while every other
 * email we send honours the SUPPRESSION LIST in our own workspace — and neither
 * knew about the other. A customer who unsubscribed from one kept receiving the
 * other, and the announcement send even declared itself `transactional`, the one
 * class whose whole purpose is to ignore an unsubscribe.
 *
 * Two opt-out systems is the exact failure the product is sold to prevent, and
 * we had it. This makes the preference write through to the suppression list, so
 * OUR OWN RULES enforce it — the same code path that stops a customer's
 * marketing email stops ours.
 *
 * Only the `unsubscribe` reason is ever added or removed here. A bounce or a
 * complaint is a deliverability fact, not a preference, and re-opting-in must
 * never clear one — that would resurrect an address the provider told us to stop
 * mailing.
 */
export async function setPlatformOptOut(email: string, optOut: boolean): Promise<void> {
  const addr = email.toLowerCase();
  const { workspaceId } = await ensureInternalAccount();

  if (!optOut) {
    await db
      .delete(suppressions)
      .where(
        and(
          eq(suppressions.workspaceId, workspaceId),
          eq(suppressions.email, addr),
          eq(suppressions.reason, "unsubscribe"),
        ),
      );
    // Bring them back into segments. Only from `unsubscribed` — a bounced or
    // complained contact stays where the provider put them.
    await db
      .update(contacts)
      .set({ status: "active", updatedAt: new Date() })
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          eq(contacts.email, addr),
          eq(contacts.status, "unsubscribed"),
        ),
      );
    return;
  }

  await db
    .insert(suppressions)
    .values({
      id: newId("suppression"),
      workspaceId,
      subTenantId: null,
      email: addr,
      reason: "unsubscribe",
      source: "platform_preference",
    })
    // Already suppressed for any reason? Leave the stronger record alone.
    .onConflictDoNothing();

  await db
    .update(contacts)
    .set({ status: "unsubscribed", updatedAt: new Date() })
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.email, addr),
        eq(contacts.status, "active"),
      ),
    );
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
