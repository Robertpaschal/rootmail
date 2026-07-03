"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateSenderAddress, type SenderState } from "./actions";

/** Edit the CAN-SPAM postal address, with a live preview of the footer line it
 * produces on marketing/sales sends. */
export function SenderForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState<SenderState, FormData>(updateSenderAddress, {});
  const [value, setValue] = useState(initial);

  return (
    <form action={action} className="space-y-4">
      <textarea
        name="postal_address"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder={"Acme Inc.\n123 Market Street, Suite 400\nSan Francisco, CA 94103, USA"}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />

      <div className="rounded-md border border-dashed p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Footer preview · appended to marketing &amp; sales sends
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {value.trim() ? (
            <>
              {value.trim().split("\n").join(" · ")} · <span className="underline">Unsubscribe</span>
            </>
          ) : (
            <>
              <span className="italic">No address set</span> · <span className="underline">Unsubscribe</span>
            </>
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save address
        </Button>
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        {state.ok && !state.error ? <span className="text-sm text-emerald-600">Saved.</span> : null}
      </div>
    </form>
  );
}
