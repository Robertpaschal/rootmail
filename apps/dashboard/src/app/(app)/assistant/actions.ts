"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { AssistantChat, AssistantChatDetail, AssistantChatMessage } from "@/lib/types";

export interface AssistantReply {
  reply?: string;
  actions?: { tool: string; status: number }[];
  credits?: { used: number; allowance: number };
  /** The chat's current title (auto-set from content on the first message). */
  title?: string;
  error?: string;
}

function toError(err: unknown): string {
  if (err instanceof ApiError || err instanceof ConnectionError) return err.message;
  return "The assistant is unavailable right now.";
}

/** Refresh views the assistant may have mutated (sequences/lists/campaigns). */
function revalidateAssistantSideEffects(): void {
  revalidatePath("/sequences");
  revalidatePath("/lists");
  revalidatePath("/campaigns");
}

/** Single-shot (no chat) — kept for callers that don't persist a conversation. */
export async function askAssistant(prompt: string): Promise<AssistantReply> {
  const p = prompt.trim();
  if (!p) return { error: "Type a request first." };
  try {
    const r = await api.assistant(p);
    revalidateAssistantSideEffects();
    return { reply: r.reply, actions: r.actions, credits: r.credits };
  } catch (err) {
    return { error: toError(err) };
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
    revalidatePath("/assistant");
    return { chat };
  } catch (err) {
    return { error: toError(err) };
  }
}

export async function deleteChat(id: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    await api.deleteAssistantChat(id);
    revalidatePath("/assistant");
    return { ok: true };
  } catch (err) {
    return { error: toError(err) };
  }
}

/** Post a message into a chat; returns the assistant's reply (already persisted). */
export async function sendChatMessage(id: string, prompt: string): Promise<AssistantReply> {
  const p = prompt.trim();
  if (!p) return { error: "Type a request first." };
  try {
    const r = await api.sendAssistantMessage(id, p);
    revalidateAssistantSideEffects();
    revalidatePath("/assistant");
    return { reply: r.reply, actions: r.actions, credits: r.credits, title: r.chat?.title };
  } catch (err) {
    return { error: toError(err) };
  }
}

/** Rename a chat. Returns the updated chat so the rail can reflect it. */
export async function renameChat(
  id: string,
  title: string,
): Promise<{ chat?: AssistantChat; error?: string }> {
  const t = title.trim();
  if (!t) return { error: "Enter a title." };
  try {
    const chat = await api.renameAssistantChat(id, t);
    revalidatePath("/assistant");
    return { chat };
  } catch (err) {
    return { error: toError(err) };
  }
}

export type { AssistantChat, AssistantChatDetail, AssistantChatMessage };
