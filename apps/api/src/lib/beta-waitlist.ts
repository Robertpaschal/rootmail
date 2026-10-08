import { and, count, eq, gt, isNull, like, or, sql } from "drizzle-orm";
import { env, newId } from "@rootmail/core";
import {
  type BetaInviteAutomation,
  betaInvites,
  users,
  contacts,
  db,
  ensureBetaInviteAutomation,
  ensureInternalAccount,
  evaluateTriggers,
  lists,
  verifiedRecipients,
} from "@rootmail/db";
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

/**
 * Staff let them in before their address could receive mail. The sweep
 * invites them the moment it can, with a staff code that does not count
 * against the automatic seats.
 */
export const BETA_ADMITTED_TAG = "beta-admitted";

/** They have been sent a code — by staff directly, or by the invite sequence. */
export const BETA_INVITED_TAG = "beta-invited";
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

  if (existing) {
    // Self-heal the signup tag. Changing the constant only affects list
    // CREATION — a list made before the verification gate existed keeps the
    // old tag in the database, so signups carried on firing the invite
    // sequence immediately and the gate looked like it did nothing. Repair on
    // read, the same way ensureInternalAccount fixes an unflagged internal org.
    if (existing.signupTag !== BETA_WAITLIST_TAG) {
      await db
        .update(lists)
        .set({ signupTag: BETA_WAITLIST_TAG, updatedAt: new Date() })
        .where(eq(lists.id, existing.id));
      return { workspaceId: internal.workspaceId, list: { ...existing, signupTag: BETA_WAITLIST_TAG } };
    }
    return { workspaceId: internal.workspaceId, list: existing };
  }

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

/**
 * A personal code staff chose to hand out: labelled with the address, no
 * expiry, and outside the automatic cap (the `waitlist:` label is not counted).
 */
export async function mintStaffInvite(email: string, staffId: string): Promise<{ id: string; code: string }> {
  const code =
    "beta-" +
    Array.from({ length: 8 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  const [invite] = await db
    .insert(betaInvites)
    .values({ id: newId("betaInvite"), code, label: `waitlist: ${email}`, maxUses: 1, createdByStaffId: staffId })
    .returning({ id: betaInvites.id, code: betaInvites.code });
  return invite;
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
 * A working code for someone we are about to invite — at the moment we invite
 * them, not when they first asked.
 *
 * If they already hold a live code (an older signup, or a staff admission) it
 * is re-armed for another full window instead of replaced, so a code they may
 * already have seen keeps working. A code that has lapsed already gave its seat
 * back, so it is NOT revived — that would take a seat without checking the cap
 * — and a fresh one is minted through the cap instead.
 *
 * Null means no seat: the caller holds them until one frees up.
 */
export async function liveInviteCodeFor(
  email: string,
  metadata: Record<string, unknown>,
  opts: { staffId?: string | null } = {},
): Promise<string | null> {
  const existing = typeof metadata.beta_invite_code === "string" ? metadata.beta_invite_code : null;
  if (existing) {
    const [rearmed] = await db
      .update(betaInvites)
      .set({
        // A staff code with no expiry stays without one.
        expiresAt: sql`case when ${betaInvites.expiresAt} is null then null else now() + make_interval(days => ${UNCLAIMED_SEAT_DAYS}::int) end`,
      })
      .where(
        and(
          eq(betaInvites.code, existing),
          isNull(betaInvites.revokedAt),
          sql`${betaInvites.usedCount} < ${betaInvites.maxUses}`,
          or(isNull(betaInvites.expiresAt), gt(betaInvites.expiresAt, new Date())),
        ),
      )
      .returning({ code: betaInvites.code });
    if (rearmed) return rearmed.code;
  }
  // Someone staff admitted gets the seat staff gave them, cap or no cap.
  if (opts.staffId) return (await mintStaffInvite(email, opts.staffId)).code;
  return autoMintInvite(email);
}

/**
 * The sweep found verified testers but the invite automation cannot send.
 *
 * Thrown instead of tagging them: a ready tag is the one-shot trigger, and
 * spending it while there is no sequence to fire loses the invite for good.
 * Held testers stay waiting and are promoted on the first pass after the
 * automation is fixed.
 */
export class BetaInviteAutomationError extends Error {
  constructor(
    readonly automation: BetaInviteAutomation,
    readonly held: number,
  ) {
    super(
      `beta invite automation is not runnable (${automation.problems.join(", ")}) — ` +
        `holding ${held} verified tester(s); nobody is invited until it is fixed`,
    );
    this.name = "BetaInviteAutomationError";
  }
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
    .select({ id: contacts.id, email: contacts.email, tags: contacts.tags, metadata: contacts.metadata, recipientStatus: verifiedRecipients.status })
    .from(contacts)
    .leftJoin(verifiedRecipients, and(eq(verifiedRecipients.workspaceId, contacts.workspaceId), eq(verifiedRecipients.email, contacts.email)))
    .where(and(eq(contacts.workspaceId, workspaceId), isNull(contacts.subTenantId)))
    .limit(500);

  let promoted = 0;
  let held = 0;
  let automation: BetaInviteAutomation | undefined;
  for (const c of waiting) {
    const tags = c.tags ?? [];
    if (!tags.includes(BETA_WAITLIST_TAG)) continue;
    // Staff already mailed them a code. A sequence invite on top would be a
    // second, different code for the same person.
    if (tags.includes(BETA_INVITED_TAG) && !tags.includes(BETA_READY_TAG)) continue;
    if (tags.includes(BETA_READY_TAG) && c.recipientStatus === "verified") continue;
    if (!(await isTesterVerified(c.email))) continue;

    // The invite sequence uses the same sending guard as customer workflows.
    // Record observed SES confirmation before evaluating its trigger. Also
    // repair older ready contacts without firing their invite a second time.
    await db.insert(verifiedRecipients).values({
      id: newId("verifiedRecipient"), workspaceId, email: c.email,
      status: "verified", verifiedAt: new Date(),
    }).onConflictDoUpdate({
      target: [verifiedRecipients.workspaceId, verifiedRecipients.email],
      set: { status: "verified", verifiedAt: new Date(), updatedAt: new Date() },
    });
    if (tags.includes(BETA_READY_TAG)) continue;

    // Ensure on first use: creates the template/sequence if a database never
    // had them, and tells us when they exist but cannot send (paused, edited).
    automation ??= await ensureBetaInviteAutomation({ workspaceId });
    if (!automation.ok) {
      held += 1;
      continue;
    }

    // Someone who already has an account (Google/GitHub, an earlier invite)
    // must not spend a seat on a code they cannot use.
    const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, c.email.toLowerCase())).limit(1);
    if (account) continue;

    // The code is minted (or re-armed) NOW, at verification, and written onto
    // the contact before the trigger fires: the sequence renders it as
    // {{beta_invite_code}} from contact metadata at send time. No seat, no tag
    // — they stay waiting and the next sweep tries again.
    const metadata = (c.metadata ?? {}) as Record<string, unknown>;
    const staffId = tags.includes(BETA_ADMITTED_TAG) && typeof metadata.beta_admitted_by === "string" ? metadata.beta_admitted_by : null;
    const code = await liveInviteCodeFor(c.email, metadata, { staffId });
    if (!code) continue;

    // Invited as well as ready: the /beta page and the staff list read
    // BETA_INVITED_TAG, and admit must not mail a second code on top.
    const next = [...tags, BETA_READY_TAG, BETA_INVITED_TAG];
    await db
      .update(contacts)
      .set({
        tags: next,
        metadata: { ...metadata, beta_invite_code: code, beta_invited_at: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, c.id));
    // The same trigger evaluation a customer's own signup form runs — which is
    // what makes the invite arrive by our own sequence engine, not a side door.
    await evaluateTriggers(workspaceId, null, { id: c.id, email: c.email, tags: next }, { created: false });
    promoted += 1;
  }
  if (held > 0 && automation) throw new BetaInviteAutomationError(automation, held);
  return promoted;
}
