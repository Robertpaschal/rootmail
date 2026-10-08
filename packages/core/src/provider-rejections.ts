/**
 * Our own SES account is in the sandbox: it refuses mail to any address that
 * has not confirmed with Amazon first. SESv2 says so with a MessageRejected
 * whose text is written for operators — it names our account's region and the
 * recipient, e.g. "Email address is not verified. The following identities
 * failed the check in region …: someone@example.com".
 *
 * That text must never be what a person reads. Classify it here, store a
 * stable code instead, and let the product explain it in its own words.
 */
export const RECIPIENT_UNCONFIRMED = "recipient_unconfirmed";

/** What we store on the message instead of the provider's text. */
export const RECIPIENT_UNCONFIRMED_ERROR = `${RECIPIENT_UNCONFIRMED}: the recipient has not confirmed their address with our email provider yet`;

/**
 * Was this send refused because the RECIPIENT is unconfirmed?
 *
 * The same rejection fires when the sender identity is unverified — that is
 * our misconfiguration, not theirs, and must keep failing loudly and retrying.
 * So it only counts when the refused identity named is the recipient.
 */
export function isUnconfirmedRecipientRejection(err: unknown, to: string): boolean {
  if (!(err instanceof Error)) return false;
  if (!/email address is not verified/i.test(err.message)) return false;
  return err.message.toLowerCase().includes(to.toLowerCase());
}
