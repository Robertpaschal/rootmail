"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export interface ChooseTierState {
  error?: string;
  assigned?: boolean;
}

/** Choose a per-wing tier. Paid + Stripe → redirect to hosted Checkout (the webhook
 * applies it on completion); Free/local → applied immediately; custom → sales. */
export async function chooseWingTier(
  wing: string,
  tierId: string,
  interval: "month" | "year",
): Promise<ChooseTierState> {
  let url: string | null = null;
  try {
    const res = await api.wingCheckout(wing, tierId, interval);
    if (res.mode === "stripe" && res.url) {
      url = res.url; // redirect() throws, so call it outside the try
    } else if (res.mode === "contact_sales") {
      url = "/contact?topic=sales";
    } else {
      // assigned (free tier, or local mode) — entitlements now flow per wing.
      revalidatePath("/billing/wings");
      revalidatePath("/billing");
      return { assigned: true };
    }
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't start the plan change." };
  }
  redirect(url);
}
