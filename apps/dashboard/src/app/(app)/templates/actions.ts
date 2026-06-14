"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { TemplateType } from "@/lib/types";

export interface TemplateFormState {
  error?: string;
  saved?: boolean;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

interface Fields {
  name: string;
  slug: string;
  type: TemplateType;
  subject: string;
  html: string;
  text: string;
  blocks: Record<string, unknown> | null;
}

function readFields(formData: FormData): Fields {
  const blocksRaw = String(formData.get("blocks") ?? "").trim();
  let blocks: Record<string, unknown> | null = null;
  if (blocksRaw) {
    try {
      const parsed: unknown = JSON.parse(blocksRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        blocks = parsed as Record<string, unknown>;
      }
    } catch {
      blocks = null;
    }
  }
  return {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
    type: (String(formData.get("type") ?? "transactional") || "transactional") as TemplateType,
    subject: String(formData.get("subject") ?? "").trim(),
    html: String(formData.get("html") ?? ""),
    text: String(formData.get("text") ?? ""),
    blocks,
  };
}

function validate(f: Fields): string | null {
  if (!f.name) return "A name is required.";
  if (!SLUG_RE.test(f.slug)) return "Slug must be lowercase letters, numbers and hyphens.";
  if (!f.subject) return "A subject is required.";
  if (!f.html.trim()) return "An HTML body is required.";
  return null;
}

export async function createTemplate(
  _prev: TemplateFormState | null,
  formData: FormData,
): Promise<TemplateFormState> {
  const f = readFields(formData);
  const invalid = validate(f);
  if (invalid) return { error: invalid };

  let id: string;
  try {
    const t = await api.createTemplate({
      name: f.name,
      slug: f.slug,
      type: f.type,
      subject: f.subject,
      html: f.html,
      text: f.text || undefined,
      blocks: f.blocks,
    });
    id = t.id;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Failed to create the template." };
  }

  revalidatePath("/templates");
  redirect(`/templates/${id}`);
}

export async function updateTemplate(
  _prev: TemplateFormState | null,
  formData: FormData,
): Promise<TemplateFormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing template id." };
  const f = readFields(formData);
  const invalid = validate(f);
  if (invalid) return { error: invalid };

  try {
    await api.updateTemplate(id, {
      name: f.name,
      slug: f.slug,
      type: f.type,
      subject: f.subject,
      html: f.html,
      text: f.text || null,
      blocks: f.blocks,
    });
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Failed to save the template." };
  }

  revalidatePath("/templates");
  revalidatePath(`/templates/${id}`);
  return { saved: true };
}

/** Upload an image/file to the API and return its public URL (for the editor). */
export async function uploadAssetAction(
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };
  try {
    const r = await api.uploadAsset(file);
    return { url: r.url };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Upload failed." };
  }
}

/** Draft a template from a prompt via the AI endpoint (Claude or mock). */
export async function aiDraftAction(
  prompt: string,
): Promise<{ subject?: string; blocks?: Record<string, unknown>; error?: string }> {
  const p = prompt.trim();
  if (!p) return { error: "Describe the email you'd like." };
  try {
    const r = await api.aiDraft(p);
    return { subject: r.subject, blocks: r.blocks };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "AI draft failed." };
  }
}

export async function deleteTemplate(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await api.deleteTemplate(id);
  } catch {
    // Best-effort; the list reflects the current state.
  }
  revalidatePath("/templates");
  redirect("/templates");
}
