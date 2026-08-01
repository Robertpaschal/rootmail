"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * What the assistant shows while it's thinking.
 *
 * This used to be a bare spinner. That's fine for a request that takes a
 * moment — but this assistant runs a tool loop, and a compound ask ("set up a
 * welcome flow for my beta list") legitimately takes several rounds and tens of
 * seconds. A motionless spinner for that long reads as "it's hung", and the
 * usual reaction is to reload the page, which throws the answer away.
 *
 * The honest fix would be streaming each step as it happens. Until the run is
 * streamed, this says only what we can actually know from here: that it's still
 * going, and how long it's been. The wording softens as the wait grows so a long
 * run feels expected rather than broken — but it never invents a step it hasn't
 * been told about, because a fake "Creating template…" would be worse than
 * silence the moment it's wrong.
 */

const PHASES: { after: number; text: string }[] = [
  { after: 0, text: "Working on it" },
  { after: 5, text: "Looking things up" },
  { after: 12, text: "Still going — this one needs a few steps" },
  { after: 25, text: "Nearly there" },
  { after: 45, text: "Taking longer than usual — still working" },
];

export function AssistantWorking({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const phase = [...PHASES].reverse().find((p) => secs >= p.after) ?? PHASES[0];

  return (
    <div className={cn("flex justify-start", className)}>
      <div className="flex items-center gap-2.5 rounded-lg bg-secondary px-3 py-2">
        {/* Three dots breathing in sequence — alive without being loud. */}
        <span className="flex items-center gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-muted-foreground/70"
              animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
            />
          ))}
        </span>
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {phase.text}
          {secs >= 5 ? <span className="ml-1.5 tabular-nums opacity-60">{secs}s</span> : null}
        </span>
      </div>
    </div>
  );
}
