"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

// Next remounts a template on every navigation — which is exactly what a page
// transition needs. Entrance-only (App Router has no reliable exit phase) and
// deliberately subtle: content settles in ~0.2s. Guards:
// • SSR always renders the hidden initial (server and client agree — no
//   hydration mismatch); a tab that's HIDDEN at mount is unhidden by an effect,
//   because rAF doesn't tick there and would hold the page at opacity 0.
// • No will-change and y ends at 0, so framer drops the transform to `none` at
//   rest — a lingering transform would re-anchor fixed modals (checkout) and
//   sticky summaries inside.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (document.visibilityState === "hidden" && ref.current) {
      ref.current.style.opacity = "1";
      ref.current.style.transform = "none";
    }
  }, []);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
