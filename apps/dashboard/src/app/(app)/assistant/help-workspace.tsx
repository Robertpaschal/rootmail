"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { SupportPane } from "@/components/app/support-pane";
import { Card } from "@/components/ui/card";
import type { Credits } from "@/components/app/ai-credit-meter";
import type { AssistantChat as Chat } from "./actions";
import { AssistantChat } from "./assistant-chat";
import { SegmentedControl } from "@/components/app/segmented-control";

export function HelpWorkspace({ chats, credits }: { chats: Chat[]; credits: Credits | null }) {
  const params = useSearchParams();
  const support = params.get("pane") === "support";
  const [visitedSupport, setVisitedSupport] = useState(support);
  useEffect(() => { if (support) setVisitedSupport(true); }, [support]);
  const showSupport = () => {
    setVisitedSupport(true);
    window.history.pushState(null, "", "/assistant?pane=support");
  };
  return (
    <>
      <PageHeader
        title={support ? "Support" : "Assistant"}
        description={support ? "Get help from the Rootmail team. Your conversations and replies stay here." : "Plan your next email, understand a delivery issue, or work with your audience."}
        actions={<SegmentedControl label="Help conversations" value={support ? "support" : "assistant"} options={[{ value: "assistant", label: "AI assistant" }, { value: "support", label: "Support team" }]} onChange={(next) => next === "support" ? showSupport() : window.history.pushState(null, "", "/assistant")} className="min-w-64 border shadow-e1" />}
      />
      {/* Keep both conversations mounted when switching; never discard a draft. */}
      <div hidden={support} className={!support ? "ui-content-enter" : undefined}><AssistantChat initialChats={chats} initialCredits={credits} onSupport={showSupport} /></div>
      <div hidden={!support} className={support ? "ui-content-enter" : undefined}>
        <Card className="help-surface flex h-[70dvh] min-h-[32rem] flex-col overflow-hidden rounded-2xl shadow-e1">
          {support || visitedSupport ? <SupportPane compact={false} visible={support} /> : null}
        </Card>
      </div>
    </>
  );
}
