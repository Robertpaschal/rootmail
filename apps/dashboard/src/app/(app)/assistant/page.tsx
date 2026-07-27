import Link from "next/link";
import { Headset, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { SupportPane } from "@/components/app/support-pane";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/rootmail";
import { cn } from "@/lib/utils";
import { AssistantChat } from "./assistant-chat";

type Pane = "assistant" | "support";

// The full-page third mode of the SAME help surface the floating bubble and the
// side panel carry: talk to the AI, or talk to a real person, without leaving.
function PaneTabs({ active }: { active: Pane }) {
  const tabs: { id: Pane; label: string; Icon: typeof Sparkles }[] = [
    { id: "assistant", label: "AI assistant", Icon: Sparkles },
    { id: "support", label: "Support team", Icon: Headset },
  ];
  return (
    <div className="inline-flex rounded-lg bg-secondary/60 p-1">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.id === "assistant" ? "/assistant" : "/assistant?pane=support"}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.Icon className="size-3.5" /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ pane?: string }>;
}) {
  const pane: Pane = (await searchParams).pane === "support" ? "support" : "assistant";

  if (pane === "support") {
    return (
      <>
        <PageHeader
          title="Support"
          description="A real person on the rootmail team — not the assistant. We reply here and by email, usually within a business day."
          actions={<PaneTabs active="support" />}
        />
        <Card className="flex h-[calc(100vh-18rem)] min-h-[26rem] flex-col overflow-hidden">
          <SupportPane compact={false} />
        </Card>
      </>
    );
  }

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
        actions={<PaneTabs active="assistant" />}
      />
      <AssistantChat initialChats={chats} initialCredits={credits} />
    </>
  );
}
