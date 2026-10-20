import { env } from "./env";

/**
 * Bring-your-own-provider policy. Pure decisions only, so the "flag off means
 * nothing changes" promise is testable without a database.
 */

/** The global switch. Only the exact string "true" turns it on. */
export function byoGloballyEnabled(value: string | undefined = env.BYO_PROVIDER_ENABLED): boolean {
  return value === "true";
}

/** BYO is in effect for an org only when BOTH the global switch and the org flag are on. */
export function byoEffective(orgFlag: boolean | null | undefined, global = byoGloballyEnabled()): boolean {
  return global && orgFlag === true;
}

/** An SES connection saved but whose SNS topic has not confirmed its subscription yet. */
export const BYO_AWAITING_FEEDBACK = "awaiting_feedback";

export type ProviderRoute =
  | { kind: "platform" }
  | { kind: "ours" }
  | { kind: "own" }
  | { kind: "fail"; reason: string };

/**
 * Which account a message leaves from.
 *
 *  - rootmail's own org: always ours, explicitly (platform mail never uses a BYO).
 *  - no connection: ours (today's behaviour).
 *  - connection usable: theirs.
 *  - connection NOT usable:
 *      unflagged → ours, silently (today's behaviour, preserved byte for byte);
 *      flagged   → fail loudly. A beta tenant's volume on our sandboxed account
 *                  is exactly what BYO exists to avoid.
 */
export function decideProviderRoute(input: {
  isInternal: boolean;
  flagged: boolean;
  connection: { status: string } | null;
  buildError: string | null;
}): ProviderRoute {
  if (input.isInternal) return { kind: "platform" };
  const c = input.connection;
  if (!c) return { kind: "ours" };
  const usable = c.status === "active" && input.buildError === null;
  if (usable) return { kind: "own" };
  if (!input.flagged) return { kind: "ours" };
  if (c.status === BYO_AWAITING_FEEDBACK) {
    return { kind: "fail", reason: "your SNS topic hasn't confirmed its subscription to Rootmail yet, so bounces couldn't reach your suppression list" };
  }
  if (c.status !== "active") {
    return { kind: "fail", reason: `the connection is ${c.status}` };
  }
  return { kind: "fail", reason: input.buildError ?? "the stored credentials could not be read" };
}

/** The exact text a failed BYO message carries, shown on the message and the card. */
export function byoFailureMessage(provider: string, reason: string): string {
  const name = provider === "mailgun" ? "Mailgun" : provider === "ses" ? "Amazon SES" : provider;
  return `Not sent: your ${name} account didn't accept this message (${reason}). Nothing was sent through Rootmail's account. Fix it in Settings → Sender → Sending account.`;
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).trim().toLowerCase();
}

/**
 * Is this From allowed through the tenant's provider?
 * Allowed: the address itself, or its domain, appears in the provider's
 * verified identities. Subdomains are NOT implied — providers verify exact names.
 */
export function fromAllowedForByo(fromEmail: string, verified: string[] | null | undefined): boolean {
  const list = (verified ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return false;
  const addr = fromEmail.trim().toLowerCase();
  return list.includes(addr) || list.includes(domainOf(addr));
}

export const BYO_BETA_ADDRESS_REFUSED =
  "The beta+ address belongs to Rootmail's account, so it can't send through your own provider. Use an address on a domain your provider has verified.";

export function byoFromNotVerified(fromEmail: string, verified: string[]): string {
  return `${domainOf(fromEmail) || fromEmail} isn't verified at your provider, so it can't send this. Verified there: ${verified.length ? verified.join(", ") : "nothing yet"}.`;
}

/** SNS TopicArn must be exactly the one the tenant registered. */
export function snsTopicMatches(registered: string | null | undefined, received: string | undefined): boolean {
  return Boolean(registered && received && registered.trim() === received.trim());
}

/** Redis channel the API publishes on when an org connects, replaces or disconnects a provider. */
export const PROVIDER_CHANGED_CHANNEL = "rootmail:sending-provider:changed";

/** Domains that are Rootmail's. A tenant can never route these through its own provider. */
export function isRootmailOwnedDomain(domain: string, extra: (string | null | undefined)[] = []): boolean {
  const d = domain.trim().toLowerCase().replace(/^.*@/, "");
  const owned = ["rootmail.io", "rootmail.dev", ...extra.map((x) => x?.trim().toLowerCase()).filter(Boolean)] as string[];
  return owned.some((o) => d === o || d.endsWith(`.${o}`));
}

/** The public URL a tenant points its provider's events at. */
export function byoWebhookUrl(base: string, token: string, provider: "ses" | "mailgun"): string {
  return `${base.replace(/\/+$/, "")}/v1/webhooks/byo/${token}/${provider}`;
}
