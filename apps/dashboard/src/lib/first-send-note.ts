import type { SendingAccess } from "./types";

/**
 * The onboarding "Send your first email" step tells someone to send to their
 * own address. While Rootmail's sending account is limited, that only works once
 * the address has been confirmed through Amazon's email, so a new account that
 * clicks straight through gets a refusal on its very first send. Say so first,
 * in plain words: who the email comes from and what to click. No provider
 * internals (account modes, identities, regions) belong in this copy.
 */

/** The /beta page's "ask for a new confirmation link" form. */
export const BETA_RESEND_URL = "https://rootmail.io/beta#resend-confirmation";

/** Where a signed-in owner asks for the confirmation email from inside the app. */
export const CONFIRM_IN_APP_HREF = "/testing#test-inboxes";

/** The only sender name we tell people to look for. */
export const CONFIRMATION_SENDER = "Amazon Web Services";

export interface FirstSendNote {
  title: string;
  body: string;
  confirmLabel: string;
  resendLabel: string;
}

export function firstSendNote(
  access: Pick<SendingAccess, "required" | "data"> | null | undefined,
  ownEmail: string | null | undefined,
): FirstSendNote | null {
  if (!access?.required) return null;
  const own = ownEmail?.trim().toLowerCase() || null;
  if (own && access.data.some((r) => r.email.toLowerCase() === own && r.status === "verified")) return null;
  const who = own ? `to ${own}` : "to your address";
  return {
    title: "Confirm your address before this send",
    body:
      `For now, Rootmail can only send to addresses that have been confirmed. ` +
      `Look for an email from ${CONFIRMATION_SENDER} sent ${who}, and click the link in it. ` +
      `Then come back and send. Check spam if it is not in your inbox.`,
    confirmLabel: "Send me the confirmation email",
    resendLabel: "Joined from the waitlist and the link expired? Get a new one",
  };
}
