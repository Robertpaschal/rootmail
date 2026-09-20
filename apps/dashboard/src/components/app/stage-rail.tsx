"use client";

import * as React from "react";
import type { CSSProperties } from "react";
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
              aria-current={active ? "step" : undefined}
              disabled={!reachable}
              onClick={() => reachable && onJump?.(i)}
              className={cn(
                "ui-stage-step group flex min-h-11 min-w-0 flex-1 flex-col gap-1.5 text-left",
                reachable && !active && "cursor-pointer",
                !reachable && "cursor-default",
              )}
            >
              <span className="relative block h-1 overflow-hidden rounded-full bg-secondary">
                <span
                  aria-hidden="true"
                  style={{ scale: `${done || active ? 1 : 0} 1` }}
                  className={cn("ui-stage-fill absolute inset-0 origin-left rounded-full", active ? "bg-primary" : "bg-primary/60")}
                />
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 text-sm transition-colors",
                  active
                    ? "font-medium text-foreground"
                    : done
                      ? "text-muted-foreground group-hover:text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3 text-brass-text" /> : null}
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
      {stages[current]?.hint ? (
        <p
          key={stages[current].id}
          className="ui-content-enter mt-2 text-sm text-muted-foreground"
        >
          {stages[current].hint}
        </p>
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
    <div
      key={keyId}
      className="ui-scene-enter"
      style={{ "--ui-scene-x": `${8 * Math.sign(direction)}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}
