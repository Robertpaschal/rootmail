"use client";

import { useState } from "react";
import { CopyButton } from "@/components/app/copy-button";
import { EmailBodyFrame } from "@/components/app/email-body-frame";
import { cn } from "@/lib/utils";

const TABS = ["Preview", "HTML", "Text"] as const;
type Tab = (typeof TABS)[number];

export function MessageContent({ html, text }: { html: string | null; text: string | null }) {
  const [tab, setTab] = useState<Tab>("Preview");

  return (
    <div>
      <div className="mb-3 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Preview" ? (
        html ? (
          <EmailBodyFrame html={html} title="Email preview" className="rounded-md border" />
        ) : (
          <Empty />
        )
      ) : null}

      {tab === "HTML" ? (
        html ? (
          <div className="relative">
            <CopyButton value={html} className="absolute right-2 top-2" />
            <pre className="max-h-[380px] overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
              <code className="font-mono">{html}</code>
            </pre>
          </div>
        ) : (
          <Empty />
        )
      ) : null}

      {tab === "Text" ? (
        text ? (
          <pre className="max-h-[380px] overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
            <code className="font-mono">{text}</code>
          </pre>
        ) : (
          <Empty />
        )
      ) : null}
    </div>
  );
}

function Empty() {
  return (
    <div className="grid h-[120px] place-items-center rounded-md border border-dashed text-sm text-muted-foreground">
      No rendered content stored for this message.
    </div>
  );
}
