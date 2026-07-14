"use client";

import { useState } from "react";
import { motion } from "framer-motion";

/**
 * Entrance reveal for a section — fade + small rise, staggered via `delay`.
 * Server components wrap blocks in it without going client themselves. Rests at
 * transform:none, and skips the entrance entirely when mounted in a hidden tab
 * (rAF doesn't tick there — an entrance would hold content invisible until focus).
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
      initial={enter ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
