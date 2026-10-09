import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { FastifyRequest } from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";
import { env, getRedis, safeEqual } from "@rootmail/core";
import { contacts, db, senderIdentities } from "@rootmail/db";
import { BETA_INVITED_TAG, BETA_WAITLIST_TAG, betaWaitlistAudience } from "./beta-waitlist";
import { platformRecipientsRestricted } from "./platform-recipients";
import { TESTER_LINK_TTL_MS, ensureTesterIdentity, isPlatformAddress, recreateTesterIdentity, testerIdentityState } from "./ses-provisioning";

/**
 * "Send me a new Amazon confirmation" for someone already on the beta waitlist.
 *
 * Why it exists: ensureTesterIdentity deliberately leaves an existing identity
 * alone, so once a tester's 24-hour link lapses nothing ever sends another one
 * and the only way in left is OAuth sign-in. This is the narrow way back.
 *
 * Narrow on purpose. It acts only for an address that is on the waitlist, only
 * when its link is actually dead (failed, or pending for longer than the link
 * lives), and never on our own domains or on an address a customer has added
 * as a sender. It mints no codes and touches no tags: when the tester clicks
 * the new link the normal sweep (promoteVerifiedTesters) picks them up and
 * mints their code at that moment, exactly as for a first-time click.
 */

/** Written whenever WE asked Amazon for a link. beta_signed_up_at is not a clock: resubmitting the form resets it. */
export const CONFIRMATION_REQUESTED_AT = "beta_confirmation_requested_at";

export type ResendOutcome =
  | "sent" // a new link was requested
  | "already_pending" // a link went out less than 24h ago — let it work
  | "already_confirmed" // verified, or already invited: nothing to resend
  | "not_on_waitlist"
  | "protected" // our domain, a customer sender, or not an email identity
  | "not_needed" // we are not in the sandbox; nobody needs confirming
  | "unavailable"; // SES could not be read or written; nothing was changed

export async function resendTesterConfirmation(email: string, now: Date = new Date()): Promise<ResendOutcome> {
  const addr = email.trim().toLowerCase();
  if (!platformRecipientsRestricted()) return "not_needed";
  if (isPlatformAddress(addr)) return "protected";

  // A customer's own sender address is an SES email identity too. Re-creating
  // it would reset their verification, so it is off limits here even if the
  // same person also joined the waitlist.
  const [sender] = await db
    .select({ id: senderIdentities.id })
    .from(senderIdentities)
    .where(sql`lower(${senderIdentities.email}) = ${addr}`)
    .limit(1);
  if (sender) return "protected";

  const { workspaceId } = await betaWaitlistAudience();
  const [contact] = await db
    .select({ id: contacts.id, tags: contacts.tags, metadata: contacts.metadata, createdAt: contacts.createdAt })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), isNull(contacts.subTenantId), eq(contacts.email, addr)))
    .limit(1);
  if (!contact || !contact.tags?.includes(BETA_WAITLIST_TAG)) return "not_on_waitlist";
  if (contact.tags.includes(BETA_INVITED_TAG)) return "already_confirmed";

  const state = await testerIdentityState(addr);
  if (!state.ok) return "unavailable";

  let requested: { ok: boolean };
  switch (state.value) {
    case "verified":
      return "already_confirmed";
    case "not_a_tester":
      return "protected";
    case "missing": {
      // The signup-time request never landed (it is best-effort). Same call the form makes.
      const made = await ensureTesterIdentity(addr);
      // Created by someone else between our read and our create: their link is fresh.
      if (made.ok && !made.value.created) return "already_pending";
      requested = made;
      break;
    }
    case "failed":
      requested = await recreateTesterIdentity(addr);
      break;
    case "pending": {
      const metadata = (contact.metadata ?? {}) as Record<string, unknown>;
      const stamp = typeof metadata[CONFIRMATION_REQUESTED_AT] === "string" ? Date.parse(metadata[CONFIRMATION_REQUESTED_AT] as string) : NaN;
      const askedAt = Number.isFinite(stamp) ? stamp : contact.createdAt.getTime();
      if (now.getTime() - askedAt < TESTER_LINK_TTL_MS) return "already_pending";
      requested = await recreateTesterIdentity(addr);
      break;
    }
  }
  if (!requested.ok) return "unavailable";

  // Re-read so a concurrent form resubmission's metadata is not overwritten.
  const [fresh] = await db.select({ metadata: contacts.metadata }).from(contacts).where(eq(contacts.id, contact.id)).limit(1);
  await db
    .update(contacts)
    .set({ metadata: { ...((fresh?.metadata ?? {}) as Record<string, unknown>), [CONFIRMATION_REQUESTED_AT]: now.toISOString() } })
    .where(eq(contacts.id, contact.id));
  return "sent";
}

// ---------------------------------------------------------------------------
// Rate limits. Counted for EVERY request, on the list or not, so a 429 says
// nothing about whether an address is known.
//
// Per IP means per VISITOR. rootmail.io's server action calls the API from one
// server, so req.ip alone would put every visitor in one bucket. The marketing
// server therefore forwards the visitor's address, and the API believes it only
// when the request also proves it holds INTERNAL_API_SECRET — the same header
// and secret the dashboard already uses for internal calls (routes/saml.ts).
// Anyone else's header is ignored and they are counted by their own address.
// ---------------------------------------------------------------------------

export const INTERNAL_HEADER = "x-rootmail-internal";
export const FORWARDED_CLIENT_IP_HEADER = "x-rootmail-client-ip";

export function resendClientIp(req: FastifyRequest): string {
  const secret = env.INTERNAL_API_SECRET;
  const proof = req.headers[INTERNAL_HEADER];
  const forwarded = req.headers[FORWARDED_CLIENT_IP_HEADER];
  if (secret && typeof proof === "string" && typeof forwarded === "string" && safeEqual(proof, secret)) {
    const ip = forwarded.trim();
    if (isIP(ip)) return ip;
  }
  return req.ip;
}

export const RESEND_LIMITS = {
  perAddress: 3,
  addressWindowSeconds: 24 * 60 * 60,
  perIp: 30,
  ipWindowSeconds: 60 * 60,
};

export function resendAddressKey(email: string): string {
  // Hashed: the address itself never sits in Redis.
  return `beta-resend:addr:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32)}`;
}
export function resendIpKey(ip: string): string {
  return `beta-resend:ip:${ip}`;
}

async function take(key: string, windowSeconds: number): Promise<number> {
  const redis = getRedis();
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, windowSeconds);
  return n;
}

export async function takeResendSlot(ip: string, email: string): Promise<{ ok: true } | { ok: false; scope: "ip" | "address" }> {
  if ((await take(resendIpKey(ip), RESEND_LIMITS.ipWindowSeconds)) > RESEND_LIMITS.perIp) return { ok: false, scope: "ip" };
  if ((await take(resendAddressKey(email), RESEND_LIMITS.addressWindowSeconds)) > RESEND_LIMITS.perAddress) {
    return { ok: false, scope: "address" };
  }
  return { ok: true };
}

// The work runs after the response is sent (see the route). Tracked so tests
// and shutdown can wait for it rather than racing a closing database.
const inflight = new Set<Promise<unknown>>();
export function track<T>(p: Promise<T>): Promise<T> {
  inflight.add(p);
  void p.finally(() => inflight.delete(p)).catch(() => undefined);
  return p;
}
export async function settleResends(): Promise<void> {
  await Promise.allSettled([...inflight]);
}
