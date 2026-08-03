"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * The gap before the assistant starts talking.
 *
 * This began as a stand-in for a whole run — the loop took tens of seconds and
 * showed nothing — so it carried a ladder of reassurances that softened as the
 * wait grew. The run is streamed now, and the first token lands in a second or
 * two, which retired most of that: every phase past the first became unreachable
 * in normal use, describing a state the product no longer has.
 *
 * So it's back to what it can honestly cover: the moment before the first token,
 * and one acknowledgement for when even that is slow. Once text or a tool
 * arrives the caller drops this and the answer itself carries the progress.
 */

const PHASES: { after: number; text: string }[] = [
  { after: 0, text: "Working on it" },
  // Reachable only when the model is slow to start (a cold cache, a long
  // prompt). Rare — but silence for eight seconds needs an answer.
  { after: 8, text: "Still starting up" },
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
