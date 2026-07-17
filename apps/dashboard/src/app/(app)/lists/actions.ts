"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/rootmail";

// Audience creation lives in the hub (contacts/actions.ts createAudienceAction);
// these are the membership + lifecycle actions shared by the hub and /lists/[id].

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
