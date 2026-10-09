"use server";

import { headers } from "next/headers";
import { clientAddress } from "../check/rate-limit";
import { takeResend } from "./rate-limit";

const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

export interface WaitlistState {
  ok?: boolean;
  error?: string;
  /** Echoed back on success so the "send a new link" action can be prefilled. */
  email?: string;
}

/**
 * Join the beta waitlist.
 *
 * Server-side so the browser never talks to the API directly — same shape as
 * every other marketing form here. The API decides everything that matters
 * (dedupe, honeypot, capacity); this only carries the answer back.
 */
const SITE_URL_ERROR = "That website doesn't look right. Try something like acme.com, or leave it blank.";

export async function joinWaitlist(
  _prev: WaitlistState | null,
  formData: FormData,
): Promise<WaitlistState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "That doesn't look like an email address." };
  }

  try {
    const res = await fetch(`${API_URL}/v1/beta/waitlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        name: String(formData.get("name") ?? "").trim() || undefined,
        use_case: String(formData.get("use_case") ?? "").trim() || undefined,
        volume: String(formData.get("volume") ?? "").trim() || undefined,
        // Their real website (optional). `website` below is the honeypot.
        site_url: String(formData.get("site_url") ?? "").trim() || undefined,
        website: String(formData.get("website") ?? "") || undefined,
      }),
      cache: "no-store",
    });
    if (res.status === 422 && (await res.text().catch(() => "")).includes("site_url")) {
      return { error: SITE_URL_ERROR };
    }
    if (!res.ok) {
      // Never surface the API's internals to a stranger on a public page.
      return { error: "We couldn't add you just now. Try again in a moment?" };
    }
    return { ok: true, email };
  } catch {
    return { error: "We couldn't reach the signup service. Try again in a moment?" };
  }
}

const TOO_MANY = "Too many requests right now. Try again in a bit.";

export interface ResendState {
  /** The API's neutral answer. Same for every address, on the list or not. */
  message?: string;
  error?: string;
}

/**
 * Ask for a new Amazon confirmation link (the old one lasts 24 hours).
 *
 * Whatever the API decides, it answers with one neutral message, and this
 * passes it through unchanged — the page must not be able to tell a visitor
 * whether someone else's address is on the list.
 */
export async function resendConfirmation(
  _prev: ResendState | null,
  formData: FormData,
): Promise<ResendState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "That doesn't look like an email address." };
  }
  const visitor = clientAddress(await headers());
  if (!takeResend(visitor)) return { error: TOO_MANY };

  // The API sees every call from here as one IP. Tell it who the visitor is,
  // with the internal secret as proof that it is us saying so; without the
  // secret the API ignores the header and falls back to its own view.
  const secret = process.env.INTERNAL_API_SECRET;
  const forward: Record<string, string> = secret
    ? { "x-rootmail-internal": secret, "x-rootmail-client-ip": visitor }
    : {};

  try {
    const res = await fetch(`${API_URL}/v1/beta/waitlist/resend-confirmation`, {
      method: "POST",
      headers: { "content-type": "application/json", ...forward },
      body: JSON.stringify({ email, website: String(formData.get("website") ?? "") || undefined }),
      cache: "no-store",
    });
    if (res.status === 429) {
      // Only blame the address when the API says the address limit is the one
      // that was hit; any other 429 is about load, not about them.
      const body = (await res.json().catch(() => null)) as { error?: { details?: { scope?: string } } } | null;
      return {
        error:
          body?.error?.details?.scope === "address"
            ? "We've had a few requests for that address already. Try again tomorrow."
            : TOO_MANY,
      };
    }
    if (!res.ok) return { error: "We couldn't send that just now. Try again in a moment?" };
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { message: body.message ?? "If that address is on our waitlist, a confirmation email is on its way." };
  } catch {
    return { error: "We couldn't reach the signup service. Try again in a moment?" };
  }
}
