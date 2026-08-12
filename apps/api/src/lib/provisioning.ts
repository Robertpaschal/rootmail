import { eq } from "drizzle-orm";
import { db, memberships, organizations, users } from "@rootmail/db";
import { dedicatedIpReadyEmail, replyDomainReadyEmail } from "./emails";
import { provisionDedicatedIp, provisionReplyReceiptRule } from "./ses-provisioning";
import { env, sendSystemEmail } from "@rootmail/core";

/**
 * Provisioning without a person in the middle.
 *
 * Both of these used to be a staff member doing mechanical work in the AWS
 * console while a paying customer sat on "pending". Nothing about either step
 * was a judgement call — the money had changed hands, or DNS had already proved
 * ownership — so the human only ever added hours.
 *
 * The rules that keep that safe:
 *
 *  - A failure changes NOTHING. The org keeps its previous status, so a retry
 *    is always safe and a customer is never told a feature is live when it is
 *    not.
 *  - The customer is emailed on success, because a feature that quietly turns
 *    on is a feature nobody uses. Failures are staff's problem, not theirs.
 *  - Staff keep their manual override. Automation that cannot be stepped around
 *    at 3am is worse than none.
 */

export interface ProvisionOutcome {
  ok: boolean;
  detail: string;
}

/** The person to tell — an org's owner. */
async function ownerOf(organizationId: string): Promise<{ email: string; name: string | null } | null> {
  const [row] = await db
    .select({ email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

/**
 * A dedicated IP, from purchase to sending, with nobody watching.
 *
 * Called when the add-on is bought. The org is only moved to `active` once SES
 * has a pool AND that pool's configuration set is wired to our event topic —
 * see ses-provisioning.ts for why that second half is non-negotiable.
 */
export async function autoProvisionDedicatedIp(organizationId: string): Promise<ProvisionOutcome> {
  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug, status: organizations.dedicatedIpStatus })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) return { ok: false, detail: "Organization not found" };
  if (org.status === "active") return { ok: true, detail: "Already active" };

  // Mark the attempt so the customer sees "setting up" rather than nothing, and
  // so a staff screen can show what is in flight.
  await db
    .update(organizations)
    .set({ dedicatedIpStatus: "requested", updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));

  const result = await provisionDedicatedIp(org.slug);
  if (!result.ok) {
    // Deliberately left at `requested`: billing shows the add-on, the product
    // shows "setting up", and staff can finish it by hand. What we must never
    // do is claim active.
    return { ok: false, detail: result.reason };
  }

  await db
    .update(organizations)
    .set({
      dedicatedIpStatus: "active",
      dedicatedIpConfigSet: result.value.configSet,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));

  const owner = await ownerOf(organizationId);
  if (owner) {
    const mail = dedicatedIpReadyEmail(owner.name);
    // Transactional: it is the fulfilment of something they paid for.
    await sendSystemEmail({
      to: owner.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      cls: "transactional",
    });
  }
  return { ok: true, detail: `Pool ${result.value.poolName} via ${result.value.configSet}` };
}

/**
 * Turn on a customer's branded reply domain the moment DNS proves they own it.
 *
 * Called from the DNS verification path, so "verified" and "working" become the
 * same event instead of two things separated by however long it took someone to
 * notice a queue.
 */
export async function autoProvisionReplyDomain(organizationId: string): Promise<ProvisionOutcome> {
  const [org] = await db
    .select({
      id: organizations.id,
      domain: organizations.replyDomain,
      verifiedAt: organizations.replyDomainVerifiedAt,
      status: organizations.replyDomainStatus,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) return { ok: false, detail: "Organization not found" };
  if (org.status === "active") return { ok: true, detail: "Already active" };
  if (!org.domain || org.verifiedAt == null) {
    // The DNS check is the ownership proof. Without it this would happily point
    // someone else's subdomain at our inbound.
    return { ok: false, detail: "Reply domain is not DNS-verified yet" };
  }

  const result = await provisionReplyReceiptRule(org.domain, {
    s3Bucket: env.INBOUND_S3_BUCKET,
    s3Prefix: env.INBOUND_S3_PREFIX,
    snsTopicArn: env.INBOUND_SNS_TOPIC_ARN,
  });
  if (!result.ok) return { ok: false, detail: result.reason };

  await db
    .update(organizations)
    .set({ replyDomainStatus: "active", updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));

  const owner = await ownerOf(organizationId);
  if (owner) {
    const mail = replyDomainReadyEmail(org.domain, owner.name);
    await sendSystemEmail({
      to: owner.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      cls: "transactional",
    });
  }
  return { ok: true, detail: `Rule ${result.value.ruleName} in ${result.value.ruleSet}` };
}
