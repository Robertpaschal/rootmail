import { PageHeader } from "@/components/app/page-header";
import { api } from "@/lib/rootmail";
import { AssistantChat } from "./assistant-chat";

export default async function AssistantPage() {
  // Seed the chat-history rail server-side. Never wedge the page on a transient
  // lookup — fall back to an empty rail and the client will fill it as chats are made.
  let chats: Awaited<ReturnType<typeof api.listAssistantChats>>["data"] = [];
  try {
    chats = (await api.listAssistantChats()).data;
  } catch {
    /* ignore — render with an empty rail */
  }

  return (
    <>
      <PageHeader
        title="Assistant"
        description="Describe what you want — the assistant builds and operates your email (sequences, campaigns, scheduled sends) and diagnoses delivery issues, within your plan and role, and points you to an upgrade if something's out of reach."
      />
      <AssistantChat initialChats={chats} />
    </>
  );
}
