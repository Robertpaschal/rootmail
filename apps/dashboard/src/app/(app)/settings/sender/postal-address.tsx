"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateSenderAddress, type SenderState } from "./actions";

/**
 * The postal address, view-first.
 *
 * It used to render an open textarea and a Save button whether or not you'd
 * already set one — so a fully-configured account looked like an unfinished
 * form. Now the address is *shown*, with the footer it produces, and editing is
 * a deliberate step. The footer preview stays visible in both states, because
 * that line is the actual reason this field exists.
 */
export function PostalAddress({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState<SenderState, FormData>(updateSenderAddress, {});
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [editing, setEditing] = useState(!initial.trim());

  // A successful save closes the editor and becomes the new displayed value.
  useEffect(() => {
    if (state.ok && !state.error) {
      setSaved(value);
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const shown = editing ? value : saved;
  const footer = shown.trim() ? shown.trim().split("\n").join(" · ") : null;

  return (
    <div className="space-y-4">
      {editing ? (
        <form action={action} className="space-y-3">
          <textarea
            name="postal_address"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            maxLength={500}
            autoFocus
            placeholder={"Acme Inc.\n123 Market Street, Suite 400\nSan Francisco, CA 94103, USA"}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save address
            </Button>
            {saved.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setValue(saved);
                  setEditing(false);
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            ) : null}
            {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <p className="flex items-start gap-2 whitespace-pre-line text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {saved}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}

      <div className="rounded-md border border-dashed p-3">
        <p className="text-[12.5px] uppercase tracking-wide text-muted-foreground">
          Footer preview · appended to marketing &amp; sales sends
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {footer ? (
            <>
              {footer} · <span className="underline">Unsubscribe</span>
            </>
          ) : (
            <>
              <span className="italic">No address set</span> · <span className="underline">Unsubscribe</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
