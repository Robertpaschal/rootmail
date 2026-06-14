"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/rootmail";

export async function changePlan(formData: FormData): Promise<void> {
  const plan = String(formData.get("plan") ?? "");
  if (!plan) return;

  let checkoutUrl: string | null = null;
  try {
    const res = await api.checkout(plan);
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
