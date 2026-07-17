"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { ImportResult } from "@/lib/types";

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

/** Import contacts from the Add-people panel; optionally straight into an
 * audience (an existing one, or a brand-new one named on the spot). */
export async function importContactsAction(
  entries: { email: string; name?: string }[],
  opts: { listId?: string; newAudienceName?: string },
): Promise<{ result?: ImportResult; error?: string; listId?: string }> {
  if (entries.length === 0) return { error: "No email addresses to import." };
  let listId = opts.listId || undefined;
  try {
    if (!listId && opts.newAudienceName?.trim()) {
      const l = await api.createList({ name: opts.newAudienceName.trim() });
      listId = l.id;
    }
    const result = await api.importContacts({ entries, list_id: listId });
    revalidatePath("/contacts");
    if (listId) revalidatePath(`/lists/${listId}`);
    return { result, listId };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Import failed. Please try again." };
  }
}

export interface AudienceFormState {
  error?: string;
}

/** Create an audience — empty, or seeded from everyone carrying a tag. */
export async function createAudienceAction(
  _prev: AudienceFormState | null,
  formData: FormData,
): Promise<AudienceFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const fromTag = String(formData.get("from_tag") ?? "").trim();
  if (!name) return { error: "Give the audience a name." };

  let id: string;
  try {
    const l = await api.createList({
      name,
      description: description || undefined,
      from_tag: fromTag || undefined,
    });
    id = l.id;
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Failed to create the audience." };
  }
  revalidatePath("/contacts");
  revalidatePath("/lists");
  redirect(`/lists/${id}`);
}

/** One click: turn the currently-filtered tag subset into an audience. On
 * failure (e.g. the plan's audience quota) the message travels back as a
 * `notice` param so the page can say exactly what happened. */
export async function audienceFromTagAction(formData: FormData): Promise<void> {
  const tag = String(formData.get("tag") ?? "").trim();
  if (!tag) return;
  let dest: string;
  try {
    const l = await api.createList({ name: tag, from_tag: tag });
    dest = `/lists/${l.id}`;
  } catch (err) {
    const msg =
      err instanceof ApiError || err instanceof ConnectionError ? err.message : "Couldn't create the audience.";
    const link =
      err instanceof ApiError && typeof (err.details as { upgrade_url?: string } | undefined)?.upgrade_url === "string"
        ? (err.details as { upgrade_url: string }).upgrade_url
        : "";
    const usp = new URLSearchParams({ tag, notice: msg });
    if (link) usp.set("notice_link", link);
    dest = `/contacts?${usp.toString()}`;
  }
  revalidatePath("/contacts");
  revalidatePath("/lists");
  redirect(dest);
}
