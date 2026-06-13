"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export interface CreateState {
  error?: string;
}

export async function createSubTenant(
  _prev: CreateState | null,
  formData: FormData,
): Promise<CreateState> {
  const name = String(formData.get("name") ?? "").trim();
  const sending_domain = String(formData.get("sending_domain") ?? "")
    .trim()
    .toLowerCase();
  const external_id = String(formData.get("external_id") ?? "").trim();

  if (!name) return { error: "A name is required." };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(sending_domain)) {
    return { error: "Enter a valid domain like sunsetvillas.com." };
  }

  let id: string;
  try {
    const st = await api.createSubTenant({
      name,
      sending_domain,
      external_id: external_id || undefined,
    });
    id = st.id;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Failed to create the sub-tenant." };
  }

  revalidatePath("/sub-tenants");
  redirect(`/sub-tenants/${id}`);
}

export async function verifySubTenant(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await api.verifySubTenant(id);
  } catch {
    // ignore; the page reflects whatever the current state is
  }
  revalidatePath(`/sub-tenants/${id}`);
  revalidatePath("/sub-tenants");
}
