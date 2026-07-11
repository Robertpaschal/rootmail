"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Loader2, Megaphone, Minus, Plus, Sparkles, Users, Wand2, Zap } from "lucide-react";
import { chooseWingTier } from "../wings/actions";
import { useCheckout } from "../checkout-provider";
import { PillTabs } from "@/components/app/pill-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AddonCatalogItem, Billing, BlockBracket } from "@/lib/types";

const num = (n: number) => n.toLocaleString();
const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const INCLUDED = [
  "The send API, templates & test sandbox",
  "Automatic suppression & bounce handling",
  "Full append-only audit trail",
  "Deliverability score, fixes & webhooks",
  "One-click unsubscribe + compliance footers",
  "The AI assistant to build, send & diagnose",
];

function rateFor(brackets: BlockBracket[], blocks: number): number {
  for (const b of brackets) if (blocks <= b.up_to_blocks) return b.per_block;
  return brackets[brackets.length - 1]?.per_block ?? 0;
}

export function TransactionalBilling({
  billing,
  prefillEmails,
  txAddons,
  addonQty,
  stitch,
}: {
  billing: Billing;
  prefillEmails?: number;
  txAddons: AddonCatalogItem[];
  addonQty: Record<string, number>;
  stitch?: { contacts?: number; team?: number };
}) {
  const tx = billing.wings!.transactional;
  const usage = billing.usage;
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [blocks, setBlocks] = useState<number>(
    prefillEmails && prefillEmails > tx.free_sends
      ? Math.min(Math.ceil(prefillEmails / tx.block_size), tx.max_blocks)
      : tx.blocks > 0
        ? tx.blocks
        : 4,
  );
  // Transactional add-ons live in the SAME cart (local selection → one checkout).
  const [addons, setAddons] = useState<Record<string, number>>(() => {
    const d: Record<string, number> = {};
    for (const a of txAddons) d[a.id] = addonQty[a.id] ?? 0;
    return d;
  });
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizEmails, setQuizEmails] = useState(prefillEmails ? String(prefillEmails) : "");
  const { open, pending } = useCheckout();

  const clamped = Math.min(Math.max(1, blocks || 1), tx.max_blocks);
  const rate = rateFor(tx.brackets, clamped);
  const monthly = clamped * rate;
  const yr = interval === "year";
  const blocksLine = yr ? monthly * 10 : monthly;
  const unit = yr ? "yr" : "mo";
  const sends = clamped * tx.block_size;
  const baseRate = tx.brackets[0]?.per_block ?? rate;
  const discounted = rate < baseRate;
  const savePct = baseRate > 0 ? Math.round((1 - rate / baseRate) * 100) : 0;
  const overagePer1000 = tx.tiers.find((t) => t.id === "tx_blocks")?.overage_per_1000 ?? 0;

  // Add-ons always bill MONTHLY (on their own subscription) — even under a yearly
  // plan — so they're never multiplied by the yearly factor.
  const addonPrice = (a: AddonCatalogItem) => a.sale_price ?? a.unit_amount;
  const addonLines = txAddons
    .map((a) => ({ a, qty: addons[a.id] ?? 0 }))
    .filter((x) => x.qty > 0)
    .map((x) => ({ a: x.a, qty: x.qty, amount: x.qty * addonPrice(x.a) }));
  const addonsMonthly = txAddons.reduce((s, a) => s + (addons[a.id] ?? 0) * addonPrice(a), 0);
  const hasAddons = addonsMonthly > 0;
  const yearlySave = monthly * 2;

  // "Current" only when nothing in the cart differs from what's active.
  const addonsUnchanged = txAddons.every((a) => (addons[a.id] ?? 0) === (addonQty[a.id] ?? 0));
  const isCurrent = tx.blocks > 0 && clamped === tx.blocks && interval === "month" && addonsUnchanged;

  const pct = Math.min(100, Math.round((usage.used / Math.max(1, usage.quota)) * 100));
  const bar = usage.over_limit ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary";

  const setAddon = (a: AddonCatalogItem, qty: number) =>
    setAddons((d) => ({ ...d, [a.id]: Math.max(0, Math.min(a.max ?? 999, qty)) }));

  const applyQuiz = () => {
    const e = Number(quizEmails) || 0;
    setBlocks(e <= tx.free_sends ? 1 : Math.min(Math.ceil(e / tx.block_size), tx.max_blocks));
    setQuizOpen(false);
  };

  const checkout = () =>
    open(
      { kind: "wing", wing: "transactional", tier_id: "tx_blocks", interval, blocks: clamped, addons },
      `${clamped} send block${clamped === 1 ? "" : "s"}${addonLines.length ? " + add-ons" : ""}`,
    );

  return (
    <div className="space-y-8">
      {/* Current transactional usage. */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              {tx.blocks > 0
                ? `${num(tx.blocks)} block${tx.blocks === 1 ? "" : "s"} · ${num(usage.quota)} sends/mo`
                : `Free allowance · ${num(usage.quota)} sends/mo`}
            </p>
            <p className="text-sm text-muted-foreground">
              {usage.over_limit
                ? tx.blocks > 0
                  ? `${num(usage.overage)} over · ~$${usage.overage_cost.toFixed(2)} overage`
                  : "Free allowance used — build your plan below"
                : `${num(usage.remaining)} sends left this month`}
            </p>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Interval — yearly benefit made loud. */}
      <div className="flex flex-col items-center gap-2">
        <PillTabs
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: "Yearly" },
          ]}
          value={interval}
          onChange={(v) => setInterval(v as "month" | "year")}
          layoutId="tx-interval"
        />
        <AnimatePresence mode="wait">
          {yr ? (
            <motion.p key="y" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600">
              🎉 2 months free — you save {money(yearlySave)}/yr
            </motion.p>
          ) : (
            <motion.button key="m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setInterval("year")} className="text-xs text-muted-foreground hover:text-foreground">
              Switch to yearly for <span className="font-semibold text-emerald-600">2 months free</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* The builder (left) + the order summary (right) — one cart, one checkout. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* LEFT: choose blocks + add extras. */}
        <div className="space-y-5">
          <Card className="border-primary/40 ring-1 ring-primary/15">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Zap className="size-5" />
                </span>
                <div>
                  <h2 className="font-semibold leading-tight">Send blocks</h2>
                  <p className="text-xs text-muted-foreground">
                    1 block = {num(tx.block_size)} emails/mo. Rates drop as you grow.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button variant="outline" size="icon" className="size-9" onClick={() => setBlocks(Math.max(1, clamped - 1))} aria-label="Fewer blocks">
                  <Minus className="size-4" />
                </Button>
                <Input type="number" min={1} max={tx.max_blocks} value={blocks} onChange={(e) => setBlocks(Number(e.target.value))}
                  className="h-9 w-24 text-center text-base font-semibold" aria-label="Number of blocks" />
                <Button variant="outline" size="icon" className="size-9" onClick={() => setBlocks(Math.min(tx.max_blocks, clamped + 1))} aria-label="More blocks">
                  <Plus className="size-4" />
                </Button>
                <span className="text-sm text-muted-foreground">block{clamped === 1 ? "" : "s"} · {num(sends)} emails/mo</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                ${rate}/block{discounted ? ` — ${savePct}% off the base rate` : ""} · past your blocks, ${overagePer1000}/1,000 (never stops).
              </p>

              {/* Quiz — closed by default, where the contact-us card used to be. */}
              <div className="mt-4 rounded-lg border border-dashed p-3">
                {quizOpen ? (
                  <div className="space-y-2">
                    <Label htmlFor="tx-quiz" className="text-xs font-medium">Roughly how many emails per month?</Label>
                    <div className="flex gap-2">
                      <Input id="tx-quiz" type="number" min={0} inputMode="numeric" placeholder="e.g. 120000"
                        value={quizEmails} onChange={(e) => setQuizEmails(e.target.value)} className="h-8" />
                      <Button size="sm" onClick={applyQuiz}><Sparkles className="size-3.5" /> Size it</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setQuizOpen(true)} className="flex w-full items-center gap-2 text-left text-sm">
                    <Wand2 className="size-4 shrink-0 text-primary" />
                    <span>
                      <span className="font-medium">Not sure how many? We&apos;ve got your back.</span>{" "}
                      <span className="text-muted-foreground">Tell us your volume; we&apos;ll pick the blocks.</span>
                    </span>
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Transactional add-ons — selectable into the same cart. */}
          {txAddons.length ? (
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-semibold">Add to your sending</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Priced per one — added to the same checkout as your blocks.
                </p>
                <div className="space-y-2">
                  {txAddons.map((a) => {
                    const qty = addons[a.id] ?? 0;
                    return (
                      <div key={a.id} className={cn("flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors", qty > 0 && "border-primary/40 bg-primary/5")}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{a.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
                          <p className="mt-1 text-xs">
                            <span className="font-semibold text-foreground">${a.unit_amount}</span>
                            <span className="text-muted-foreground">/mo per {a.unit} · {a.unit_note}</span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button type="button" variant="outline" size="icon" className="size-7" disabled={qty === 0} onClick={() => setAddon(a, qty - 1)} aria-label={`Remove one ${a.unit}`}>
                            <Minus className="size-3.5" />
                          </Button>
                          <span className="w-6 text-center text-sm font-medium tabular-nums">{qty}</span>
                          <Button type="button" variant="outline" size="icon" className="size-7" disabled={a.max != null && qty >= a.max} onClick={() => setAddon(a, qty + 1)} aria-label={`Add one ${a.unit}`}>
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* RIGHT: order summary — accumulates until you check out. */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="border-primary/30">
            <CardContent className="p-5">
              <p className="text-sm font-semibold">Your order</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">
                    Send blocks ×{clamped}
                    <span className="block text-xs">{num(sends)} emails/mo</span>
                  </span>
                  <span className="font-medium tabular-nums">{money(blocksLine)}<span className="text-xs font-normal text-muted-foreground">/{unit}</span></span>
                </li>
                {hasAddons ? (
                  <li className="pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Add-ons · billed monthly</li>
                ) : null}
                <AnimatePresence>
                  {addonLines.map(({ a, qty, amount }) => (
                    <motion.li key={a.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="flex items-baseline justify-between gap-2 overflow-hidden">
                      <span className="text-muted-foreground">
                        {a.name}
                        {qty > 1 ? ` ×${qty}` : ""}
                      </span>
                      <span className="font-medium tabular-nums">{money(amount)}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              <div className="mt-3 space-y-1 border-t pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">Plan total</span>
                  <span className="text-lg font-bold tabular-nums">
                    {money(blocksLine)}<span className="text-xs font-normal text-muted-foreground">/{unit}</span>
                  </span>
                </div>
                {hasAddons ? (
                  <div className="flex items-baseline justify-between text-sm text-muted-foreground">
                    <span>+ add-ons</span>
                    <span className="tabular-nums">{money(addonsMonthly)}/mo</span>
                  </div>
                ) : null}
              </div>
              {yr ? (
                <p className="mt-1 text-xs font-medium text-emerald-600">Plan includes 2 months free</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">{money(monthly * 10)}/yr if paid yearly</p>
              )}

              <Button className="mt-4 w-full" size="lg" disabled={pending || isCurrent} onClick={checkout}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {isCurrent ? "Current plan" : tx.blocks > 0 ? "Review & update" : "Review & checkout"}
              </Button>
              {tx.blocks > 0 ? <FreeButton /> : (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Or stay on Free — {num(tx.free_sends)} sends/mo, no card.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* What every transactional plan includes. */}
      <div>
        <h2 className="text-sm font-semibold">In every transactional plan</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((f) => (
            <div key={f} className="flex items-start gap-2 rounded-lg border bg-card p-3 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Stitches to the sibling wings. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={stitch?.contacts ? `/billing/marketing?contacts=${stitch.contacts}` : "/billing/marketing"}
          className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Megaphone className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Marketing is its own wing</span>
              <span className="ml-1 text-muted-foreground">— priced by audience, never your send blocks.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
        <Link href="/billing/platform" className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
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

/** Drop back to the free allowance (cancels the blocks subscription). */
function FreeButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
      disabled={pending}
      onClick={() => {
        if (!confirm("Drop to the free allowance? Your send blocks stop at the end of the period.")) return;
        start(async () => {
          await chooseWingTier("transactional", "tx_free", "month", {});
        });
      }}
    >
      {pending ? "Switching…" : "Drop to Free allowance"}
    </button>
  );
}
