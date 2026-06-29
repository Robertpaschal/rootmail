"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";
import type { ChangeItem, CmsStatus, PostCategory } from "@/lib/types";

export type CmsState = { ok?: boolean; error?: string };

function fail(err: unknown, fallback: string): CmsState {
  if (err instanceof ApiError && err.status === 403) {
    return { error: "You need the content.publish permission." };
  }
  if (err instanceof ApiError) return { error: err.message || fallback };
  return { error: fallback };
}

// ---- Blog ----------------------------------------------------------------
export async function saveBlogPost(_prev: CmsState, formData: FormData): Promise<CmsState> {
  const id = String(formData.get("id") ?? "").trim();
  const input = {
    slug: String(formData.get("slug") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    category: String(formData.get("category") ?? "Company") as PostCategory,
    author: String(formData.get("author") ?? "").trim() || "rootmail",
    body: String(formData.get("body") ?? ""),
    external_url: String(formData.get("external_url") ?? "").trim() || null,
    source: String(formData.get("source") ?? "").trim() || null,
    status: String(formData.get("status") ?? "draft") as CmsStatus,
  };
  if (!input.slug || !input.title) return { error: "Slug and title are required." };
  try {
    if (id) await adminApi.updateBlogPost(id, input);
    else await adminApi.createBlogPost(input);
    revalidatePath("/content");
    return { ok: true };
  } catch (err) {
    return fail(err, "Couldn't save the post.");
  }
}

export async function deleteBlogPost(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await adminApi.deleteBlogPost(id).catch(() => undefined);
  revalidatePath("/content");
}

// ---- Changelog -----------------------------------------------------------
export async function saveChangelogEntry(_prev: CmsState, formData: FormData): Promise<CmsState> {
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const status = String(formData.get("status") ?? "draft") as CmsStatus;
  // Changes arrive as parallel kind[]/text[] inputs; zip them, dropping empty rows.
  const kinds = formData.getAll("change_kind").map(String);
  const texts = formData.getAll("change_text").map(String);
  const changes: ChangeItem[] = [];
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]?.trim();
    if (text) changes.push({ kind: (kinds[i] as ChangeItem["kind"]) ?? "New", text });
  }
  if (!title) return { error: "A title is required." };
  if (changes.length === 0) return { error: "Add at least one change." };
  try {
    const input = { title, changes, status, ...(date ? { date } : {}) };
    if (id) await adminApi.updateChangelog(id, input);
    else await adminApi.createChangelog(input);
    revalidatePath("/content");
    return { ok: true };
  } catch (err) {
    return fail(err, "Couldn't save the entry.");
  }
}

export async function deleteChangelogEntry(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await adminApi.deleteChangelog(id).catch(() => undefined);
  revalidatePath("/content");
}
