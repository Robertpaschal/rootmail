"use server";

import { revalidatePath } from "next/cache";
import { ApiError, api } from "@/lib/rootmail";
import type { ImportResult } from "@/lib/types";

/** Bring a previous provider's suppression list over — deliverability hygiene,
 * so it lives on the Deliverability page (not the Audience hub). */
export async function importSuppressionsAction(
  entries: { email: string; reason?: string }[],
): Promise<{ result?: ImportResult; error?: string }> {
  if (entries.length === 0) return { error: "No email addresses to import." };
  try {
    const result = await api.importSuppressions({ entries, source: "import" });
    revalidatePath("/deliverability");
    return { result };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "Import failed. Please try again." };
  }
}
