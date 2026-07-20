"use server";

const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

export interface SubscribeResult {
  state?: "confirm_sent" | "subscribed" | "waitlisted";
  error?: string;
}

/** Server-side proxy to the public subscribe API (same-origin for the browser,
 * so the hosted page needs no CORS story). */
export async function subscribeAction(listId: string, formData: FormData): Promise<SubscribeResult> {
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const website = String(formData.get("website") ?? ""); // honeypot passthrough
  if (!email) return { error: "Enter your email address." };

  try {
    const res = await fetch(`${API_URL.replace(/\/$/, "")}/v1/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ list_id: listId, email, name: name || undefined, website }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { error: body?.error?.message ?? "Something went wrong — please try again." };
    }
    const body = (await res.json()) as { state: SubscribeResult["state"] };
    return { state: body.state };
  } catch {
    return { error: "Couldn't reach the signup service — please try again." };
  }
}
