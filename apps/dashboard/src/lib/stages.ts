// The CRM lifecycle — plain-English everywhere. The positive path runs left to
// right (escalate/de-escalate by one click or drag); "At risk" is the side lane
// you pull people into when the relationship cools, and out of when it warms.

export const CONTACT_STAGES = ["subscriber", "engaged", "customer", "champion", "at_risk"] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];

/** The escalation path, in order. at_risk lives outside it (a side lane). */
export const POSITIVE_STAGES: ContactStage[] = ["subscriber", "engaged", "customer", "champion"];

/** A send with the engagement timestamps we reason over for suggestions. */
export interface EngagementSignal {
  sent_at: string;
  opened_at: string | null;
  clicked_at: string | null;
}

/**
 * Suggest a lifecycle move from real engagement — never auto-applied, always a
 * one-click confirm. Reads the contact's recent sends: fresh clicks/opens escalate
 * a subscriber (or warm an at-risk contact back), a run of ignored emails cools an
 * engaged+ contact toward at-risk. Returns null when the current stage already fits.
 */
export function suggestStage(
  stage: ContactStage,
  sends: EngagementSignal[],
): { to: ContactStage; reason: string } | null {
  const now = Date.now();
  const DAY = 86_400_000;
  const recent = sends.filter((m) => m.sent_at && now - Date.parse(m.sent_at) < 60 * DAY);
  const clicks = recent.filter((m) => m.clicked_at).length;
  const engaged = recent.filter((m) => m.opened_at || m.clicked_at).length;

  if (stage === "subscriber" && (clicks >= 1 || engaged >= 2)) {
    return { to: "engaged", reason: clicks >= 1 ? "clicked a recent email" : "opened several recent emails" };
  }
  if (stage === "at_risk" && engaged >= 1) {
    return { to: "engaged", reason: "opened a recent email — they're back" };
  }
  if ((stage === "engaged" || stage === "customer" || stage === "champion") && recent.length >= 3 && engaged === 0) {
    return { to: "at_risk", reason: `no opens across your last ${recent.length} emails` };
  }
  return null;
}

export const STAGE_META: Record<
  ContactStage,
  { label: string; hint: string; dot: string; badge: string; column: string }
> = {
  subscriber: {
    label: "Subscriber",
    hint: "Just arrived — they signed up or you added them.",
    dot: "bg-slate-400",
    badge: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    column: "border-t-slate-400",
  },
  engaged: {
    label: "Engaged",
    hint: "Opening and clicking — they're paying attention.",
    dot: "bg-violet-500",
    badge: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    column: "border-t-violet-500",
  },
  customer: {
    label: "Customer",
    hint: "They've bought or signed up for your product.",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    column: "border-t-emerald-500",
  },
  champion: {
    label: "Champion",
    hint: "Your best people — repeat buyers, loud fans.",
    dot: "bg-amber-500",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    column: "border-t-amber-500",
  },
  at_risk: {
    label: "At risk",
    hint: "Gone quiet — worth a win-back before they slip away.",
    dot: "bg-red-500",
    badge: "bg-red-500/15 text-red-600 dark:text-red-400",
    column: "border-t-red-400",
  },
};
