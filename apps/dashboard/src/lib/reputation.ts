/**
 * Presentation rules for per-tenant sending reputation.
 *
 * A plain module on purpose: BOTH the server pages and the client-side resume
 * control need these, and a server component may not import from a `"use client"`
 * module (tsc allows it, production crashes).
 *
 * The numbers themselves come from `@rootmail/core/reputation` rather than being
 * copied here. That file is the canon the worker enforces on — if the floor moves
 * from 20 to 50 and the dashboard still says "20", the screen is lying about the
 * gate. It is a dependency-free leaf, which is the only kind of core subpath the
 * dashboard is allowed to import (see next.config.mjs).
 */
import {
  REPUTATION_MIN_VERDICTS,
  REPUTATION_THRESHOLDS,
  REPUTATION_THROTTLE_PER_HOUR,
  REPUTATION_WINDOW_DAYS,
} from "@rootmail/core/reputation";
import { DNS_DRIFT_GRACE_HOURS } from "@rootmail/core/constants";
import type { ReputationState, SubTenant } from "./types";

export { DNS_DRIFT_GRACE_HOURS };

export {
  REPUTATION_MIN_VERDICTS,
  REPUTATION_THRESHOLDS,
  REPUTATION_THROTTLE_PER_HOUR,
  REPUTATION_WINDOW_DAYS,
};

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "destructive" | "muted";

export interface ReputationVisual {
  /** What the operator calls this state, not what the enum calls it. */
  label: string;
  badge: BadgeVariant;
  text: string;
  dot: string;
  /** One line: what is happening to this client's mail right now. */
  effect: string;
}

/**
 * Deliberately phrased as CONSEQUENCES ("sending is paused"), not as grades.
 * "Warn" tells an operator nothing; "no restriction yet — this is the cheap
 * moment to fix it" tells them whether to get out of their chair.
 */
export const REPUTATION_VISUAL: Record<ReputationState, ReputationVisual> = {
  ok: {
    label: "Sending normally",
    badge: "success",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    effect: "Bounces and complaints are within limits. Nothing is restricted.",
  },
  warn: {
    label: "Needs attention",
    badge: "warning",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    effect: "Nothing is restricted yet — this is the point where it is still cheap to fix.",
  },
  throttled: {
    label: "Throttled",
    badge: "warning",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    effect: `Sending is metered to ${REPUTATION_THROTTLE_PER_HOUR} messages an hour. Nothing is dropped — mail waits its turn.`,
  },
  paused: {
    label: "Paused",
    badge: "destructive",
    text: "text-red-600 dark:text-red-400",
    dot: "bg-red-500",
    effect: "Sending is rejected for this client until someone resumes them.",
  },
};

/** Anything the operator would want to know about before their customer tells them. */
export function needsAttention(state: ReputationState): boolean {
  return state !== "ok";
}

/** `0.0623` → `6.23%`. Two decimals, because the complaint limit is 0.5%. */
export function formatRate(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  const pct = n * 100;
  // Whole numbers read better without ".00", but 0.5% must never round to 1%.
  return `${pct >= 10 ? pct.toFixed(1) : pct.toFixed(2)}%`;
}

const num = (v: unknown): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);

/**
 * The metrics blob is `Record<string, unknown>` on the wire (it is a jsonb column
 * the sweep writes). Read it defensively — an older row written before a key
 * existed must render as "no reading", never as zero. A confident `0.00%` bounce
 * rate we never actually measured is the worst thing this panel could show.
 */
export interface ReputationReading {
  verdicts: number | null;
  bounceRate: number | null;
  complaintRate: number | null;
  windowDays: number;
  /** The metric that crossed a line, when the sweep recorded one. */
  metric: "bounce" | "complaint" | null;
  threshold: number | null;
  /** Has this client sent enough judged mail for enforcement to act at all? */
  judged: boolean;
  /** Has the sweep ever looked at this client? */
  swept: boolean;
  /**
   * The stored numbers PREDATE a resume, so they describe a window we have
   * deliberately stopped judging on.
   *
   * A resume clears the state but not the metrics — which left the panel showing
   * "Sending normally" directly above the 1.00% complaint rate that had just
   * paused the client, i.e. a screen contradicting itself in two adjacent
   * sentences. Those numbers are history the moment someone resumes; the next
   * sweep re-reads from the resume forward.
   */
  staleSinceResume: boolean;
}

export function readReputation(rep: SubTenant["reputation"]): ReputationReading {
  const m = rep.metrics ?? {};
  const verdicts = num(m.verdicts);
  const metric = m.metric === "bounce" || m.metric === "complaint" ? m.metric : null;
  const at = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
  const resumed = at(rep.resumed_at);
  const checked = at(rep.checked_at);
  return {
    staleSinceResume: resumed !== null && (checked === null || resumed >= checked),
    verdicts,
    bounceRate: num(m.bounce_rate),
    complaintRate: num(m.complaint_rate),
    windowDays: num(m.window_days) ?? REPUTATION_WINDOW_DAYS,
    metric,
    threshold: num(m.threshold),
    judged: (verdicts ?? 0) >= REPUTATION_MIN_VERDICTS,
    swept: Boolean(rep.checked_at),
  };
}

/**
 * What the reputation transitions in the audit trail are called in English.
 * `tenant_resumed` covers both the human resume and the sweep clearing a warn,
 * so the phrasing has to survive both readings.
 */
export const TENANT_EVENT_LABEL: Record<string, string> = {
  tenant_warned: "Flagged for attention",
  tenant_throttled: "Throttled",
  tenant_paused: "Paused",
  tenant_resumed: "Restrictions lifted",
};


// ---------------------------------------------------------------------------
// DNS drift
//
// A second, independent way a client can be in trouble: not their numbers, their
// records. It is deliberately NOT folded into the reputation state — an operator
// fixes drift in a DNS panel we cannot see, and telling them "reputation: paused"
// when the real answer is "your DKIM record is gone" sends them to the wrong page.
// ---------------------------------------------------------------------------

export interface DriftReading {
  /** Headline in the operator's language. */
  label: string;
  /** What is happening to this client's mail right now. */
  effect: string;
  /** The record to fix, straight from the check. */
  detail: string | null;
  /** Whole hours left before sending stops. Null once it already has. */
  hoursLeft: number | null;
  /** True once drift has actually stopped their sending. */
  stopped: boolean;
}

/** Null when the domain is healthy — the common case, and the one with no UI. */
export function readDrift(st: SubTenant): DriftReading | null {
  if (!st.dns?.drifting) return null;

  const stopped = st.status === "failed";
  const since = st.dns.failing_since ? new Date(st.dns.failing_since).getTime() : null;
  const elapsedH = since === null ? 0 : (Date.now() - since) / 3_600_000;
  // Floor, not round: "1 hour left" must never be shown to someone who has 70
  // minutes and will be cut off before the next whole hour ticks over.
  const hoursLeft = stopped ? null : Math.max(0, Math.floor(DNS_DRIFT_GRACE_HOURS - elapsedH));

  return {
    label: stopped ? "Sending stopped — DNS" : "DNS records missing",
    effect: stopped
      ? "Their records have been unreachable long enough that we stopped accepting sends. Restoring the record switches them back on automatically."
      : hoursLeft === 0
        ? "Their mail is still going out but failing authentication. Sending stops within the hour if the record does not come back."
        : `Their mail is still going out but failing authentication, so it lands in spam. Sending stops in about ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"} if the record does not come back.`,
    detail: st.dns.detail,
    hoursLeft,
    stopped,
  };
}
