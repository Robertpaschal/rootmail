"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Megaphone, Package, Plus, Zap } from "lucide-react";
import { AddonCards } from "./addon-cards";
import { PillTabs } from "@/components/app/pill-tabs";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AddonCatalogItem, Wings } from "@/lib/types";

type Wing = "transactional" | "marketing";
type Segment = Wing | "addons";

const num = (n: number) => n.toLocaleString();

/**
 * The compare view.
 *
 * Two rules this page kept breaking before, now enforced by construction:
 *
 *  1. **Every number comes from the live catalog.** The old copy promised "from
 *     $6/block" while the entry bracket was $8 — a price the checkout would
 *     never honour. Nothing here is typed by hand any more.
 *  2. **Included ≠ available.** Client sending domains and a dedicated IP used
 *     to sit in the Transactional bullet list as though buying blocks bought
 *     them. They're add-ons. Each wing now shows what it *includes* and, in a
 *     visibly separate block, what you can *add*.
 */

interface Pitch {
  icon: typeof Zap;
  title: string;
  /** Plain-language "what is this for" — no jargon, no metaphors. */
  tagline: string;
  /** The one dimension the price moves on. */
  sizedBy: string;
  /** What the wing genuinely gives you, free tier included. */
  includes: string[];
  /** Bought separately. Never mixed into `includes`. */
  addOns: string[];
  href: string;
  cta: string;
}

function pitches(w: Wings | null): Record<Wing, Pitch> {
  const tx = w?.transactional;
  const mk = w?.marketing;
  const entryRate = tx?.brackets?.[0]?.per_block;
  const bestRate = tx?.brackets?.length ? tx.brackets[tx.brackets.length - 1].per_block : undefined;
  // Only claim a range when the catalog actually has one.
  const txPrice =
    entryRate == null
      ? "Free to start"
      : bestRate != null && bestRate < entryRate
        ? `Free, then $${entryRate}/block — down to $${bestRate} at volume`
        : `Free, then $${entryRate}/block`;

  return {
    transactional: {
      icon: Zap,
      title: "Transactional",
      tagline:
        "The email your product owes someone: receipts, password resets, confirmations, alerts. One person, one message, right now.",
      sizedBy: tx ? `Priced by how much you send · ${num(tx.block_size)} sends a block` : "Priced by how much you send",
      includes: [
        tx ? `${num(tx.free_sends)} sends every month on the free tier — no card` : "A free monthly allowance — no card",
        "Buy sends in blocks; the rate per block drops as you buy more",
        "Going over never blocks a send — you're billed for the overage, not cut off",
        "Write it in the composer or reuse a saved template — no code needed",
        "Every reply comes back to your inbox, on every tier",
        "Rehearse a real send safely with test addresses before you go live",
      ],
      addOns: ["Send on behalf of your clients' own domains", "A dedicated sending IP"],
      href: "/billing/transactional",
      cta: "Size my sends",
    },
    marketing: {
      icon: Megaphone,
      title: "Marketing",
      tagline:
        "The email you choose to send: campaigns and follow-ups to an audience you've built and can grow.",
      sizedBy: "Priced by how many contacts you keep",
      includes: [
        mk ? `Up to ${num(mk.free_contacts)} contacts free — no card` : "A free contact allowance — no card",
        "Your contact size sets the price; your plan turns it into monthly and daily send volume",
        "Collect subscribers with a hosted signup page or an embedded form, with opt-in confirmation",
        "Keep them in a real contact record — tags, audiences, notes and lifecycle stages",
        "Design campaigns visually and preview the exact email each person will get",
        "See the whole funnel: delivered → opened → clicked, per campaign and per person",
        "Unsubscribes, one-click headers and footers handled for you",
      ],
      addOns: ["More contacts than your plan's size", "More audiences to send to"],
      href: "/billing/marketing",
      cta: "Size my audience",
    },
  };
}

/** The lowest tier that carries a feature, named — so a gated line says WHERE. */
function gatedNote(w: Wings | null): string | null {
  const tiers = w?.marketing?.tiers ?? [];
  const seq = tiers.filter((t) => t.features.includes("sequences")).sort((a, b) => a.rank - b.rank)[0];
  return seq ? `Multi-step follow-up sequences unlock on ${seq.name}.` : null;
}

export function ComparePlans({
  addonCatalog,
  addonQty,
  initialSegment,
  wings,
}: {
  addonCatalog: AddonCatalogItem[];
  addonQty: Record<string, number>;
  /** From ?wing= — makes each pill's view a linkable URL. */
  initialSegment?: Segment;
  /** Live catalog — every price and volume on this page is read from it. */
  wings?: Wings | null;
}) {
  const [seg, setSeg] = useState<Segment>(initialSegment ?? "transactional");
  const reduce = useReducedMotion();
  const PITCH = pitches(wings ?? null);
  const gated = gatedNote(wings ?? null);

  // Keep the URL in step with the pill so any view here can be shared/linked
  // (?tab=plans&wing=…) without a router round-trip.
  const select = (v: Segment) => {
    setSeg(v);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "plans");
      url.searchParams.set("wing", v);
      window.history.replaceState(null, "", url);
    } catch {
      // URL sync is a nicety — never let it break the tab switch.
    }
  };

  return (
    <div>
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold tracking-tight">Two ways to send. Take one, or run both.</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          Transactional and Marketing are separate products with separate bills, and each is free until you
          outgrow it — so you can run one seriously and leave the other alone. Most people start with one.
        </p>
      </div>

      <PillTabs
        options={[
          { value: "transactional", label: "Transactional", icon: Zap },
          { value: "marketing", label: "Marketing", icon: Megaphone },
          { value: "addons", label: "Add-ons", icon: Package },
        ]}
        value={seg}
        onChange={(v) => select(v as Segment)}
        size="lg"
        layoutId="compare-seg"
        className="mb-6"
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={seg}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
        >
          {seg === "addons" ? (
            <div>
              <p className="mx-auto mb-4 max-w-xl text-center text-sm text-muted-foreground">
                Buy any of these on their own — no plan required. Each is priced per one and lands on a single
                add-ons bill, separate from either wing.
              </p>
              <AddonCards catalog={addonCatalog} quantities={addonQty} />
            </div>
          ) : (
            <WingPitch pitch={PITCH[seg]} priceLine={priceLineFor(seg, wings ?? null)} gated={seg === "marketing" ? gated : null} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function priceLineFor(wing: Wing, w: Wings | null): string {
  if (wing === "transactional") {
    const b = w?.transactional?.brackets ?? [];
    const entry = b[0]?.per_block;
    const best = b.length ? b[b.length - 1].per_block : undefined;
    if (entry == null) return "Starts free";
    return best != null && best < entry
      ? `Starts free · then $${entry} per block, down to $${best} at volume`
      : `Starts free · then $${entry} per block`;
  }
  const mk = w?.marketing;
  const paid = (mk?.tiers ?? [])
    .filter((t) => (t.per_thousand_cents ?? 0) > 0)
    .sort((a, b) => (a.per_thousand_cents ?? 0) - (b.per_thousand_cents ?? 0))[0];
  if (!mk) return "Starts free";
  const from = paid?.per_thousand_cents
    ? ` · then from $${(paid.per_thousand_cents / 100).toFixed(0)} per 1,000 contacts`
    : "";
  return `Free up to ${num(mk.free_contacts)} contacts${from}`;
}

function WingPitch({ pitch: p, priceLine, gated }: { pitch: Pitch; priceLine: string; gated: string | null }) {
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b bg-muted/30 p-6 text-center">
        <span className="inline-grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <p.icon className="size-6" />
        </span>
        <h3 className="mt-3 text-xl font-bold">{p.title}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{p.tagline}</p>
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-primary">{p.sizedBy}</p>
      </div>

      <div className="p-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          What you get
        </p>
        <ul className="space-y-2.5">
          {p.includes.map((pt) => (
            <li key={pt} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span>{pt}</span>
            </li>
          ))}
        </ul>

        {gated ? (
          <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{gated}</p>
        ) : null}

        {/* Kept visibly apart from the list above: these are NOT included, and
            reading them as included is the mistake this page used to invite. */}
        <div className="mt-5 rounded-xl border border-dashed p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Add separately, if you need it
          </p>
          <ul className="mt-2 space-y-1.5">
            {p.addOns.map((a) => (
              <li key={a} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Plus className="mt-0.5 size-3.5 shrink-0" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          <Link href={p.href} className={cn(buttonVariants({ size: "lg" }), "w-full max-w-xs")}>
            {p.cta} <ArrowRight className="size-4" />
          </Link>
          <p className="text-xs text-muted-foreground">{priceLine}</p>
        </div>
      </div>
    </div>
  );
}
