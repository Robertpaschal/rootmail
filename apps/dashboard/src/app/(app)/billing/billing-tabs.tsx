"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PillTabs } from "@/components/app/pill-tabs";

type TabKey = "usage" | "plans";

/**
 * Two-tab Plan & usage — a centered, animated pill. Tab 1 is "what you have now";
 * tab 2 is the upgrade surface. The tab syncs with the URL (?tab=plans) so deep
 * links AND in-page links (e.g. the "Change plan" button) actually switch it —
 * `initialTab` changes on a soft navigation, and we follow it.
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

  // Follow the URL: a <Link> to /billing?tab=plans re-renders the server page with
  // a new initialTab; sync to it so those links aren't dead.
  useEffect(() => setTab(initialTab), [initialTab]);

  function select(t: TabKey) {
    setTab(t);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", t === "plans" ? "/billing?tab=plans" : "/billing");
    }
  }

  return (
    <>
      <div className="mb-6">
        <PillTabs
          options={[
            { value: "usage", label: "Your plan & usage" },
            { value: "plans", label: "Compare plans" },
          ]}
          value={tab}
          onChange={(v) => select(v as TabKey)}
          layoutId="billing-tab"
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "usage" ? usage : plans}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
