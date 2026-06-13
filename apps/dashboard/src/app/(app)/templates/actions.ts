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
}

function readFields(formData: FormData): Fields {
  return {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
    type: (String(formData.get("type") ?? "transactional") || "transactional") as TemplateType,
    subject: String(formData.get("subject") ?? "").trim(),
    html: String(formData.get("html") ?? ""),
    text: String(formData.get("text") ?? ""),
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
    });
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Failed to save the template." };
  }

  revalidatePath("/templates");
  revalidatePath(`/templates/${id}`);
  return { saved: true };
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
