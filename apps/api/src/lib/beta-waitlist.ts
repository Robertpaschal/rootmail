import { and, eq, isNull } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { db, ensureInternalAccount, lists } from "@rootmail/db";

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
