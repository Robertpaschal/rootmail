"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

/**
 * Entrance reveal. Two modes:
 * • default — plays on mount (above-the-fold heroes);
 * • `inView` — plays when scrolled into view, once (the "appears as you scroll"
 *   feel for everything below the fold).
 * SSR always renders the hidden initial (server and client agree — no hydration
 * mismatch). If the tab is HIDDEN at mount, an effect unhides immediately: rAF
 * doesn't tick in hidden tabs, so the animation would otherwise hold content
 * invisible until focus. Rests at transform:none (sticky/fixed descendants safe).
 */
export function Reveal({
  children,
  delay = 0,
  className,
  inView = false,
  y = 12,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  /** Trigger on scroll-into-view (once) instead of on mount. */
  inView?: boolean;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (document.visibilityState === "hidden" && ref.current) {
      ref.current.style.opacity = "1";
      ref.current.style.transform = "none";
    }
  }, []);
  const target = { opacity: 1, y: 0 };
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      {...(inView
        ? { whileInView: target, viewport: { once: true, margin: "-80px" } }
        : { animate: target })}
      transition={{ duration: 0.45, ease: [0.21, 0.65, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Scroll parallax for decorative layers (hero glows, section backdrops): the
 * wrapped element drifts `range` px over its scroll journey. Decor-only — it
 * respects prefers-reduced-motion and never wraps interactive content.
 */
export function Parallax({
  children,
  range = 60,
  className,
}: {
  children: React.ReactNode;
  range?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const yUp = useTransform(scrollYProgress, [0, 1], [range / 2, -range / 2]);
  return (
    <motion.div ref={ref} className={className} style={reduce ? undefined : { y: yUp }}>
      {children}
    </motion.div>
  );
}

/** Reactive card wrapper — lifts toward the cursor on hover, settles on tap.
 * Pure transform (no layout shift); pointer-only via whileHover/whileTap. */
export function ReactiveCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -6, transition: { duration: 0.18 } }}
      whileTap={{ scale: 0.985 }}
    >
      {children}
    </motion.div>
  );
}
