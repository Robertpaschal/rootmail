"use client";

import { useActionState } from "react";
import { type PreviewState, sendSystemMailPreview } from "./actions";

/** Staff-only: mail yourself one preview (announcement or win-back) to check the real headers. */
export function SendSystemMailPreview() {
  const [state, action, pending] = useActionState<PreviewState, FormData>(sendSystemMailPreview, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
      <span className="text-muted-foreground">Send a preview to your own address:</span>
      <button name="kind" value="announcement" disabled={pending} className="rounded-md border px-2.5 py-1 hover:bg-muted/40 disabled:opacity-50">
        Announcement
      </button>
      <button name="kind" value="win_back" disabled={pending} className="rounded-md border px-2.5 py-1 hover:bg-muted/40 disabled:opacity-50">
        Win-back
      </button>
      {state.ok ? (
        <span className="text-muted-foreground">
          Queued to {state.to} ({state.usedToday}/{state.cap} today).
        </span>
      ) : state.error ? (
        <span className="text-destructive">{state.error}</span>
      ) : null}
    </form>
  );
}
