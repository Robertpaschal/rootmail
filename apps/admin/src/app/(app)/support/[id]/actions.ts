"use server";

import { revalidatePath } from "next/cache";
import { adminApi, ApiError } from "@/lib/admin-api";
import type { SupportTicketStatus } from "@/lib/types";

export type ReplyState = { ok?: boolean; error?: string };

export async function replyTicket(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return { error: "Write a reply first." };
  try {
    await adminApi.replySupportTicket(id, body);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { error: "You need the support.manage permission." };
    return { error: err instanceof ApiError ? err.message : "Couldn't send the reply." };
  }
  revalidatePath(`/support/${id}`);
  revalidatePath("/support");
  return { ok: true };
}

export async function setTicketStatus(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as SupportTicketStatus;
  if (!id || (status !== "open" && status !== "closed")) return;
  await adminApi.setSupportStatus(id, status).catch(() => undefined);
  revalidatePath(`/support/${id}`);
  revalidatePath("/support");
}
