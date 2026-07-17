"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              {children}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

/** Same reveal, but the trigger sits inline (e.g. a section header action). */
export function InlineReveal({
  triggerLabel,
  children,
  defaultOpen = false,
}: {
  triggerLabel: string;
  children: (close: () => void) => React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
            {children(() => setOpen(false))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
