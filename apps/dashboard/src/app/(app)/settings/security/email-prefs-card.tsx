"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setAnnouncementOptOut } from "./actions";
import { cn } from "@/lib/utils";

/**
 * Just the switch. The label and the "essential emails are always sent" caveat
 * now live on the settings row that hosts this, so repeating them here would say
 * the same thing twice at two sizes.
 *
 * Optimistic: it flips immediately and reverts if the save fails — a preference
 * toggle that waits on a round-trip feels broken even when it's working.
 */
export function EmailPrefsCard({ initialOptOut }: { initialOptOut: boolean }) {
  const [optOut, setOptOut] = useState(initialOptOut);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !optOut;
    setOptOut(next);
    setError(null);
    start(async () => {
      const res = await setAnnouncementOptOut(next);
      if (res.error) {
        setOptOut(!next); // revert on failure
        setError(res.error);
      }
    });
  };

  const on = !optOut;

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      {pending ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Product announcements"
        onClick={toggle}
        disabled={pending}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
          on ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-background shadow transition-transform",
            on ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
