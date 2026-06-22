"use server";

import { ApiError, api } from "@/lib/rootmail";
import type { ImportResult } from "@/lib/types";

export async function importSuppressions(
  entries: { email: string; reason?: string }[],
  source?: string,
): Promise<{ result?: ImportResult; error?: string }> {
  try {
    return { result: await api.importSuppressions({ entries, source }) };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "Import failed. Please try again." };
  }
}

export async function importContacts(
  entries: { email: string; name?: string; tags?: string[] }[],
  listId?: string,
): Promise<{ result?: ImportResult; error?: string }> {
  try {
    return { result: await api.importContacts({ entries, list_id: listId || undefined }) };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "Import failed. Please try again." };
  }
}
