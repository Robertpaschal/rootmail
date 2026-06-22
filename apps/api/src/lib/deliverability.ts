import type { MessageStatus, SuppressionReason } from "@rootmail/core";

// Deliverability scoring. Turns raw send outcomes (delivery / bounce / complaint /
// failure) plus domain-auth health into a single 0–100 score, the factors hurting
// it, and concrete next steps — so "how's my deliverability?" has a real answer.
//
// Thresholds follow what the big mailbox providers and ESPs publish: keep bounces
// under ~2% and complaints under ~0.1%; SES warns at 5% bounce / 0.1% complaint and
// can suspend around 10% / 0.5%. We score against those bands.

export type DeliverabilityStatus = "no_data" | "excellent" | "good" | "at_risk" | "critical";
export type Severity = "info" | "warning" | "critical";

export interface DeliverabilityInput {
  windowDays: number;
  counts: Record<MessageStatus, number>;
  suppressions: { total: number; byReason: Record<SuppressionReason, number> };
  domains: { total: number; verified: number; unverified: number };
}

export interface DeliverabilityFactor {
  id: string;
  severity: Severity;
  label: string;
  detail: string;
}

export interface DeliverabilityResult {
  window_days: number;
  volume: {
    total: number;
    delivered: number;
    bounced: number;
    complained: number;
    failed: number;
    suppressed: number;
    in_flight: number;
  };
  rates: { delivery: number; bounce: number; complaint: number; failure: number };
  suppressions: { total: number; by_reason: Record<string, number> };
  domains: { total: number; verified: number; unverified: number };
  score: number | null;
  grade: "A" | "B" | "C" | "D" | "F" | null;
  status: DeliverabilityStatus;
  confidence: "none" | "low" | "high";
  factors: DeliverabilityFactor[];
  recommendations: string[];
}

const pct = (n: number) => Math.round(n * 10000) / 100; // 0.0234 -> 2.34 (%)

export function computeDeliverability(input: DeliverabilityInput): DeliverabilityResult {
  const c = input.counts;
  const delivered = c.delivered ?? 0;
  const bounced = c.bounced ?? 0;
  const complained = c.complained ?? 0;
  const failed = c.failed ?? 0;
  const suppressed = c.suppressed ?? 0;
  const inFlight = (c.queued ?? 0) + (c.sending ?? 0) + (c.sent ?? 0);
  const total = delivered + bounced + complained + failed + suppressed + inFlight;

  // A "verdict" is an attempt the provider actually judged: it landed (delivered),
  // landed-then-complained, or bounced. Failures are our-side; suppressed never left.
  const verdicts = delivered + bounced + complained;
  const inbox = delivered + complained; // complaint implies it was delivered first
  const processed = verdicts + failed;

  const bounceRate = verdicts ? bounced / verdicts : 0;
  const complaintRate = inbox ? complained / inbox : 0;
  const deliveryRate = verdicts ? inbox / verdicts : 0;
  const failureRate = processed ? failed / processed : 0;

  const rates = {
    delivery: pct(deliveryRate),
    bounce: pct(bounceRate),
    complaint: pct(complaintRate),
    failure: pct(failureRate),
  };

  const volume = { total, delivered, bounced, complained, failed, suppressed, in_flight: inFlight };
  const suppressions = { total: input.suppressions.total, by_reason: input.suppressions.byReason };
  const domains = input.domains;

  const factors: DeliverabilityFactor[] = [];
  const recommendations: string[] = [];

  // No measurable outcomes yet → don't invent a score.
  if (verdicts === 0 && failed === 0) {
    if (domains.unverified > 0) {
      factors.push({
        id: "unverified_domains",
        severity: "warning",
        label: "Unverified sending domain(s)",
        detail: `${domains.unverified} of ${domains.total} sending domain(s) aren't DKIM-verified yet.`,
      });
      recommendations.push("Verify DKIM/SPF for your sending domains (Sub-tenants) before you start sending.");
    }
    recommendations.push("Send some email — once there's delivery data we can score your reputation.");
    return {
      window_days: input.windowDays,
      volume,
      rates,
      suppressions,
      domains,
      score: null,
      grade: null,
      status: "no_data",
      confidence: "none",
      factors,
      recommendations,
    };
  }

  const confidence: "low" | "high" = verdicts < 20 ? "low" : "high";
  // At low volume a single bounce skews the rate, so soften penalties.
  const damp = confidence === "low" ? 0.5 : 1;

  let score = 100;

  // --- Bounce rate (target < 2%) ---
  if (bounceRate > 0.1) {
    score -= 50 * damp;
    factors.push(band("bounce_rate", "critical", "Very high bounce rate", rates.bounce, 2));
  } else if (bounceRate > 0.05) {
    score -= 30 * damp;
    factors.push(band("bounce_rate", "critical", "High bounce rate", rates.bounce, 2));
  } else if (bounceRate > 0.02) {
    score -= 15 * damp;
    factors.push(band("bounce_rate", "warning", "Elevated bounce rate", rates.bounce, 2));
  }
  if (bounceRate > 0.02) {
    recommendations.push(
      "Clean your list: remove invalid addresses and use confirmed opt-in. Hard-bounced recipients are already auto-suppressed.",
    );
  }

  // --- Complaint rate (target < 0.1%) ---
  if (complaintRate > 0.005) {
    score -= 40 * damp;
    factors.push(band("complaint_rate", "critical", "Very high complaint rate", rates.complaint, 0.1));
  } else if (complaintRate > 0.003) {
    score -= 25 * damp;
    factors.push(band("complaint_rate", "critical", "High complaint rate", rates.complaint, 0.1));
  } else if (complaintRate > 0.001) {
    score -= 12 * damp;
    factors.push(band("complaint_rate", "warning", "Elevated complaint rate", rates.complaint, 0.1));
  }
  if (complaintRate > 0.001) {
    recommendations.push(
      "Cut complaints: honor unsubscribes immediately, set clear expectations at sign-up, and send mainly to engaged recipients.",
    );
  }

  // --- Our-side send failures ---
  if (failureRate > 0.05) {
    score -= 15;
    factors.push(band("failure_rate", "warning", "High send-failure rate", rates.failure, 1));
  } else if (failureRate > 0.01) {
    score -= 7;
    factors.push(band("failure_rate", "warning", "Send failures", rates.failure, 1));
  }
  if (failureRate > 0.01) {
    recommendations.push("Investigate failed sends under Messages (filter: failed) — these are errors before delivery.");
  }

  // --- Domain authentication ---
  if (domains.unverified > 0) {
    score -= Math.min(15, domains.unverified * 5);
    factors.push({
      id: "unverified_domains",
      severity: "warning",
      label: "Unverified sending domain(s)",
      detail: `${domains.unverified} of ${domains.total} sending domain(s) aren't DKIM-verified — mail from them is far more likely to be filtered.`,
    });
    recommendations.push("Verify DKIM/SPF for your sending domains under Sub-tenants.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const status: DeliverabilityStatus =
    score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "at_risk" : "critical";
  const grade: DeliverabilityResult["grade"] =
    score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  if (factors.length === 0) {
    factors.push({
      id: "healthy",
      severity: "info",
      label: "Healthy reputation",
      detail: `Delivery ${rates.delivery}%, bounce ${rates.bounce}%, complaint ${rates.complaint}% — all within target.`,
    });
    recommendations.push("Deliverability is healthy — keep monitoring and maintain list hygiene.");
  }
  if (confidence === "low") {
    factors.push({
      id: "low_volume",
      severity: "info",
      label: "Low volume",
      detail: `Only ${verdicts} delivery verdict(s) in the last ${input.windowDays} days — the score is indicative until you send more.`,
    });
  }

  return {
    window_days: input.windowDays,
    volume,
    rates,
    suppressions,
    domains,
    score,
    grade,
    status,
    confidence,
    factors,
    recommendations,
  };
}

function band(id: string, severity: Severity, label: string, actual: number, target: number): DeliverabilityFactor {
  return { id, severity, label, detail: `${actual}% (target < ${target}%)` };
}
