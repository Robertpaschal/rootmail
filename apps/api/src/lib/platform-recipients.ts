import { and, desc, eq, sql } from "drizzle-orm";
import { env, RECIPIENT_UNCONFIRMED } from "@rootmail/core";
import { db, ensureInternalAccount, messages } from "@rootmail/db";

/**
 * Is OUR platform mail limited to recipients who have confirmed their address
 * with the provider first? True while rootmail's own SES account is in the
 * sandbox — the same predicate packages/db/src/sending-access.ts uses for
 * customer sends. Anything we mail a stranger (an invite, a verification
 * link) is refused by the provider until they have clicked its confirmation.
 */
export function platformRecipientsRestricted(): boolean {
  return env.MAIL_PROVIDER === "ses" && env.SES_SANDBOX_MODE !== "false";
}

/**
 * What a person is told when our provider will not deliver to them yet.
 *
 * Product words only: no provider error text, region or configuration names.
 * Google/GitHub works because OAuth sign-in marks an existing account's
 * address verified (upsertOAuthUser) without us emailing anything.
 */
export const UNCONFIRMED_ADDRESS_COPY =
  "We can't email this address yet. While rootmail is in closed beta, our email provider only delivers to addresses " +
  "that have confirmed with it first, so your verification email didn't go through. Look for a confirmation email " +
  "from Amazon Web Services (check spam too), click its link, then press Resend. Or sign in with Google or GitHub " +
  "using this same address — that verifies it straight away.";

/**
 * Did our most recent security email (verification, reset) to this address
 * get refused because the address hasn't confirmed with the provider?
 *
 * Reads what system-mail recorded rather than asking SES, so it is safe on
 * hot paths like /v1/auth/me. A later successful resend replaces the answer.
 */
export async function verificationMailRefused(email: string): Promise<boolean> {
  const { workspaceId } = await ensureInternalAccount();
  const [last] = await db
    .select({ status: messages.status, error: messages.error })
    .from(messages)
    .where(
      and(
        eq(messages.workspaceId, workspaceId),
        eq(messages.toEmail, email.toLowerCase()),
        sql`${messages.metadata}->>'platform_mail_class' = 'security'`,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return last?.status === "failed" && (last.error ?? "").startsWith(RECIPIENT_UNCONFIRMED);
}
