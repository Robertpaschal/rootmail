"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, RefreshCw, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SendingAccess } from "@/lib/types";
import { addTestInbox, refreshTestInboxes, removeTestInbox, prepareBetaAudience } from "./actions";

export function TestInboxes({ initial, email, beta, error: initialError }: {
  initial: SendingAccess | null; email: string; beta: boolean; error?: string;
}) {
  const [access, setAccess] = useState(initial);
  const [address, setAddress] = useState(email);
  const [error, setError] = useState(initialError ?? "");
  const [notice, setNotice] = useState("");
  const [audience, setAudience] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = access?.data.filter(r => r.status === "verified") ?? [];

  function run(action: typeof refreshTestInboxes) {
    setError(""); setNotice("");
    startTransition(async () => {
      const result = await action();
      if ("error" in result) setError(result.error);
      else { setAccess(result.access); setNotice(result.message ?? "Status checked with the sending provider."); }
    });
  }

  return (
    <section id="test-inboxes" className="scroll-mt-28 rounded-lg border bg-card p-5 shadow-e1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Test inboxes</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Send your actual email to yourself or a teammate. Check its layout in your inbox,
            reply to it, and follow the conversation back in Rootmail.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(refreshTestInboxes)}>
          <RefreshCw className="size-4" /> {pending ? "Checking…" : "Check status"}
        </Button>
      </div>
      {access?.required ? (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            Rootmail&apos;s sending account is in the SES sandbox. Each real recipient must confirm
            their address through an Amazon Web Services email before we can deliver to them.
            Signing in to Rootmail is a separate confirmation.
          </p>
          <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); run(() => addTestInbox(address)); }}>
            <label className="min-w-0 flex-1 basis-56 text-sm font-medium">
              Inbox to test with
              <Input className="mt-1.5" type="email" autoComplete="email" required value={address} onChange={e => setAddress(e.target.value)} placeholder="you@company.com" />
            </label>
            <Button disabled={pending || !address.trim()} type="submit">Request confirmation</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Use an inbox you own or a teammate who has agreed to test with you. Check spam if the AWS email hasn&apos;t arrived.</p>
        </>
      ) : access ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {access.sandbox ? "This workspace simulates mail; it does not deliver to personal inboxes. Switch to your live workspace to test real delivery."
            : access.own_provider ? `Sending uses your connected ${access.provider.toUpperCase()} account. Rootmail's SES recipient restriction does not apply; your provider's rules still do.`
            : "This sending route does not require SES sandbox recipient confirmation."}
        </p>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
      {access?.verification_unavailable ? <p role="alert" className="mt-3 text-sm text-destructive">AWS could not be reached to check one or more pending inboxes. Their status has not changed. Try Check status again.</p> : null}
      {notice ? <p role="status" className="mt-3 text-sm text-muted-foreground">{notice}</p> : null}
      {access?.data.length ? (
        <ul className="mt-5 divide-y border-t">
          {access.data.map(inbox => (
            <li key={inbox.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="break-all text-sm font-medium">{inbox.email}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {inbox.status === "verified" ? <CheckCircle2 className="size-3.5 text-witnessed" /> : <Clock3 className="size-3.5" />}
                  {inbox.status === "verified" ? "Confirmed by SES" : "Awaiting AWS confirmation — request it above, then check status"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {inbox.status === "verified" && !access.sandbox ? (
                  <Link className="text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline" href={`/messages/new?to=${encodeURIComponent(inbox.email)}`}>Write an email <ArrowRight className="inline size-3" /></Link>
                ) : null}
                <button type="button" className="text-xs text-muted-foreground hover:underline disabled:opacity-50" disabled={pending} aria-label={`Remove ${inbox.email} from test inboxes`}
                  onClick={() => run(() => removeTestInbox(inbox.id))}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      ) : access?.required ? <p className="mt-4 text-sm text-muted-foreground">Start with your own inbox above. Your verified test addresses stay available as your sending access grows.</p> : null}
      {beta && access && !access.sandbox ? (
        <div className="mt-5 border-t pt-4">
          <h3 className="text-sm font-semibold">Rehearse a campaign</h3>
          <p className="mt-1 text-sm text-muted-foreground">Prepare a separate beta audience with your inbox and delivery, bounce and complaint scenarios. Confirm your own inbox first. Keep real customer audiences separate from deliberate failure tests.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" disabled={pending} onClick={() => {
              setError(""); startTransition(async () => {
                const result = await prepareBetaAudience();
                if ("error" in result) setError(result.error);
                else {
                  setAudience(result.list_id);
                  const refreshed = await refreshTestInboxes();
                  if ("error" in refreshed) setError(refreshed.error);
                  else setAccess(refreshed.access);
                  setNotice("Your beta audience is ready to review. Existing contacts and opt-outs have been kept.");
                }
              });
            }}>Prepare beta audience</Button>
            {audience ? <Link className="text-sm text-foreground underline underline-offset-4 hover:no-underline" href={`/lists/${audience}`}>Review beta audience <ArrowRight className="inline size-3" /></Link> : null}
            {ready.length || !access.required ? <Link href="/campaigns/new" className={buttonVariants({ variant: "ghost", size: "sm" })}>Build a campaign <ArrowRight className="size-4" /></Link> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
