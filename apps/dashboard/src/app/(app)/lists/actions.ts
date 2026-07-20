"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/rootmail";

// Audience creation lives in the hub (contacts/actions.ts createAudienceAction);
// these are the membership + lifecycle actions shared by the hub and /lists/[id].

/** Save an audience's public-signup settings (the Grow panel). */
export async function saveSignupSettings(
  listId: string,
  body: { signup_enabled?: boolean; double_opt_in?: boolean; signup_tag?: string | null; signup_redirect_url?: string | null },
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await api.updateList(listId, body);
    revalidatePath(`/lists/${listId}`);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save signup settings." };
  }
}

export async function deleteList(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await api.deleteList(id);
  } catch {
    /* best-effort */
  }
  revalidatePath("/lists");
  revalidatePath("/contacts");
}

export async function addContact(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!id || !email) return;
  try {
    await api.addListContact(id, email);
  } catch {
    /* best-effort */
  }
  revalidatePath(`/lists/${id}`);
}

export async function removeContact(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const contactId = String(formData.get("contact_id") ?? "");
  if (!id || !contactId) return;
  try {
    await api.removeListContact(id, contactId);
  } catch {
    /* best-effort */
  }
  revalidatePath(`/lists/${id}`);
}
