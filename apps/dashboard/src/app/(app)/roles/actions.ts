"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export interface RoleFormState {
  error?: string;
  ok?: boolean;
}

export async function createRole(_prev: RoleFormState | null, formData: FormData): Promise<RoleFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const permissions = formData.getAll("permissions").map(String).filter(Boolean);
  if (!name) return { error: "A name is required." };
  if (permissions.length === 0) return { error: "Pick at least one permission." };
  try {
    await api.createRole({ name, permissions });
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Failed to create the role." };
  }
  revalidatePath("/members");
  return { ok: true };
}

export async function deleteRole(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await api.deleteRole(id);
  } catch {
    /* best-effort */
  }
  revalidatePath("/members");
}
