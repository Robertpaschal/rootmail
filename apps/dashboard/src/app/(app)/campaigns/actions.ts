"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { CampaignVariant, ListTag } from "@/lib/types";

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
  const subject = String(formData.get("subject") ?? "").trim();
  const segmentTag = String(formData.get("segment_tag") ?? "").trim();
  if (!name) return { error: "A name is required." };
  if (!listId) return { error: "Pick an audience." };
  if (!templateId) return { error: "Pick a template for the message." };

  // A/B variants arrive as a JSON blob assembled by the composer.
  let variants: CampaignVariant[] = [];
  const rawVariants = String(formData.get("variants") ?? "").trim();
  if (rawVariants) {
    try {
      const parsed: unknown = JSON.parse(rawVariants);
      if (Array.isArray(parsed)) {
        variants = parsed
          .filter((v): v is CampaignVariant => !!v && typeof v === "object" && !!(v as CampaignVariant).tag && !!(v as CampaignVariant).template_id)
          .slice(0, 4);
      }
    } catch {
      return { error: "The A/B variants didn't parse — remove and re-add them." };
    }
  }

  let id: string;
  try {
    const c = await api.createCampaign({
      name,
      list_id: listId,
      template_id: templateId,
      subject: subject || undefined,
      segment_tag: segmentTag || undefined,
      variants: variants.length > 0 ? variants : undefined,
    });
    id = c.id;
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Failed to create the campaign." };
  }
  revalidatePath("/campaigns");
  redirect(`/campaigns/${id}`);
}

/** Tags carried by an audience's members — feeds the segment + A/B pickers. */
export async function listTagsAction(listId: string): Promise<{ tags?: ListTag[]; error?: string }> {
  if (!listId) return { tags: [] };
  try {
    const r = await api.listTags(listId);
    return { tags: r.data };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't load the audience's tags." };
  }
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
  revalidatePath(`/campaigns/${id}`); // the detail page shows status + funnel too
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
  // Callable from the detail page of the campaign being deleted — always land on
  // the list so nobody is stranded on a dead URL. (From the list it's a no-op hop.)
  redirect("/campaigns");
}
