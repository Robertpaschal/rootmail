"use client";

import { useState } from "react";
import { Megaphone, Minus, Plus, Users, Zap } from "lucide-react";
import type { PublicPricing, PublicTier } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { CtaButton } from "./cta-button";

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
    <div className="flex h-full flex-col rounded-lg border border-rule bg-card shadow-e1 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded bg-secondary text-foreground">
          <Zap className="size-5" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">Transactional</h3>
          <p className="text-sm text-muted-foreground">Receipts, resets, alerts — priced by send volume.</p>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-rule bg-secondary/40 p-4">
        <p className="text-sm">
          <span className="text-2xl font-medium tracking-tight">{num(tx.free_sends)}</span>{" "}
          <span className="text-muted-foreground">sends every month, free — no card.</span>
        </p>
      </div>

      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Size it</p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBlocks(Math.max(1, clamped - 1))}
            className="grid size-11 place-items-center rounded border transition-colors duration-interaction ease-interaction hover:bg-secondary"
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
            className="h-11 w-24 rounded border bg-background text-center text-base font-semibold"
            aria-label="Number of send blocks"
          />
          <button
            type="button"
            onClick={() => setBlocks(Math.min(tx.max_blocks, clamped + 1))}
            className="grid size-11 place-items-center rounded border transition-colors duration-interaction ease-interaction hover:bg-secondary"
            aria-label="More blocks"
          >
            <Plus className="size-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            block{clamped === 1 ? "" : "s"} · {num(sends)} emails/mo
          </span>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight">
          {/* Remounts per value — a subtle tick as the price recalculates. */}
          <span className="inline-block">{money(monthly)}</span>
          <span className="text-base font-normal text-muted-foreground">/mo</span>
          <span className="ml-2 align-middle text-xs font-medium text-muted-foreground">
            at ${rate}/block · {money(monthly * 10)}/yr (2 months free)
          </span>
        </p>
      </div>

      <p className="display-s mt-4">
        Past your blocks it&apos;s ${overage}/1,000. Sending never stops.
      </p>

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

      <ul className="ruled mt-5 flex-1 border-t border-rule font-mono text-[12.5px] text-ink-muted">
        {["send API · templates · sandbox", "score · suppression · webhooks", "client domains · included", "append-only audit trail"].map((f) => (
          <li key={f} className="py-2" data-fact>
            {f}
          </li>
        ))}
      </ul>

      <CtaButton label="Start free" className="mt-6 w-full" />
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
    <div className="flex h-full flex-col rounded-lg border border-rule bg-card shadow-e1 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded bg-secondary text-foreground">
          <Megaphone className="size-5" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">Marketing</h3>
          <p className="text-sm text-muted-foreground">Campaigns, sequences, replies — priced by audience size.</p>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-rule bg-secondary/40 p-4">
        <p className="text-sm">
          <span className="text-2xl font-medium tracking-tight">Free</span>{" "}
          <span className="text-muted-foreground">up to {num(mk.free_contacts)} contacts — no card.</span>
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
                "inline-flex min-h-11 items-center rounded border px-3 text-xs font-medium transition-colors duration-interaction ease-interaction",
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
            className="h-11 w-24 rounded border bg-background px-2 text-xs font-semibold"
            aria-label="Custom contact count"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {freeEligible ? (
          <div className="rounded border border-witnessed/40 bg-witnessed/10 p-3 text-sm">
            <span className="font-semibold text-witnessed">Free covers you</span>
          </div>
        ) : null}
        {paidTiers.map((t) => {
          const p = tierPrice(t, clamped);
          return (
            <div key={t.id} className={cn("flex items-center justify-between gap-3 rounded-lg border p-3", t.id === "mk_growth" && "border-primary/50 bg-primary/5")}>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {t.name}
                  {t.id === "mk_growth" ? <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[12px] font-medium text-primary-foreground">Recommended</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {num(clamped * (t.sends_per_contact ?? 0))} emails/mo · {num(clamped * (t.daily_per_contact ?? 0))}/day ·{" "}
                  {t.included_audiences === -1 ? "unlimited" : t.included_audiences} audience{t.included_audiences === 1 ? "" : "s"}
                </p>
              </div>
              <p className="shrink-0 text-right text-lg font-semibold tabular-nums" data-fact>
                {money(p)}
                <span className="block text-[12px] font-normal text-muted-foreground">/mo · {money(p * 10)}/yr</span>
              </p>
            </div>
          );
        })}
      </div>

      <ul className="ruled mt-5 flex-1 border-t border-rule font-mono text-[12.5px] text-ink-muted">
        {["campaigns · sequences · inbox", "sent → delivered → opened", "footers · one-click unsubscribe", "separate from transactional"].map((f) => (
          <li key={f} className="py-2" data-fact>
            {f}
          </li>
        ))}
      </ul>

      <CtaButton label="Start free" className="mt-6 w-full" />
    </div>
  );
}
