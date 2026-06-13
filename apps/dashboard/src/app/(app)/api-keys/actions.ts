"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export interface CreateKeyState {
  error?: string;
  /** The full secret — returned once so the form can reveal it. */
  secret?: string;
  name?: string;
}

export async function createApiKey(
  _prev: CreateKeyState | null,
  formData: FormData,
): Promise<CreateKeyState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the key a name so you can recognise it later." };

  try {
    const created = await api.createApiKey({ name });
    revalidatePath("/api-keys");
    return { secret: created.key, name: created.name };
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Failed to create the API key." };
  }
}

export async function revokeApiKey(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await api.revokeApiKey(id);
  } catch {
    // Best-effort; the list re-renders to reflect whatever the current state is.
  }
  revalidatePath("/api-keys");
}
