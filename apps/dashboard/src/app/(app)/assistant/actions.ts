"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";

export interface AssistantReply {
  reply?: string;
  actions?: { tool: string; status: number }[];
  credits?: { used: number; allowance: number };
  error?: string;
}

export async function askAssistant(prompt: string): Promise<AssistantReply> {
  const p = prompt.trim();
  if (!p) return { error: "Type a request first." };
  try {
    const r = await api.assistant(p);
    // The assistant may have created sequences/lists/etc. — refresh those views.
    revalidatePath("/sequences");
    revalidatePath("/lists");
    revalidatePath("/campaigns");
    return { reply: r.reply, actions: r.actions, credits: r.credits };
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "The assistant is unavailable right now." };
  }
}
