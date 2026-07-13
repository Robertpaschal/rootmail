"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Loader2, Megaphone, Minus, Plus, Sparkles, Users, Wand2, X, Zap } from "lucide-react";
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

/** Volume price for a block count under the bracket schedule (all blocks bill at
 * the bracket their total lands in — same as the Stripe volume-tiered price). */
function priceForBlocks(brackets: BlockBracket[], blocks: number): number {
  return blocks * rateFor(brackets, blocks);
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
  const current = tx.blocks; // blocks the org PAYS for today (0 = free allowance)
  const [interval, setInterval] = useState<"month" | "year">(
    current > 0 && billing.billing_interval === "year" ? "year" : "month",
  );
  const [blocks, setBlocks] = useState<number>(
    prefillEmails && prefillEmails > tx.free_sends
      ? Math.min(Math.ceil(prefillEmails / tx.block_size), tx.max_blocks)
      : current > 0
        ? current
        : 4,
  );
  // Add-on DELTAS — how many MORE of each (starts at 0); what you own carries over.
  const [addons, setAddons] = useState<Record<string, number>>({});
  const [quizOpen, setQuizOpen] = useState(false);
  const { open, pending } = useCheckout();

  const clamped = Math.min(Math.max(1, blocks || 1), tx.max_blocks);
  const rate = rateFor(tx.brackets, clamped);
  const monthly = priceForBlocks(tx.brackets, clamped);
  const currentMonthly = current > 0 ? priceForBlocks(tx.brackets, current) : 0;
  const yr = interval === "year";
  const blocksLine = yr ? monthly * 10 : monthly;
  const unit = yr ? "yr" : "mo";
  const sends = clamped * tx.block_size;
  const overagePer1000 = tx.tiers.find((t) => t.id === "tx_blocks")?.overage_per_1000 ?? 0;
  const changingBlocks = current > 0 && clamped !== current;
  const monthlyDelta = monthly - currentMonthly;

  // One bill: add-ons ride the same checkout at the SAME interval (yearly = 10×).
  const addonPrice = (a: AddonCatalogItem) => a.sale_price ?? a.unit_amount;
  const addonLineAmount = (a: AddonCatalogItem, qty: number) =>
    qty * (yr ? a.unit_amount * 10 : addonPrice(a));
  const delta = (a: AddonCatalogItem) => addons[a.id] ?? 0;
  const have = (a: AddonCatalogItem) => addonQty[a.id] ?? 0;
  const addonLines = txAddons
    .map((a) => ({ a, qty: delta(a) }))
    .filter((x) => x.qty > 0)
    .map((x) => ({ ...x, amount: addonLineAmount(x.a, x.qty) }));
  const addonsAmount = addonLines.reduce((s, l) => s + l.amount, 0);
  const hasAddons = addonLines.length > 0;
  const yearlySave = monthly * 2;

  // "Current" only when nothing in the cart differs from what's active.
  const isCurrent =
    current > 0 && clamped === current && interval === billing.billing_interval && !hasAddons;

  const pct = Math.min(100, Math.round((usage.used / Math.max(1, usage.quota)) * 100));
  const bar = usage.over_limit ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary";

  const setAddon = (a: AddonCatalogItem, qty: number) =>
    setAddons((d) => ({ ...d, [a.id]: Math.max(0, Math.min((a.max ?? 999) - have(a), qty)) }));

  const checkout = () =>
    open(
      { kind: "wing", wing: "transactional", tier_id: "tx_blocks", interval, blocks: clamped, addons },
      `${clamped} send block${clamped === 1 ? "" : "s"}${hasAddons ? " + add-ons" : ""}`,
    );

  return (
    <div className="space-y-8">
      {/* Current transactional usage. */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              {current > 0
                ? `You're paying for ${num(current)} block${current === 1 ? "" : "s"} — ${money(currentMonthly)}/mo · ${num(usage.quota)} sends/mo`
                : `Free allowance · ${num(usage.quota)} sends/mo`}
            </p>
            <p className="text-sm text-muted-foreground">
              {usage.over_limit
                ? current > 0
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

      {/* The builder (left) + the order summary (right) — one cart, ONE bill. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* LEFT: choose blocks + add extras. */}
        <div className="space-y-5">
          <Card className="border-primary/40 ring-1 ring-primary/15">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                {current > 0 ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                    You have {num(current)}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="icon" className="size-9" onClick={() => setBlocks(Math.max(1, clamped - 1))} aria-label="Fewer blocks">
                  <Minus className="size-4" />
                </Button>
                <Input type="number" min={1} max={tx.max_blocks} value={blocks} onChange={(e) => setBlocks(Number(e.target.value))}
                  className="h-9 w-24 text-center text-base font-semibold" aria-label="Number of blocks" />
                <Button variant="outline" size="icon" className="size-9" onClick={() => setBlocks(Math.min(tx.max_blocks, clamped + 1))} aria-label="More blocks">
                  <Plus className="size-4" />
                </Button>
                <span className="text-sm text-muted-foreground">block{clamped === 1 ? "" : "s"} · {num(sends)} emails/mo</span>
                <button type="button" onClick={() => setQuizOpen(true)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/60">
                  <Wand2 className="size-3.5" /> Not sure? Size it for me
                </button>
              </div>

              {/* Current → chosen, stated plainly. */}
              <AnimatePresence>
                {changingBlocks ? (
                  <motion.p key="delta" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="mt-2 overflow-hidden text-xs font-medium">
                    {num(current)} block{current === 1 ? "" : "s"} now → {num(clamped)} after checkout
                    <span className={cn("ml-1.5", monthlyDelta >= 0 ? "text-primary" : "text-emerald-600")}>
                      ({monthlyDelta >= 0 ? "+" : "−"}{money(Math.abs(monthlyDelta))}/mo)
                    </span>
                  </motion.p>
                ) : null}
              </AnimatePresence>

              {/* The real rate schedule — the whole price, visible. */}
              <div className="mt-4 overflow-hidden rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                      <th className="p-2 font-medium">Blocks</th>
                      <th className="p-2 font-medium">Per block</th>
                      <th className="p-2 text-right font-medium">Emails / month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tx.brackets.map((b, i) => {
                      const lo = i === 0 ? 1 : tx.brackets[i - 1].up_to_blocks + 1;
                      const last = i === tx.brackets.length - 1;
                      const active = clamped >= lo && (last || clamped <= b.up_to_blocks);
                      return (
                        <tr key={i} className={cn("border-b last:border-0", active && "bg-primary/5 font-medium")}>
                          <td className="p-2">{last ? `${num(lo)}+` : `${num(lo)}–${num(b.up_to_blocks)}`}{active ? " ← you" : ""}</td>
                          <td className="p-2">${b.per_block}</td>
                          <td className="p-2 text-right text-muted-foreground">
                            {last ? `${num(lo * tx.block_size)}+` : `up to ${num(b.up_to_blocks * tx.block_size)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Every block bills at your bracket&apos;s rate · past your blocks, ${overagePer1000}/1,000 overage — sending never stops.
              </p>
            </CardContent>
          </Card>

          {/* Transactional add-ons — DELTAS into the same cart, one bill. */}
          {txAddons.length ? (
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-semibold">Add to your sending</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Same checkout, one bill. What you already have carries over — pick only what you&apos;re adding.
                </p>
                <div className="space-y-2">
                  {txAddons.map((a) => {
                    const d = delta(a);
                    const h = have(a);
                    return (
                      <div key={a.id} className={cn("flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors", d > 0 && "border-primary/40 bg-primary/5")}>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            {a.name}
                            {h > 0 ? (
                              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                                you have {h}
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
                          <p className="mt-1 text-xs">
                            <span className="font-semibold text-foreground">${yr ? a.unit_amount * 10 : a.unit_amount}</span>
                            <span className="text-muted-foreground">/{unit} per {a.unit} · {a.unit_note}</span>
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <div className="flex items-center gap-1.5">
                            <Button type="button" variant="outline" size="icon" className="size-7" disabled={d === 0} onClick={() => setAddon(a, d - 1)} aria-label={`Add fewer ${a.unit}`}>
                              <Minus className="size-3.5" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium tabular-nums">+{d}</span>
                            <Button type="button" variant="outline" size="icon" className="size-7" disabled={a.max != null && h + d >= a.max} onClick={() => setAddon(a, d + 1)} aria-label={`Add one more ${a.unit}`}>
                              <Plus className="size-3.5" />
                            </Button>
                          </div>
                          <span className="h-3.5 text-[10px] text-muted-foreground">{d > 0 ? `you'll have ${h + d}` : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* What every transactional plan includes — the features, next to the price. */}
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-semibold">In every transactional plan</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {INCLUDED.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {f}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: order summary — exactly what this checkout is. */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="border-primary/30">
            <CardContent className="p-5">
              <p className="text-sm font-semibold">Your order</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">
                    Send blocks ×{clamped}
                    <span className="block text-xs">
                      {num(sends)} emails/mo
                      {changingBlocks ? ` · replaces your ${num(current)}` : ""}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{money(blocksLine)}<span className="text-xs font-normal text-muted-foreground">/{unit}</span></span>
                </li>
                <AnimatePresence>
                  {addonLines.map(({ a, qty, amount }) => (
                    <motion.li key={a.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="flex items-baseline justify-between gap-2 overflow-hidden">
                      <span className="text-muted-foreground">
                        {a.name} <span className="text-xs">+{qty}</span>
                        {have(a) > 0 ? <span className="block text-xs">you&apos;ll have {have(a) + qty}</span> : null}
                      </span>
                      <span className="font-medium tabular-nums">{money(amount)}<span className="text-xs font-normal text-muted-foreground">/{unit}</span></span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              <div className="mt-3 space-y-1 border-t pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="text-lg font-bold tabular-nums">
                    {money(blocksLine + addonsAmount)}<span className="text-xs font-normal text-muted-foreground">/{unit}</span>
                  </span>
                </div>
                {current > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Unused time on your current plan is credited at checkout — you never pay for the same period twice.
                  </p>
                ) : null}
              </div>
              {yr ? (
                <p className="mt-1 text-xs font-medium text-emerald-600">Includes 2 months free</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {money(monthly * 10 + addonLines.reduce((s, l) => s + l.qty * l.a.unit_amount * 10, 0))}/yr if paid yearly — 2 months free
                </p>
              )}

              <Button className="mt-4 w-full" size="lg" disabled={pending || isCurrent} onClick={checkout}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {isCurrent ? "Current plan" : current > 0 ? "Review & update" : "Review & checkout"}
              </Button>
              {current > 0 ? <FreeButton /> : (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Or stay on Free — {num(tx.free_sends)} sends/mo, no card.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stitches to the sibling surfaces. */}
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
        <Link href="/billing/addons" className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
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

      <SizingQuiz
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        blockSize={tx.block_size}
        freeSends={tx.free_sends}
        maxBlocks={tx.max_blocks}
        brackets={tx.brackets}
        prefill={prefillEmails}
        onPick={(b) => {
          setBlocks(b);
          setQuizOpen(false);
        }}
      />
    </div>
  );
}

/** The sizing quiz as its own pop-out — volume in, blocks + price out. */
function SizingQuiz({
  open,
  onClose,
  blockSize,
  freeSends,
  maxBlocks,
  brackets,
  prefill,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  blockSize: number;
  freeSends: number;
  maxBlocks: number;
  brackets: BlockBracket[];
  prefill?: number;
  onPick: (blocks: number) => void;
}) {
  const [emails, setEmails] = useState(prefill ? String(prefill) : "");
  useEffect(() => {
    if (open && prefill) setEmails(String(prefill));
  }, [open, prefill]);

  const e = Number(emails) || 0;
  const fitsFree = e > 0 && e <= freeSends;
  const suggested = e > 0 ? Math.min(Math.max(1, Math.ceil(e / blockSize)), maxBlocks) : 0;
  const price = suggested > 0 ? priceForBlocks(brackets, suggested) : 0;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-md rounded-2xl border bg-background p-6 shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <button type="button" onClick={onClose} aria-label="Close sizing quiz"
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Wand2 className="size-5" />
              </span>
              <div>
                <p className="font-semibold">Size my sending</p>
                <p className="text-xs text-muted-foreground">Tell us your volume — we&apos;ll pick the blocks.</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="tx-quiz" className="text-xs font-medium">Roughly how many emails per month?</Label>
              <Input id="tx-quiz" type="number" min={0} inputMode="numeric" placeholder="e.g. 120000" autoFocus
                value={emails} onChange={(ev) => setEmails(ev.target.value)} />
            </div>
            <div className="mt-4 min-h-16 rounded-lg border bg-muted/30 p-3 text-sm">
              {e <= 0 ? (
                <p className="text-muted-foreground">Enter a volume to see your fit.</p>
              ) : fitsFree ? (
                <p>
                  <span className="font-semibold text-emerald-600">The free allowance covers you</span> — {num(freeSends)} sends/mo,
                  no card. Blocks are here whenever you outgrow it.
                </p>
              ) : (
                <p>
                  {num(e)} emails ≈ <span className="font-semibold">{suggested} block{suggested === 1 ? "" : "s"}</span>{" "}
                  ({num(suggested * blockSize)} sends/mo) — <span className="font-semibold">{money(price)}/mo</span>.
                </p>
              )}
            </div>
            <Button className="mt-4 w-full" disabled={!e || fitsFree} onClick={() => onPick(suggested)}>
              <Sparkles className="size-4" /> Use {suggested > 0 && !fitsFree ? `${suggested} block${suggested === 1 ? "" : "s"}` : "this"}
            </Button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
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
