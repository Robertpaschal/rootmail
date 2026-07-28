"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Stage {
  id: string;
  label: string;
  /** One line of "what you're doing here", shown for the current stage. */
  hint?: string;
}

/**
 * The journey rail — one shared progress header for every multi-scene flow
 * (design a template, write a message, launch a campaign).
 *
 * Cramming a whole flow onto one page makes the user decide where to look.
 * A rail says three things at a glance: where you are, what's left, and that
 * going back is safe. Completed stages are clickable; stages ahead are not,
 * so the flow can't be skipped into an invalid state.
 */
export function StageRail({
  stages,
  current,
  furthest,
  onJump,
  className,
}: {
  stages: Stage[];
  /** Index of the stage being shown. */
  current: number;
  /** How far the user has legitimately reached — anything at or below is clickable. */
  furthest?: number;
  onJump?: (index: number) => void;
  className?: string;
}) {
  const reach = furthest ?? current;
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex items-end gap-2">
        {stages.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const reachable = i <= reach && onJump != null;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onJump?.(i)}
              className={cn(
                "group flex flex-1 flex-col gap-1.5 text-left",
                reachable && !active && "cursor-pointer",
                !reachable && "cursor-default",
              )}
            >
              <span className="relative block h-1 overflow-hidden rounded-full bg-secondary">
                <motion.span
                  initial={false}
                  animate={{ scaleX: done || active ? 1 : 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 32 }}
                  style={{ originX: 0 }}
                  className={cn("absolute inset-0 rounded-full", active ? "bg-primary" : "bg-primary/60")}
                />
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 text-[11px] transition-colors",
                  active
                    ? "font-medium text-foreground"
                    : done
                      ? "text-muted-foreground group-hover:text-foreground"
                      : "text-muted-foreground/60",
                )}
              >
                {done ? <Check className="size-3 text-primary" /> : null}
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
      {stages[current]?.hint ? (
        <motion.p
          key={stages[current].id}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-sm text-muted-foreground"
        >
          {stages[current].hint}
        </motion.p>
      ) : null}
    </div>
  );
}

/** Slide-in wrapper so moving between stages reads as one continuous motion. */
export function StageScene({
  keyId,
  children,
  direction = 1,
}: {
  keyId: string;
  children: React.ReactNode;
  /** 1 = moving forward, -1 = going back. */
  direction?: number;
}) {
  return (
    <motion.div
      key={keyId}
      initial={{ opacity: 0, x: 24 * direction }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 * direction }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
