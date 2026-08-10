import type { SequenceStepDef, SequenceTriggerDef } from "@/lib/types";

// Plain module on purpose: server components import these, and a helper that
// lives in a "use client" file cannot cross that boundary (only COMPONENTS can).
// See CLAUDE.md — this exact mistake shipped a broken campaign page once.

/** The trigger, as a sentence rather than an enum. */
export function triggerSentence(trigger: SequenceTriggerDef): string {
  switch (trigger.type) {
    case "contact_tagged":
      return trigger.tag ? `When someone gets the “${trigger.tag}” tag` : "When someone gets a tag";
    case "contact_created":
      return "When someone is added to your audience";
    default:
      return "When you enroll someone";
  }
}

/** Short form for a table cell. */
export function triggerShort(trigger: SequenceTriggerDef): string {
  switch (trigger.type) {
    case "contact_tagged":
      return trigger.tag ? `tagged “${trigger.tag}”` : "tagged";
    case "contact_created":
      return "new contacts";
    default:
      return "manual";
  }
}

/** Total hours a full run takes, and how many emails it sends. */
export function journeyShape(steps: SequenceStepDef[]): { emails: number; hours: number } {
  let emails = 0;
  let hours = 0;
  for (const s of steps) {
    if (s.type === "wait") hours += s.hours;
    else if (s.type === "send") emails += 1;
  }
  return { emails, hours };
}

/** One email in the journey, carrying the gap BEFORE it. */
export interface EmailDraft {
  template: string;
  /** Hours to wait before sending this one. 0 = immediately on enrollment. */
  afterHours: number;
}

/** Emails → the wait/send pairs the engine runs. */
export function toSteps(emails: EmailDraft[]): SequenceStepDef[] {
  const out: SequenceStepDef[] = [];
  for (const e of emails) {
    if (e.afterHours > 0) out.push({ type: "wait", hours: e.afterHours });
    out.push({ type: "send", template: e.template });
  }
  return out;
}

/**
 * Steps → emails. Null when the sequence uses something the simplified view
 * cannot represent — a branch, or a trailing wait after the last send. Both
 * would be silently dropped on the way back out, which would edit the user's
 * sequence behind their back, so they open the advanced editor instead.
 */
export function toEmails(steps: SequenceStepDef[]): EmailDraft[] | null {
  const out: EmailDraft[] = [];
  let pending = 0;
  for (const s of steps) {
    if (s.type === "wait") pending += s.hours;
    else if (s.type === "send") {
      out.push({ template: s.template, afterHours: pending });
      pending = 0;
    } else return null;
  }
  return pending > 0 ? null : out;
}

/** Hours → the way a person says it. */
export function delayLabel(hours: number): string {
  if (hours === 0) return "straight away";
  if (hours % 168 === 0) return `${hours / 168} week${hours / 168 === 1 ? "" : "s"} later`;
  if (hours % 24 === 0) return `${hours / 24} day${hours / 24 === 1 ? "" : "s"} later`;
  return `${hours} hour${hours === 1 ? "" : "s"} later`;
}

/** Cumulative day the Nth email lands on, for the review timeline. */
export function dayOf(emails: EmailDraft[], i: number): number {
  return Math.round(emails.slice(0, i + 1).reduce((h, e) => h + e.afterHours, 0) / 24);
}

/** "3 emails over 7 days" — what the sequence actually does, in one line. */
export function journeySummary(steps: SequenceStepDef[]): string {
  const { emails, hours } = journeyShape(steps);
  if (emails === 0) return "No emails yet";
  const one = `${emails} email${emails === 1 ? "" : "s"}`;
  if (hours === 0) return `${one}, sent at once`;
  const days = Math.round(hours / 24);
  if (days >= 1) return `${one} over ${days} day${days === 1 ? "" : "s"}`;
  return `${one} over ${hours} hour${hours === 1 ? "" : "s"}`;
}
