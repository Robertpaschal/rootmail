"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MailPlus, Send, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BETA_LEAD_COPY, type BetaLead } from "@/lib/sender-beta-first";
import { activateBetaSenderAction, setDefaultSenderAction } from "./actions";

// The first thing on /settings/sender during the closed beta: the beta address
// and the one action that gets you sending with it. Sending stays gated on a
// verified sender identity — activating creates the org's beta identity through
// the existing endpoint; nothing here adds or bypasses one.
export function BetaLeadCard({ lead, senderId, secondary }: { lead: BetaLead; senderId?: string; secondary: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justActivated, setJustActivated] = useState(false);
  if (lead.kind === "none") return null;

  const activate = () => start(async () => {
    setError(null);
    const res = await activateBetaSenderAction();
    if (res.error) setError(res.error);
    else { setJustActivated(true); router.refresh(); }
  });
  const makeDefault = () => start(async () => {
    if (!senderId) return;
    setError(null);
    const res = await setDefaultSenderAction(senderId);
    if (res.error) setError(res.error);
    else router.refresh();
  });

  return (
    <section aria-labelledby="beta-lead-title" className="space-y-3 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="beta-lead-title" className="text-base font-semibold">{BETA_LEAD_COPY.activate.title}</h2>
        {lead.kind === "active" && lead.isDefault ? <Badge variant="secondary" className="gap-1"><Star className="size-3 fill-current" /> Default</Badge> : null}
      </div>
      {lead.kind === "active" ? (
        <>
          <p className="font-mono text-sm break-all">{lead.email}</p>
          <p className="text-sm text-muted-foreground">{lead.isDefault ? BETA_LEAD_COPY.active.defaultBody : BETA_LEAD_COPY.active.notDefaultBody}</p>
          <div className="flex flex-wrap gap-2">
            {lead.isDefault ? (
              <Link href="/messages/new" className={cn(buttonVariants())}><Send className="size-4" /> {BETA_LEAD_COPY.active.send}</Link>
            ) : (
              <Button type="button" disabled={pending || !senderId} onClick={makeDefault}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Star className="size-4" />} {BETA_LEAD_COPY.active.makeDefault}
              </Button>
            )}
          </div>
          {justActivated ? <p className="text-sm">Next: <Link href="/testing#test-inboxes" className="underline underline-offset-4">confirm the inbox you&apos;ll test with →</Link></p> : null}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{BETA_LEAD_COPY.activate.body}</p>
          <Button type="button" disabled={pending} onClick={activate}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <MailPlus className="size-4" />} {BETA_LEAD_COPY.activate.action}
          </Button>
        </>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">{secondary}</p>
    </section>
  );
}
