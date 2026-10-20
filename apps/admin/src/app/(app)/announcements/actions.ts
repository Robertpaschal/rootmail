"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";

export type AnnouncementState = { ok?: boolean; error?: string; sent?: number; id?: string };

/** Broadcast a product/service announcement to every account owner. Superadmin.
 * Returns the archived announcement's id so the composer can land on its record. */
export async function sendAnnouncement(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject) return { error: "Enter a subject." };
  if (!body) return { error: "Write a message." };
  try {
    const res = await adminApi.sendAnnouncement({ subject, body });
    revalidatePath("/announcements");
    return { ok: true, sent: res.sent, id: res.id };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "Superadmins only." };
    if (err instanceof ApiError) return { error: err.message || "Couldn't send the announcement." };
    return { error: "Couldn't send the announcement." };
  }
}

export type PreviewState = { ok?: boolean; error?: string; to?: string; usedToday?: number; cap?: number };

/** Send ONE preview of a marketing-class system email to the signed-in staffer only. */
export async function sendSystemMailPreview(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const kind = formData.get("kind") === "win_back" ? "win_back" : "announcement";
  try {
    const res = await adminApi.sendSystemMailPreview(kind);
    return { ok: true, to: res.to, usedToday: res.used_today, cap: res.daily_cap };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "Your staff role doesn't allow this." };
    if (err instanceof ApiError) return { error: err.message || "Couldn't send the preview." };
    return { error: "Couldn't send the preview." };
  }
}
