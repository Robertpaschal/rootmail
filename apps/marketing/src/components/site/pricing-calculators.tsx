"use client";

import { useState } from "react";
import { Megaphone, Minus, Plus, Users, Zap } from "lucide-react";
import type { PublicPricing, PublicTier } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { CtaButton } from "./cta-button";

/**
 * The two wing meters.
 *
 * ── WHY THEY READ FLAT, MEASURED (2026-08-31) ───────────────────────────────
 * The owner: *"the market and the pricing two boxes for price. It still feels
 * flat."* It was not a matter of taste — it was the exact bug `--well` was
 * introduced to prevent, shipped in the most expensive place on the page:
 *
 *     card background   rgb(254, 253, 251)
 *     section behind it rgb(254, 253, 251)      ← contrast ratio 1.00
 *
 * Both cards were `bg-card` sitting on a `.slab`, which is also painted
 * `hsl(var(--card))`. They were the identical colour as the thing they sat on,
 * so the only edge either box had was a hairline, and `shadow-e1` had nothing
 * to lift them off. In dark mode the same two values came back rgb(34,28,22)
 * and rgb(34,28,22). Flat is what 1.00 looks like.
 *
 * ── THE FIX IS THREE PLANES, NOT A NEW COLOUR ───────────────────────────────
 * `pricing.tsx` puts the pair in a pressed tray (`bg-well`), so the meters are
 * `--card` lifted out of `--well` — a real lightness step in both themes, with
 * `shadow-e2` under them and the interior controls recessed BACK into `--well`.
 * Section → tray → card → inset control is four planes where there was one.
 *
 * ── AND THE FIGURES MOVED INTO THE DISPLAY FACE ─────────────────────────────
 * `00-PHILOSOPHY.md` §10.1: the big numbers on a page belong in
 * `--font-display` at size. The price a reader came here for was `text-3xl` in
 * the UI grotesque, the same face and nearly the same weight as the heading
 * above it and the label beside it. It is `.display-num` now, at ~2.5rem, with
 * tabular lining figures so it cannot jitter as the stepper runs.
 *
 * NOTHING ABOUT THE MODEL CHANGED. Every control, every bracket row, every
 * tier and every number is the one that was here — this is planes, type scale
 * and elevation only. The maths is still the maths the product bills on.
 */

const num = (n: number) => n.toLocaleString();
const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : String(n);

/** The shared shell. One definition so the two wings cannot drift apart. */
const CARD =
  "flex h-full flex-col rounded-xl border border-rule bg-card p-5 shadow-e2 sm:p-6";
/** A control or a quoted figure, pressed back into the card. */
const INSET = "rounded-lg bg-well px-4 py-3";
const STEP =
  "grid size-11 place-items-center rounded-lg border border-rule bg-card transition-colors duration-interaction ease-interaction hover:bg-secondary";

/** Interactive transactional pricing — the SAME block math the product bills:
 * pick a volume, see blocks, the bracket rate, and the exact monthly price. */
export function BlocksCalculator({ tx }: { tx: PublicPricing["wings"]["transactional"] }) {
  const [blocks, setBlocks] = useState(4);
  const clamped = Math.min(Math.max(1, blocks || 1), tx.max_blocks);
  const rate =
    tx.brackets.find((b) => clamped <= b.up_to_blocks)?.per_block ??
    tx.brackets[tx.brackets.length - 1]?.per_block ??
    0;
  const monthly = clamped * rate;
  const sends = clamped * tx.block_size;
  const overage = tx.tiers.find((t) => t.id === "tx_blocks")?.overage_per_1000 ?? 0;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground">
          <Zap className="size-5" />
        </span>
        <div>
          <h3 className="display-s">Transactional</h3>
          <p className="text-[13px] text-ink-muted">
            Receipts, resets, alerts — priced by send volume.
          </p>
        </div>
      </div>

      <div className={cn(INSET, "mt-5 flex flex-wrap items-baseline gap-x-2")}>
        <span className="display-num text-[1.75rem] leading-none">{num(tx.free_sends)}</span>
        <span className="text-sm text-ink-muted">sends every month, free — no card.</span>
      </div>

      <div className="mt-6">
        <p className="text-[13px] font-medium text-ink-muted">Size it</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setBlocks(Math.max(1, clamped - 1))}
            className={STEP}
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
            className="h-11 w-20 rounded-lg border border-rule bg-well text-center text-base font-semibold"
            aria-label="Number of send blocks"
          />
          <button
            type="button"
            onClick={() => setBlocks(Math.min(tx.max_blocks, clamped + 1))}
            className={STEP}
            aria-label="More blocks"
          >
            <Plus className="size-4" />
          </button>
          <span className="text-[13px] text-ink-muted">
            block{clamped === 1 ? "" : "s"} · {num(sends)} emails/mo
          </span>
        </div>

        {/* The number the reader came for, in the display face at size. */}
        <p className="mt-5 flex flex-wrap items-baseline gap-x-2">
          <span className="display-num text-[clamp(2.25rem,4.5vw,2.75rem)] leading-none">
            {money(monthly)}
          </span>
          <span className="text-base text-ink-muted">/mo</span>
        </p>
        <p className="mt-2 font-mono text-[12.5px] text-ink-muted" data-fact>
          ${rate}/block · {money(monthly * 10)}/yr — 2 months free
        </p>
      </div>

      <p className="mt-5 text-[15px] font-medium">
        Past your blocks it&apos;s ${overage}/1,000. Sending never stops.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg bg-well">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-rule text-left text-ink-muted">
              <th className="p-2.5 font-medium">Blocks</th>
              <th className="p-2.5 font-medium">Per block</th>
              <th className="p-2.5 text-right font-medium">Emails / month</th>
            </tr>
          </thead>
          <tbody>
            {tx.brackets.map((b, i) => {
              const lo = i === 0 ? 1 : tx.brackets[i - 1].up_to_blocks + 1;
              const last = i === tx.brackets.length - 1;
              const active = clamped >= lo && (last || clamped <= b.up_to_blocks);
              return (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-rule last:border-0",
                    active && "bg-card font-medium",
                  )}
                >
                  <td className="p-2.5">
                    {last ? `${num(lo)}+` : `${num(lo)}–${num(b.up_to_blocks)}`}
                    {active ? " ← you" : ""}
                  </td>
                  <td className="p-2.5">${b.per_block}</td>
                  <td className="p-2.5 text-right text-ink-muted">
                    {last
                      ? `${num(lo * tx.block_size)}+`
                      : `up to ${num(b.up_to_blocks * tx.block_size)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="ruled mt-5 flex-1 border-t border-rule font-mono text-[12.5px] text-ink-muted">
        {[
          "send API · templates · sandbox",
          "score · suppression · webhooks",
          "client domains · included",
          "append-only audit trail",
        ].map((f) => (
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
  const paidTiers = [...mk.tiers]
    .filter((t) => (t.per_thousand_cents ?? 0) > 0)
    .sort((a, b) => a.rank - b.rank);
  const freeEligible = clamped <= mk.free_contacts;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground">
          <Megaphone className="size-5" />
        </span>
        <div>
          <h3 className="display-s">Marketing</h3>
          <p className="text-[13px] text-ink-muted">
            Campaigns, sequences, replies — priced by audience size.
          </p>
        </div>
      </div>

      <div className={cn(INSET, "mt-5 flex flex-wrap items-baseline gap-x-2")}>
        <span className="display-num text-[1.75rem] leading-none">Free</span>
        <span className="text-sm text-ink-muted">
          up to {num(mk.free_contacts)} contacts — no card.
        </span>
      </div>

      <div className="mt-6">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-muted">
          <Users className="size-3.5" /> Your contacts
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {mk.contact_steps.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setContacts(s)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium transition-colors duration-interaction ease-interaction",
                clamped === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-rule bg-card hover:border-primary/50",
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
            className="h-11 w-24 rounded-lg border border-rule bg-well px-2 text-xs font-semibold"
            aria-label="Custom contact count"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {freeEligible ? (
          <div className="rounded-lg border border-witnessed/40 bg-witnessed-tint p-3 text-sm">
            <span className="font-semibold text-witnessed">Free covers you</span>
          </div>
        ) : null}
        {paidTiers.map((t) => {
          const p = tierPrice(t, clamped);
          return (
            <div
              key={t.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border p-3",
                t.id === "mk_growth" ? "border-primary/50 bg-well" : "border-rule",
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {t.name}
                  {t.id === "mk_growth" ? (
                    <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[12px] font-medium text-primary-foreground">
                      Recommended
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {num(clamped * (t.sends_per_contact ?? 0))} emails/mo ·{" "}
                  {num(clamped * (t.daily_per_contact ?? 0))}/day ·{" "}
                  {t.included_audiences === -1 ? "unlimited" : t.included_audiences} audience
                  {t.included_audiences === 1 ? "" : "s"}
                </p>
              </div>
              <p className="shrink-0 text-right">
                <span className="display-num text-[1.5rem] leading-none" data-fact>
                  {money(p)}
                </span>
                <span className="mt-1 block text-[12.5px] text-ink-muted">
                  /mo · {money(p * 10)}/yr
                </span>
              </p>
            </div>
          );
        })}
      </div>

      <ul className="ruled mt-5 flex-1 border-t border-rule font-mono text-[12.5px] text-ink-muted">
        {[
          "campaigns · sequences · inbox",
          "sent → delivered → opened",
          "footers · one-click unsubscribe",
          "separate from transactional",
        ].map((f) => (
          <li key={f} className="py-2" data-fact>
            {f}
          </li>
        ))}
      </ul>

      <CtaButton label="Start free" className="mt-6 w-full" />
    </div>
  );
}
