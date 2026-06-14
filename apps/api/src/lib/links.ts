import { env, hmacSign, safeEqual } from "@rootmail/core";

// Tamper-proof public links (currently: one-click unsubscribe). The token is
// `base64url(payload).base64url(hmac(payload))`, so it can't be forged or
// enumerated without the signing secret. Unset secret → a dev-insecure default;
// production must set LINK_SIGNING_SECRET.
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
