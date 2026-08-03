"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { AssistantChat, AssistantChatDetail, AssistantChatMessage } from "@/lib/types";

function toError(err: unknown): string {
  if (err instanceof ApiError || err instanceof ConnectionError) return err.message;
  return "The assistant is unavailable right now.";
}

/**
 * Refresh the views the assistant may have changed underneath you.
 *
 * This used to run inside `sendChatMessage`. Streaming moved the end of a run
 * into the browser, so there is no server action left to hang it on — the client
 * calls this once a run finishes having actually built or sent something.
 * Without it the assistant creates a campaign and /campaigns keeps showing the
 * cached list until a hard reload.
 */
/*
 * NOTE: none of these revalidate "/assistant" itself.
 *
 * They used to, and it quietly destroyed the thing it was meant to keep fresh:
 * revalidating the page you are ON re-renders the server tree and resets the
 * chat component's state, so the transcript you were reading vanished. Worst on
 * the FIRST message of a new chat — createChat revalidated, and the answer that
 * was still streaming in landed in a component that had just been wiped. The
 * run completed and persisted server-side; you simply never saw it.
 *
 * The client already keeps its own rail up to date optimistically, so there was
 * nothing to gain either. Side-effect pages (sequences/lists/campaigns) still
 * get revalidated below — those the assistant really can change underneath you.
 */
export async function revalidateAssistantSideEffects(): Promise<void> {
  revalidatePath("/sequences");
  revalidatePath("/lists");
  revalidatePath("/campaigns");
}
export async function getAiCredits(): Promise<{
  used: number;
  allowance: number;
  remaining: number;
} | null> {
  try {
    const c = await api.assistantCredits();
    return { used: c.used, allowance: c.allowance, remaining: c.remaining };
  } catch {
    return null;
  }
}

export async function listChats(): Promise<{ chats?: AssistantChat[]; error?: string }> {
  try {
    const r = await api.listAssistantChats();
    return { chats: r.data };
  } catch (err) {
    return { error: toError(err) };
  }
}

export async function loadChat(
  id: string,
): Promise<{ chat?: AssistantChatDetail; error?: string }> {
  try {
    return { chat: await api.getAssistantChat(id) };
  } catch (err) {
    return { error: toError(err) };
  }
}

export async function createChat(
  title?: string,
): Promise<{ chat?: AssistantChat; error?: string }> {
  try {
    const chat = await api.createAssistantChat(title);
    return { chat };
  } catch (err) {
    return { error: toError(err) };
  }
}

export async function deleteChat(id: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    await api.deleteAssistantChat(id);
    return { ok: true };
  } catch (err) {
    return { error: toError(err) };
  }
}
export async function renameChat(
  id: string,
  title: string,
): Promise<{ chat?: AssistantChat; error?: string }> {
  const t = title.trim();
  if (!t) return { error: "Enter a title." };
  try {
    const chat = await api.renameAssistantChat(id, t);
    return { chat };
  } catch (err) {
    return { error: toError(err) };
  }
}

export type { AssistantChat, AssistantChatDetail, AssistantChatMessage };
