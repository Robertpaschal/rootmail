/**
 * Whether a failed message may be sent again.
 *
 * The cardinal rule: **never retry a message the provider already accepted.**
 * Once SES has taken it, the mail is on the wire — a "retry" is a second copy in
 * someone's inbox, and there is no undo. `providerMessageId` is the evidence of
 * acceptance, so its presence is an absolute bar regardless of how the message
 * later ended up marked failed.
 *
 * Everything else is judgement about whether trying again can plausibly work,
 * and is deliberately advisory rather than a lock — the operator can see the
 * error and may know something we do not (they fixed their DNS, the provider
 * outage ended, we shipped a bug fix).
 */
import type { MessageStatus } from "./constants";

export interface RetryCandidate {
  status: MessageStatus;
  /** Set once the provider accepted the message. Presence forbids retry. */
  providerMessageId: string | null;
  /** The recorded failure, used only to explain the likely outcome. */
  error: string | null;
}

export type RetryVerdict =
  | { retryable: true; caution: string | null }
  | { retryable: false; reason: string };

/**
 * Failures that mean the recipient, not the send. Retrying these produces another
 * bounce against an account every tenant shares, so they are worth naming rather
 * than letting someone press a button four times to learn it.
 */
const PERMANENT_HINTS = [
  "does not exist",
  "no such user",
  "user unknown",
  "mailbox unavailable",
  "invalid recipient",
  "address rejected",
  "domain not found",
  "recipient address rejected",
];

export function canRetryMessage(m: RetryCandidate): RetryVerdict {
  // Acceptance is irreversible. This check comes first and outranks everything.
  if (m.providerMessageId) {
    return {
      retryable: false,
      reason:
        "This message was already accepted by the email provider, so sending it again would deliver a second copy.",
    };
  }

  switch (m.status) {
    case "failed":
      break;
    case "suppressed":
      return {
        retryable: false,
        reason:
          "This recipient is on your suppression list. Remove them from it first — retrying would override a deliberate opt-out.",
      };
    case "bounced":
    case "complained":
      return {
        retryable: false,
        reason:
          "This message reached the recipient's provider and was rejected there. Sending it again would bounce again and cost your reputation.",
      };
    case "queued":
    case "sending":
      return { retryable: false, reason: "This message is still on its way — give it a moment." };
    case "sent":
    case "delivered":
      return { retryable: false, reason: "This message was sent." };
  }

  const err = (m.error ?? "").toLowerCase();
  const looksPermanent = PERMANENT_HINTS.some((h) => err.includes(h));
  return {
    retryable: true,
    caution: looksPermanent
      ? "This failed because of the recipient's address, so it will probably fail the same way again."
      : null,
  };
}
