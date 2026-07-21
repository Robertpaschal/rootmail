"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { ContactNote } from "@/lib/types";

type Result = { ok?: boolean; error?: string };

function msg(err: unknown, fallback: string): Result {
  if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
  return { error: fallback };
}

export async function updateContactAction(
  id: string,
  body: {
    name?: string | null;
    phone?: string | null;
    tags?: string[];
    metadata?: Record<string, unknown>;
    status?: "active" | "unsubscribed";
    stage?: "subscriber" | "engaged" | "customer" | "champion" | "at_risk";
  },
): Promise<Result> {
  try {
    await api.updateContact(id, body);
    revalidatePath(`/contacts/${id}`);
    revalidatePath("/contacts");
    return { ok: true };
  } catch (err) {
    return msg(err, "Couldn't save the contact.");
  }
}

export async function deleteContactAction(id: string): Promise<Result> {
  try {
    await api.deleteContact(id);
  } catch (err) {
    return msg(err, "Couldn't delete the contact.");
  }
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function addNoteAction(id: string, body: string): Promise<Result & { note?: ContactNote }> {
  try {
    const note = await api.addContactNote(id, body);
    revalidatePath(`/contacts/${id}`);
    return { ok: true, note };
  } catch (err) {
    return msg(err, "Couldn't add the note.");
  }
}

export async function deleteNoteAction(id: string, noteId: string): Promise<Result> {
  try {
    await api.deleteContactNote(id, noteId);
    revalidatePath(`/contacts/${id}`);
    return { ok: true };
  } catch (err) {
    return msg(err, "Couldn't remove the note.");
  }
}

export async function addToAudienceAction(contactId: string, listId: string): Promise<Result> {
  try {
    await api.addListContactById(listId, contactId);
    revalidatePath(`/contacts/${contactId}`);
    return { ok: true };
  } catch (err) {
    return msg(err, "Couldn't add to that audience.");
  }
}

export async function removeFromAudienceAction(contactId: string, listId: string): Promise<Result> {
  try {
    await api.removeListContact(listId, contactId);
    revalidatePath(`/contacts/${contactId}`);
    return { ok: true };
  } catch (err) {
    return msg(err, "Couldn't remove from that audience.");
  }
}
