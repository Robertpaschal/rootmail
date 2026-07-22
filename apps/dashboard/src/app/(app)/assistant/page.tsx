import { PageHeader } from "@/components/app/page-header";
import { api } from "@/lib/rootmail";
import { AssistantChat } from "./assistant-chat";

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

  return (
    <>
      <PageHeader
        title="Assistant"
        description="Describe what you want — the assistant builds and operates your email (sequences, campaigns, scheduled sends) and diagnoses delivery issues, within your plan and role, and points you to an upgrade if something's out of reach."
      />
      <AssistantChat initialChats={chats} initialCredits={credits} />
    </>
  );
}
