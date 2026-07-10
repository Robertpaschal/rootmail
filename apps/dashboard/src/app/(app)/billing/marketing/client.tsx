"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Users, Zap } from "lucide-react";
import { WingLadder } from "../wings/wing-ladder";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Billing, WingTier } from "@/lib/types";

const num = (n: number) => n.toLocaleString();

// The marketing wing's own feature class, explained. No blocks, no API keys — if
// the transactional wing didn't exist, this would still be a complete product.
const INCLUDED: { title: string; desc: string }[] = [
  { title: "Campaigns to your whole audience", desc: "Pick an audience + a template, send or schedule — a full campaign to everyone in your bracket is always included, no send caps." },
  { title: "Sequences & automation", desc: "Welcome, onboard, follow up automatically — series that stop the moment someone replies." },
  { title: "Replies & shared inbox", desc: "Responses come back into a shared inbox instead of a noreply void." },
  { title: "Audiences & imports", desc: "Distinct groups of people you communicate with; bring them in from any provider's export." },
  { title: "Engagement analytics", desc: "The sent → delivered → opened → clicked funnel per campaign, and per-step drop-off for sequences." },
  { title: "Compliance handled", desc: "Postal-address footers and one-click unsubscribe added automatically — Gmail/Yahoo bulk rules covered." },
];

export function MarketingBilling({
  billing,
  prefillContacts,
  stitch,
}: {
  billing: Billing;
  prefillContacts?: number;
  stitch?: { team?: number };
}) {
  const mk = billing.wings!.marketing;
  const usage = billing.usage;
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [contacts, setContacts] = useState(prefillContacts ? String(prefillContacts) : "");

  const pick = (n: number): string => {
    const asc = [...mk.tiers].sort((a, b) => a.rank - b.rank);
    for (const t of asc) {
      const v = (t as WingTier).included_contacts;
      if (v === -1 || (v != null && v >= n)) return t.id;
    }
    return asc[asc.length - 1]?.id ?? "";
  };
  const [rec, setRec] = useState<string | null>(prefillContacts ? pick(prefillContacts) : null);

  const ctUsed = usage.contacts_used;
  const ctLimit = usage.contacts_limit;
  const pct = ctLimit > 0 ? Math.min(100, Math.round((ctUsed / ctLimit) * 100)) : 0;
  const bar = ctLimit > 0 && ctUsed >= ctLimit ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary";

  return (
    <div className="space-y-8">
      {/* This wing's meter — audience size, not sends. */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              {num(ctUsed)} {ctLimit === -1 ? "contacts" : `of ${num(ctLimit)} contacts`} in your audiences
            </p>
            <p className="text-sm text-muted-foreground">
              {num(usage.marketing_sent)} marketing emails sent this month — campaigns never consume send blocks
            </p>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${ctLimit === -1 ? 4 : pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A contact in more than one audience counts once per audience — that&apos;s the number your bracket covers.
          </p>
        </CardContent>
      </Card>

      {/* Size it by audience. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid flex-1 gap-1.5 sm:max-w-xs">
              <Label htmlFor="mk-est" className="text-xs">How many contacts will you email?</Label>
              <Input id="mk-est" type="number" min={0} inputMode="numeric" placeholder="e.g. 5000"
                value={contacts} onChange={(e) => setContacts(e.target.value)} />
            </div>
            <Button size="sm" onClick={() => setRec(pick(Number(contacts) || 0))}>
              <Sparkles className="size-4" /> Find my bracket
            </Button>
            {rec ? <p className="text-sm text-muted-foreground">Your bracket is highlighted below.</p> : null}
          </div>
        </CardContent>
      </Card>

      <div className="inline-flex rounded-lg border p-0.5 text-sm">
        {(["month", "year"] as const).map((iv) => (
          <button key={iv} type="button" onClick={() => setInterval(iv)}
            className={cn("rounded-md px-3.5 py-1.5 font-medium", interval === iv ? "bg-secondary" : "text-muted-foreground hover:text-foreground")}>
            {iv === "year" ? "Yearly — 2 months free" : "Monthly"}
          </button>
        ))}
      </div>

      <WingLadder wing="marketing" ladder={mk} interval={interval} recommendedId={rec ?? undefined} />

      <div>
        <h2 className="text-sm font-semibold">Everything marketing includes</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-4">
              <p className="text-sm font-medium">{f.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Deliberate stitches — the sibling wings live on their own pages. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/billing/transactional"
          className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Zap className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Transactional is its own wing</span>
              <span className="ml-1 text-muted-foreground">— your product&apos;s email, priced by send volume.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
        <Link href={stitch?.team ? `/billing/platform?team=${stitch.team}` : "/billing/platform"}
          className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Platform</span>
              <span className="ml-1 text-muted-foreground">— seats, workspaces &amp; governance, shared by both wings.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
      </div>
    </div>
  );
}
