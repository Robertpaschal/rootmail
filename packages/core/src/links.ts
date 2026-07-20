import { hmacSign, safeEqual } from "./crypto";
import { env } from "./env";

// Tamper-proof public links (currently: one-click unsubscribe). The token is
// `base64url(payload).base64url(hmac(payload))`, so it can't be forged or
// enumerated without the signing secret. Unset secret → a dev-insecure default;
// production must set LINK_SIGNING_SECRET. Lives in core so both the API and the
// worker (sequences/campaigns) inject the same signed unsubscribe URL.
const SECRET = env.LINK_SIGNING_SECRET ?? "dev-insecure-link-signing-secret";

export interface UnsubscribePayload {
  /** workspace id */
  w: string;
  /** recipient email */
  e: string;
  /** sub-tenant id, if the send was sub-tenant scoped */
  s?: string | null;
}

export function unsubscribeToken(p: UnsubscribePayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${hmacSign(body, SECRET)}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, hmacSign(body, SECRET))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UnsubscribePayload;
    return p && typeof p.w === "string" && typeof p.e === "string" ? p : null;
  } catch {
    return null;
  }
}

/** Absolute unsubscribe URL injected as the {{unsubscribe_url}} template var. */
export function unsubscribeUrl(p: UnsubscribePayload): string {
  const base = env.PUBLIC_API_URL.replace(/\/$/, "");
  return `${base}/v1/unsubscribe?token=${encodeURIComponent(unsubscribeToken(p))}`;
}

// --- Audience signup (double opt-in confirmation) ---------------------------
// The link inside the "confirm your subscription" email. Distinct `k`
// discriminator so it can't double as an unsubscribe link or vice-versa.

export interface SubscribePayload {
  /** workspace id */
  w: string;
  /** list (audience) id */
  l: string;
  /** subscriber email */
  e: string;
  /** subscriber name, when the form captured one */
  n?: string;
}

export function subscribeConfirmToken(p: SubscribePayload): string {
  const body = Buffer.from(JSON.stringify({ ...p, k: "subscribe" })).toString("base64url");
  return `${body}.${hmacSign(body, SECRET)}`;
}

export function verifySubscribeConfirmToken(token: string): SubscribePayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, hmacSign(body, SECRET))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as SubscribePayload & { k?: string };
    if (parsed.k !== "subscribe" || !parsed.w || !parsed.l || !parsed.e) return null;
    return { w: parsed.w, l: parsed.l, e: parsed.e, n: parsed.n };
  } catch {
    return null;
  }
}

/** Absolute confirm URL for the double opt-in email's button. */
export function subscribeConfirmUrl(p: SubscribePayload): string {
  const base = env.PUBLIC_API_URL.replace(/\/$/, "");
  return `${base}/v1/subscribe/confirm?token=${encodeURIComponent(subscribeConfirmToken(p))}`;
}

// --- Admin announcement opt-out -------------------------------------------
// Announcements broadcast to account owners. A distinct token shape (`k`
// discriminator) so an announcement link can't double as a contact-unsubscribe
// link or vice-versa.

export function announcementUnsubToken(email: string): string {
  const body = Buffer.from(JSON.stringify({ e: email, k: "announcement" })).toString("base64url");
  return `${body}.${hmacSign(body, SECRET)}`;
}

export function verifyAnnouncementUnsubToken(token: string): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, hmacSign(body, SECRET))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { e?: string; k?: string };
    return p && p.k === "announcement" && typeof p.e === "string" ? p.e : null;
  } catch {
    return null;
  }
}

/** Absolute opt-out URL for the announcement email footer. */
export function announcementUnsubscribeUrl(email: string): string {
  const base = env.PUBLIC_API_URL.replace(/\/$/, "");
  return `${base}/v1/announcements/unsubscribe?token=${encodeURIComponent(announcementUnsubToken(email))}`;
}
