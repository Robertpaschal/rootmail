/**
 * WHAT CHANGED, AND WHAT WE DID ABOUT IT.
 *
 * rootmail throttles senders, pauses them, re-checks every client's DNS hourly
 * with a six-hour grace, rotates signing keys and sweeps reputation on a
 * schedule — and until this file existed, none of it appeared anywhere an
 * operator would look. The overview was seven rows of read-outs: a grade, a
 * funnel, two meters, four shortcuts, a table. The product acted and then
 * declined to mention it.
 *
 * `docs/design/00-PHILOSOPHY.md` §8 sets the target: by day 30 the default view
 * is not a grid of metrics, it is a short reverse-chronological list of things
 * the system noticed and acted on, each with the quantity that triggered it and
 * a door to the fix. §4 sets the voice: **name the actor**. "rootmail paused
 * this client", never "this client was paused".
 *
 * Three rules this file follows and the next person must keep:
 *
 *   1. Every number carries a WINDOW and a METHOD. `Metric` enforces that in
 *      its types; `ChangeMetric` mirrors the shape so a change cannot be built
 *      with a naked figure either.
 *   2. Nothing is invented. Where the API cannot answer a question the
 *      philosophy says the day-30 product should answer, the change is emitted
 *      as an honest GAP — a dotted entry naming what it would need — rather
 *      than a plausible number. §5.5.
 *   3. It fails quiet, per source. A workspace whose sub-tenant listing 402s
 *      (sub-tenancy is a Scale capability) still gets its quota and
 *      deliverability entries.
 *
 * Server-only: `api` reads the session cookie.
 */
import {
  DNS_DRIFT_GRACE_HOURS,
  REPUTATION_MIN_VERDICTS,
  REPUTATION_THROTTLE_PER_HOUR,
  REPUTATION_WINDOW_DAYS,
  formatRate,
  readDrift,
} from "./reputation";
import { api } from "./rootmail";
import type { Deliverability, Message, ReputationEvent, SubTenant } from "./types";

export type ChangeTone = "acted" | "stopped" | "witnessed" | "unknown";

/** A number, with the window it covers and the method that produced it. */
export interface ChangeMetric {
  value: string;
  label: string;
  window: string;
  method: string;
  threshold?: string;
}

export interface Change {
  id: string;
  /** When it happened. Null means it is a standing condition, not an event. */
  at: string | null;
  /** Who did it. Named, in the first person plural where it was us. */
  actor: string;
  /** Past tense, actor first. The whole entry in one line. */
  headline: string;
  /** What it means for their mail right now, and what happens next. */
  detail: string;
  tone: ChangeTone;
  metric?: ChangeMetric;
  /** The door to the fix. A change nobody can act on is a notification. */
  action?: { href: string; label: string };
  /**
   * Set when we cannot back this entry with data we hold. Renders dotted, and
   * the string names exactly what it would take to make it solid.
   */
  gap?: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const pct = (n: number) => `${Math.round(n)}%`;

/** `tenant_paused` → what rootmail did, in the operator's words. */
const REPUTATION_VERB: Record<string, { verb: string; tone: ChangeTone }> = {
  tenant_warned: { verb: "flagged", tone: "acted" },
  tenant_throttled: { verb: "throttled", tone: "acted" },
  tenant_paused: { verb: "paused sending for", tone: "stopped" },
  tenant_resumed: { verb: "lifted the restrictions on", tone: "witnessed" },
};

const CONSEQUENCE: Record<string, string> = {
  tenant_warned: `Nothing is restricted yet. This is the point where it is still cheap to fix — the numbers are judged over a rolling ${REPUTATION_WINDOW_DAYS} days, so a cleaned list shows up in the score within the week.`,
  tenant_throttled: `Their mail is metered to ${REPUTATION_THROTTLE_PER_HOUR} messages an hour. Nothing is dropped — it waits its turn — and every other client on the shared trunk keeps flowing at full rate.`,
  tenant_paused: "We are rejecting their sends until someone resumes them. This is the state that protects the other clients on the shared pool from a provider-level suspension.",
  tenant_resumed: "They are sending normally again. The next sweep re-reads their numbers from the resume forward, so the window that caused the stop is no longer being judged.",
};

/** A reputation transition out of the append-only trail, as a change. */
function fromReputationEvent(st: SubTenant, e: ReputationEvent): Change | null {
  const meta = REPUTATION_VERB[e.event];
  if (!meta) return null;
  // A resume performed by a person is THEIR action, not ours. Saying "rootmail
  // lifted the restrictions" about a button the operator pressed themselves is
  // the same class of error as the passive voice we are trying to kill.
  const byUs = e.actor === "system" || e.actor === "worker" || !e.actor;
  const actor = byUs ? "rootmail" : e.actor;

  const metric: ChangeMetric | undefined =
    typeof e.rate === "number" && e.metric
      ? {
          value: formatRate(e.rate),
          label: e.metric === "bounce" ? "bounce rate" : "complaint rate",
          window: `${e.window_days ?? REPUTATION_WINDOW_DAYS}d`,
          method: "provider feedback",
          threshold:
            typeof e.threshold === "number" ? `limit ${formatRate(e.threshold)}` : undefined,
        }
      : undefined;

  return {
    id: `rep-${st.id}-${e.occurred_at}-${e.event}`,
    at: e.occurred_at,
    actor,
    headline: `${actor} ${meta.verb} ${st.name}`,
    detail: e.reason ?? CONSEQUENCE[e.event] ?? "",
    tone: meta.tone,
    metric,
    action: { href: `/sub-tenants/${st.id}`, label: st.sending_domain },
  };
}

/** Standing conditions on a client domain: DNS drift, a key rotation in flight. */
function fromSubTenantState(st: SubTenant): Change[] {
  const out: Change[] = [];

  const drift = readDrift(st);
  if (drift) {
    out.push({
      id: `drift-${st.id}`,
      at: st.dns.failing_since,
      actor: "rootmail",
      headline: `rootmail found ${st.sending_domain}'s DNS records missing`,
      detail: `${drift.effect}${drift.detail ? ` The check reports: ${drift.detail}` : ""}`,
      tone: drift.stopped ? "stopped" : "acted",
      metric: {
        value: drift.stopped
          ? "grace spent"
          : `${drift.hoursLeft ?? 0}h left`,
        label: "grace remaining",
        window: `${DNS_DRIFT_GRACE_HOURS}h grace`,
        method: "hourly DNS re-check",
      },
      action: { href: `/sub-tenants/${st.id}`, label: "Fix the record" },
    });
  }

  if (st.dkim?.rotating) {
    out.push({
      id: `dkim-${st.id}`,
      at: st.dkim.rotation_started_at,
      actor: "rootmail",
      headline: `rootmail is rotating ${st.sending_domain}'s signing key`,
      detail:
        `A new selector (${st.dkim.pending_selector ?? "pending"}) is waiting to be published. ` +
        "Nothing switches over until DNS agrees, and the current key keeps signing every message until it does — so this state is safe to sit in.",
      tone: "acted",
      action: { href: `/sub-tenants/${st.id}`, label: "Publish the record" },
    });
  }

  return out;
}

/** What the deliverability scorer found, as things we noticed rather than a grade. */
function fromDeliverability(d: Deliverability): Change[] {
  const windowLabel = `${d.window_days}d`;
  return d.factors
    .filter((f) => f.severity !== "info")
    .map((f) => ({
      id: `factor-${f.id}`,
      at: null,
      actor: "rootmail",
      headline: `rootmail scored your sending: ${f.label.toLowerCase()}`,
      detail: f.detail,
      tone: (f.severity === "critical" ? "stopped" : "acted") as ChangeTone,
      metric: {
        value: d.score != null ? `${d.score}/100` : "—",
        label: "sender score",
        window: windowLabel,
        method: "bounce + complaint + suppression mix",
        threshold: d.confidence === "high" ? undefined : `confidence: ${d.confidence}`,
      },
      action: { href: "/deliverability", label: "Deliverability" },
    }));
}

/**
 * Sending against the block, and the date it runs out at the current rate.
 *
 * The projection is honest arithmetic on numbers we hold: the period is a
 * calendar month (`YYYY-MM`, UTC — `apps/api/src/lib/billing.ts`), so days
 * elapsed is the UTC day of month, and the rate is what has actually been sent
 * divided by that. It is named as a projection, never as a fact.
 */
function fromQuota(usage: {
  period: string;
  used: number;
  quota: number;
  over_limit: boolean;
}): Change | null {
  if (usage.quota <= 0) return null;
  const share = usage.used / usage.quota;

  if (usage.over_limit) {
    return {
      id: "quota-over",
      at: null,
      actor: "rootmail",
      headline: "rootmail is billing your sends as overage",
      detail:
        "You are past the block included in your plan. Sending has not stopped and will not — the excess is metered and appears on this month's bill. Adding a block costs less per message than the overage rate.",
      tone: "acted",
      metric: {
        value: `${usage.used.toLocaleString()} / ${usage.quota.toLocaleString()}`,
        label: "transactional sends",
        window: `period ${usage.period}`,
        method: "metered at send",
      },
      action: { href: "/billing", label: "Plan & usage" },
    };
  }

  if (share < 0.8) return null;

  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const perDay = usage.used / Math.max(dayOfMonth, 1);
  const daysToQuota = perDay > 0 ? (usage.quota - usage.used) / perDay : Infinity;
  const hitsOn =
    Number.isFinite(daysToQuota) && dayOfMonth + daysToQuota <= daysInMonth
      ? new Date(Date.now() + daysToQuota * DAY).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : null;

  return {
    id: "quota-near",
    at: null,
    actor: "rootmail",
    headline: `rootmail counts you at ${pct(share * 100)} of this month's transactional block`,
    detail: hitsOn
      ? `At the rate you have sent so far this month, the block runs out around ${hitsOn}. Sending does not stop when it does — the excess is metered as overage.`
      : "At the rate you have sent so far this month, the block lasts the rest of the period. Sending does not stop if it doesn't — the excess is metered as overage.",
    tone: "acted",
    metric: {
      value: `${usage.used.toLocaleString()} / ${usage.quota.toLocaleString()}`,
      label: "transactional sends",
      window: `period ${usage.period}`,
      method: "metered at send · projection from days elapsed",
    },
    action: { href: "/billing", label: "Plan & usage" },
  };
}

/** Mail that stopped in the last day, counted off the messages we hold. */
function fromRecentStops(messages: Message[]): Change | null {
  const cutoff = Date.now() - DAY;
  const stopped = messages.filter(
    (m) =>
      ["bounced", "complained", "failed"].includes(m.status) &&
      new Date(m.updated_at ?? m.created_at).getTime() >= cutoff,
  );
  if (stopped.length === 0) return null;

  const newest = stopped.reduce((a, b) =>
    (a.updated_at ?? a.created_at) > (b.updated_at ?? b.created_at) ? a : b,
  );
  const complaints = stopped.filter((m) => m.status === "complained").length;

  return {
    id: "stops-24h",
    at: newest.updated_at ?? newest.created_at,
    actor: "your provider",
    headline: `${stopped.length} message${stopped.length === 1 ? "" : "s"} stopped in the last day`,
    detail:
      complaints > 0
        ? `${complaints} of them were reported as spam by the recipient. Every one is on the suppression list now, so nothing will be sent to those addresses again.`
        : "Every bounced address is on the suppression list now, so nothing will be sent to it again. Each message keeps the provider's own reason.",
    tone: "stopped",
    metric: {
      value: String(stopped.length),
      label: "stopped",
      window: "24h",
      method: "provider feedback",
    },
    action: { href: "/messages?status=bounced", label: "See what stopped" },
  };
}

/**
 * The gaps. §8 names five things the day-30 product should be saying unprompted;
 * two of them we cannot say yet, and drawing our own edge is cheaper than
 * pretending we have none.
 */
function gaps(d: Deliverability | null): Change[] {
  const out: Change[] = [];
  if (d && d.suppressions.total > 0) {
    out.push({
      id: "gap-suppression-rate",
      at: null,
      actor: "rootmail",
      headline: "rootmail cannot yet tell you how fast your suppression list is growing",
      detail:
        "A suppression list that jumps is what a dirty import looks like from the outside, and it is the earliest warning there is. We hold the total and every entry's reason, but not a daily series to compare it against — so there is no honest way to say \"unusually fast\" on this screen yet.",
      tone: "unknown",
      gap: `Needs a daily suppression count retained per workspace. Today: ${d.suppressions.total.toLocaleString()} entries, total, no series.`,
      metric: {
        value: d.suppressions.total.toLocaleString(),
        label: "suppressed addresses",
        window: "all time",
        method: "bounces, complaints, unsubscribes, imports",
      },
      action: { href: "/deliverability", label: "Suppression list" },
    });
  }
  return out;
}

export interface ChangesResult {
  changes: Change[];
  /** True when we could not reach the API at all — different from "nothing happened". */
  unreachable: boolean;
  /** Sub-tenancy is plan-gated; say so rather than silently omitting client entries. */
  clientsAvailable: boolean;
}

/**
 * Assemble the feed. Every source is settled independently: a workspace whose
 * sub-tenant listing is refused by the plan gate must still get its quota and
 * deliverability entries.
 */
export async function loadChanges(limit = 12): Promise<ChangesResult> {
  const [subsR, delR, billR, msgR] = await Promise.allSettled([
    api.listSubTenants(),
    api.getDeliverability({ window_days: 30 }),
    api.getBilling(),
    api.listMessages({ limit: 100 }),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);

  const subs = ok(subsR)?.data ?? [];
  const deliver = ok(delR);
  const billing = ok(billR);
  const messages = ok(msgR)?.data ?? [];

  if (!deliver && !billing && subsR.status === "rejected" && msgR.status === "rejected") {
    return { changes: [], unreachable: true, clientsAvailable: false };
  }

  const changes: Change[] = [];

  // Reputation history, for the clients that have any. Bounded: the trail lives
  // behind a per-tenant route, and a workspace with two hundred clients must not
  // turn one page render into two hundred round trips.
  const recentlyMoved = subs
    .filter((s) => s.reputation.changed_at || s.reputation.state !== "ok")
    .sort((a, b) => (b.reputation.changed_at ?? "").localeCompare(a.reputation.changed_at ?? ""))
    .slice(0, 8);

  const histories = await Promise.allSettled(
    recentlyMoved.map((s) => api.getSubTenantReputation(s.id)),
  );
  histories.forEach((h, i) => {
    if (h.status !== "fulfilled") return;
    const st = recentlyMoved[i];
    for (const e of h.value.history.slice(0, 6)) {
      const c = fromReputationEvent(st, e);
      if (c) changes.push(c);
    }
  });

  for (const st of subs) changes.push(...fromSubTenantState(st));
  if (deliver) changes.push(...fromDeliverability(deliver));
  if (billing) {
    const q = fromQuota(billing.usage);
    if (q) changes.push(q);
  }
  const stops = fromRecentStops(messages);
  if (stops) changes.push(stops);
  changes.push(...gaps(deliver));

  // Reverse-chronological, with standing conditions (no timestamp) first —
  // something still true outranks something that finished on Tuesday.
  changes.sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return -1;
    if (!b.at) return 1;
    return b.at.localeCompare(a.at);
  });

  return {
    changes: changes.slice(0, limit),
    unreachable: false,
    clientsAvailable: subsR.status === "fulfilled",
  };
}

/**
 * What the feed says when it has nothing to say — which is the good outcome, and
 * must not read like a broken page. It states the floor enforcement works from,
 * because "nothing happened" and "nothing could have happened yet" are different
 * facts and an operator is entitled to know which one they are looking at.
 */
export function quietSentence(sending: boolean): string {
  return sending
    ? `Nothing crossed a line. We re-check every client's DNS hourly and score bounce and complaint rates over a rolling ${REPUTATION_WINDOW_DAYS} days, and neither has moved anything today.`
    : `Nothing to report yet. Enforcement needs ${REPUTATION_MIN_VERDICTS} judged sends before it will act on a client at all — below that, a single bounce would read as a catastrophe.`;
}
