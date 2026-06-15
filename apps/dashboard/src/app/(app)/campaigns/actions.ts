"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export interface CampaignFormState {
  error?: string;
  ok?: boolean;
}

export async function createCampaign(
  _prev: CampaignFormState | null,
  formData: FormData,
): Promise<CampaignFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const listId = String(formData.get("list_id") ?? "");
  const templateId = String(formData.get("template_id") ?? "");
  if (!name) return { error: "A name is required." };
  if (!listId || !templateId) return { error: "Pick a list and a template." };
  try {
    await api.createCampaign({ name, list_id: listId, template_id: templateId });
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Failed to create the campaign." };
  }
  revalidatePath("/campaigns");
  return { ok: true };
}

export async function sendCampaign(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await api.sendCampaign(id);
  } catch {
    /* best-effort; the row reflects current status */
  }
  revalidatePath("/campaigns");
}

export async function deleteCampaign(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await api.deleteCampaign(id);
  } catch {
    /* best-effort */
  }
  revalidatePath("/campaigns");
}
