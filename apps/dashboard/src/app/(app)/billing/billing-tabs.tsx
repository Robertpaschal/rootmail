"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "usage", label: "Your plan & usage" },
  { key: "plans", label: "Compare plans" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/**
 * Two-tab Plan & usage. Tab 1 is "what you have now"; tab 2 is the upgrade surface.
 * The tab is URL-synced (?tab=plans) so any limit hiccup elsewhere can deep-link
 * straight to the comparison — the point of friction lands on upgrading, not on
 * current usage. Switching is shallow (history.replaceState) — no server refetch.
 */
export function BillingTabs({
  initialTab,
  usage,
  plans,
}: {
  initialTab: TabKey;
  usage: ReactNode;
  plans: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);

  function select(t: TabKey) {
    setTab(t);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", t === "plans" ? "/billing?tab=plans" : "/billing");
    }
  }

  return (
    <>
      <div className="mb-6 inline-flex rounded-lg border p-0.5 text-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => select(t.key)}
            className={cn(
              "rounded-md px-3.5 py-1.5 font-medium transition-colors",
              tab === t.key
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "usage" ? usage : plans}
    </>
  );
}
