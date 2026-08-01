"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/app/action-form";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

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

export async function deleteList(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id." };
  try {
    await api.deleteList(id);
  } catch (err) {
    return {
      error:
        err instanceof ConnectionError || err instanceof ApiError
          ? err.message
          : "That didn't work. Try again.",
    };
  }
  revalidatePath("/lists");
  revalidatePath("/contacts");
  return {};
}

export async function addContact(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!id || !email) return { error: "An audience and an email address are both required." };
  try {
    await api.addListContact(id, email);
  } catch (err) {
    return {
      error:
        err instanceof ConnectionError || err instanceof ApiError
          ? err.message
          : "That didn't work. Try again.",
    };
  }
  revalidatePath(`/lists/${id}`);
  return {};
}

export async function removeContact(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const contactId = String(formData.get("contact_id") ?? "");
  if (!id || !contactId) return { error: "Missing the audience or the contact." };
  try {
    await api.removeListContact(id, contactId);
  } catch (err) {
    return {
      error:
        err instanceof ConnectionError || err instanceof ApiError
          ? err.message
          : "That didn't work. Try again.",
    };
  }
  revalidatePath(`/lists/${id}`);
  return {};
}
