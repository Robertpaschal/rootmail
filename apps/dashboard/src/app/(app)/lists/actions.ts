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

/**
 * Save (or clear) an audience's rule.
 *
 * `null` turns a rule audience back into an ordinary one — the members it had
 * were never stored, so this is a genuine change of kind, not a deletion of
 * anybody. The API compiles the rule before storing it, so an invalid rule
 * comes back here as a message rather than being discovered at send time.
 */
export async function saveAudienceRule(
  listId: string,
  filter: Record<string, unknown> | null,
): Promise<{ ok?: boolean; error?: string; size?: number; describes?: string | null }> {
  try {
    const updated = await api.updateList(listId, { filter } as never);
    revalidatePath(`/lists/${listId}`);
    revalidatePath("/contacts");
    return {
      ok: true,
      size: (updated as { contacts?: number }).contacts,
      describes: (updated as { describes?: string | null }).describes ?? null,
    };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Couldn't save the rule." };
  }
}

/**
 * How many people a rule would reach, WITHOUT saving it.
 *
 * The whole point of a rule you can't see the result of is that you don't trust
 * it. Counting before saving is what makes "everyone on Free who never
 * onboarded" a decision rather than a guess — and it is the guard against the
 * silent-zero trap, where a rule that matches nobody looks identical to a rule
 * that works until the campaign goes out to an empty audience.
 */
export async function previewAudienceRule(
  filter: Record<string, unknown>,
): Promise<{ size?: number; error?: string }> {
  try {
    const res = await api.previewSegment(filter);
    return { size: res.size };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Couldn't preview that rule." };
  }
}
