import { and, count, eq, gt, isNull, like, or, sql } from "drizzle-orm";
import { env, newId } from "@rootmail/core";
import { betaInvites, contacts, db, ensureInternalAccount, evaluateTriggers, lists } from "@rootmail/db";
import { isTesterVerified } from "./ses-provisioning";

/**
 * rootmail's own beta waitlist — an audience in our own account.
 *
 * The whole point of the dogfooding work is that we do not get a second,
 * private mechanism for our own mail. So the waitlist is not a bespoke table:
 * it is a list in rootmail-hq, which means it already has a hosted signup page,
 * double opt-in, suppression, unsubscribe headers, growth charts and campaign
 * sending — and every bug in that path is one our customers would have hit too.
 */
/**
 * Applied at signup. Inert on purpose — it triggers nothing.
 *
 * The invite sequence fires on BETA_READY_TAG, and a tester only earns that
 * once SES says their address is verified. Tagging them ready at signup is the
 * bug this pair of constants exists to prevent: the sequence sent within
 * seconds, SES refused an unverified recipient, and the enrollment completed —
 * so the invite was never retried and the tester waited forever.
 */
export const BETA_WAITLIST_TAG = "beta-pending";

/** The tag the invite sequence triggers on. Earned by verifying, never given. */
export const BETA_READY_TAG = "beta-waitlist";
const BETA_WAITLIST_NAME = "Beta waitlist";

export interface BetaWaitlistAudience {
  workspaceId: string;
  list: { id: string; signupTag: string | null };
}

/** Find-or-create the waitlist audience. Idempotent, safe on every request. */
export async function betaWaitlistAudience(): Promise<BetaWaitlistAudience> {
  const internal = await ensureInternalAccount();

  const [existing] = await db
    .select({ id: lists.id, signupTag: lists.signupTag })
    .from(lists)
    .where(
      and(
        eq(lists.workspaceId, internal.workspaceId),
        isNull(lists.subTenantId),
        eq(lists.name, BETA_WAITLIST_NAME),
      ),
    )
    .limit(1);

  if (existing) return { workspaceId: internal.workspaceId, list: existing };

  const [created] = await db
    .insert(lists)
    .values({
      id: newId("list"),
      workspaceId: internal.workspaceId,
      subTenantId: null,
      name: BETA_WAITLIST_NAME,
      description: "People who asked for access while rootmail is in closed beta.",
      signupEnabled: true,
      signupTag: BETA_WAITLIST_TAG,
      // Single opt-in: they typed their address into our own form seconds ago,
      // and the next mail they get is the invite they are waiting for. A
      // confirm step here loses people at the exact moment they are keenest.
      doubleOptIn: false,
    })
    .returning({ id: lists.id, signupTag: lists.signupTag });

  return { workspaceId: internal.workspaceId, list: created };
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Mint a single-use code for one person, if we still have automatic seats.
 *
 * Returns null when the cap is spent — the signup still lands on the waitlist,
 * it just waits for a human. That is the difference between "we let the first
 * fifty in automatically" and "signup is open", and it is one env var wide.
 *
 * The cap counts codes we minted automatically, not accounts created, because
 * the seat is spent the moment we mail someone a working code.
 */
export async function autoMintInvite(email: string): Promise<string | null> {
  const limit = env.BETA_AUTO_ADMIT_LIMIT;
  if (limit < 1) return null;

  if ((await autoAdmitRemaining()).left < 1) return null;

  const code =
    "beta-" +
    Array.from({ length: 8 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  await db.insert(betaInvites).values({
    id: newId("betaInvite"),
    code,
    // The prefix is load-bearing: it is how the cap counts itself.
    label: `auto: ${email}`,
    maxUses: 1,
    // A seat someone never took must come back. See autoAdmitRemaining.
    expiresAt: new Date(Date.now() + UNCLAIMED_SEAT_DAYS * 86_400_000),
  });
  return code;
}

/** How long an unclaimed auto-minted code holds its seat before releasing it. */
const UNCLAIMED_SEAT_DAYS = 7;

/**
 * How many automatic seats remain.
 *
 * A seat is held by an invite that was REDEEMED, or by one recently minted and
 * still live. It is deliberately NOT held forever by a minted code, because
 * plenty of them will never be used: a tester has to click an AWS verification
 * email before we can even reach them, and some fraction simply won't. Counting
 * those against capacity would shrink an 8-seat beta to five real testers with
 * nothing on screen explaining where the other three went.
 *
 * So an unredeemed code expires after a week and its seat returns to the pool.
 * The code stays in the table — the roster keeps its history — it just stops
 * occupying a chair nobody sat in.
 */
export async function autoAdmitRemaining(): Promise<{ limit: number; used: number; left: number }> {
  const limit = env.BETA_AUTO_ADMIT_LIMIT;
  const [used] = await db
    .select({ n: count() })
    .from(betaInvites)
    .where(
      and(
        like(betaInvites.label, "auto:%"),
        isNull(betaInvites.revokedAt),
        or(
          // Claimed: a real tester is in that seat.
          sql`${betaInvites.usedCount} > 0`,
          // Or still within its window — held, not yet lost.
          gt(betaInvites.expiresAt, new Date()),
        ),
      ),
    );
  const u = used?.n ?? 0;
  return { limit, used: u, left: Math.max(0, limit - u) };
}

/**
 * Promote everyone who has now verified their address.
 *
 * A tester clicks the link in Amazon's mail; nothing in our system is told. So
 * we ask, on a short interval, and the moment SES says yes we add the tag that
 * fires their invite. That is the whole gate: verification gets to decide when
 * the sequence runs, instead of racing it.
 *
 * Cheap by construction — only contacts still waiting are checked, and the
 * beta is a couple of dozen people at most. Returns how many moved so a log
 * line can be quiet when nothing happened.
 */
export async function promoteVerifiedTesters(): Promise<number> {
  const { workspaceId } = await betaWaitlistAudience();

  const waiting = await db
    .select({ id: contacts.id, email: contacts.email, tags: contacts.tags })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), isNull(contacts.subTenantId)))
    .limit(500);

  let promoted = 0;
  for (const c of waiting) {
    const tags = c.tags ?? [];
    if (!tags.includes(BETA_WAITLIST_TAG) || tags.includes(BETA_READY_TAG)) continue;
    if (!(await isTesterVerified(c.email))) continue;

    const next = [...tags, BETA_READY_TAG];
    await db.update(contacts).set({ tags: next, updatedAt: new Date() }).where(eq(contacts.id, c.id));
    // The same trigger evaluation a customer's own signup form runs — which is
    // what makes the invite arrive by our own sequence engine, not a side door.
    await evaluateTriggers(workspaceId, null, { id: c.id, email: c.email, tags: next }, { created: false });
    promoted += 1;
  }
  return promoted;
}
