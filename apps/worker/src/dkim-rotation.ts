import { eq } from "drizzle-orm";
import {
  DKIM_PREVIOUS_RETIRE_DAYS,
  DKIM_ROTATION_AGE_DAYS,
  decideDkimRotation,
  type DnsCheck,
  encryptSecret,
  generateDkimKeypair,
  newId,
  nextDkimSelector,
  previousRetireAt,
} from "@rootmail/core";
import { auditEntries, db, type SubTenant, subTenants } from "@rootmail/db";
import { sendTenantAlert } from "./tenant-alerts";

// DKIM rotation, applied.
//
// The rules are pure and tested in core; this only carries them out. The single
// invariant worth restating at the point of the write: we swap the signing key
// ONLY in the `promote` branch, which is only reached once the new record has
// actually resolved. Every other branch leaves the active key exactly where it is.

/** Auto-start rotation on key age. Off by default — see the note in ROADMAP. */
const AUTO_START = process.env.DKIM_AUTO_ROTATE === "true";

export async function applyDkimRotation(tenant: SubTenant, checks: DnsCheck[]): Promise<void> {
  const now = new Date();
  const pendingResolves = checks.some((c) => c.purpose === "dkim_next" && c.ok);

  const decision = decideDkimRotation({
    pendingResolves,
    rotationStartedAt: tenant.dkimRotationStartedAt,
    hasPending: Boolean(tenant.nextDkimSelector),
    rotatedAt: tenant.dkimRotatedAt,
    verifiedAt: tenant.verifiedAt,
    previousRetireAt: tenant.previousDkimRetireAt,
    now,
    autoStart: AUTO_START,
  });

  switch (decision.action) {
    case "none":
      return;

    case "retire":
      // Cleanup only: the old selector has outlived every plausible deferral, so
      // it stops being advertised. Nothing about signing changes here.
      await db
        .update(subTenants)
        .set({ previousDkimSelector: null, previousDkimRetireAt: null, updatedAt: now })
        .where(eq(subTenants.id, tenant.id));
      return;

    case "stalled": {
      // A nag, never an enforcement — their mail is signing perfectly well with
      // the existing key. Stamped so it is said once, not every hour.
      await db
        .update(subTenants)
        .set({ dkimRotationStartedAt: now, updatedAt: now })
        .where(eq(subTenants.id, tenant.id));
      await sendTenantAlert({
        workspaceId: tenant.workspaceId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        headline: `${tenant.name}'s new signing key is still waiting on a DNS record`,
        reason:
          `We generated a new DKIM key for ${tenant.sendingDomain} ${decision.daysWaiting} days ago ` +
          `and its record has not appeared yet.`,
        detail: `${tenant.nextDkimSelector}._domainkey.${tenant.sendingDomain}\n\n${tenant.nextDkimPublicKey ?? ""}`,
        next:
          "Nothing is broken — their mail is still signed with the current key, and will be until the " +
          "new record resolves. Add it whenever suits; it completes on its own.",
      });
      return;
    }

    case "start": {
      const selector = nextDkimSelector(tenant.dkimSelector, now);
      const keypair = generateDkimKeypair(selector);
      await db
        .update(subTenants)
        .set({
          nextDkimSelector: selector,
          nextDkimPublicKey: keypair.dnsValue,
          nextDkimPrivateKey: encryptSecret(keypair.privateKeyPem),
          dkimRotationStartedAt: now,
          updatedAt: now,
        })
        .where(eq(subTenants.id, tenant.id));
      await audit(tenant, "dkim_rotation_started", {
        from_selector: tenant.dkimSelector,
        to_selector: selector,
        trigger: "age",
        age_days: DKIM_ROTATION_AGE_DAYS,
      });
      await sendTenantAlert({
        workspaceId: tenant.workspaceId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        headline: `Time to rotate ${tenant.name}'s signing key`,
        reason:
          `${tenant.sendingDomain}'s DKIM key is ${DKIM_ROTATION_AGE_DAYS} days old, so we have ` +
          `generated a replacement. Add the record below ALONGSIDE the existing one.`,
        detail: `${selector}._domainkey.${tenant.sendingDomain}\n\n${keypair.dnsValue}`,
        next:
          "Their mail keeps signing with the current key until the new record resolves, so there is " +
          "no window where anything fails. Do not remove the old record yet — we will tell you when.",
      });
      return;
    }

    case "promote": {
      // The only place the active signing key changes, and only ever after the
      // new record has been seen to resolve.
      const retireAt = previousRetireAt(now);
      await db
        .update(subTenants)
        .set({
          dkimSelector: tenant.nextDkimSelector!,
          dkimPublicKey: tenant.nextDkimPublicKey!,
          dkimPrivateKey: tenant.nextDkimPrivateKey!,
          nextDkimSelector: null,
          nextDkimPublicKey: null,
          nextDkimPrivateKey: null,
          dkimRotationStartedAt: null,
          dkimRotatedAt: now,
          previousDkimSelector: tenant.dkimSelector,
          previousDkimRetireAt: retireAt,
          updatedAt: now,
        })
        .where(eq(subTenants.id, tenant.id));
      await audit(tenant, "dkim_rotation_completed", {
        from_selector: tenant.dkimSelector,
        to_selector: tenant.nextDkimSelector,
        old_record_removable_after: retireAt.toISOString(),
      });
      await sendTenantAlert({
        workspaceId: tenant.workspaceId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        headline: `${tenant.name} is now signing with its new key`,
        reason: `The new record for ${tenant.sendingDomain} resolved, so we have switched over. No mail was interrupted.`,
        detail: `You can delete the old record after ${retireAt.toDateString()}:\n${tenant.dkimSelector}._domainkey.${tenant.sendingDomain}`,
        next:
          `Leave the old record in place until then. Mail we already sent can still be checked against ` +
          `it for up to ${DKIM_PREVIOUS_RETIRE_DAYS} days, and removing it early makes those look unsigned.`,
      });
      return;
    }
  }
}

async function audit(
  tenant: SubTenant,
  event: "dkim_rotation_started" | "dkim_rotation_completed",
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditEntries).values({
    id: newId("audit"),
    workspaceId: tenant.workspaceId,
    subTenantId: tenant.id,
    messageId: null,
    event,
    actor: "system",
    actorId: null,
    metadata: { sending_domain: tenant.sendingDomain, ...metadata },
  });
}
