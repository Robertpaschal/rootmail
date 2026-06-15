import { PageHeader } from "@/components/app/page-header";
import { AssistantChat } from "./assistant-chat";

export default function AssistantPage() {
  return (
    <>
      <PageHeader
        title="Assistant"
        description="Describe what you want — the AI builds it for you, within your plan and role, and points you to an upgrade if something's out of reach."
      />
      <AssistantChat />
    </>
  );
}
