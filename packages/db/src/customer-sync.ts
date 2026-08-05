import { and, desc, eq, isNull } from "drizzle-orm";
import { getTierDef, newId } from "@rootmail/core";
import { db } from "./client";
import { ensureInternalAccount } from "./internal-org";
import { contacts, memberships, organizations, users, workspaces } from "./schema";

/**
 * Our customers, as an audience we can actually write to.
 *
 * rootmail reaches its customers with rootmail, which means our customers have
 * to BE contacts — not rows in `organizations` that some bespoke admin screen
 * knows how to mail. This mirrors each account's owner into our own workspace
 * as an ordinary contact, carrying the facts we'd want to segment on.
 *
 * Everything here writes through the SAME shape a customer's own sync would:
 * a contact, keyed by email, with traits on `metadata` and tags for the coarse
 * cuts. There is no private field and no internal-only mechanism — if this were
 * more capable than what a customer can do with `POST /v1/contacts`, we would
 * be back to having a product that can't do our job. The traits chosen are the
 * generic SaaS ones (plan, signup date, activity) precisely because every
 * customer syncing their app's users wants the same ones.
 */

/**
 * Traits every synced customer carries. Names are stable — segments use them.
 *
 * Anything a person would not want to READ on the customer's record is prefixed
 * `_` (see `isPrivateTrait`): stored and segmentable, never displayed. That
 * convention exists because of this file — the first version wrote
 * `organization_id: org_8pgw…`, `marketing_tier: mk_free` and two billing
 * counters onto every customer, and the contact page rendered all of it. Useful
 * to query, meaningless to read.
 */
export interface CustomerTraits extends Record<string, unknown> {
  /** "free" or "paid" — the word a person would type into a segment. */
  plan: "free" | "paid";
  /** The tier as a PERSON reads it ("Growth"), not its internal id. */
  marketing_tier?: string;
  /** ISO date they signed up — "trial ending", "joined this month". */
  signed_up_at: string;
  /** Have they finished the setup that makes sending possible? */
  onboarded: boolean;
  /** Set only when true, so `not_exists` means "never verified a domain". */
  verified_domain?: string;
  /** Private: our own id for them, for joining back to the admin console. */
  _organization_id: string;
  /** Private: billing counters — segment on them, don't read them. */
  _transactional_blocks: number;
  _marketing_contacts: number;
  /** Private: the raw tier id, when a rule needs to be exact. */
  _marketing_tier_id?: string;
}

/**
 * "free" or "paid" — and deliberately not the tier id.
 *
 * The first version returned the raw tier ("mk_free"), which meant the most
 * obvious segment anyone would write, `plan = free`, matched nobody while
 * every account was in fact free. A trait that quietly matches zero is worse
 * than a missing one: the campaign sends to an empty audience and looks like it
 * worked. Segment values have to be the words a person would type.
 *
 * The precise tier is still available as its own trait for when it's wanted.
 */
function planLabel(o: typeof organizations.$inferSelect): "free" | "paid" {
  return o.transactionalBlocks > 0 || o.marketingContacts > 0 ? "paid" : "free";
}

function tagsFor(o: typeof organizations.$inferSelect, traits: CustomerTraits): string[] {
  const t = ["customer", `plan:${traits.plan}`];
  if (!traits.onboarded) t.push("not-onboarded");
  if (!traits.verified_domain) t.push("no-verified-domain");
  if (o.dedicatedIpStatus === "active") t.push("dedicated-ip");
  return t;
}

/**
 * Mirror one account's owner into our audience. Idempotent: the same account
 * syncs to the same contact, traits refreshed.
 *
 * Returns null when the org has no owner we could mail — a half-provisioned
 * account is not something to invent a contact for.
 */
export async function syncCustomerToAudience(organizationId: string): Promise<string | null> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  // Never mirror ourselves into our own audience — we would be mailing us.
  if (!org || org.isInternal) return null;

  const [owner] = await db
    .select({ email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, "owner")))
    .orderBy(desc(memberships.createdAt))
    .limit(1);
  if (!owner?.email) return null;

  const { workspaceId } = await ensureInternalAccount();

  const traits: CustomerTraits = {
    plan: planLabel(org),
    // The tier a person reads ("Growth"), not the id they'd have to decode.
    ...(org.marketingTier
      ? {
          marketing_tier: getTierDef(org.marketingTier)?.name ?? org.marketingTier,
          _marketing_tier_id: org.marketingTier,
        }
      : {}),
    signed_up_at: org.createdAt.toISOString().slice(0, 10),
    onboarded: org.onboardingCompletedAt !== null,
    _organization_id: org.id,
    _transactional_blocks: org.transactionalBlocks ?? 0,
    _marketing_contacts: org.marketingContacts ?? 0,
    ...(org.replyDomainStatus === "active" && org.replyDomain
      ? { verified_domain: org.replyDomain }
      : {}),
  };

  const email = owner.email.toLowerCase();
  const [existing] = await db
    .select({ id: contacts.id, metadata: contacts.metadata })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.subTenantId),
        eq(contacts.email, email),
      ),
    )
    .limit(1);

  if (existing) {
    // Contacts synced before the `_` convention still carry the public versions
    // of keys that are now private. A merge alone would preserve them forever,
    // so the retired names are dropped explicitly — the sync is what repairs
    // them, on its next run, with no migration needed.
    const kept = { ...existing.metadata };
    for (const retired of ["organization_id", "transactional_blocks", "marketing_contacts"]) {
      delete kept[retired];
    }

    await db
      .update(contacts)
      .set({
        name: owner.name ?? undefined,
        // Merge, don't replace: a human may have added notes-worth of their own
        // traits on this contact and a sync must not wipe them.
        metadata: { ...kept, ...traits },
        tags: tagsFor(org, traits),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, existing.id));
    return existing.id;
  }

  const id = newId("contact");
  await db.insert(contacts).values({
    id,
    workspaceId,
    subTenantId: null,
    email,
    name: owner.name ?? null,
    metadata: { ...traits },
    tags: tagsFor(org, traits),
    // "active" is right: this is our existing customer relationship, not a
    // scraped address. Marketing to them still honours unsubscribe — that is
    // what the marketing class is for.
    status: "active",
  });
  return id;
}

/** Backfill every account. Returns how many contacts now represent customers. */
export async function syncAllCustomersToAudience(): Promise<{ synced: number; skipped: number }> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.isInternal, false));

  let synced = 0;
  let skipped = 0;
  for (const r of rows) {
    const id = await syncCustomerToAudience(r.id);
    if (id) synced++;
    else skipped++;
  }
  return { synced, skipped };
}

/** Our own workspace id, for callers that need to scope a query to it. */
export async function audienceWorkspaceId(): Promise<string> {
  const { workspaceId } = await ensureInternalAccount();
  return workspaceId;
}

/** Unused import guard — `workspaces` is referenced by the schema relations. */
void workspaces;

/**
 * Our audience just went stale for this account — refresh it.
 *
 * Fire-and-forget by design. This is OUR marketing plumbing; a customer
 * signing up, finishing onboarding or upgrading must never see an error, or
 * wait, because a contact record failed to write. The daily backfill
 * (syncAllCustomersToAudience) is the safety net that repairs anything missed.
 *
 * Callers do `void customerChanged(orgId)` — deliberately not awaited.
 */
export function customerChanged(organizationId: string): void {
  void syncCustomerToAudience(organizationId).catch(() => {
    /* the backfill will pick it up */
  });
}
