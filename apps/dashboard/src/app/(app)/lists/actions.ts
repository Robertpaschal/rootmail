"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export interface ListFormState {
  error?: string;
  ok?: boolean;
}

export async function createList(_prev: ListFormState | null, formData: FormData): Promise<ListFormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A name is required." };
  try {
    await api.createList({ name });
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Failed to create the list." };
  }
  revalidatePath("/lists");
  return { ok: true };
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
