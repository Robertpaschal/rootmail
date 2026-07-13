"use client";

import { useState } from "react";
import { motion } from "framer-motion";

/**
 * Entrance reveal for a page block — fade + small rise, staggered via `delay`.
 * Server components wrap sections in it to get a cascade without going client
 * themselves. Rests at transform:none (sticky/fixed descendants stay safe), and
 * skips the entrance entirely when mounted in a hidden tab — rAF doesn't tick
 * there, and an entrance would hold the block invisible until focus.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [enter] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "visible",
  );
  return (
    <motion.div
      className={className}
      initial={enter ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
