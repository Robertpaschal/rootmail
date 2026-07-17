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

// --- Own from-addresses (SES identity verification) --------------------------

export async function addSenderAction(_prev: SenderState, formData: FormData): Promise<SenderState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  try {
    await api.addSender({ email, display_name: displayName || undefined });
    revalidatePath("/settings/sender");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't add that address." };
  }
}

export async function checkSenderAction(id: string): Promise<{ status?: string; error?: string }> {
  try {
    const res = await api.checkSender(id);
    revalidatePath("/settings/sender");
    return { status: res.status };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't check verification." };
  }
}

export async function setDefaultSenderAction(id: string): Promise<{ error?: string }> {
  try {
    await api.setDefaultSender(id);
    revalidatePath("/settings/sender");
    return {};
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't set the default sender." };
  }
}

export async function deleteSenderAction(id: string): Promise<{ error?: string }> {
  try {
    await api.deleteSender(id);
    revalidatePath("/settings/sender");
    return {};
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't remove that address." };
  }
}
