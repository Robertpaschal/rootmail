"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * A quiet (i) that reveals an explanation on hover/focus — the definition is
 * there when you want it and out of the way when you don't. Used to carry the
 * transactional-vs-marketing definitions next to the meters they explain.
 */
export function InfoHint({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <Info className="size-3.5" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            role="tooltip"
            className="absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-lg border bg-popover p-3 text-xs font-normal leading-relaxed text-muted-foreground shadow-lg"
          >
            {children}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
