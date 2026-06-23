"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setAnnouncementOptOut } from "./actions";

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

  return (
    <div className="space-y-1.5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={!optOut}
          onChange={toggle}
          disabled={pending}
          className="mt-1 size-4 accent-primary"
        />
        <span className="text-sm">
          <span className="flex items-center gap-2 font-medium">
            Product announcements
            {pending ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          </span>
          <span className="block text-muted-foreground">
            Occasional product news and updates. Essential account &amp; security emails are always sent.
          </span>
        </span>
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
