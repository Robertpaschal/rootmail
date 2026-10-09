/**
 * /settings/sender leads with the beta address during the closed beta: what it
 * is, and the one action that gets someone sending (activate it, or use it).
 * Pure so the copy and the state rules are testable; no provider terms here.
 */
export interface SenderLike {
  email: string;
  status: string;
  is_default: boolean;
}

export type BetaLead =
  | { kind: "none" }
  | { kind: "activate" }
  | { kind: "active"; email: string; isDefault: boolean };

/** A platform-assigned beta address: beta+<org>@ Rootmail's domain or a subdomain
 * of it (reply.rootmail.io). Customers can't add these by hand. */
export function isBetaSenderEmail(email: string, rootmailDomain: string): boolean {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (!e.startsWith("beta+") || at <= "beta+".length) return false;
  const domain = e.slice(at + 1);
  const apex = rootmailDomain.trim().toLowerCase();
  return domain === apex || domain.endsWith(`.${apex}`);
}

/** What the top of the page shows. An existing beta address always shows (so
 * the owner can find and use it); the activation offer only when available. */
export function betaLead(senders: SenderLike[], betaAvailable: boolean, rootmailDomain: string): BetaLead {
  const beta = senders.find((s) => s.status === "verified" && isBetaSenderEmail(s.email, rootmailDomain));
  if (beta) return { kind: "active", email: beta.email, isDefault: beta.is_default };
  return betaAvailable ? { kind: "activate" } : { kind: "none" };
}

export const BETA_LEAD_COPY = {
  activate: {
    title: "Your beta address",
    body: "Send from an address we've set up for this workspace. No DNS setup needed. It becomes your default sender, and replies come back to your Replies inbox.",
    action: "Activate beta address",
  },
  active: {
    title: "Your beta address",
    defaultBody: "This is your default sender. Replies come back to your Replies inbox.",
    notDefaultBody: "Make it your default so campaigns and quick sends use it. Replies come back to your Replies inbox.",
    send: "Send an email",
    makeDefault: "Use as default",
  },
} as const;

/** One quiet line of orientation under the sender page: how many sending
 * addresses are verified, or what to do when none is (pre-#29 wording). */
export function senderCountLine(verified: number, pending: number): string {
  return verified > 0
    ? `${verified} address${verified === 1 ? "" : "es"} verified${pending ? ` · ${pending} still awaiting confirmation` : ""}.`
    : "Dashboard sending is paused until you verify a sending address. You can prepare templates and campaign drafts in the meantime.";
}
