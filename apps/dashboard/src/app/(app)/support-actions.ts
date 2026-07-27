"use server";

import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SupportTicket } from "@/lib/types";

// The HUMAN side of the help chat. Kept next to the assistant's own actions so
// one floating bubble can carry both conversations (AI ↔ real person) without
// either pane knowing about the other's transport.

function msg(err: unknown): string {
  if (err instanceof ApiError || err instanceof ConnectionError) return err.message;
  return "Something went wrong. Please try again.";
}

/** Every conversation this org has had with the support team, newest first. */
export async function listSupportThreads(): Promise<{ data?: SupportTicket[]; error?: string }> {
  try {
    return { data: (await api.listSupportTickets()).data };
  } catch (err) {
    return { error: msg(err) };
  }
}

/** One conversation, with its full message history. */
export async function loadSupportThread(id: string): Promise<{ ticket?: SupportTicket; error?: string }> {
  try {
    return { ticket: await api.getSupportTicket(id) };
  } catch (err) {
    return { error: msg(err) };
  }
}

/**
 * Start a conversation with a human. `context` is the optional handoff summary
 * carried over from the assistant, so the team lands mid-problem instead of
 * asking the user to repeat themselves.
 */
export async function startSupportThread(
  message: string,
  context?: string,
): Promise<{ ticket?: SupportTicket; error?: string }> {
  const body = context ? `${message}\n\n— — —\nFrom the assistant conversation:\n${context}` : message;
  try {
    const created = await api.createSupportTicket({ message: body });
    // Re-read so the caller gets the thread with its messages attached.
    return { ticket: await api.getSupportTicket(created.id ?? created.ticket_id) };
  } catch (err) {
    return { error: msg(err) };
  }
}

/** Write back on an existing conversation (reopens it if it had been closed). */
export async function replySupportThread(
  id: string,
  message: string,
): Promise<{ ticket?: SupportTicket; error?: string }> {
  try {
    return { ticket: await api.replySupportTicket(id, { message }) };
  } catch (err) {
    return { error: msg(err) };
  }
}
