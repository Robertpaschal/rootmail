"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export type SenderState = { ok?: boolean; error?: string };

/** Save the org's CAN-SPAM postal address (blank clears it). billing.manage. */
export async function updateSenderAddress(
  _prev: SenderState,
  formData: FormData,
): Promise<SenderState> {
  const raw = String(formData.get("postal_address") ?? "").trim();
  if (raw.length > 500) return { error: "Keep the address under 500 characters." };
  try {
    await api.updateOrganization({ postal_address: raw || null });
    revalidatePath("/settings/sender");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return { error: "Only owners and billing managers can change the sender address." };
    }
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't save the address. Please try again." };
  }
}
