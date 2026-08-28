"use client";

import { type ReactNode, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The row vocabulary the settings sub-pages share.
 *
 * Before this, every sub-page was a stack of <Card> — header, description
 * paragraph, and the control always in EDIT mode underneath. That's the wrong
 * default twice over: a card is heavy furniture around what is usually one
 * switch or one value, and showing an open textarea for an address you set
 * months ago makes a settled account look unfinished.
 *
 * So: a row states what the thing is and **what it's currently set to**, and the
 * editor is a deliberate act that unfolds underneath. Same view-first posture as
 * the rest of the dashboard, and the same spring the Replies inbox opens with,
 * so the app moves like one hand.
 *
 * Rows that are genuinely just a switch pass `control` and no children — no
 * disclosure, because there's nothing to disclose.
 */

const EASE = { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.7 };

export function SettingsSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {hint ? <p className="mb-2 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="divide-y overflow-hidden rounded-lg border bg-card">{children}</div>
    </section>
  );
}

export function SettingsItem({
  label,
  description,
  /** What it's set to right now — the thing you came to read. */
  value,
  /** A control that lives permanently on the row (a switch, say). */
  control,
  /** Label for the disclosure button. Omit when there's nothing to open. */
  openLabel = "Change",
  closeLabel = "Done",
  /**
   * Start open. Settings deliberately passes this NOWHERE: the owner's rule is
   * that nothing in this section opens itself. A page of half-unfolded editors
   * is noise, and "we decided this one matters" is a judgement the reader
   * should get to make. Kept on the API for surfaces outside settings.
   */
  defaultOpen = false,
  children,
}: {
  label: string;
  description?: ReactNode;
  value?: ReactNode;
  control?: ReactNode;
  openLabel?: string;
  closeLabel?: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  const expandable = Boolean(children);

  return (
    <div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          {description ? (
            <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {value ? <div className="text-right text-xs">{value}</div> : null}
          {control}
          {expandable ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                open ? "bg-accent" : "hover:bg-accent",
              )}
            >
              {open ? closeLabel : openLabel}
              <motion.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={reduce ? { duration: 0 } : EASE}
                className="flex"
              >
                <ChevronDown className="size-3.5" />
              </motion.span>
            </button>
          ) : null}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expandable && open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { height: EASE, opacity: { duration: 0.16 } }}
            className="overflow-hidden"
          >
            <div className="border-t bg-muted/20 px-4 py-4">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** A small state pill — "On", "Off", "Set", "Missing". */
export function StateBadge({ tone, children }: { tone: "ok" | "warn" | "muted"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "ok" && "bg-witnessed/15 text-witnessed",
        tone === "warn" && "bg-acted/15 text-acted",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
