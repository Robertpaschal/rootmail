import { and, eq, ne } from "drizzle-orm";
import {
  clearThrottle,
  computeDeliverability,
  enqueueWebhookEvent,
  evaluateReputation,
  newId,
  REPUTATION_THROTTLE_PER_HOUR,
  REPUTATION_WINDOW_DAYS,
} from "@rootmail/core";
import {
  auditEntries,
  db,
  organizations,
  reputationSnapshotInput,
  sampleFromOutcomes,
  type Workspace,
  workspaces,
} from "@rootmail/db";
import { sendTenantAlert } from "./tenant-alerts";

// Reputation enforcement for ordinary senders.
//
// The loop shipped for sub-tenants only, and `reputationGate` returned "ok"
// immediately when a message had no sub-tenant. Since sub-tenancy is a PAID
// feature, that meant the control we describe publicly protected only customers
// on the multi-tenant tier — while an ordinary account mailing a purchased list
// was measured by nothing at all. This closes that, reusing the same pure state
// machine, the same thresholds and the same window, so there is exactly one set
// of rules to explain and to defend.
//
// Scored per WORKSPACE rather than per organization because that is the unit
// `outcomeCounts` already counts by, and because a sandbox workspace must never
// drag a live one down.

const STATE_EVENT = {
  warn: "tenant_warned",
  throttled: "tenant_throttled",
  paused: "tenant_paused",
  ok: "tenant_resumed",
} as const;

/** Score one workspace and apply what the numbers say. True if it moved. */
export async function evaluateWorkspace(ws: Workspace): Promise<boolean> {
  const snapshot = await reputationSnapshotInput({
    workspaceId: ws.id,
    // No sub-tenant: this is the workspace's OWN sending, and the query already
    // aggregates every message in it.
    subTenantId: null,
    windowDays: REPUTATION_WINDOW_DAYS,
    since: ws.reputationResumedAt,
    realSendsOnly: true,
  });

  const scored = computeDeliverability(snapshot);
  const sample = sampleFromOutcomes(snapshot.counts);
  const decision = evaluateReputation(sample, ws.reputationState);
  const now = new Date();
  const metrics = {
    bounce_rate: sample.bounceRate,
    complaint_rate: sample.complaintRate,
    verdicts: sample.verdicts,
    window_days: REPUTATION_WINDOW_DAYS,
  };

  if (!decision.changed) {
    await db
      .update(workspaces)
      .set({ reputationScore: scored.score, reputationCheckedAt: now, reputationMetrics: metrics })
      .where(eq(workspaces.id, ws.id));
    return false;
  }

  const to = decision.state;
  await db
    .update(workspaces)
    .set({
      reputationState: to,
      reputationReason: decision.reason,
      reputationScore: scored.score,
      reputationCheckedAt: now,
      reputationChangedAt: now,
      reputationMetrics: {
        ...metrics,
        ...(decision.crossed
          ? { metric: decision.crossed.metric, threshold: decision.crossed.threshold }
          : {}),
      },
      updatedAt: now,
    })
    .where(eq(workspaces.id, ws.id));

  if (ws.reputationState === "throttled" && to !== "throttled") {
    await clearThrottle(ws.id).catch(() => {});
  }

  await db.insert(auditEntries).values({
    id: newId("audit"),
    workspaceId: ws.id,
    subTenantId: null,
    messageId: null,
    event: STATE_EVENT[to],
    actor: "system",
    actorId: null,
    metadata: {
      scope: "workspace",
      from_state: ws.reputationState,
      to_state: to,
      reason: decision.reason,
      score: scored.score,
      ...metrics,
    },
  });

  void enqueueWebhookEvent({
    workspaceId: ws.id,
    subTenantId: null,
    event: `tenant.${to === "ok" ? "resumed" : to === "warn" ? "warned" : to}` as never,
    data: {
      scope: "workspace",
      workspace_id: ws.id,
      state: to,
      previous_state: ws.reputationState,
      reason: decision.reason,
      occurred_at: now.toISOString(),
    },
  });

  const headline =
    to === "paused"
      ? "Your sending has been paused"
      : to === "throttled"
        ? "Your sending is being throttled"
        : to === "warn"
          ? "Your sending reputation needs attention"
          : "Your sending is back to normal";

  await sendTenantAlert({
    workspaceId: ws.id,
    tenantId: ws.id,
    tenantName: ws.name,
    headline,
    reason: decision.reason,
    next:
      to === "paused"
        ? "New sends are being rejected. Clean the list that caused this, then contact us to resume — a pause is not self-clearing."
        : to === "throttled"
          ? `Sends are limited to ${REPUTATION_THROTTLE_PER_HOUR} an hour until the numbers recover. Nothing is being dropped.`
          : to === "warn"
            ? "Nothing is restricted yet. This is the point at which it's still cheap to fix."
            : "No restrictions are in place.",
  }).catch((err) => console.warn(`[reputation] notify failed for ${ws.id}: ${String(err)}`));

  console.log(`[reputation] workspace ${ws.slug} ${ws.reputationState} → ${to}: ${decision.reason}`);
  return true;
}

/**
 * Sweep every live workspace.
 *
 * Sandbox workspaces are skipped — they never reach a real provider, so there is
 * nothing to judge. Internal (our own) orgs are skipped for the same reason the
 * tenant sweep skips them: we are not going to pause ourselves out of the
 * ability to tell a customer their sending is paused.
 */
export async function processWorkspaceReputationSweep(): Promise<void> {
  const rows = await db
    .select({ ws: workspaces })
    .from(workspaces)
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(and(eq(workspaces.environment, "live"), ne(organizations.isInternal, true)));

  let moved = 0;
  for (const { ws } of rows) {
    try {
      if (await evaluateWorkspace(ws)) moved++;
    } catch (err) {
      console.warn(`[reputation] workspace evaluation failed for ${ws.id}: ${String(err)}`);
    }
  }
  if (rows.length) {
    console.log(`[reputation] swept ${rows.length} workspace(s), ${moved} state change(s)`);
  }
}
