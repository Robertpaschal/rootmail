"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/rootmail";

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
