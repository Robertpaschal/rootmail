"use client";

import { useState } from "react";
import { motion } from "framer-motion";

// Next remounts a template on every navigation — which is exactly what a page
// transition needs. Entrance-only (App Router has no reliable exit phase) and
// deliberately subtle: content settles in ~0.2s. Two guardrails:
// • No will-change and y ends at 0, so framer drops the transform to `none` at
//   rest — a lingering transform would re-anchor fixed modals (checkout) and
//   sticky summaries inside.
// • A page that mounts in a HIDDEN tab renders visible immediately (initial:
//   false): rAF doesn't tick while hidden, so an entrance would hold the page
//   at opacity 0 until the tab is focused.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const [enter] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "visible",
  );
  return (
    <motion.div
      initial={enter ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
