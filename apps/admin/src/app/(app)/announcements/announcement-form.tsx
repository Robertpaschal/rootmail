"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { sendAnnouncement, type AnnouncementState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AnnouncementForm({ recipientCount }: { recipientCount: number }) {
  const [state, action, pending] = useActionState<AnnouncementState, FormData>(sendAnnouncement, {});

  if (state.ok) {
    return (
      <p className="text-sm font-medium text-emerald-600">
        Sent to {state.sent} account owner{state.sent === 1 ? "" : "s"}.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" required maxLength={200} placeholder="What's new in rootmail" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="body">Message</Label>
        <textarea
          id="body"
          name="body"
          required
          maxLength={10000}
          rows={8}
          placeholder="Write your announcement…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <p className="text-xs text-muted-foreground">
          Plain text — a greeting and footer are added automatically. Sent through rootmail&apos;s own
          pipeline.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={pending}
          onClick={(e) => {
            if (!confirm(`Send this announcement to ${recipientCount} account owner(s)?`)) {
              e.preventDefault();
            }
          }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Send to {recipientCount} owner{recipientCount === 1 ? "" : "s"}
        </Button>
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
      </div>
    </form>
  );
}
