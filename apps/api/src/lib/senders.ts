import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { and, asc, desc, eq } from "drizzle-orm";
import { env } from "@rootmail/core";
import { db, senderIdentities, type SenderIdentity } from "@rootmail/db";

// Own-address sending: an org adds e.g. hello@acme.com, SES emails that mailbox a
// confirmation link (CreateEmailIdentity), and once confirmed the address may be
// used as a From on sends. In mock mode (DNS_VERIFY_MODE=mock — local/demo, no
// AWS), the flow is simulated: create → pending, check → verified.

const MOCK = env.DNS_VERIFY_MODE === "mock";

const ses = new SESv2Client(env.AWS_REGION ? { region: env.AWS_REGION } : {});

/** Ask SES to start email-identity verification (SES sends the confirmation mail). */
export async function startIdentityVerification(email: string): Promise<void> {
  if (MOCK) return;
  try {
    await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: email }));
  } catch (err) {
    // Already-exists is fine — re-adding just re-checks status later.
    if ((err as { name?: string }).name !== "AlreadyExistsException") throw err;
  }
}

/** Query SES for the identity's verification status. */
export async function identityVerified(email: string): Promise<boolean> {
  if (MOCK) return true;
  try {
    const res = await ses.send(new GetEmailIdentityCommand({ EmailIdentity: email }));
    return res.VerifiedForSendingStatus === true;
  } catch {
    return false;
  }
}

/** Remove the identity from SES (best-effort — the row is the source of truth). */
export async function removeIdentity(email: string): Promise<void> {
  if (MOCK) return;
  await ses
    .send(new DeleteEmailIdentityCommand({ EmailIdentity: email }))
    .catch(() => undefined);
}

/**
 * The address an org sends from when a message/campaign doesn't name one — the
 * whole point of "set up your own sender once." Prefers the identity flagged
 * default; else the earliest verified one. null → the org has verified nothing,
 * so callers fall back to the rootmail no-reply.
 */
export async function defaultSenderFor(organizationId: string): Promise<SenderIdentity | null> {
  const verified = await db
    .select()
    .from(senderIdentities)
    .where(and(eq(senderIdentities.organizationId, organizationId), eq(senderIdentities.status, "verified")))
    .orderBy(desc(senderIdentities.isDefault), asc(senderIdentities.createdAt));
  return verified[0] ?? null;
}

/** Make one verified identity the org's default, clearing the flag on the rest. */
export async function setDefaultSender(organizationId: string, id: string): Promise<void> {
  await db
    .update(senderIdentities)
    .set({ isDefault: false })
    .where(eq(senderIdentities.organizationId, organizationId));
  await db.update(senderIdentities).set({ isDefault: true }).where(eq(senderIdentities.id, id));
}

/** After a verify or delete, guarantee the org has exactly one default among its
 * verified identities (promote the earliest if the default is gone). */
export async function ensureDefaultSender(organizationId: string): Promise<void> {
  const verified = await db
    .select({ id: senderIdentities.id, isDefault: senderIdentities.isDefault })
    .from(senderIdentities)
    .where(and(eq(senderIdentities.organizationId, organizationId), eq(senderIdentities.status, "verified")))
    .orderBy(asc(senderIdentities.createdAt));
  if (verified.length === 0) return;
  if (verified.some((v) => v.isDefault)) return;
  await db.update(senderIdentities).set({ isDefault: true }).where(eq(senderIdentities.id, verified[0].id));
}

/** Is this exact address a VERIFIED sender identity of the org? */
export async function verifiedSenderFor(
  organizationId: string,
  email: string,
): Promise<SenderIdentity | null> {
  const [row] = await db
    .select()
    .from(senderIdentities)
    .where(
      and(
        eq(senderIdentities.organizationId, organizationId),
        eq(senderIdentities.email, email.toLowerCase()),
        eq(senderIdentities.status, "verified"),
      ),
    )
    .limit(1);
  return row ?? null;
}
