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
  /** True when the send was blocked by the AI-credit gate (402) — UI shows an upgrade CTA. */
  upgrade?: boolean;
}

function toError(err: unknown): string {
  if (err instanceof ApiError || err instanceof ConnectionError) return err.message;
  return "The assistant is unavailable right now.";
}

/** A caught 402 from the assistant endpoint is the AI-credit gate (out of credits). */
function isUpgrade(err: unknown): boolean {
  return err instanceof ApiError && err.status === 402;
}

/** Refresh views the assistant may have mutated (sequences/lists/campaigns). */
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
    return { error: toError(err), upgrade: isUpgrade(err) };
  }
}

/** Current AI-credit balance — for the launcher/meter to nudge proactively. */
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

/** Post a message into a chat; returns the assistant's reply (already persisted). */
export async function sendChatMessage(id: string, prompt: string): Promise<AssistantReply> {
  const p = prompt.trim();
  if (!p) return { error: "Type a request first." };
  try {
    const r = await api.sendAssistantMessage(id, p);
    revalidateAssistantSideEffects();
    return { reply: r.reply, actions: r.actions, credits: r.credits, title: r.chat?.title };
  } catch (err) {
    return { error: toError(err), upgrade: isUpgrade(err) };
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
    return { chat };
  } catch (err) {
    return { error: toError(err) };
  }
}

export type { AssistantChat, AssistantChatDetail, AssistantChatMessage };
