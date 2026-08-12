import { and, count, eq, isNull, like } from "drizzle-orm";
import { env, newId } from "@rootmail/core";
import { betaInvites, db, ensureInternalAccount, lists } from "@rootmail/db";

/**
 * rootmail's own beta waitlist — an audience in our own account.
 *
 * The whole point of the dogfooding work is that we do not get a second,
 * private mechanism for our own mail. So the waitlist is not a bespoke table:
 * it is a list in rootmail-hq, which means it already has a hosted signup page,
 * double opt-in, suppression, unsubscribe headers, growth charts and campaign
 * sending — and every bug in that path is one our customers would have hit too.
 */
export const BETA_WAITLIST_TAG = "beta-waitlist";
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

  const [used] = await db
    .select({ n: count() })
    .from(betaInvites)
    .where(like(betaInvites.label, "auto:%"));
  if ((used?.n ?? 0) >= limit) return null;

  const code =
    "beta-" +
    Array.from({ length: 8 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  await db.insert(betaInvites).values({
    id: newId("betaInvite"),
    code,
    // The prefix is load-bearing: it is how the cap counts itself.
    label: `auto: ${email}`,
    maxUses: 1,
  });
  return code;
}

/** How many automatic seats remain — for the staff waitlist screen. */
export async function autoAdmitRemaining(): Promise<{ limit: number; used: number; left: number }> {
  const limit = env.BETA_AUTO_ADMIT_LIMIT;
  const [used] = await db
    .select({ n: count() })
    .from(betaInvites)
    .where(like(betaInvites.label, "auto:%"));
  const u = used?.n ?? 0;
  return { limit, used: u, left: Math.max(0, limit - u) };
}
