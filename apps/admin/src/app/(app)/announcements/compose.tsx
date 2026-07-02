"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Send, Users } from "lucide-react";
import { useFormStatus } from "react-dom";
import { sendAnnouncement, type AnnouncementState } from "./actions";
import { AnnouncementPreview } from "./announcement-preview";

/**
 * Full-page composer with the actual email rendering live below as you type —
 * an announcement is a send, so what-you-see is the whole point. Sending is one
 * deliberate, confirmed action; the archive gets the record.
 */
export function ComposeAnnouncement({ recipientCount }: { recipientCount: number }) {
  const router = useRouter();
  const [state, action] = useActionState<AnnouncementState, FormData>(sendAnnouncement, {});
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // A sent broadcast becomes its archive record — land on it.
  useEffect(() => {
    if (state.ok) router.replace(state.id ? `/announcements/${state.id}` : "/announcements");
  }, [state, router]);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const autogrow = () => {
    const el = bodyRef.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${Math.max(el.scrollHeight, 160)}px`;
    }
  };
  useEffect(autogrow, []);

  return (
    <form action={action} className="mx-auto max-w-3xl">
      {/* Toolbar — pinned just below the app topbar (h-14). */}
      <div className="sticky top-14 z-10 -mx-2 flex flex-wrap items-center gap-2 border-b bg-background/95 px-2 py-2.5 backdrop-blur">
        <Link
          href="/announcements"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Announcements
        </Link>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3.5" /> {recipientCount.toLocaleString()} account owner
          {recipientCount === 1 ? "" : "s"} will receive this
        </span>
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        <div className="ml-auto">
          <SendButton recipientCount={recipientCount} />
        </div>
      </div>

      <div className="pt-8">
        <input
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={200}
          placeholder="Subject line"
          className="w-full border-0 bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
        />
        <textarea
          ref={bodyRef}
          name="body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            autogrow();
          }}
          required
          maxLength={10_000}
          placeholder="Write your announcement — plain text; a greeting and footer are added automatically…"
          className="mt-4 w-full resize-none border-0 bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/40"
        />

        {/* The email, as each owner will receive it. */}
        <div className="mt-8">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Preview · subject: {subject || "—"}
          </p>
          <AnnouncementPreview body={body} />
        </div>
      </div>
    </form>
  );
}

function SendButton({ recipientCount }: { recipientCount: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`Send this announcement to ${recipientCount} account owner(s)? This emails your whole customer base.`)) {
          e.preventDefault();
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
      {pending ? "Sending…" : `Send to ${recipientCount.toLocaleString()}`}
    </button>
  );
}
