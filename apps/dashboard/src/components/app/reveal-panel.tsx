"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Children reach the enclosing reveal's close via context — NOT a render prop.
// (Server pages compose these; a (close) => … function child would cross the
// server→client boundary and crash at runtime, even though it typechecks.)
const RevealContext = createContext<(() => void) | null>(null);

/** Close the enclosing RevealPanel/InlineReveal; a no-op outside one. */
export function useRevealClose(): () => void {
  const close = useContext(RevealContext);
  return close ?? (() => {});
}

/**
 * View-first "add" affordance: a section shows its existing data, and the
 * creation form is revealed ON DEMAND behind a trigger — never both at once.
 * `defaultOpen` (e.g. when the list is empty) opens it immediately so an empty
 * section still leads straight into creating the first item.
 */
export function RevealPanel({
  triggerLabel,
  title,
  description,
  children,
  defaultOpen = false,
  className,
}: {
  triggerLabel: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className={className}>
      {!open ? (
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus className="size-4" /> {triggerLabel}
        </Button>
      ) : (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
          <Card className="border-primary/30">
            <CardContent className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                  {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <RevealContext.Provider value={close}>{children}</RevealContext.Provider>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

/** Same reveal, but the trigger sits inline (e.g. a section header action).
 * Children are plain nodes; a form inside closes the panel via useRevealClose(). */
export function InlineReveal({
  triggerLabel,
  children,
  defaultOpen = false,
}: {
  triggerLabel: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button size="sm" variant={open ? "outline" : "default"} onClick={() => setOpen((v) => !v)}>
        {open ? <X className="size-4" /> : <Plus className="size-4" />}
        {open ? "Cancel" : triggerLabel}
      </Button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className={cn("overflow-hidden")}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <RevealContext.Provider value={close}>{children}</RevealContext.Provider>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
