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

/**
 * A lifecycle stage is a NOUN, and nouns get ink (docs/design/00-PHILOSOPHY.md
 * §5.2). These used to be slate / violet / emerald / amber / red — which meant
 * a "Champion" badge was drawn in the colour that means *we intervened* and an
 * "At risk" contact in the colour that means *this sender was stopped*, so the
 * day one of those fired for real it read as one more coloured chip.
 *
 * The distribution bar still has to separate five values, so it uses an ink
 * RAMP rather than five hues: darkest is furthest along the positive path, and
 * "At risk" — the side lane — is the lightest. The badge carries no colour at
 * all; its own label already says which stage it is.
 */
export const STAGE_META: Record<
  ContactStage,
  { label: string; hint: string; dot: string; badge: string; column: string }
> = {
  subscriber: {
    label: "Subscriber",
    hint: "Just arrived — they signed up or you added them.",
    dot: "bg-ink/35",
    badge: "bg-muted text-foreground",
    column: "border-t-ink/35",
  },
  engaged: {
    label: "Engaged",
    hint: "Opening and clicking — they're paying attention.",
    dot: "bg-ink/55",
    badge: "bg-muted text-foreground",
    column: "border-t-ink/55",
  },
  customer: {
    label: "Customer",
    hint: "They've bought or signed up for your product.",
    dot: "bg-ink/75",
    badge: "bg-muted text-foreground",
    column: "border-t-ink/75",
  },
  champion: {
    label: "Champion",
    hint: "Your best people — repeat buyers, loud fans.",
    dot: "bg-ink",
    badge: "bg-muted text-foreground",
    column: "border-t-ink",
  },
  at_risk: {
    label: "At risk",
    hint: "Gone quiet — worth a win-back before they slip away.",
    dot: "bg-ink/15",
    badge: "border border-dashed border-rule bg-transparent text-muted-foreground",
    column: "border-t-ink/15",
  },
};