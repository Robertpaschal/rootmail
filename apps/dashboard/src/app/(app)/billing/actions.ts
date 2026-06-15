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
