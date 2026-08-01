"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Campaign, CampaignAnalytics, CampaignRecipient, CampaignVariant, ListTag } from "@/lib/types";

export interface CampaignFormState {
  error?: string;
  ok?: boolean;
}

/** Enroll a campaign's engaged (or cold) recipients into a follow-up sequence —
 * the campaign→sequence bridge. Returns how many were newly enrolled. */
export async function followUpAction(
  campaignId: string,
  sequenceId: string,
  segment: "clicked" | "opened" | "not_opened" | "all",
): Promise<{ enrolled?: number; matched?: number; error?: string }> {
  if (!sequenceId) return { error: "Pick a sequence to follow up with." };
  try {
    const res = await api.campaignFollowUp(campaignId, { sequence_id: sequenceId, segment });
    revalidatePath(`/campaigns/${campaignId}`);
    return { enrolled: res.enrolled, matched: res.matched };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't start the follow-up." };
  }
}

/** One poll of a campaign's live state — status, funnel, and the recipient rows —
 * for the detail page's real-time refresh while a send is in flight or opens/clicks
 * trickle in. Returns null pieces on transient failure so the UI keeps the last good state. */
export async function refreshCampaign(
  id: string,
  recipientLimit = 100,
): Promise<{ campaign?: Campaign; analytics?: CampaignAnalytics | null; recipients?: CampaignRecipient[]; total?: number }> {
  try {
    const [campaign, analytics, recips] = await Promise.all([
      api.getCampaign(id),
      api.campaignAnalytics(id).catch(() => null),
      api.campaignRecipients(id, { limit: recipientLimit }).catch(() => null),
    ]);
    return { campaign, analytics, recipients: recips?.data, total: recips?.total };
  } catch {
    return {};
  }
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

/**
 * Launch a campaign.
 *
 * This used to swallow every error — `catch { /* best-effort *\/ }` — so a send
 * that the API refused (no verified sender, empty audience, over quota, feature
 * locked) looked identical to one that worked: the page just reloaded and
 * nothing happened, with nothing said. For the single most consequential button
 * in the product, that's the worst possible failure mode. It reports now.
 */
export async function sendCampaign(id: string): Promise<{ error?: string }> {
  if (!id) return { error: "Missing campaign." };
  try {
    await api.sendCampaign(id);
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't start this send." };
  }
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`); // the detail page shows status + funnel too
  return {};
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

/**
 * Change one recipient's copy of a campaign — the thing you do when the
 * pre-flight shows you something you don't like for one person. Their edit wins
 * over the template and over any A/B variant when the campaign goes out.
 */
export async function saveRecipientCopy(input: {
  campaignId: string;
  email: string;
  subject: string;
  html: string;
}): Promise<{ error?: string }> {
  if (!input.subject.trim()) return { error: "A subject is required." };
  if (!input.html.trim()) return { error: "The message can't be empty." };
  try {
    await api.setCampaignOverride(input.campaignId, {
      email: input.email,
      subject: input.subject,
      html: input.html,
    });
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't save this person's copy." };
  }
  revalidatePath(`/campaigns/${input.campaignId}`);
  return {};
}

/** Put a recipient back on the campaign's normal copy. */
export async function resetRecipientCopy(campaignId: string, email: string): Promise<{ error?: string }> {
  try {
    await api.clearCampaignOverride(campaignId, email);
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't reset this person's copy." };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  return {};
}
