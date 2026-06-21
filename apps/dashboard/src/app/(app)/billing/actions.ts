"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/rootmail";

export async function changePlan(formData: FormData): Promise<void> {
  const plan = String(formData.get("plan") ?? "");
  if (!plan) return;
  const interval = String(formData.get("interval") ?? "month") === "year" ? "year" : "month";

  let checkoutUrl: string | null = null;
  try {
    const res = await api.checkout(plan, interval);
    if (res.mode === "stripe" && res.url) checkoutUrl = res.url;
  } catch {
    // Best-effort; the page reflects the current plan.
  }

  // Stripe mode → hand off to hosted Checkout (redirect() must run outside the
  // try/catch since it signals via a thrown control-flow error).
  if (checkoutUrl) redirect(checkoutUrl);

  revalidatePath("/billing");
  revalidatePath("/");
}

export type EmbeddedSessionResult =
  | { clientSecret: string; publishableKey: string }
  | { redirectUrl: string }
  | { error: string };

/**
 * Create an embedded checkout session for the configured plan + add-ons. Falls back
 * to the hosted Checkout URL when embedded isn't available, or an error to show.
 */
export async function createEmbeddedSession(
  plan: string,
  interval: "month" | "year",
  addons: Record<string, number>,
): Promise<EmbeddedSessionResult> {
  try {
    const res = await api.embeddedCheckout(plan, interval, addons);
    if (res.available) {
      return { clientSecret: res.client_secret, publishableKey: res.publishable_key };
    }
    // Embedded unavailable (no publishable key) → hosted redirect / local apply.
    const hosted = await api.checkout(plan, interval);
    if (hosted.mode === "stripe" && hosted.url) return { redirectUrl: hosted.url };
    return { redirectUrl: "/billing?checkout=success" };
  } catch {
    return { error: "Couldn't start checkout. Please try again." };
  }
}

/** Set an add-on quantity (extra seats, dedicated IP, sub-tenant / AI packs). */
export async function setAddon(formData: FormData): Promise<void> {
  const addonId = String(formData.get("addon_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  if (!addonId || Number.isNaN(quantity)) return;
  try {
    await api.setAddon(addonId, Math.max(0, Math.floor(quantity)));
  } catch {
    // Best-effort; the page reflects current state.
  }
  revalidatePath("/billing");
}
