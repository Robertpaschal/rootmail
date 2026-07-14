"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Megaphone, Minus, Plus, Users, Zap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { signupUrl } from "@/lib/links";
import type { PublicPricing, PublicTier } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const num = (n: number) => n.toLocaleString();
const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : String(n));

/** Interactive transactional pricing — the SAME block math the product bills:
 * pick a volume, see blocks, the bracket rate, and the exact monthly price. */
export function BlocksCalculator({ tx }: { tx: PublicPricing["wings"]["transactional"] }) {
  const [blocks, setBlocks] = useState(4);
  const clamped = Math.min(Math.max(1, blocks || 1), tx.max_blocks);
  const rate = tx.brackets.find((b) => clamped <= b.up_to_blocks)?.per_block ?? tx.brackets[tx.brackets.length - 1]?.per_block ?? 0;
  const monthly = clamped * rate;
  const sends = clamped * tx.block_size;
  const overage = tx.tiers.find((t) => t.id === "tx_blocks")?.overage_per_1000 ?? 0;

  return (
    <div className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Zap className="size-5" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">Transactional</h3>
          <p className="text-sm text-muted-foreground">Receipts, resets, alerts — priced by send volume alone.</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border bg-secondary/40 p-4">
        <p className="text-sm">
          <span className="text-2xl font-bold tracking-tight">{num(tx.free_sends)}</span>{" "}
          <span className="text-muted-foreground">sends every month, free — no card.</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Then buy blocks of {num(tx.block_size)} sends. Rates drop as you grow; past your blocks it&apos;s
          just ${overage}/1,000 — sending never stops.
        </p>
      </div>

      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Size it</p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBlocks(Math.max(1, clamped - 1))}
            className="grid size-9 place-items-center rounded-md border transition-colors hover:border-primary/50"
            aria-label="Fewer blocks"
          >
            <Minus className="size-4" />
          </button>
          <input
            type="number"
            min={1}
            max={tx.max_blocks}
            value={blocks}
            onChange={(e) => setBlocks(Number(e.target.value))}
            className="h-9 w-24 rounded-md border bg-background text-center text-base font-semibold"
            aria-label="Number of send blocks"
          />
          <button
            type="button"
            onClick={() => setBlocks(Math.min(tx.max_blocks, clamped + 1))}
            className="grid size-9 place-items-center rounded-md border transition-colors hover:border-primary/50"
            aria-label="More blocks"
          >
            <Plus className="size-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            block{clamped === 1 ? "" : "s"} · {num(sends)} emails/mo
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold tracking-tight">
          {/* Remounts per value — a subtle tick as the price recalculates. */}
          <motion.span key={monthly} initial={{ opacity: 0.35, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="inline-block">
            {money(monthly)}
          </motion.span>
          <span className="text-base font-normal text-muted-foreground">/mo</span>
          <span className="ml-2 align-middle text-xs font-medium text-muted-foreground">
            at ${rate}/block · {money(monthly * 10)}/yr (2 months free)
          </span>
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-secondary/40 text-left text-muted-foreground">
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

      <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
        <li>· The send API, templates &amp; a free test sandbox</li>
        <li>· Deliverability score, suppression &amp; webhooks</li>
        <li>· Client sending domains &amp; a dedicated IP when you need them</li>
        <li>· Full append-only audit trail</li>
      </ul>

      <Link href={signupUrl} className={cn(buttonVariants(), "mt-6 w-full")}>
        Start free — 3,000 sends/mo
      </Link>
    </div>
  );
}

function tierPrice(t: PublicTier, contacts: number): number {
  if (!t.per_thousand_cents || contacts <= 0) return 0;
  return Math.round((contacts * t.per_thousand_cents) / 1000) / 100;
}

/** Interactive marketing pricing — pick a contact size, see what each plan costs
 * and what it turns that audience into (monthly volume, daily cap, audiences). */
export function ContactPricer({ mk }: { mk: PublicPricing["wings"]["marketing"] }) {
  const [contacts, setContacts] = useState(5_000);
  const clamped = Math.min(Math.max(1, contacts || 1), mk.max_contacts);
  const paidTiers = [...mk.tiers].filter((t) => (t.per_thousand_cents ?? 0) > 0).sort((a, b) => a.rank - b.rank);
  const freeEligible = clamped <= mk.free_contacts;

  return (
    <div className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Megaphone className="size-5" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">Marketing</h3>
          <p className="text-sm text-muted-foreground">Campaigns, sequences &amp; replies — priced by audience size.</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border bg-secondary/40 p-4">
        <p className="text-sm">
          <span className="text-2xl font-bold tracking-tight">Free</span>{" "}
          <span className="text-muted-foreground">up to {num(mk.free_contacts)} contacts — no card.</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Your audience size sets the price; the plan turns it into monthly volume, a daily cap, and
          how many audiences you can run.
        </p>
      </div>

      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Users className="mr-1 inline size-3.5" /> Your contacts
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {mk.contact_steps.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setContacts(s)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                clamped === s ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50",
              )}
            >
              {compact(s)}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={mk.max_contacts}
            value={contacts}
            onChange={(e) => setContacts(Number(e.target.value))}
            className="h-7 w-24 rounded-md border bg-background px-2 text-xs font-semibold"
            aria-label="Custom contact count"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {freeEligible ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
            <span className="font-semibold text-emerald-600">Free covers you</span>
            <span className="text-muted-foreground"> — {num(clamped)} contacts fit the free tier.</span>
          </div>
        ) : null}
        {paidTiers.map((t) => {
          const p = tierPrice(t, clamped);
          return (
            <div key={t.id} className={cn("flex items-center justify-between gap-3 rounded-lg border p-3", t.id === "mk_growth" && "border-primary/50 bg-primary/5")}>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {t.name}
                  {t.id === "mk_growth" ? <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">Recommended</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {num(clamped * (t.sends_per_contact ?? 0))} emails/mo · {num(clamped * (t.daily_per_contact ?? 0))}/day ·{" "}
                  {t.included_audiences === -1 ? "unlimited" : t.included_audiences} audience{t.included_audiences === 1 ? "" : "s"}
                </p>
              </div>
              <motion.p
                key={p}
                initial={{ opacity: 0.35, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="shrink-0 text-right text-lg font-bold tabular-nums"
              >
                {money(p)}
                <span className="block text-[10px] font-normal text-muted-foreground">/mo · {money(p * 10)}/yr</span>
              </motion.p>
            </div>
          );
        })}
      </div>

      <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
        <li>· Campaigns, sequences &amp; a shared replies inbox</li>
        <li>· Full funnel analytics: sent → delivered → opened → clicked</li>
        <li>· Compliance handled — footers &amp; one-click unsubscribe</li>
        <li>· Never touches your transactional volume</li>
      </ul>

      <Link href={signupUrl} className={cn(buttonVariants(), "mt-6 w-full")}>
        Start free — up to {num(mk.free_contacts)} contacts
      </Link>
    </div>
  );
}
