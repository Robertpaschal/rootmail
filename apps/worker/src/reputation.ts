import { and, eq } from "drizzle-orm";
import {
  clearThrottle,
  computeDeliverability,
  enqueueWebhookEvent,
  env,
  evaluateReputation,
  newId,
  REPUTATION_THROTTLE_PER_HOUR,
  REPUTATION_WINDOW_DAYS,
  type ReputationDecision,
  type ReputationState,
  sendSystemEmail,
} from "@rootmail/core";
import { dashUrl, esc, ownerForWorkspace } from "./tenant-alerts";
import {
  auditEntries,
  db,
  memberships,
  organizations,
  reputationSnapshotInput,
  sampleFromOutcomes,
  type SubTenant,
  subTenants,
  users,
  workspaces,
} from "@rootmail/db";

// The enforcement loop.
//
// Everything it needs already existed: a calibrated scorer, per-tenant attribution
// on every message, a `disabled` status in the enum, and a send-time guard. What
// did not exist was anything that connected them — the scorer was imported in
// exactly one place, a read-only GET route. A number nobody acts on is a report,
// not infrastructure. This is the loop that closes it.
//
// Order matters here: decide, persist, THEN notify. A notification for a
// transition we failed to write would send an operator looking for a state their
// dashboard doesn't show.

const STATE_EVENT = {
  warn: "tenant_warned",
  throttled: "tenant_throttled",
  paused: "tenant_paused",
  ok: "tenant_resumed",
} as const satisfies Record<ReputationState, string>;

const STATE_WEBHOOK = {
  warn: "tenant.warned",
  throttled: "tenant.throttled",
  paused: "tenant.paused",
  ok: "tenant.resumed",
} as const satisfies Record<ReputationState, string>;


/** The verified account owner for the org that owns this workspace. */
/**
 * Record a transition on the one append-only trail, with a null `message_id` —
 * this is about the tenant, not about any message it sent.
 */
async function auditTransition(
  tenant: SubTenant,
  to: ReputationState,
  decision: ReputationDecision,
  score: number | null,
  actor: { actor: string; actorId: string | null },
): Promise<void> {
  await db.insert(auditEntries).values({
    id: newId("audit"),
    workspaceId: tenant.workspaceId,
    subTenantId: tenant.id,
    messageId: null,
    event: STATE_EVENT[to],
    actor: actor.actor,
    actorId: actor.actorId,
    metadata: {
      from_state: tenant.reputationState,
      to_state: to,
      reason: decision.reason,
      score,
      window_days: REPUTATION_WINDOW_DAYS,
      ...(decision.crossed
        ? {
            metric: decision.crossed.metric,
            rate: decision.crossed.rate,
            threshold: decision.crossed.threshold,
          }
        : {}),
    },
  });
}

/**
 * Tell the parent workspace. They are the customer — the whole value of per-tenant
 * scoring is that it names WHICH of their customers is the problem, so the
 * notification leads with the client, the metric and the threshold, in that order.
 */
async function notifyParent(
  tenant: SubTenant,
  to: ReputationState,
  decision: ReputationDecision,
): Promise<void> {
  void enqueueWebhookEvent({
    workspaceId: tenant.workspaceId,
    subTenantId: tenant.id,
    event: STATE_WEBHOOK[to],
    data: {
      sub_tenant_id: tenant.id,
      sending_domain: tenant.sendingDomain,
      state: to,
      previous_state: tenant.reputationState,
      reason: decision.reason,
      metric: decision.crossed?.metric ?? null,
      rate: decision.crossed?.rate ?? null,
      threshold: decision.crossed?.threshold ?? null,
      occurred_at: new Date().toISOString(),
    },
  });

  const owner = await ownerForWorkspace(tenant.workspaceId);
  if (!owner) return;

  const link = `${dashUrl()}/sub-tenants/${tenant.id}`;
  const headline =
    to === "paused"
      ? `${tenant.name} has been paused`
      : to === "throttled"
        ? `${tenant.name} is being throttled`
        : to === "warn"
          ? `${tenant.name}'s reputation needs attention`
          : `${tenant.name} is back to normal`;

  const next =
    to === "paused"
      ? "Their sends are being rejected. Review the numbers, fix the list, then resume them from the dashboard."
      : to === "throttled"
        ? `Their sends are limited to ${REPUTATION_THROTTLE_PER_HOUR} an hour until the numbers recover. Nothing is being dropped.`
        : to === "warn"
          ? "Nothing is restricted yet. This is the point at which it's still cheap to fix."
          : "No restrictions are in place.";

  // Transactional, and genuinely so: this is account operations about someone
  // else's mail being stopped. It must never be silenceable by a marketing opt-out.
  await sendSystemEmail({
    to: owner.email,
    cls: "transactional",
    subject: headline,
    text: `${owner.name ? `Hi ${owner.name},` : "Hi,"}\n\n${headline}.\n\n${decision.reason}\n\n${next}\n\n${link}`,
    html:
      `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111;max-width:480px">` +
      `<p>${owner.name ? `Hi ${esc(owner.name)},` : "Hi,"}</p>` +
      `<p><strong>${esc(headline)}.</strong></p>` +
      `<p>${esc(decision.reason)}</p>` +
      `<p style="color:#444">${esc(next)}</p>` +
      `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Open ${esc(tenant.name)}</a></p>` +
      `</div>`,
  });
}

/** Score one tenant and apply whatever the numbers say. Returns true if it moved. */
export async function evaluateTenant(tenant: SubTenant): Promise<boolean> {
  const snapshot = await reputationSnapshotInput({
    workspaceId: tenant.workspaceId,
    subTenantId: tenant.id,
    windowDays: REPUTATION_WINDOW_DAYS,
    // Judge a resumed tenant on what it has done SINCE the resume.
    since: tenant.reputationResumedAt,
    realSendsOnly: true,
  });

  const scored = computeDeliverability(snapshot);
  const sample = sampleFromOutcomes(snapshot.counts);
  const decision = evaluateReputation(sample, tenant.reputationState);
  const now = new Date();

  if (!decision.changed) {
    // Still record that we looked — "when was this last checked" is the first
    // question anyone asks of an automated gate.
    await db
      .update(subTenants)
      .set({
        reputationScore: scored.score,
        reputationCheckedAt: now,
        reputationMetrics: {
          bounce_rate: sample.bounceRate,
          complaint_rate: sample.complaintRate,
          verdicts: sample.verdicts,
          window_days: REPUTATION_WINDOW_DAYS,
        },
      })
      .where(eq(subTenants.id, tenant.id));
    return false;
  }

  const to = decision.state;

  await db
    .update(subTenants)
    .set({
      reputationState: to,
      reputationReason: decision.reason,
      reputationScore: scored.score,
      reputationCheckedAt: now,
      reputationChangedAt: now,
      reputationMetrics: {
        bounce_rate: sample.bounceRate,
        complaint_rate: sample.complaintRate,
        verdicts: sample.verdicts,
        window_days: REPUTATION_WINDOW_DAYS,
        ...(decision.crossed
          ? { metric: decision.crossed.metric, threshold: decision.crossed.threshold }
          : {}),
      },
      // A pause is the only state that touches `status` — it is what the send
      // guard reads, and what makes "disabled" mean something at last.
      ...(to === "paused" ? { status: "disabled" as const } : {}),
      updatedAt: now,
    })
    .where(eq(subTenants.id, tenant.id));

  // Leaving `throttled` must drop the meter, or the tenant stays metered by a
  // stale Redis counter until the hour rolls over.
  if (tenant.reputationState === "throttled" && to !== "throttled") {
    await clearThrottle(tenant.id).catch(() => {});
  }

  await auditTransition(tenant, to, decision, scored.score, { actor: "system", actorId: null });
  await notifyParent(tenant, to, decision).catch((err) =>
    console.warn(`[reputation] notify failed for ${tenant.id}: ${String(err)}`),
  );

  console.log(
    `[reputation] ${tenant.sendingDomain} ${tenant.reputationState} → ${to}: ${decision.reason}`,
  );
  return true;
}

/**
 * The sweep. Every sending tenant, every fifteen minutes.
 *
 * Tenants are evaluated independently and a failure on one is swallowed so it
 * cannot stop the rest — a sweep that dies halfway leaves the tenants after it
 * unenforced, which is the failure mode this whole feature exists to prevent.
 */
export async function processReputationSweep(): Promise<void> {
  // Only tenants that can currently send. A tenant that never verified has never
  // sent anything to judge, and a paused one carries status "disabled" — it is
  // held by a human decision now, not by its numbers, and `evaluateReputation`
  // would refuse to move it anyway.
  const tenants = await db.select().from(subTenants).where(eq(subTenants.status, "verified"));

  let moved = 0;
  for (const tenant of tenants) {
    try {
      if (await evaluateTenant(tenant)) moved++;
    } catch (err) {
      console.warn(`[reputation] evaluation failed for ${tenant.id}: ${String(err)}`);
    }
  }
  if (tenants.length) {
    console.log(`[reputation] swept ${tenants.length} tenant(s), ${moved} state change(s)`);
  }
}
