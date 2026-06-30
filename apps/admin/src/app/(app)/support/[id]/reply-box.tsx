"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/app/submit-button";
import type { SupportTicketStatus } from "@/lib/types";
import { replyTicket, type ReplyState, setTicketStatus } from "./actions";

export function ReplyBox({ id, status }: { id: string; status: SupportTicketStatus }) {
  const [state, action] = useActionState<ReplyState, FormData>(replyTicket, {});
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <form action={action} className="space-y-2">
        <input type="hidden" name="id" value={id} />
        <textarea
          name="body"
          rows={4}
          required
          placeholder="Reply to the customer — they'll receive this by email, and can reply back…"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel="Sending…">Send reply</SubmitButton>
          {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
          {state.ok ? <span className="text-sm text-emerald-600">Sent · emailed the customer</span> : null}
        </div>
      </form>
      <form action={setTicketStatus} className="flex justify-end border-t pt-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value={status === "open" ? "closed" : "open"} />
        <SubmitButton variant="outline" pendingLabel="…">
          {status === "open" ? "Close ticket" : "Reopen ticket"}
        </SubmitButton>
      </form>
    </div>
  );
}
