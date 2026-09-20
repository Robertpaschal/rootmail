import { api } from "@/lib/rootmail";
import { HelpWorkspace } from "./help-workspace";

export default async function AssistantPage() {

  // Seed the chat-history rail + the AI-credit balance server-side. Never wedge
  // the page on a transient lookup — fall back to empties and let the client fill in.
  let chats: Awaited<ReturnType<typeof api.listAssistantChats>>["data"] = [];
  let credits: { used: number; allowance: number; remaining: number } | null = null;
  try {
    [chats, credits] = await Promise.all([
      api.listAssistantChats().then((r) => r.data),
      api.assistantCredits().then((c) => ({ used: c.used, allowance: c.allowance, remaining: c.remaining })).catch(() => null),
    ]);
  } catch {
    /* ignore — render with an empty rail */
  }

  return <HelpWorkspace chats={chats} credits={credits} />;
}
