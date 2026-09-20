"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface PillOption {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * A centered, animated segmented control (framer-motion sliding indicator via a
 * shared layoutId). Used for the wing/plan switches so they read as a deliberate
 * balanced control in the middle of the view, not a plain left-hugging button row.
 */
export function PillTabs({
  options,
  value,
  onChange,
  size = "md",
  layoutId = "pill-indicator",
  className,
}: {
  options: PillOption[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md" | "lg";
  layoutId?: string;
  className?: string;
}) {
  const pad = size === "lg" ? "px-6 py-2.5 text-base" : size === "sm" ? "px-3 py-2 text-sm" : "px-4 py-2 text-sm";
  const reduce = useReducedMotion();
  return (
    <div className={cn("flex justify-center", className)}>
      <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border bg-muted/50 p-1 shadow-sm">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={cn(
                "ui-button relative inline-flex min-h-10 items-center gap-1.5 rounded-full font-medium transition-colors",
                pad,
                active ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active ? (
                <motion.span
                  aria-hidden="true"
                  initial={false}
                  layoutId={layoutId}
                  className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-brass/40"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38, mass: 0.8 }}
                />
              ) : null}
              {o.icon ? <o.icon className={cn("relative z-10", size === "sm" ? "size-3.5" : "size-4")} /> : null}
              <span className="relative z-10">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
