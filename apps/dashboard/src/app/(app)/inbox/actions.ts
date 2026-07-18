"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Thread } from "@/lib/types";

/** Load one conversation (with its messages) for the right-hand pane. */
export async function loadConversation(id: string): Promise<Thread | null> {
  if (!id) return null;
  try {
    return await api.getThread(id);
  } catch {
    return null;
  }
}

/** Send a reply into a conversation, then return the refreshed thread so the pane
 * updates in place (no full navigation). */
export async function sendReply(id: string, text: string): Promise<{ thread?: Thread; error?: string }> {
  if (!id) return { error: "Missing conversation." };
  if (!text.trim()) return { error: "Write a reply first." };
  try {
    await api.replyThread(id, { text: text.trim() });
    const thread = await api.getThread(id);
    revalidatePath("/inbox");
    return { thread };
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Failed to send the reply." };
  }
}

/** Testing helper: drop a simulated inbound reply into a conversation so the owner
 * can see the round-trip without waiting for a real email. */
export async function simulateInbound(id: string): Promise<{ thread?: Thread; error?: string }> {
  if (!id) return { error: "Missing conversation." };
  try {
    await api.simulateReply(id, {});
    const thread = await api.getThread(id);
    revalidatePath("/inbox");
    return { thread };
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) return { error: err.message };
    return { error: "Couldn't simulate a reply." };
  }
}
