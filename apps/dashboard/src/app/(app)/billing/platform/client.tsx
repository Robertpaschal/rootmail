"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Megaphone, Sparkles, Zap } from "lucide-react";
import { WingLadder } from "../wings/wing-ladder";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Billing, WingTier } from "@/lib/types";

const num = (n: number) => n.toLocaleString();

// Platform's own feature class: the shared foundation both wings stand on.
const INCLUDED: { title: string; desc: string }[] = [
  { title: "Team seats", desc: "Everyone who works in rootmail — invite, manage, remove." },
  { title: "Workspaces", desc: "One per product or brand, each with its own sending, templates, and audiences." },
  { title: "Custom roles (RBAC)", desc: "Decide exactly who can send, edit content, or touch billing." },
  { title: "SAML SSO + SCIM", desc: "Sign in through Okta, Entra, or Google; leavers lose access automatically." },
  { title: "Proof & compliance exports", desc: "Cryptographically signed records that prove what you sent." },
  { title: "AI assistant credits", desc: "Org-level and shared by both wings — every paid tier adds more; packs top it up." },
];

export function PlatformBilling({
  billing,
  prefillTeam,
}: {
  billing: Billing;
  prefillTeam?: number;
}) {
  const pf = billing.wings!.platform;
  const seats = billing.summary.seats;
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [team, setTeam] = useState(prefillTeam ? String(prefillTeam) : "");

  const pick = (n: number): string => {
    const asc = [...pf.tiers].sort((a, b) => a.rank - b.rank);
    for (const t of asc) {
      const v = (t as WingTier).seats;
      if (v === -1 || (v != null && v >= n)) return t.id;
    }
    return asc[asc.length - 1]?.id ?? "";
  };
  const [rec, setRec] = useState<string | null>(prefillTeam ? pick(prefillTeam) : null);

  const capacity = seats.capacity === -1 ? "unlimited" : num(seats.capacity);

  return (
    <div className="space-y-8">
      {/* This wing's meter — the team. */}
      <Card>
        <CardContent className="p-5">
          <p className="text-sm font-medium">
            {num(seats.used)} of {capacity} seats in use
            <span className="ml-2 font-normal text-muted-foreground">
              ({seats.included} included{seats.purchased ? ` + ${seats.purchased} purchased` : ""})
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Platform is the shared foundation — one subscription that serves both wings without touching either wing&apos;s bill.
          </p>
        </CardContent>
      </Card>

      {/* Size it by team. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid flex-1 gap-1.5 sm:max-w-xs">
              <Label htmlFor="pf-est" className="text-xs">How many people are on your team?</Label>
              <Input id="pf-est" type="number" min={1} inputMode="numeric" placeholder="e.g. 4"
                value={team} onChange={(e) => setTeam(e.target.value)} />
            </div>
            <Button size="sm" onClick={() => setRec(pick(Number(team) || 1))}>
              <Sparkles className="size-4" /> Find my tier
            </Button>
            {rec ? <p className="text-sm text-muted-foreground">Your tier is highlighted below.</p> : null}
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

      <WingLadder wing="platform" ladder={pf} interval={interval} recommendedId={rec ?? undefined} />

      <div>
        <h2 className="text-sm font-semibold">Everything Platform covers</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-4">
              <p className="text-sm font-medium">{f.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/billing/transactional"
          className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Zap className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Transactional</span>
              <span className="ml-1 text-muted-foreground">— your product&apos;s email, priced by send volume.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
        <Link href="/billing/marketing"
          className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Megaphone className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Marketing</span>
              <span className="ml-1 text-muted-foreground">— audience email, priced by contacts.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
      </div>
    </div>
  );
}
