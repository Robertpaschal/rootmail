"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Loader2, Minus, Plus, Users, Zap } from "lucide-react";
import { chooseWingTier } from "../wings/actions";
import { useCheckout } from "../checkout-provider";
import { PillTabs } from "@/components/app/pill-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AddonCatalogItem, Billing, WingTier } from "@/lib/types";

const num = (n: number) => n.toLocaleString();
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : String(n));
const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const RECOMMENDED = "mk_growth";

function priceFor(t: WingTier, contacts: number): number {
  if (!t.per_thousand_cents || contacts <= 0) return 0;
  return Math.round((contacts * t.per_thousand_cents) / 1000) / 100;
}
function sendsFor(t: WingTier, contacts: number, freeContacts: number): number {
  const base = t.id === "mk_free" ? Math.max(contacts, freeContacts) : contacts;
  return base * (t.sends_per_contact ?? 0);
}
function dailyFor(t: WingTier, contacts: number, freeContacts: number): number {
  const base = t.id === "mk_free" ? Math.max(contacts, freeContacts) : contacts;
  return base * (t.daily_per_contact ?? 0);
}

// Objective, real comparison rows — every value comes from the tier's actual
// enforced numbers/features, computed for the chosen contact size. No vague copy.
type Row = { label: string; hint?: string; value: (t: WingTier) => string | boolean };

export function MarketingBilling({
  billing,
  prefillContacts,
  mkAddons,
  addonQty,
  stitch,
}: {
  billing: Billing;
  prefillContacts?: number;
  mkAddons: AddonCatalogItem[];
  addonQty: Record<string, number>;
  stitch?: { team?: number };
}) {
  const mk = billing.wings!.marketing;
  const usage = billing.usage;
  // Highest tier first, Free last.
  const tiers = [...mk.tiers].sort((a, b) => b.rank - a.rank);
  const free = mk.free_contacts;

  const initial = mk.contacts > 0 ? mk.contacts : prefillContacts && prefillContacts > free ? prefillContacts : 5_000;
  const [contacts, setContacts] = useState<number>(initial);
  const [interval, setInterval] = useState<"month" | "year">("month");
  // Add-ons fold into the marketing checkout too (configured here → order summary).
  const [addons, setAddons] = useState<Record<string, number>>(() => {
    const d: Record<string, number> = {};
    for (const a of mkAddons) d[a.id] = addonQty[a.id] ?? 0;
    return d;
  });

  const clamped = Math.min(Math.max(1, contacts || 1), mk.max_contacts);
  const yr = interval === "year";

  const rows: Row[] = [
    { label: "Emails / month", hint: "Sends allowed at your contact size", value: (t) => `${num(sendsFor(t, clamped, free))}` },
    { label: "Daily send limit", value: (t) => `${num(dailyFor(t, clamped, free))}/day` },
    { label: "Audiences", hint: "Distinct lists you can send to", value: (t) => (t.included_audiences === -1 ? "Unlimited" : `${t.included_audiences ?? 0}`) },
    { label: "Contacts", value: (t) => (t.id === "mk_free" ? `up to ${num(free)}` : num(clamped)) },
    { label: "Campaigns & scheduling", value: (t) => t.features.includes("campaigns") },
    { label: "Engagement analytics funnel", value: () => true },
    { label: "Sequences & automation", hint: "Multi-step drips that stop on reply", value: (t) => t.features.includes("sequences") },
    { label: "Replies & shared inbox", value: (t) => t.features.includes("threads") },
    { label: "No rootmail footer", value: (t) => t.id !== "mk_free" },
  ];

  return (
    <div className="space-y-8">
      {/* Current usage — audience + this month's marketing volume. */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              {num(usage.contacts_used)} {usage.contacts_limit === -1 ? "contacts" : `of ${num(usage.contacts_limit)} contacts`} · {num(usage.audiences_used)}
              {usage.audiences_limit === -1 ? "" : `/${num(usage.audiences_limit)}`} audiences
            </p>
            <p className="text-sm text-muted-foreground">
              {num(usage.marketing_sent)}/{num(usage.marketing_allowance)} emails this month · {num(usage.marketing_sent_today)}/{num(usage.marketing_daily_limit)} today
            </p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            You pay for audience size; your plan turns it into monthly + daily send volume and how many audiences you can run.
          </p>
        </CardContent>
      </Card>

      {/* STEP 1 — contact size. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">1. Choose your contact size</h2>
              <p className="text-xs text-muted-foreground">Your audience size sets the price and volume in every plan below.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {mk.contact_steps.map((s) => (
              <button key={s} type="button" onClick={() => setContacts(s)}
                className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", clamped === s ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40")}>
                {compact(s)}
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">or</span>
              <Input type="number" min={1} max={mk.max_contacts} value={contacts} onChange={(e) => setContacts(Number(e.target.value))} className="h-9 w-28" aria-label="Custom contact size" />
              <span className="text-sm text-muted-foreground">contacts</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interval — with the yearly benefit emphasized. */}
      <div className="flex flex-col items-center gap-2">
        <PillTabs
          options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]}
          value={interval}
          onChange={(v) => setInterval(v as "month" | "year")}
          layoutId="mk-interval"
        />
        <AnimatePresence mode="wait">
          {yr ? (
            <motion.p key="y" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600">
              🎉 2 months free on every yearly plan
            </motion.p>
          ) : (
            <motion.button key="m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setInterval("year")} className="text-xs text-muted-foreground hover:text-foreground">
              Pay yearly for <span className="font-semibold text-emerald-600">2 months free</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* STEP 2 — the comparison table. Sticky tier headers + CTAs while you scroll. */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">2. Compare plans for {num(clamped)} contacts</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
              <tr>
                <th className="w-48 border-b p-3 text-left align-bottom" />
                {tiers.map((t) => (
                  <MarketingHeader key={t.id} tier={t} contacts={clamped} free={free} interval={interval}
                    currentTierId={mk.current_tier_id} currentContacts={mk.contacts} addons={addons} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <th className="p-3 text-left font-medium">
                    {row.label}
                    {row.hint ? <span className="block text-[11px] font-normal text-muted-foreground">{row.hint}</span> : null}
                  </th>
                  {tiers.map((t) => {
                    const v = row.value(t);
                    return (
                      <td key={t.id} className={cn("p-3 text-center", t.id === RECOMMENDED && "bg-emerald-500/[0.04]")}>
                        {v === true ? (
                          <Check className="mx-auto size-4 text-emerald-600" />
                        ) : v === false ? (
                          <span className="text-muted-foreground/40">—</span>
                        ) : (
                          <span className="font-medium text-foreground">{v}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add-ons fold into the marketing checkout too. */}
      {mkAddons.length ? (
        <MarketingAddons mkAddons={mkAddons} addonQty={addonQty} addons={addons} setAddons={setAddons} />
      ) : null}

      {/* Stitches. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/billing/transactional" className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Zap className="size-4 text-muted-foreground" />
            <span><span className="font-medium">Transactional is its own wing</span><span className="ml-1 text-muted-foreground">— product email, priced by send volume.</span></span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
        <Link href={stitch?.team ? `/billing/platform?team=${stitch.team}` : "/billing/platform"} className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-muted-foreground" />
            <span><span className="font-medium">Add-ons</span><span className="ml-1 text-muted-foreground">— seats, roles, SSO &amp; more, shared across both wings.</span></span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
      </div>
    </div>
  );
}

function MarketingHeader({
  tier,
  contacts,
  free,
  interval,
  currentTierId,
  currentContacts,
  addons,
}: {
  tier: WingTier;
  contacts: number;
  free: number;
  interval: "month" | "year";
  currentTierId: string | null;
  currentContacts: number;
  addons: Record<string, number>;
}) {
  const { open, pending } = useCheckout();
  const [freePending, startFree] = useTransition();
  const isFree = tier.id === "mk_free";
  const freeEligible = contacts <= free;
  const monthly = priceFor(tier, contacts);
  const shown = interval === "year" ? monthly * 10 : monthly;
  const isCurrent = currentTierId === tier.id && (isFree ? currentContacts === 0 : currentContacts === contacts);
  const recommended = tier.id === RECOMMENDED;

  const cta = () => {
    if (isFree) {
      startFree(async () => {
        await chooseWingTier("marketing", tier.id, interval, {});
      });
      return;
    }
    void open(
      { kind: "wing", wing: "marketing", tier_id: tier.id, interval, contacts, addons },
      `Marketing ${tier.name} · ${contacts.toLocaleString()} contacts`,
    );
  };

  return (
    <th className={cn("min-w-[150px] border-b p-3 text-center align-top", recommended && "bg-emerald-500/[0.06]")}>
      {recommended ? (
        <Badge className="mb-1 bg-emerald-500 hover:bg-emerald-500">Recommended</Badge>
      ) : (
        <div className="mb-1 h-5" />
      )}
      <p className="text-base font-bold">{tier.name}</p>
      <p className="mt-0.5">
        {isFree ? (
          <span className="text-lg font-bold">$0</span>
        ) : (
          <>
            <motion.span key={shown} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="text-lg font-bold">
              {money(shown)}
            </motion.span>
            <span className="text-[11px] font-normal text-muted-foreground">/{interval === "year" ? "yr" : "mo"}</span>
          </>
        )}
      </p>
      <p className="mb-2 h-4 text-[10px] text-emerald-600">
        {!isFree && interval === "month" ? `${money(monthly * 10)}/yr — 2 mo free` : !isFree ? "2 months free" : ""}
      </p>
      {/* CTA sits ABOVE the feature rows and sticks with the header. */}
      {isFree && !freeEligible ? (
        <p className="text-[11px] text-muted-foreground">Free ≤ {free.toLocaleString()}</p>
      ) : (
        <Button size="sm" variant={recommended && !isCurrent ? "default" : "outline"} className="w-full"
          disabled={(isFree ? freePending : pending) || isCurrent} onClick={cta}>
          {(isFree ? freePending : pending) ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {isCurrent ? "Current" : isFree ? "Use Free" : `Get ${tier.name}`}
        </Button>
      )}
    </th>
  );
}

/** Configure platform add-ons that fold into the marketing checkout. */
function MarketingAddons({
  mkAddons,
  addonQty,
  addons,
  setAddons,
}: {
  mkAddons: AddonCatalogItem[];
  addonQty: Record<string, number>;
  addons: Record<string, number>;
  setAddons: (fn: (d: Record<string, number>) => Record<string, number>) => void;
}) {
  const set = (a: AddonCatalogItem, q: number) => setAddons((d) => ({ ...d, [a.id]: Math.max(0, Math.min(a.max ?? 999, q)) }));
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm font-semibold">Add extras to your plan</p>
        <p className="mb-3 text-xs text-muted-foreground">Optional — folded into the same checkout when you pick a plan above.</p>
        <div className="space-y-2">
          {mkAddons.map((a) => {
            const qty = addons[a.id] ?? 0;
            const have = addonQty[a.id] ?? 0;
            const isToggle = a.max === 1;
            return (
              <div key={a.id} className={cn("flex items-center justify-between gap-3 rounded-lg border p-3", qty > 0 && "border-primary/40 bg-primary/5")}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {a.name}
                    {have > 0 ? <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">you have {isToggle ? "this" : have}</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
                  <p className="mt-1 text-xs"><span className="font-semibold">${a.unit_amount}</span><span className="text-muted-foreground">/mo{isToggle ? "" : ` per ${a.unit}`} · {a.unit_note}</span></p>
                </div>
                {isToggle ? (
                  <Button type="button" variant={qty > 0 ? "default" : "outline"} size="sm" onClick={() => set(a, qty > 0 ? 0 : 1)}>
                    {qty > 0 ? <><Check className="size-3.5" /> Added</> : "Add"}
                  </Button>
                ) : (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button type="button" variant="outline" size="icon" className="size-7" disabled={qty === 0} onClick={() => set(a, qty - 1)}><Minus className="size-3.5" /></Button>
                    <span className="w-6 text-center text-sm font-medium tabular-nums">{qty}</span>
                    <Button type="button" variant="outline" size="icon" className="size-7" disabled={a.max != null && qty >= a.max} onClick={() => set(a, qty + 1)}><Plus className="size-3.5" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
