"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Megaphone, Sparkles, Users } from "lucide-react";
import { WingLadder } from "../wings/wing-ladder";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Billing } from "@/lib/types";

const num = (n: number) => n.toLocaleString();

// What the transactional wing IS — its own feature class, explained. This page
// never mentions campaigns or audiences: if the marketing wing didn't exist,
// transactional would still be a complete product (two-wings doctrine).
const INCLUDED: { title: string; desc: string }[] = [
  { title: "The send API, templates & test sandbox", desc: "Integrate once; every send renders from your templates. Sandbox sends are always free and never touch your reputation." },
  { title: "Suppression & bounce safety", desc: "Bounced and unsubscribed addresses are blocked automatically before every send." },
  { title: "Full audit trail", desc: "Every delivery event logged immutably — see exactly what happened to any email." },
  { title: "Deliverability & webhooks", desc: "A live reputation score with fixes, and delivery events pushed to your systems." },
  { title: "Client sending domains", desc: "With blocks: each client sends from their own verified domain, reputation isolated." },
  { title: "Dedicated IP (add-on)", desc: "An IP only you send from — your reputation, fully yours." },
];

export function TransactionalBilling({
  billing,
  prefillEmails,
  stitch,
}: {
  billing: Billing;
  prefillEmails?: number;
  stitch?: { contacts?: number; team?: number };
}) {
  const tx = billing.wings!.transactional;
  const usage = billing.usage;
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [emails, setEmails] = useState(prefillEmails ? String(prefillEmails) : "");
  const [rec, setRec] = useState<{ tierId: string; blocks: number } | null>(
    prefillEmails
      ? prefillEmails <= tx.free_sends
        ? { tierId: "tx_free", blocks: 0 }
        : { tierId: "tx_blocks", blocks: Math.min(Math.ceil(prefillEmails / tx.block_size), tx.max_blocks) }
      : null,
  );

  function estimate() {
    const e = Number(emails) || 0;
    const blocks = Math.max(1, Math.ceil(e / tx.block_size));
    setRec(
      e <= tx.free_sends
        ? { tierId: "tx_free", blocks: 0 }
        : blocks > tx.max_blocks
          ? { tierId: "tx_enterprise", blocks: 0 }
          : { tierId: "tx_blocks", blocks },
    );
  }

  const pct = Math.min(100, Math.round((usage.used / Math.max(1, usage.quota)) * 100));
  const bar = usage.over_limit ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary";
  const blocksLabel =
    tx.blocks > 0
      ? `${num(tx.blocks)} block${tx.blocks === 1 ? "" : "s"} · ${num(usage.quota)} sends/mo`
      : `Free allowance · ${num(usage.quota)} sends/mo`;

  return (
    <div className="space-y-8">
      {/* This wing's meter — transactional usage only. */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{blocksLabel}</p>
            <p className="text-sm text-muted-foreground">
              {usage.over_limit
                ? tx.blocks > 0
                  ? `${num(usage.overage)} over · ~$${usage.overage_cost.toFixed(2)} overage this month`
                  : "Free allowance used — buy blocks below to keep sending"
                : `${num(usage.remaining)} sends left this month`}
            </p>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Size it: the estimator IS the pricing conversation for this wing. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid flex-1 gap-1.5 sm:max-w-xs">
              <Label htmlFor="tx-est" className="text-xs">How many emails will your product send per month?</Label>
              <Input id="tx-est" type="number" min={0} inputMode="numeric" placeholder="e.g. 120000"
                value={emails} onChange={(e) => setEmails(e.target.value)} />
            </div>
            <Button size="sm" onClick={estimate}>
              <Sparkles className="size-4" /> Size my volume
            </Button>
            {rec ? (
              <p className="text-sm text-muted-foreground">
                {rec.tierId === "tx_free"
                  ? "The free allowance covers you."
                  : rec.tierId === "tx_enterprise"
                    ? "That's Enterprise volume — talk to us."
                    : `${rec.blocks} block${rec.blocks === 1 ? "" : "s"} covers it — highlighted below.`}
              </p>
            ) : null}
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

      <WingLadder
        wing="transactional"
        ladder={tx}
        interval={interval}
        recommendedId={rec?.tierId}
        recommendedBlocks={rec?.blocks || undefined}
      />

      {/* The wing's feature class, in detail. */}
      <div>
        <h2 className="text-sm font-semibold">Everything transactional includes</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-4">
              <p className="text-sm font-medium">{f.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Deliberate stitches to the sibling wings — links, never folded in. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={stitch?.contacts ? `/billing/marketing?contacts=${stitch.contacts}` : "/billing/marketing"}
          className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Megaphone className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Marketing is its own wing</span>
              <span className="ml-1 text-muted-foreground">— priced by audience, never by your send blocks.</span>
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
