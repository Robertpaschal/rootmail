/**
 * Translate provider internals into operator language.
 *
 * Closed-beta users must not see SES region names, configuration-set ids, or
 * "identities failed the check". Those are our wiring, not their mail. A
 * stopped send is stopped. The raw string stays in the API/worker — this is
 * a display layer, nothing else.
 */
const SES_INTERNALS =
  /us-east-\d|eu-west-\d|eu-central-\d|ap-southeast-\d|amazonses|amazonaws|configuration set|identities failed the check|email address is not verified|mailfromdomainnotverified|message rejected/i;

export function operatorReason(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const text = raw.trim();
  if (!text) return null;

  // Bring-your-own-provider failures are already written for the customer and
  // name THEIR account; rewriting them would blame ours.
  if (/^Not sent: your /.test(text) || /isn't verified at your provider/.test(text) || /^The beta\+ address belongs to Rootmail/.test(text)) {
    return text;
  }

  if (/configuration set/i.test(text)) {
    return "Sending stopped — this workspace is not ready to send yet.";
  }
  if (/not verified/i.test(text) || /identities failed the check/i.test(text) || /mailfromdomainnotverified/i.test(text)) {
    return "Sending stopped — that from address is not a sending identity.";
  }
  if (SES_INTERNALS.test(text)) {
    return "Sending stopped — the provider refused this send.";
  }
  return text;
}
