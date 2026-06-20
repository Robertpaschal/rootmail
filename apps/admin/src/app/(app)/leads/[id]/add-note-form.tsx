"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { addNote, type NoteState } from "./actions";
import { Button } from "@/components/ui/button";

export function AddNoteForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<NoteState, FormData>(addNote, {});
  const ref = useRef<HTMLFormElement>(null);

  // Clear the textarea after a successful save.
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="id" value={leadId} />
      <textarea
        name="body"
        required
        maxLength={4000}
        rows={3}
        placeholder="Log a call, next steps, or context for the team…"
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Add note
        </Button>
      </div>
    </form>
  );
}
