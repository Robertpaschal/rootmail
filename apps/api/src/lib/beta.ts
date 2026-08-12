import { and, eq, isNull, or, sql } from "drizzle-orm";
import { env } from "@rootmail/core";
import { betaInvites, db } from "@rootmail/db";

/**
 * The closed beta.
 *
 * While `BETA_INVITE_REQUIRED` is on, an account cannot be created without a
 * code. That is the whole gate — there is no second path, because a second path
 * is how closed betas quietly stop being closed.
 *
 * Turning the flag off opens signup to everyone and needs no code change; codes
 * already redeemed keep their `is_beta` flag, so testers do not lose access to
 * everything the day the beta ends.
 */
export function betaInviteRequired(): boolean {
  return String(env.BETA_INVITE_REQUIRED ?? "").toLowerCase() === "true";
}

export interface RedeemedInvite {
  id: string;
  code: string;
}

/**
 * Check a code and consume one use, atomically.
 *
 * The update is the check: a single conditional UPDATE that only matches a code
 * which is live, unexpired and under its cap. Reading first and writing after
 * would let two people racing on the last seat of a code both get in — the
 * classic way an invite cap leaks, and one that only shows up under exactly the
 * traffic a launch produces.
 *
 * Returns null for every kind of bad code. The caller must not explain which
 * kind: "expired" vs "already used" vs "never existed" tells someone probing
 * for codes how close they are.
 */
export async function redeemBetaInvite(rawCode: string): Promise<RedeemedInvite | null> {
  const code = rawCode.trim().toLowerCase();
  if (!code) return null;

  const [row] = await db
    .update(betaInvites)
    .set({ usedCount: sql`${betaInvites.usedCount} + 1` })
    .where(
      and(
        eq(sql`lower(${betaInvites.code})`, code),
        isNull(betaInvites.revokedAt),
        or(isNull(betaInvites.expiresAt), sql`${betaInvites.expiresAt} > now()`),
        sql`${betaInvites.usedCount} < ${betaInvites.maxUses}`,
      ),
    )
    .returning({ id: betaInvites.id, code: betaInvites.code });

  return row ?? null;
}
