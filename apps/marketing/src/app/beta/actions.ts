"use server";

const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

export interface WaitlistState {
  ok?: boolean;
  error?: string;
}

/**
 * Join the beta waitlist.
 *
 * Server-side so the browser never talks to the API directly — same shape as
 * every other marketing form here. The API decides everything that matters
 * (dedupe, honeypot, capacity); this only carries the answer back.
 */
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
        website: String(formData.get("website") ?? "") || undefined,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      // Never surface the API's internals to a stranger on a public page.
      return { error: "We couldn't add you just now. Try again in a moment?" };
    }
    return { ok: true };
  } catch {
    return { error: "We couldn't reach the signup service. Try again in a moment?" };
  }
}
