import { and, asc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import {
  buildDnsRecords,
  decideDnsDrift,
  type DnsCheck,
  DNS_DRIFT_GRACE_HOURS,
  DNS_RECHECK_INTERVAL_MINUTES,
  enqueueWebhookEvent,
  isVerified,
  newId,
  verifyDnsRecords,
} from "@rootmail/core";
import { auditEntries, db, type SubTenant, subTenants } from "@rootmail/db";
import { applyDkimRotation } from "./dkim-rotation";
import { sendTenantAlert } from "./tenant-alerts";

// DNS drift.
//
// Verification was one-shot. A tenant who verified in March and deleted the DKIM
// record in April kept a "verified" badge on a domain whose mail now fails
// authentication at every receiver — and because all tenants share one SES
// account and one IP pool, that lands on everyone's reputation, not just theirs.
//
// The shape mirrors the reputation loop deliberately: a grace period instead of a
// hair trigger, one notification per transition rather than per check, and a
// human-readable reason stored next to the flag so the dashboard never has to
// re-derive why.

/** How many tenants to re-check per sweep. Bounds the DNS fan-out per run. */
const BATCH = 200;

/**
 * Which record is missing, said the way the operator's DNS host says it.
 *
 * "Verification failed" is useless to someone who has to go and fix it. The host
 * and the expected value are what they paste into a DNS panel.
 */
function describeDrift(checks: DnsCheck[]): string {
  const broken = checks.filter((c) => c.required && !c.ok);
  if (!broken.length) return "";
  return broken
    .map((c) => {
      const what =
        c.purpose === "dkim"
          ? "DKIM signing record"
          : c.purpose === "ownership"
            ? "ownership record"
            : `${c.purpose.toUpperCase()} record`;
      // `found: []` means nothing resolved at all — deleted, or the whole zone is
      // gone. Anything else means a record exists but no longer matches, which is
      // usually someone overwriting it with a different provider's value.
      return c.found.length
        ? `The ${what} at ${c.host} no longer matches. Expected: ${c.expected}`
        : `The ${what} at ${c.host} is missing. Expected: ${c.expected}`;
    })
    .join("\n\n");
}

async function auditDrift(
  tenant: SubTenant,
  event: "tenant_dns_drifted" | "tenant_dns_suspended" | "tenant_dns_recovered",
  detail: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(auditEntries).values({
    id: newId("audit"),
    workspaceId: tenant.workspaceId,
    subTenantId: tenant.id,
    // Tenant-level, so no message. Every message-trail query filters on this
    // column — see TENANT_AUDIT_EVENTS.
    messageId: null,
    event,
    actor: "system",
    actorId: null,
    metadata: { sending_domain: tenant.sendingDomain, detail, ...extra },
  });
}

/**
 * Re-check one tenant's DNS and act on what changed. Returns true if it moved.
 *
 * Order is decide → persist → notify, the same as the reputation sweep: a
 * notification for a transition we failed to write would send an operator
 * looking for a state their dashboard does not show.
 */
export async function checkTenantDns(tenant: SubTenant): Promise<boolean> {
  const checks = await verifyDnsRecords(
    buildDnsRecords({
      domain: tenant.sendingDomain,
      verificationToken: tenant.verificationToken,
      dkimSelector: tenant.dkimSelector,
      dkimValue: tenant.dkimPublicKey,
      // Included so ONE lookup pass answers both questions: is the domain still
      // healthy, and has the incoming key's record appeared yet. It is emitted
      // `required: false`, so a rotation nobody has published can never make the
      // domain read as failing — see BuildDnsInput.
      pendingDkimSelector: tenant.nextDkimSelector,
      pendingDkimValue: tenant.nextDkimPublicKey,
      sesDkimTokens: tenant.sesDkimTokens,
    }),
  );

  // Rotation runs off the same lookup, before the drift verdict: promoting a key
  // is not a drift transition and must not be mistaken for one.
  await applyDkimRotation(tenant, checks);
  const ok = isVerified(checks);
  const now = new Date();
  const detail = describeDrift(checks);

  // The rules live in core and are unit-tested there; this function only applies
  // whatever they decide. Keeping the two apart is what makes "we give them six
  // hours before stopping their mail" a claim someone can check.
  const decision = decideDnsDrift({
    ok,
    failingSince: tenant.dnsFailingSince,
    status: tenant.status,
    reputationPaused: tenant.reputationState === "paused",
    now,
    graceHours: DNS_DRIFT_GRACE_HOURS,
  });

  switch (decision.action) {
    case "none":
      await db.update(subTenants).set({ lastCheckedAt: now }).where(eq(subTenants.id, tenant.id));
      return false;

    case "grace":
      // Keep the detail current — the failing record can change while they are
      // half-way through fixing it — but do NOT notify again. Twenty-four emails
      // about one broken record is how an alert becomes noise.
      await db
        .update(subTenants)
        .set({ dnsDriftDetail: detail, lastCheckedAt: now })
        .where(eq(subTenants.id, tenant.id));
      return false;

    case "recovered": {
      await db
        .update(subTenants)
        .set({
          dnsFailingSince: null,
          dnsDriftDetail: null,
          lastCheckedAt: now,
          ...(decision.restoreSending ? { status: "verified" as const, verifiedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(subTenants.id, tenant.id));

      await auditDrift(tenant, "tenant_dns_recovered", "All required records resolve again.", {
        sending_resumed: decision.restoreSending,
        failing_since: tenant.dnsFailingSince?.toISOString() ?? null,
      });
      void enqueueWebhookEvent({
        workspaceId: tenant.workspaceId,
        subTenantId: tenant.id,
        event: "tenant.dns_recovered",
        data: {
          sub_tenant_id: tenant.id,
          sending_domain: tenant.sendingDomain,
          sending_resumed: decision.restoreSending,
          occurred_at: now.toISOString(),
        },
      });
      await sendTenantAlert({
        workspaceId: tenant.workspaceId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        headline: `${tenant.name}'s DNS is back`,
        reason: `Every required record for ${tenant.sendingDomain} resolves again.`,
        next: decision.restoreSending
          ? "Their sending has been switched back on. Nothing else is needed."
          : tenant.reputationState === "paused"
            ? "Their sending is still paused for reputation, which is separate from DNS — resume them from the dashboard when you're ready."
            : "Nothing was interrupted.",
      });
      return true;
    }

    case "drifted": {
      await db
        .update(subTenants)
        .set({ dnsFailingSince: now, dnsDriftDetail: detail, lastCheckedAt: now, updatedAt: now })
        .where(eq(subTenants.id, tenant.id));

      await auditDrift(tenant, "tenant_dns_drifted", detail, { grace_hours: DNS_DRIFT_GRACE_HOURS });
      void enqueueWebhookEvent({
        workspaceId: tenant.workspaceId,
        subTenantId: tenant.id,
        event: "tenant.dns_drifted",
        data: {
          sub_tenant_id: tenant.id,
          sending_domain: tenant.sendingDomain,
          detail,
          grace_hours: DNS_DRIFT_GRACE_HOURS,
          occurred_at: now.toISOString(),
        },
      });
      await sendTenantAlert({
        workspaceId: tenant.workspaceId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        headline: `${tenant.name}'s DNS records stopped resolving`,
        reason:
          `We re-check every verified domain hourly, and ${tenant.sendingDomain} no longer passes. ` +
          `Their mail is still going out, but it is failing authentication at the receiving end, ` +
          `which sends it to spam.`,
        detail,
        next:
          `Put the record back and it clears by itself within the hour. If it is still missing in ` +
          `${DNS_DRIFT_GRACE_HOURS} hours we will stop their sending, because unauthenticated mail ` +
          `costs the reputation of every client on the account.`,
      });
      return true;
    }

    case "suspend": {
      await db
        .update(subTenants)
        .set({ status: "failed", dnsDriftDetail: detail, lastCheckedAt: now, updatedAt: now })
        .where(eq(subTenants.id, tenant.id));

      await auditDrift(tenant, "tenant_dns_suspended", detail, {
        failing_since: tenant.dnsFailingSince?.toISOString() ?? null,
        grace_hours: DNS_DRIFT_GRACE_HOURS,
      });
      void enqueueWebhookEvent({
        workspaceId: tenant.workspaceId,
        subTenantId: tenant.id,
        event: "tenant.dns_suspended",
        data: {
          sub_tenant_id: tenant.id,
          sending_domain: tenant.sendingDomain,
          detail,
          failing_since: tenant.dnsFailingSince?.toISOString() ?? null,
          occurred_at: now.toISOString(),
        },
      });
      await sendTenantAlert({
        workspaceId: tenant.workspaceId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        headline: `${tenant.name}'s sending has been stopped`,
        reason:
          `${tenant.sendingDomain} has failed DNS verification continuously for ` +
          `${DNS_DRIFT_GRACE_HOURS} hours, so we have stopped accepting sends for this client.`,
        detail,
        next:
          "Restore the record and their sending switches back on automatically at the next check — " +
          "you do not need to do anything here.",
      });
      return true;
    }
  }
}

/**
 * Re-verify the domains that are due a check.
 *
 * Only tenants that HAVE verified at some point (`verified_at` is set). A tenant
 * still working through their first setup is not drifting — they have never been
 * right yet — and auto-verifying them here would quietly take over a flow the
 * operator drives from the dashboard.
 */
export async function processDnsDriftSweep(): Promise<void> {
  const due = new Date(Date.now() - DNS_RECHECK_INTERVAL_MINUTES * 60_000);

  const tenants = await db
    .select()
    .from(subTenants)
    .where(
      and(
        isNotNull(subTenants.verifiedAt),
        // "verified" catches drift; "failed" is how a drift-suspended tenant gets
        // re-checked so it can recover on its own.
        or(eq(subTenants.status, "verified"), eq(subTenants.status, "failed")),
        or(sql`${subTenants.lastCheckedAt} is null`, lt(subTenants.lastCheckedAt, due)),
      ),
    )
    // Oldest check first, so a backlog drains fairly instead of starving the
    // tenants at the end of the table.
    .orderBy(asc(subTenants.lastCheckedAt))
    .limit(BATCH);

  let moved = 0;
  for (const tenant of tenants) {
    try {
      if (await checkTenantDns(tenant)) moved++;
    } catch (err) {
      // A thrown lookup must not stop the sweep for everyone behind it.
      console.warn(`[dns-drift] check failed for ${tenant.id}: ${String(err)}`);
    }
  }
  if (tenants.length) {
    console.log(`[dns-drift] re-checked ${tenants.length} domain(s), ${moved} change(s)`);
  }
}
