"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

/**
 * Entrance reveal for a section — fade + small rise, staggered via `delay`.
 * SSR always renders the hidden initial (server and client agree — no hydration
 * mismatch). If the tab is HIDDEN at mount, an effect unhides immediately: rAF
 * doesn't tick in hidden tabs, so the animation would otherwise hold content
 * invisible until focus. Rests at transform:none (sticky/fixed descendants safe).
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
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
