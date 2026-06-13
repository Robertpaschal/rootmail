"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export interface UpsertState {
  error?: string;
}

export async function upsertContact(
  _prev: UpsertState | null,
  formData: FormData,
): Promise<UpsertState> {
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!email) return { error: "Email is required." };

  try {
    await api.upsertContact({
      email,
      name: name || undefined,
      phone: phone || undefined,
      tags: tags.length ? tags : undefined,
    });
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Failed to save the contact." };
  }

  revalidatePath("/contacts");
  redirect(`/contacts?email=${encodeURIComponent(email)}`);
}

export async function unsubscribeContact(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  if (!email) return;
  try {
    await api.unsubscribe(email);
  } catch {
    // ignore; the page reflects current state
  }
  revalidatePath("/contacts");
  redirect(`/contacts?email=${encodeURIComponent(email)}`);
}
