"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, Loader2, Sparkles, Users, Zap } from "lucide-react";
import { chooseWingTier } from "../wings/actions";
import { PillTabs } from "@/components/app/pill-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Billing, WingTier } from "@/lib/types";

const num = (n: number) => n.toLocaleString();
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : String(n));

// The marketing wing's feature classes, keyed by the tier that first unlocks them.
const TIER_UNLOCKS: Record<string, string[]> = {
  mk_free: ["1 audience", "Basic one-off campaigns", "Sent/open/click analytics"],
  mk_starter: ["Unlimited audiences", "Full campaign analytics funnel", "Scheduled sends"],
  mk_growth: ["Sequences & automation", "Replies & shared inbox", "Higher daily volume"],
  mk_pro: ["Advanced automation", "Send-time optimization", "Top daily volume"],
};

function priceFor(tier: WingTier, contacts: number): number {
  if (!tier.per_thousand_cents || contacts <= 0) return 0;
  return Math.round((contacts * tier.per_thousand_cents) / 1000) / 100;
}
function sendsFor(tier: WingTier, contacts: number, freeContacts: number): number {
  const base = tier.id === "mk_free" ? Math.max(contacts, freeContacts) : contacts;
  return base * (tier.sends_per_contact ?? 0);
}
function dailyFor(tier: WingTier, contacts: number, freeContacts: number): number {
  const base = tier.id === "mk_free" ? Math.max(contacts, freeContacts) : contacts;
  return base * (tier.daily_per_contact ?? 0);
}

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
  const tiers = [...mk.tiers].sort((a, b) => a.rank - b.rank);
  const current = mk.contacts > 0 ? mk.contacts : prefillContacts && prefillContacts > mk.free_contacts ? prefillContacts : 5_000;

  const [contacts, setContacts] = useState<number>(current);
  const [interval, setInterval] = useState<"month" | "year">("month");

  const clamped = Math.min(Math.max(1, contacts || 1), mk.max_contacts);

  const ctUsed = usage.contacts_used;
  const ctLimit = usage.contacts_limit;
  const pct = ctLimit > 0 ? Math.min(100, Math.round((ctUsed / ctLimit) * 100)) : 0;
  const bar = ctLimit > 0 && ctUsed >= ctLimit ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary";

  return (
    <div className="space-y-8">
      {/* Current marketing usage — audience size + this month's marketing sends. */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              {num(ctUsed)} {ctLimit === -1 ? "contacts" : `of ${num(ctLimit)} contacts`} in your audiences
            </p>
            <p className="text-sm text-muted-foreground">
              {num(usage.marketing_sent)} / {num(usage.marketing_allowance)} marketing emails this month ·{" "}
              {num(usage.marketing_sent_today)}/{num(usage.marketing_daily_limit)} today
            </p>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${ctLimit === -1 ? 4 : pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            You pay for audience size; the plan turns it into your monthly + daily send volume. A contact in more
            than one audience counts once per audience.
          </p>
        </CardContent>
      </Card>

      {/* STEP 1 — choose your contact size. This is the base everything builds on. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">1. How many contacts will you email?</h2>
              <p className="text-xs text-muted-foreground">
                Your audience size sets the price, monthly sends, and daily limit — pick a plan below to see them.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {mk.contact_steps.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setContacts(s)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  clamped === s ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40",
                )}
              >
                {compact(s)}
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">or</span>
              <Input
                type="number"
                min={1}
                max={mk.max_contacts}
                value={contacts}
                onChange={(e) => setContacts(Number(e.target.value))}
                className="h-9 w-28"
                aria-label="Custom contact size"
              />
              <span className="text-sm text-muted-foreground">contacts</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interval pill — centered. */}
      <PillTabs
        options={[
          { value: "month", label: "Monthly" },
          { value: "year", label: "Yearly — 2 months free" },
        ]}
        value={interval}
        onChange={(v) => setInterval(v as "month" | "year")}
        layoutId="mk-interval"
      />

      {/* STEP 2 — the plans, each priced + sized for the chosen contact count. */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">2. Pick the plan for {num(clamped)} contacts</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {tiers.map((t) => (
            <MarketingTierCard
              key={t.id}
              tier={t}
              contacts={clamped}
              freeContacts={mk.free_contacts}
              interval={interval}
              currentTierId={mk.current_tier_id}
              currentContacts={mk.contacts}
            />
          ))}
        </div>
      </div>

      {/* Stitches — the sibling wing + shared add-ons, as links. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/billing/transactional" className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Zap className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Transactional is its own wing</span>
              <span className="ml-1 text-muted-foreground">— product email, priced by send volume.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
        <Link href={stitch?.team ? `/billing/platform?team=${stitch.team}` : "/billing/platform"} className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Add-ons</span>
              <span className="ml-1 text-muted-foreground">— seats, roles, SSO &amp; more, shared across both wings.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
      </div>
    </div>
  );
}

function MarketingTierCard({
  tier,
  contacts,
  freeContacts,
  interval,
  currentTierId,
  currentContacts,
}: {
  tier: WingTier;
  contacts: number;
  freeContacts: number;
  interval: "month" | "year";
  currentTierId: string | null;
  currentContacts: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isFree = tier.id === "mk_free";
  const freeEligible = contacts <= freeContacts;
  const monthly = priceFor(tier, contacts);
  const shown = interval === "year" ? monthly * 10 : monthly;
  const sends = sendsFor(tier, contacts, freeContacts);
  const daily = dailyFor(tier, contacts, freeContacts);
  const isCurrent = currentTierId === tier.id && (isFree ? currentContacts === 0 : currentContacts === contacts);

  const unlocks = useMemo(() => TIER_UNLOCKS[tier.id] ?? [], [tier.id]);
  const recommended = tier.id === "mk_growth";

  const choose = () => {
    setError(null);
    start(async () => {
      const res = await chooseWingTier("marketing", tier.id, interval, isFree ? {} : { contacts });
      if (res?.error) setError(res.error);
    });
  };

  return (
    <Card
      className={cn(
        "flex flex-col transition-shadow",
        isCurrent && "border-primary ring-1 ring-primary/30",
        recommended && !isCurrent && "border-emerald-500 ring-1 ring-emerald-500/30",
      )}
    >
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{tier.name}</h3>
          {isCurrent ? (
            <Badge>Current</Badge>
          ) : recommended ? (
            <Badge className="bg-emerald-500 hover:bg-emerald-500">Popular</Badge>
          ) : null}
        </div>

        <div className="mt-1 flex items-baseline gap-1">
          {isFree ? (
            <span className="text-2xl font-bold">$0</span>
          ) : (
            <>
              <motion.span
                key={shown}
                initial={{ opacity: 0.4, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-bold"
              >
                ${num(shown)}
              </motion.span>
              <span className="text-xs text-muted-foreground">/{interval === "year" ? "yr" : "mo"}</span>
            </>
          )}
        </div>
        {!isFree && interval === "month" ? (
          <p className="text-[11px] text-emerald-600">${num(monthly * 10)}/yr — 2 months free</p>
        ) : !isFree ? (
          <p className="text-[11px] text-emerald-600">2 months free applied</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">up to {num(freeContacts)} contacts</p>
        )}

        {/* What THIS contact size gets on THIS tier — the whole point. */}
        <div className="mt-3 space-y-1 rounded-md bg-muted/40 p-2.5 text-xs">
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">Emails / mo</span>
            <span className="font-semibold">{num(sends)}</span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">Daily limit</span>
            <span className="font-semibold">{num(daily)}</span>
          </p>
        </div>

        {unlocks.length ? (
          <ul className="mt-3 space-y-1">
            {unlocks.map((u) => (
              <li key={u} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                {u}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto pt-4">
          {isFree && !freeEligible ? (
            <p className="text-center text-[11px] text-muted-foreground">
              Free covers up to {num(freeContacts)} contacts
            </p>
          ) : (
            <Button
              size="sm"
              variant={recommended && !isCurrent ? "default" : "outline"}
              className="w-full"
              disabled={pending || isCurrent}
              onClick={choose}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isCurrent ? "Current plan" : isFree ? "Use Free" : `Choose ${tier.name}`}
            </Button>
          )}
          {error ? <p className="mt-1.5 text-[11px] text-destructive">{error}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
