"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { CheckoutPayload, EmbeddedCheckoutResponse } from "@/lib/types";

export type StartCheckoutState =
  | { ok: true; available: true; client_secret: string; publishable_key: string }
  | { ok: true; available: false; mode?: "assigned" | "updated" } // applied without a fresh checkout
  | { ok: false; error: string };

/** Start an in-app (embedded) checkout for a wing tier or an add-on set. */
export async function startEmbeddedCheckout(payload: CheckoutPayload): Promise<StartCheckoutState> {
  try {
    const res: EmbeddedCheckoutResponse = await api.embeddedCheckout(payload);
    if (res.available && res.client_secret && res.publishable_key) {
      return { ok: true, available: true, client_secret: res.client_secret, publishable_key: res.publishable_key };
    }
    // Applied directly (free tier / local mode / prorated add-on change) — refresh.
    revalidatePath("/billing");
    revalidatePath("/billing/transactional");
    revalidatePath("/billing/marketing");
    revalidatePath("/billing/platform");
    return { ok: true, available: false, mode: res.mode };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { ok: false, error: err.message };
    return { ok: false, error: "Couldn't start checkout. Please try again." };
  }
}

/** Revalidate billing surfaces after a checkout completes (webhook applies async). */
export async function refreshBilling(): Promise<void> {
  revalidatePath("/billing");
  revalidatePath("/billing/transactional");
  revalidatePath("/billing/marketing");
  revalidatePath("/billing/platform");
  revalidatePath("/");
}
