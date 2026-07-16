"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronUp, Loader2, Minus, Plus, ShoppingCart, Sparkles, Users, X, Zap } from "lucide-react";
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
  // Add-on DELTAS — how many MORE of each (starts at 0). What you already have
  // carries over automatically; the checkout is ONE bill (plan + add-ons together).
  const [addons, setAddons] = useState<Record<string, number>>({});

  const clamped = Math.min(Math.max(1, contacts || 1), mk.max_contacts);
  const yr = interval === "year";
  // The tier the user has CHOSEN (staged, not yet checked out) — choosing a plan
  // and adding extras build ONE order, reviewed in the bar before checkout.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen = tiers.find((t) => t.id === chosenId && t.id !== "mk_free") ?? null;
  const addonCount = Object.values(addons).reduce((s, n) => s + n, 0);

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

      {/* STEP 2 — compare + CHOOSE. Choosing stages the plan into one order (the
          bar below) so extras can ride the same checkout — one bill. */}
      <div>
        <h2 className="mb-1 text-sm font-semibold">2. Choose your plan for {num(clamped)} contacts</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Choosing doesn&apos;t charge anything yet — you&apos;ll review the full order (plan + any extras) before checkout.
        </p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
              <tr>
                <th className="w-48 border-b p-3 text-left align-bottom" />
                {tiers.map((t) => (
                  <MarketingHeader key={t.id} tier={t} contacts={clamped} free={free} interval={interval}
                    currentTierId={mk.current_tier_id} currentContacts={mk.contacts}
                    chosenId={chosenId} onChoose={(id) => setChosenId((c) => (c === id ? null : id))} />
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
                      <td key={t.id} className={cn("p-3 text-center", t.id === RECOMMENDED && "bg-emerald-500/[0.04]", t.id === chosenId && "bg-primary/[0.06]")}>
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

      {/* STEP 3 — extras ride the SAME order as the plan chosen above. */}
      {mkAddons.length ? (
        <MarketingAddons mkAddons={mkAddons} addonQty={addonQty} addons={addons} setAddons={setAddons} chosen={chosen} />
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
        <Link href={stitch?.team ? "/billing/addons?focus=extra_seat" : "/billing/addons"} className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-muted-foreground" />
            <span><span className="font-medium">Add-ons</span><span className="ml-1 text-muted-foreground">— seats, roles, SSO &amp; more, shared across both wings.</span></span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
      </div>

      {/* Breathing room so the order bar never covers the last section. */}
      {chosen || addonCount > 0 ? <div className="h-24" aria-hidden /> : null}

      <OrderBar
        chosen={chosen}
        contacts={clamped}
        interval={interval}
        addons={addons}
        addonQty={addonQty}
        mkAddons={mkAddons}
        currentContacts={mk.contacts}
        onClear={() => {
          setChosenId(null);
          setAddons(() => ({}));
        }}
      />
    </div>
  );
}

/** The one-order bar: the chosen plan + any extras, itemized, ONE checkout.
 * This is what makes "tier + add-ons = one bill" visible before paying.
 * Collapsed = a one-line summary; expand for the full itemized order (per-line
 * math, what you already own, the credit note) so it stays uncramped however
 * many extras join. Centered against the CONTENT column (md:pl-72 = sidebar). */
function OrderBar({
  chosen,
  contacts,
  interval,
  addons,
  addonQty,
  mkAddons,
  currentContacts,
  onClear,
}: {
  chosen: WingTier | null;
  contacts: number;
  interval: "month" | "year";
  addons: Record<string, number>;
  addonQty: Record<string, number>;
  mkAddons: AddonCatalogItem[];
  currentContacts: number;
  onClear: () => void;
}) {
  const { open, pending } = useCheckout();
  const [expanded, setExpanded] = useState(false);
  const yr = interval === "year";
  const unit = yr ? "yr" : "mo";
  // Add-ons ride the same checkout at the SAME interval (yearly = 10×, 2 mo free).
  const addonLines = mkAddons
    .map((a) => ({ a, qty: addons[a.id] ?? 0 }))
    .filter((l) => l.qty > 0)
    .map((l) => ({ ...l, amount: l.a.unit_amount * l.qty * (yr ? 10 : 1) }));
  const addonsAmount = addonLines.reduce((s, l) => s + l.amount, 0);
  const planAmount = chosen ? priceFor(chosen, contacts) * (yr ? 10 : 1) : 0;
  const per1k = chosen?.per_thousand_cents ? chosen.per_thousand_cents / 100 : 0;
  const visible = chosen !== null || addonLines.length > 0;

  const checkout = () => {
    if (!chosen) return;
    void open(
      { kind: "wing", wing: "marketing", tier_id: chosen.id, interval, contacts, addons },
      `Marketing ${chosen.name} · ${contacts.toLocaleString()} contacts${addonLines.length ? ` + ${addonLines.length} extra${addonLines.length > 1 ? "s" : ""}` : ""}`,
    );
  };

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 md:pl-[19rem] md:pr-6"
        >
          <div className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-xl border bg-card shadow-lg">
            {/* Expanded: the full order, itemized — everything worth knowing before checkout. */}
            <AnimatePresence initial={false}>
              {expanded ? (
                <motion.div
                  key="details"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <div className="space-y-2.5 border-b px-4 pb-3 pt-4 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Your order</p>
                    {chosen ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <div>
                          <p className="font-medium">Marketing {chosen.name} — {num(contacts)} contacts</p>
                          <p className="text-xs text-muted-foreground">
                            {money(per1k)} per 1,000 contacts
                            {currentContacts > 0 ? ` · replaces your current ${num(currentContacts)}-contact plan` : ""}
                            {yr ? " · billed yearly (2 months free)" : ""}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums">{money(planAmount)}/{unit}</span>
                      </div>
                    ) : null}
                    {addonLines.map((l) => {
                      const have = addonQty[l.a.id] ?? 0;
                      return (
                        <div key={l.a.id} className="flex items-baseline justify-between gap-3">
                          <div>
                            <p className="font-medium">{l.qty}× {l.a.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {money(l.a.unit_amount)}/mo per {l.a.unit}
                              {have > 0 ? ` · you have ${have} — you'll have ${have + l.qty}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold tabular-nums">{money(l.amount)}/{unit}</span>
                        </div>
                      );
                    })}
                    <div className="flex items-baseline justify-between gap-3 border-t pt-2.5">
                      <p className="font-semibold">Total{yr ? " (yearly)" : " per month"}</p>
                      <span className="shrink-0 text-base font-bold tabular-nums">{money(planAmount + addonsAmount)}/{unit}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      One bill, one checkout. Anything you already own carries over and is never re-billed —
                      and unused time on your current plan is credited automatically.
                    </p>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Collapsed row — always visible, stays uncramped at any order size. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <ShoppingCart className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                {chosen ? (
                  <p className="truncate text-sm font-semibold">
                    Marketing {chosen.name} · {num(contacts)} contacts
                    {addonLines.length > 0 ? (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        + {addonLines.length} extra{addonLines.length > 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="truncate text-sm font-semibold">
                    {addonLines.length} extra{addonLines.length > 1 ? "s" : ""} selected
                    <span className="ml-1.5 font-normal text-muted-foreground">pick a plan to check out together</span>
                  </p>
                )}
                {chosen && addonLines.length === 0 ? (
                  <p className="truncate text-xs text-muted-foreground">
                    <Sparkles className="mr-1 inline size-3" />
                    Want seats, workspaces, or AI credits with it? Add extras above — same bill.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-expanded={expanded}
              >
                {expanded ? "Hide" : "Details"}
                <ChevronUp className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right">
                  <p className="text-lg font-bold leading-tight tabular-nums">
                    {money(planAmount + addonsAmount)}
                    <span className="text-xs font-normal text-muted-foreground">/{unit}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">one bill{yr ? " · 2 mo free" : ""}</p>
                </div>
                {chosen ? (
                  <Button size="sm" disabled={pending} onClick={checkout}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Review &amp; checkout
                  </Button>
                ) : (
                  <Link href="/billing/addons" className="text-xs font-medium text-primary hover:underline">
                    or buy extras alone
                  </Link>
                )}
                <button
                  type="button"
                  onClick={onClear}
                  aria-label="Clear selection"
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function MarketingHeader({
  tier,
  contacts,
  free,
  interval,
  currentTierId,
  currentContacts,
  chosenId,
  onChoose,
}: {
  tier: WingTier;
  contacts: number;
  free: number;
  interval: "month" | "year";
  currentTierId: string | null;
  currentContacts: number;
  chosenId: string | null;
  onChoose: (id: string) => void;
}) {
  const [freePending, startFree] = useTransition();
  const isFree = tier.id === "mk_free";
  const freeEligible = contacts <= free;
  const monthly = priceFor(tier, contacts);
  const shown = interval === "year" ? monthly * 10 : monthly;
  const isCurrent = currentTierId === tier.id && (isFree ? currentContacts === 0 : currentContacts === contacts);
  const recommended = tier.id === RECOMMENDED;
  const isChosen = chosenId === tier.id;

  // Paid tiers STAGE into the order bar (so extras can join the same bill);
  // Free applies directly — there's nothing to pay.
  const cta = () => {
    if (isFree) {
      startFree(async () => {
        await chooseWingTier("marketing", tier.id, interval, {});
      });
      return;
    }
    onChoose(tier.id);
  };

  return (
    <th className={cn("min-w-[150px] border-b p-3 text-center align-top", recommended && "bg-emerald-500/[0.06]", isChosen && "bg-primary/[0.06]")}>
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
        <Button size="sm" variant={isChosen || (recommended && !isCurrent) ? "default" : "outline"} className="w-full"
          disabled={freePending || isCurrent} onClick={cta}>
          {freePending ? <Loader2 className="size-3.5 animate-spin" /> : isChosen ? <Check className="size-3.5" /> : null}
          {isCurrent ? "Current" : isFree ? "Use Free" : isChosen ? "Chosen" : `Choose ${tier.name}`}
        </Button>
      )}
    </th>
  );
}

/** Configure add-ons that ride the marketing checkout — DELTAS only ("how many
 * MORE"); what you already own carries over and is never re-billed. */
function MarketingAddons({
  mkAddons,
  addonQty,
  addons,
  setAddons,
  chosen,
}: {
  mkAddons: AddonCatalogItem[];
  addonQty: Record<string, number>;
  addons: Record<string, number>;
  setAddons: (fn: (d: Record<string, number>) => Record<string, number>) => void;
  chosen: WingTier | null;
}) {
  const set = (a: AddonCatalogItem, q: number) => {
    const have = addonQty[a.id] ?? 0;
    setAddons((d) => ({ ...d, [a.id]: Math.max(0, Math.min((a.max ?? 999) - have, q)) }));
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Plus className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">3. Add extras — optional, same bill</h2>
            <p className="text-xs text-muted-foreground">
              {chosen
                ? `They'll join your Marketing ${chosen.name} checkout as one bill.`
                : "Choose a plan above and these ride the same checkout — one bill."}{" "}
              What you already have carries over; pick only what you&apos;re adding.
            </p>
          </div>
        </div>
        <div className="mb-3 mt-4" />
        <div className="space-y-2">
          {mkAddons.map((a) => {
            const d = addons[a.id] ?? 0;
            const have = addonQty[a.id] ?? 0;
            const isToggle = a.max === 1;
            return (
              <div key={a.id} className={cn("flex items-center justify-between gap-3 rounded-lg border p-3", d > 0 && "border-primary/40 bg-primary/5")}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {a.name}
                    {have > 0 ? <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">you have {isToggle ? "this" : have}</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
                  <p className="mt-1 text-xs"><span className="font-semibold">${a.unit_amount}</span><span className="text-muted-foreground">/mo{isToggle ? "" : ` per ${a.unit}`} · {a.unit_note}</span></p>
                </div>
                {isToggle ? (
                  have > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-600">
                      <Check className="size-3.5" /> Included
                    </span>
                  ) : (
                    <Button type="button" variant={d > 0 ? "default" : "outline"} size="sm" onClick={() => set(a, d > 0 ? 0 : 1)}>
                      {d > 0 ? <><Check className="size-3.5" /> Adding</> : "Add"}
                    </Button>
                  )
                ) : (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <Button type="button" variant="outline" size="icon" className="size-7" disabled={d === 0} onClick={() => set(a, d - 1)} aria-label={`Add fewer ${a.unit}`}><Minus className="size-3.5" /></Button>
                      <span className="w-8 text-center text-sm font-medium tabular-nums">+{d}</span>
                      <Button type="button" variant="outline" size="icon" className="size-7" disabled={a.max != null && have + d >= a.max} onClick={() => set(a, d + 1)} aria-label={`Add one more ${a.unit}`}><Plus className="size-3.5" /></Button>
                    </div>
                    <span className="h-3.5 text-[10px] text-muted-foreground">{d > 0 ? `you'll have ${have + d}` : ""}</span>
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
