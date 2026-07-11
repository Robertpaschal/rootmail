"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Loader2, Megaphone, Minus, Plus, Sparkles, Users, Wand2, Zap } from "lucide-react";
import { chooseWingTier } from "../wings/actions";
import { AddonManager } from "../addon-manager";
import { useCheckout } from "../checkout-provider";
import { PillTabs } from "@/components/app/pill-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AddonCatalogItem, Billing, BlockBracket } from "@/lib/types";

const num = (n: number) => n.toLocaleString();

// What every transactional plan includes — its own feature class (no marketing).
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
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizEmails, setQuizEmails] = useState(prefillEmails ? String(prefillEmails) : "");
  const { open, pending } = useCheckout();

  const clamped = Math.min(Math.max(1, blocks || 1), tx.max_blocks);
  const rate = rateFor(tx.brackets, clamped);
  const monthly = clamped * rate;
  const shown = interval === "year" ? monthly * 10 : monthly;
  const unit = interval === "year" ? "yr" : "mo";
  const sends = clamped * tx.block_size;
  const baseRate = tx.brackets[0]?.per_block ?? rate;
  const discounted = rate < baseRate;
  const savePct = baseRate > 0 ? Math.round((1 - rate / baseRate) * 100) : 0;
  const yearlySave = monthly * 2; // 2 months free
  const isCurrent = tx.blocks > 0 && clamped === tx.blocks && interval === "month";
  const overagePer1000 = tx.tiers.find((t) => t.id === "tx_blocks")?.overage_per_1000 ?? 0;

  const pct = Math.min(100, Math.round((usage.used / Math.max(1, usage.quota)) * 100));
  const bar = usage.over_limit ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary";

  const applyQuiz = () => {
    const e = Number(quizEmails) || 0;
    setBlocks(e <= tx.free_sends ? 1 : Math.min(Math.ceil(e / tx.block_size), tx.max_blocks));
    setQuizOpen(false);
  };

  const buy = () =>
    open(
      { kind: "wing", wing: "transactional", tier_id: "tx_blocks", interval, blocks: clamped },
      `${clamped} send block${clamped === 1 ? "" : "s"}`,
    );

  return (
    <div className="space-y-8">
      {/* Current transactional usage — this wing only. */}
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
                  ? `${num(usage.overage)} over · ~$${usage.overage_cost.toFixed(2)} overage this month`
                  : "Free allowance used — buy blocks below"
                : `${num(usage.remaining)} sends left this month`}
            </p>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Interval — with the yearly benefit made loud. */}
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
          {interval === "year" ? (
            <motion.p
              key="y"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600"
            >
              🎉 2 months free — you save ${num(yearlySave)}/yr at {num(clamped)} block{clamped === 1 ? "" : "s"}
            </motion.p>
          ) : (
            <motion.button
              key="m"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInterval("year")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Switch to yearly and get <span className="font-semibold text-emerald-600">2 months free</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* The BLOCKS purchaser — the hero. Estimate → stepper → buy. */}
      <Card className="overflow-hidden border-primary/40 ring-1 ring-primary/15">
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Zap className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold leading-tight">Send blocks</h2>
              <p className="text-xs text-muted-foreground">
                1 block = {num(tx.block_size)} emails/mo. Buy exactly what you send — the rate drops as you grow.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-6 md:grid-cols-[1fr_320px]">
            {/* Left: the grand table of what a block gives + the quiz. */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="size-9" onClick={() => setBlocks(Math.max(1, clamped - 1))} aria-label="Fewer blocks">
                  <Minus className="size-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  max={tx.max_blocks}
                  value={blocks}
                  onChange={(e) => setBlocks(Number(e.target.value))}
                  className="h-9 w-24 text-center text-base font-semibold"
                  aria-label="Number of blocks"
                />
                <Button variant="outline" size="icon" className="size-9" onClick={() => setBlocks(Math.min(tx.max_blocks, clamped + 1))} aria-label="More blocks">
                  <Plus className="size-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  block{clamped === 1 ? "" : "s"} · up to {tx.max_blocks}
                </span>
              </div>

              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-primary" /> {num(sends)} emails every month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-primary" /> ${rate}/block{discounted ? ` — ${savePct}% off the base rate` : ""}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-primary" /> Sending never stops — ${overagePer1000}/1,000 beyond
                </li>
              </ul>

              {/* The quiz lives HERE — closed by default, opened when unsure. */}
              <div className="rounded-lg border border-dashed p-3">
                {quizOpen ? (
                  <div className="space-y-2">
                    <Label htmlFor="tx-quiz" className="text-xs font-medium">
                      Roughly how many emails will you send each month?
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="tx-quiz"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder="e.g. 120000"
                        value={quizEmails}
                        onChange={(e) => setQuizEmails(e.target.value)}
                        className="h-8"
                      />
                      <Button size="sm" onClick={applyQuiz}>
                        <Sparkles className="size-3.5" /> Size it
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      We&apos;ll set the block count that covers it — you can still adjust.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setQuizOpen(true)}
                    className="flex w-full items-center gap-2 text-left text-sm"
                  >
                    <Wand2 className="size-4 shrink-0 text-primary" />
                    <span>
                      <span className="font-medium">Not sure how many? We&apos;ve got your back.</span>{" "}
                      <span className="text-muted-foreground">Tell us your volume and we&apos;ll pick the blocks.</span>
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Right: the price + the buy. */}
            <div className="flex flex-col rounded-xl border bg-muted/30 p-5">
              <p className="text-xs font-medium text-muted-foreground">Your transactional plan</p>
              <p className="mt-1">
                <span className="text-3xl font-bold">${num(shown)}</span>
                <span className="text-sm text-muted-foreground">/{unit}</span>
              </p>
              {interval === "year" ? (
                <p className="text-xs font-medium text-emerald-600">2 months free vs monthly</p>
              ) : (
                <p className="text-xs text-muted-foreground">${num(monthly * 10)}/yr if paid yearly</p>
              )}
              <p className="mt-3 text-sm font-medium">{num(sends)} emails / mo</p>
              <div className="mt-auto pt-4">
                <Button className="w-full" size="lg" disabled={pending || isCurrent} onClick={buy}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {isCurrent
                    ? "Current plan"
                    : tx.blocks > 0
                      ? `Update to ${num(clamped)} block${clamped === 1 ? "" : "s"}`
                      : `Buy ${num(clamped)} block${clamped === 1 ? "" : "s"}`}
                </Button>
                {tx.blocks > 0 ? (
                  <FreeButton />
                ) : (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    Or stay on Free — {num(tx.free_sends)} sends/mo, no card needed.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Transactional add-ons FOLDED IN — priced per one, explained plainly. */}
          {txAddons.length ? (
            <div className="mt-6 border-t pt-5">
              <p className="text-sm font-semibold">Add to your sending</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Transactional extras, each priced per one — add only what you need.
              </p>
              <AddonManager quantities={addonQty} catalog={txAddons} />
            </div>
          ) : null}
        </CardContent>
      </Card>

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

      {/* Deliberate stitches to the sibling wings — links, never folded in. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={stitch?.contacts ? `/billing/marketing?contacts=${stitch.contacts}` : "/billing/marketing"}
          className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40"
        >
          <span className="flex items-center gap-2 text-sm">
            <Megaphone className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Marketing is its own wing</span>
              <span className="ml-1 text-muted-foreground">— priced by audience, never your send blocks.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
        <Link
          href="/billing/platform"
          className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40"
        >
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
