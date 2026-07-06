import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { and, eq } from "drizzle-orm";
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
