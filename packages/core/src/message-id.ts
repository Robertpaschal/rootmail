/**
 * RFC 5322 message identity and threading headers (brief P2.5).
 *
 * Threading rested entirely on a plus-addressed reply token
 * (`reply+<threadId>@…`) plus subject normalisation. That works for a plain
 * Reply and nothing else — reply to a forwarded copy, or use a client that
 * ignores `Reply-To`, and the token is gone. Mail solved this in 1982 with
 * `Message-ID` / `In-Reply-To` / `References`; we simply were not participating.
 *
 * Pure and dependency-free on purpose: the parsing here runs on strangers' mail
 * headers, which are attacker-controlled, and the rules are worth testing
 * without a database.
 */

/** Longest header value we will look at. Beyond this the sender is not threading. */
const MAX_HEADER = 4_000;
/** RFC 5322 asks for at most a handful; a chain longer than this is noise or attack. */
const MAX_IDS = 20;

/**
 * Build the `Message-ID` for one outbound entry.
 *
 * The local part is our own thread-message id, so a reply quoting it identifies
 * the exact entry with no lookup table. The domain is the sending domain, which
 * is what makes it globally unique and what receivers expect to match the From.
 */
export function buildMessageId(threadMessageId: string, sendingDomain: string): string {
  const domain = sendingDomain.trim().replace(/^@/, "").toLowerCase();
  return `<${threadMessageId}@${domain}>`;
}

/**
 * Pull message ids out of an `In-Reply-To` or `References` header value.
 *
 * Deliberately forgiving about what surrounds them and strict about what counts:
 * real-world headers arrive folded across lines, comma-separated, space-separated,
 * or with commentary, and the only thing we trust is the angle-bracketed token.
 */
export function parseMessageIds(header: string | null | undefined): string[] {
  if (!header) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of header.slice(0, MAX_HEADER).matchAll(/<([^<>\s]{1,300})>/g)) {
    const id = `<${m[1]}>`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_IDS) break;
  }
  return out;
}

/**
 * The ids an inbound reply is pointing at, most specific first.
 *
 * `In-Reply-To` names the immediate parent, so it is tried before `References`,
 * whose last entry is the same message in a well-formed chain but whose earlier
 * entries walk back toward the root. Trying the parent first means a reply lands
 * on the conversation it actually answers rather than the oldest one it mentions.
 */
export function threadingCandidates(headers: {
  inReplyTo?: string | null;
  references?: string | null;
}): string[] {
  const direct = parseMessageIds(headers.inReplyTo);
  // Newest-first: the tail of References is nearest the reply.
  const chain = parseMessageIds(headers.references).reverse();
  const seen = new Set(direct);
  return [...direct, ...chain.filter((id) => !seen.has(id))];
}

/**
 * The `References` value for a reply we are about to send.
 *
 * RFC 5322 §3.6.4: the parent's References, then the parent's Message-ID. Capped
 * because some clients grow this without bound and an oversized header gets the
 * whole message rejected by strict receivers.
 */
export function buildReferences(parentReferences: string | null | undefined, parentId: string): string {
  const chain = parseMessageIds(parentReferences).filter((id) => id !== parentId);
  chain.push(parentId);
  // Keep the root and the most recent — that is what clients actually use to
  // group, and dropping the middle keeps long threads inside header limits.
  const kept = chain.length <= MAX_IDS ? chain : [chain[0], ...chain.slice(-(MAX_IDS - 1))];
  return kept.join(" ");
}

export interface ReplyHeaders {
  name: string;
  value: string;
}

/** The threading headers for a reply into an existing conversation. */
export function replyThreadingHeaders(parent: {
  rfcMessageId: string | null;
  references?: string | null;
}): ReplyHeaders[] {
  if (!parent.rfcMessageId) return [];
  return [
    { name: "In-Reply-To", value: parent.rfcMessageId },
    { name: "References", value: buildReferences(parent.references, parent.rfcMessageId) },
  ];
}

/**
 * Amazon SES replaces the `Message-ID` we set with one of its own, shaped
 * `<{sesMessageId}@{region}.amazonses.com>`. So the id a recipient quotes back is
 * usually NOT the one we generated — but its local part is exactly the id SES
 * returned to us at send time, which is already stored and indexed as
 * `messages.provider_message_id`.
 *
 * Returns that local part, or null if this is not an SES-shaped id.
 */
export function sesProviderIdFromMessageId(id: string): string | null {
  // The dot before `amazonses.com` is load-bearing: SES ids are always
  // `<id@region.amazonses.com>`, and without it a lookalike domain someone
  // controls (`evilamazonses.com`) would be accepted as an SES id and sent
  // through the provider-id lookup. This value comes off a stranger's headers.
  const m = /^<([^@<>\s]+)@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.amazonses\.com>$/i.exec(id.trim());
  return m ? m[1] : null;
}
