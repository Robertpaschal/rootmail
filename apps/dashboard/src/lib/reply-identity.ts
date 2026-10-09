/**
 * Who wrote each email in Replies. "You" is ONLY ever an outbound label — an
 * inbound email always shows its real From, because a reply can come from
 * someone other than the contact the conversation is filed under:
 *
 * A conversation is keyed by the contact we wrote to. A reply that reaches it
 * through the conversation's reply address (reply+<thread>@…) or its threading
 * headers joins that conversation whoever sent it — a colleague on CC, an alias,
 * a forwarding address, a shared mailbox. So we never borrow the contact's name
 * for a different address, and we say when a reply came from another one.
 */
export interface IdentityMessage {
  direction: "outbound" | "inbound";
  from: string;
  from_name: string | null;
}
export interface IdentityContact {
  email: string;
  name: string | null;
}

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const fmt = (name: string | null | undefined, email: string) => (name?.trim() ? `${name.trim()} <${email}>` : email);
/** A contact "name" that is really a pronoun (e.g. a test contact saved as "You") must never label an inbound email. */
const usableName = (name: string | null | undefined) => (name && !/^\s*(you|me)\s*$/i.test(name) ? name : null);

export function senderLine(m: IdentityMessage, contact: IdentityContact): string {
  if (m.direction === "outbound") return `You · ${fmt(m.from_name, m.from)}`;
  return fmt(same(m.from, contact.email) ? usableName(contact.name) : null, m.from);
}

/** Inbound from an address other than the conversation's contact. */
export function isOtherReplyAddress(m: IdentityMessage, contact: IdentityContact): boolean {
  return m.direction === "inbound" && !same(m.from, contact.email);
}

/** The conversation header: the contact, plus the address(es) replies actually came from when different. */
export function headerIdentity(contact: IdentityContact, lastReplyFroms: (string | null | undefined)[]): { title: string; repliesFrom: string[] } {
  const repliesFrom = [...new Set(lastReplyFroms.filter((f): f is string => Boolean(f)).map((f) => f.trim().toLowerCase()))].filter((f) => !same(f, contact.email));
  return { title: usableName(contact.name) ?? contact.email, repliesFrom };
}
