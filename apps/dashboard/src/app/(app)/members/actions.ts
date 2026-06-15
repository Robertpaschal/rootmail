"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export interface InviteState {
  error?: string;
  ok?: string;
}

export async function inviteMember(
  _prev: InviteState | null,
  formData: FormData,
): Promise<InviteState> {
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "member");
  if (!email) return { error: "Enter an email address." };
  try {
    await api.invite(email, role);
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Failed to send the invitation." };
  }
  revalidatePath("/members");
  return { ok: `Invitation sent to ${email}.` };
}

export async function revokeInvite(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await api.revokeInvite(id);
  } catch {
    // Best-effort; the list reflects current state.
  }
  revalidatePath("/members");
}
