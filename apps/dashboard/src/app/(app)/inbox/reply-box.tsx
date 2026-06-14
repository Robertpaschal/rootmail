"use client";

import { useActionState } from "react";
import { Check, Loader2, Send, Sparkles } from "lucide-react";
import { reply, simulateReply, type ReplyState } from "./actions";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ReplyBox({ threadId }: { threadId: string }) {
  const [state, formAction, pending] = useActionState<ReplyState | null, FormData>(reply, null);

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="thread_id" value={threadId} />
        <Textarea name="text" rows={3} placeholder="Write a reply…" required />
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send reply
          </Button>
          {state?.sent ? (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <Check className="size-4" /> Added to thread
            </span>
          ) : null}
        </div>
      </form>

      <form action={simulateReply} className="border-t pt-3">
        <input type="hidden" name="thread_id" value={threadId} />
        <SubmitButton variant="outline" size="sm" pendingLabel="Simulating…">
          <Sparkles className="size-4" /> Simulate an inbound reply
        </SubmitButton>
      </form>
    </div>
  );
}
