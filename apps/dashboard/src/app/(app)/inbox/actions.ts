"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export interface ReplyState {
  error?: string;
  sent?: boolean;
}

export async function reply(_prev: ReplyState | null, formData: FormData): Promise<ReplyState> {
  const id = String(formData.get("thread_id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!id) return { error: "Missing thread." };
  if (!text) return { error: "Write a reply first." };

  try {
    await api.replyThread(id, { text });
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Failed to send the reply." };
  }
  revalidatePath(`/inbox/${id}`);
  revalidatePath("/inbox");
  return { sent: true };
}

export async function simulateReply(formData: FormData): Promise<void> {
  const id = String(formData.get("thread_id") ?? "");
  if (!id) return;
  try {
    await api.simulateReply(id, {});
  } catch {
    // Best-effort demo helper.
  }
  revalidatePath(`/inbox/${id}`);
  revalidatePath("/inbox");
}
