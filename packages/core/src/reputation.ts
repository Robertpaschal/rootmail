import type { ReputationState } from "./constants";

// Per-tenant reputation ENFORCEMENT. `deliverability.ts` scores a tenant 0–100 and
// tells a human what to fix; this decides what the platform does about it without
// waiting for one. Same numbers, same bands — the scorer is the measurement, this
// is the loop that closes around it.
//
// Why this file is pure: the decision is the part that must never drift, and it is
// the part that is hardest to exercise for real (you cannot manufacture a 10%
// complaint rate on live mail to check it). Sampling, persistence, notification and
// the token bucket all live elsewhere so this stays a function of numbers.

/**
 * Bands. These are deliberately BELOW the provider's own suspension thresholds —
 * SES warns around 5% bounce / 0.1% complaint and can suspend an entire account
 * near 10% / 0.5%. Acting first is the whole point: once the provider suspends,
 * it suspends the shared account, and every other tenant on it stops sending too.
 * A tenant crossing `pause` here is one we would rather stop ourselves.
 */
export const REPUTATION_THRESHOLDS = {
  warn: { bounce: 0.05, complaint: 0.001 },
  throttle: { bounce: 0.08, complaint: 0.003 },
  pause: { bounce: 0.1, complaint: 0.005 },
} as const;

/**
 * Below this many judged sends, do nothing at all.
 *
 * A tenant three sends into its life with one bounce is at 33% — enforcing on that
 * would pause every new client on the platform during their first afternoon. The
 * scorer already damps low volume for display; enforcement needs a hard floor
 * because its actions are not cosmetic.
 */
export const REPUTATION_MIN_VERDICTS = 20;

/** Trailing window the sweep judges on. */
export const REPUTATION_WINDOW_DAYS = 7;

/** Sends per hour allowed to a throttled tenant. Metered, never dropped. */
export const REPUTATION_THROTTLE_PER_HOUR = 60;

/**
 * How many times one message may be deferred by the throttle before we give up and
 * fail it. At the hourly rate above this is a little over a day of trying — past
 * that, a message sitting in a queue is worse than an honest failure the operator
 * can see and act on.
 */
export const REPUTATION_MAX_DEFERRALS = 26;

/** A judged outcome sample for one tenant over the window. */
export interface ReputationSample {
  /** Sends the provider actually ruled on: delivered + bounced + complained. */
  verdicts: number;
  /** bounced / verdicts, as a fraction. */
  bounceRate: number;
  /** complained / (delivered + complained), as a fraction. */
  complaintRate: number;
}

export interface ReputationDecision {
  state: ReputationState;
  /** Plain-English why, safe to put in an email, an error body and the audit row. */
  reason: string;
  /** Whether this differs from where the tenant already was. */
  changed: boolean;
  /** Which metric crossed, for the notification and the audit metadata. */
  crossed: { metric: "bounce" | "complaint"; rate: number; threshold: number } | null;
}

const pct = (n: number) => `${Math.round(n * 10000) / 100}%`;

/**
 * Decide where a tenant belongs given its numbers and where it is now.
 *
 * Two rules that are not obvious from the thresholds:
 *
 * 1. **`paused` is sticky.** Falling back under the threshold does not un-pause a
 *    tenant — only a human at the parent workspace does, via the resume endpoint.
 *    A tenant that pauses, sends nothing, and thereby "recovers" on a decaying
 *    trailing average has not fixed anything, and auto-resuming would hand it back
 *    the reputation it just spent. Warn and throttle DO clear on their own, because
 *    those are reversible and the tenant kept sending to earn the recovery.
 *
 * 2. **Escalation is by current numbers, not by ratchet.** A tenant sitting at
 *    `throttled` whose numbers recover to the warn band moves DOWN to `warn` on the
 *    next sweep. The throttle is a response to what is happening now, not a
 *    punishment with a sentence to serve.
 */
export function evaluateReputation(
  sample: ReputationSample,
  current: ReputationState,
): ReputationDecision {
  // Rule 1: once paused, only a person moves it.
  if (current === "paused") {
    return {
      state: "paused",
      reason: "Paused for reputation. Only the parent workspace can resume this client.",
      changed: false,
      crossed: null,
    };
  }

  const stay = (reason: string): ReputationDecision => ({
    state: current,
    reason,
    changed: false,
    crossed: null,
  });

  if (sample.verdicts < REPUTATION_MIN_VERDICTS) {
    // Not enough evidence to act on — and not enough to CLEAR on either, or a
    // throttled tenant would escape simply by going quiet for a week.
    return stay(
      `Only ${sample.verdicts} judged send(s) in the last ${REPUTATION_WINDOW_DAYS} days — ` +
        `below the ${REPUTATION_MIN_VERDICTS} needed to judge a tenant.`,
    );
  }

  const decide = (
    band: keyof typeof REPUTATION_THRESHOLDS,
  ): ReputationDecision["crossed"] => {
    const t = REPUTATION_THRESHOLDS[band];
    if (sample.bounceRate > t.bounce) {
      return { metric: "bounce", rate: sample.bounceRate, threshold: t.bounce };
    }
    if (sample.complaintRate > t.complaint) {
      return { metric: "complaint", rate: sample.complaintRate, threshold: t.complaint };
    }
    return null;
  };

  // Hardest band first — a tenant over the pause line is also over the other two.
  const paused = decide("pause");
  const throttled = paused ?? decide("throttle");
  const warned = throttled ?? decide("warn");

  const state: ReputationState = paused ? "paused" : throttled ? "throttled" : warned ? "warn" : "ok";
  const crossed = paused ?? throttled ?? warned;

  if (!crossed) {
    return {
      state: "ok",
      reason:
        `Bounce ${pct(sample.bounceRate)}, complaint ${pct(sample.complaintRate)} over ` +
        `${sample.verdicts} judged sends — within limits.`,
      changed: current !== "ok",
      crossed: null,
    };
  }

  const label = crossed.metric === "bounce" ? "Bounce rate" : "Complaint rate";
  const action =
    state === "paused"
      ? "sending is paused"
      : state === "throttled"
        ? `sending is limited to ${REPUTATION_THROTTLE_PER_HOUR} messages an hour`
        : "no send restriction applied";

  return {
    state,
    reason:
      `${label} ${pct(crossed.rate)} over ${sample.verdicts} judged sends in the last ` +
      `${REPUTATION_WINDOW_DAYS} days, above the ${pct(crossed.threshold)} limit — ${action}.`,
    changed: state !== current,
    crossed,
  };
}

/** Derive the rates the state machine needs from raw outcome counts. */
export function sampleFromCounts(counts: {
  delivered: number;
  bounced: number;
  complained: number;
}): ReputationSample {
  const verdicts = counts.delivered + counts.bounced + counts.complained;
  // A complaint implies the mail was delivered first, so it belongs in the
  // denominator for complaint rate but a bounce does not.
  const inbox = counts.delivered + counts.complained;
  return {
    verdicts,
    bounceRate: verdicts ? counts.bounced / verdicts : 0,
    complaintRate: inbox ? counts.complained / inbox : 0,
  };
}
