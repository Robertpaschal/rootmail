"use server";

import { adminApi, ApiError } from "@/lib/admin-api";

export type AnnouncementState = { ok?: boolean; error?: string; sent?: number };

/** Broadcast a product/service announcement to every account owner. Superadmin. */
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
    return { ok: true, sent: res.sent };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "Superadmins only." };
    if (err instanceof ApiError) return { error: err.message || "Couldn't send the announcement." };
    return { error: "Couldn't send the announcement." };
  }
}
