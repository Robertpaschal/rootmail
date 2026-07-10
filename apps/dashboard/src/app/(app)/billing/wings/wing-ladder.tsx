"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Megaphone, Minus, Plus, Users, Zap } from "lucide-react";
import { chooseWingTier } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  BlockBracket,
  TransactionalLadder,
  WingId,
  WingLadder as Ladder,
  WingTier,
} from "@/lib/types";

const FEATURE_LABEL: Record<string, string> = {
  audit: "Full audit trail",
  suppression: "Suppression & bounces",
  subtenants: "Client sending domains",
  dedicated_ip: "Dedicated IP",
  campaigns: "Campaigns",
  sequences: "Sequences & automation",
  threads: "Replies & shared inbox",
  rbac: "Custom team roles",
  sso: "SAML SSO + SCIM",
  proof: "Proof & compliance exports",
  residency: "Data residency",
};

const WING_META: Record<WingId, { label: string; icon: typeof Zap; sizedBy: string; blurb: string }> = {
  transactional: {
    label: "Transactional",
    icon: Zap,
    sizedBy: "by send volume",
    blurb: "Automated app email — receipts, resets, alerts. Buy blocks of sends; scaling is never punished.",
  },
  marketing: {
    label: "Marketing",
    icon: Megaphone,
    sizedBy: "by contacts",
    blurb: "Campaigns and sequences to your audience. You pay for audience size — a full campaign to everyone is always included.",
  },
  platform: {
    label: "Platform",
    icon: Users,
    sizedBy: "by team & governance",
    blurb: "Seats, workspaces, roles, and security — shared across both wings.",
  },
};

const num = (n: number) => n.toLocaleString();
const price = (p: number | null) => (p === null ? "Custom" : p === 0 ? "$0" : `$${num(p)}`);

/** Per-block rate for a quantity (volume mode — the whole lot at its bracket rate). */
function rateFor(brackets: BlockBracket[], blocks: number): number {
  for (const b of brackets) if (blocks <= b.up_to_blocks) return b.per_block;
  return brackets[brackets.length - 1]?.per_block ?? 0;
}

/** The wing's headline metric for a tier, in plain words. */
function metricLine(wing: WingId, t: WingTier): string {
  if (wing === "transactional") {
    return t.included_sends === -1 ? "Unlimited emails / mo" : `${num(t.included_sends ?? 0)} emails / mo`;
  }
  if (wing === "marketing") {
    return t.included_contacts === -1 ? "Unlimited contacts" : `${num(t.included_contacts ?? 0)} contacts`;
  }
  const seats = t.seats === -1 ? "Unlimited" : num(t.seats ?? 0);
  const ws = t.workspace_limit === -1 ? "Unlimited" : num(t.workspace_limit ?? 0);
  return `${seats} seats · ${ws} workspaces`;
}

export function WingLadder({
  wing,
  ladder,
  recommendedId,
  recommendedBlocks,
}: {
  wing: WingId;
  ladder: Ladder | TransactionalLadder;
  recommendedId?: string;
  /** Quiz-recommended block count (transactional wing only). */
  recommendedBlocks?: number;
}) {
  const meta = WING_META[wing];
  // Best plan first, Free last (per the pricing reference).
  const tiers = [...ladder.tiers].sort((a, b) => b.rank - a.rank);
  const tx = wing === "transactional" ? (ladder as TransactionalLadder) : null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-secondary text-foreground">
          <meta.icon className="size-4" />
        </span>
        <div>
          <h2 className="font-semibold leading-tight">
            {meta.label} <span className="text-sm font-normal text-muted-foreground">· priced {meta.sizedBy}</span>
          </h2>
          <p className="text-xs text-muted-foreground">{meta.blurb}</p>
        </div>
      </div>

      <div className={cn("grid gap-3", wing === "transactional" ? "md:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-5")}>
        {tiers.map((t) => {
          const isCurrent =
            ladder.current_tier_id === t.id && (t.id !== "tx_blocks" || (tx?.blocks ?? 0) > 0);
          const isRecommended = recommendedId === t.id;
          if (t.id === "tx_blocks" && tx) {
            return (
              <BlocksCard
                key={t.id}
                tx={tx}
                tier={t}
                isCurrent={isCurrent}
                recommended={isRecommended}
                recommendedBlocks={recommendedBlocks}
              />
            );
          }
          return (
            <Card
              key={t.id}
              className={cn(
                "flex flex-col transition-shadow",
                isCurrent && "border-primary ring-1 ring-primary/30",
                isRecommended && !isCurrent && "border-emerald-500 ring-1 ring-emerald-500/30",
              )}
            >
              <CardContent className="flex flex-1 flex-col p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{t.name}</h3>
                  {isCurrent ? (
                    <Badge>Current</Badge>
                  ) : isRecommended ? (
                    <Badge className="bg-emerald-500 hover:bg-emerald-500">For you</Badge>
                  ) : null}
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-bold">{price(t.price_monthly)}</span>
                  {t.price_monthly ? <span className="text-xs text-muted-foreground">/mo</span> : null}
                </div>
                {t.price_monthly != null && t.price_monthly > 0 && t.price_yearly != null ? (
                  <p className="text-[11px] text-emerald-600">${num(t.price_yearly)}/yr — 2 months free</p>
                ) : null}

                <p className="mt-3 text-xs font-medium text-foreground">{metricLine(wing, t)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t.ai_credits === -1 ? "Unlimited AI credits" : `${t.ai_credits} AI credits / mo`}
                </p>

                {t.features.length ? (
                  <ul className="mt-3 space-y-1">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                        {FEATURE_LABEL[f] ?? f}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <ChooseTierButton wing={wing} tier={t} isCurrent={isCurrent} recommended={isRecommended} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The transactional BLOCKS purchaser — the first-principles core: estimate your
 * monthly sends, buy exactly that many 25k blocks at a volume-discounted rate,
 * change it any time. No guessing a tier cap.
 */
function BlocksCard({
  tx,
  tier,
  isCurrent,
  recommended,
  recommendedBlocks,
}: {
  tx: TransactionalLadder;
  tier: WingTier;
  isCurrent: boolean;
  recommended: boolean;
  recommendedBlocks?: number;
}) {
  const [blocks, setBlocks] = useState<number>(
    recommendedBlocks ?? (tx.blocks > 0 ? tx.blocks : 4),
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const clamped = Math.min(Math.max(1, blocks || 1), tx.max_blocks);
  const rate = rateFor(tx.brackets, clamped);
  const monthly = clamped * rate;
  const sends = clamped * tx.block_size;
  const discounted = rate < (tx.brackets[0]?.per_block ?? rate);
  const changed = tx.blocks > 0 && clamped !== tx.blocks;

  const est = useMemo(() => {
    const first = tx.brackets[0]?.per_block ?? 0;
    return first > 0 ? Math.round((1 - rate / first) * 100) : 0;
  }, [rate, tx.brackets]);

  return (
    <Card
      className={cn(
        "flex flex-col border-primary/40 ring-1 ring-primary/15",
        isCurrent && "border-primary ring-primary/30",
        recommended && !isCurrent && "border-emerald-500 ring-emerald-500/30",
      )}
    >
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Send blocks</h3>
          {isCurrent ? (
            <Badge>Current · {num(tx.blocks)} block{tx.blocks === 1 ? "" : "s"}</Badge>
          ) : recommended ? (
            <Badge className="bg-emerald-500 hover:bg-emerald-500">For you</Badge>
          ) : (
            <Badge variant="secondary">Pay for volume</Badge>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          1 block = {num(tx.block_size)} emails/mo. Buy exactly what you send — volume rates drop as you grow.
        </p>

        {/* Quantity stepper */}
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="size-8 p-0"
            onClick={() => setBlocks(Math.max(1, clamped - 1))}
            aria-label="Fewer blocks"
          >
            <Minus className="size-3.5" />
          </Button>
          <Input
            type="number"
            min={1}
            max={tx.max_blocks}
            value={blocks}
            onChange={(e) => setBlocks(Number(e.target.value))}
            className="h-8 w-20 text-center"
            aria-label="Blocks"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="size-8 p-0"
            onClick={() => setBlocks(Math.min(tx.max_blocks, clamped + 1))}
            aria-label="More blocks"
          >
            <Plus className="size-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground">of {tx.max_blocks} max — then contact us</span>
        </div>

        <div className="mt-3 rounded-md border bg-muted/30 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold">${num(monthly)}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
            <span className="text-xs text-muted-foreground">${rate}/block</span>
          </div>
          <p className="mt-1 text-xs font-medium text-foreground">= {num(sends)} emails / mo</p>
          {discounted ? (
            <p className="text-[11px] text-emerald-600">Volume rate — {est}% off the base block price</p>
          ) : null}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Past your blocks, sending never stops — ${tier.overage_per_1000}/1,000 overage.
          </p>
        </div>

        <ul className="mt-3 space-y-1">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Check className="mt-0.5 size-3 shrink-0 text-primary" />
              {FEATURE_LABEL[f] ?? f}
            </li>
          ))}
          <li className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Check className="mt-0.5 size-3 shrink-0 text-primary" />
            {tier.ai_credits} AI credits / mo
          </li>
        </ul>

        <div className="mt-auto pt-4">
          <Button
            size="sm"
            className="w-full"
            disabled={pending || (isCurrent && !changed)}
            onClick={() => {
              setError(null);
              start(async () => {
                const res = await chooseWingTier("transactional", "tx_blocks", "month", clamped);
                if (res?.error) setError(res.error);
              });
            }}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {isCurrent && !changed
              ? "Current volume"
              : tx.blocks > 0
                ? `Update to ${num(clamped)} block${clamped === 1 ? "" : "s"}`
                : `Buy ${num(clamped)} block${clamped === 1 ? "" : "s"} · $${num(monthly)}/mo`}
          </Button>
          {error ? <p className="mt-1.5 text-[11px] text-destructive">{error}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Choose a tier: paid → Stripe Checkout (redirect), Free → applied immediately,
 * custom → contact sales. */
function ChooseTierButton({
  wing,
  tier,
  isCurrent,
  recommended,
}: {
  wing: WingId;
  tier: WingTier;
  isCurrent: boolean;
  recommended: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isCurrent) {
    return (
      <Button variant="outline" size="sm" className="mt-auto w-full" disabled>
        Current plan
      </Button>
    );
  }

  const custom = tier.price_monthly === null;
  const free = tier.price_monthly === 0;
  const label = custom ? "Contact sales" : free ? `Use ${tier.name}` : `Choose ${tier.name}`;

  return (
    <div className="mt-auto pt-4">
      <Button
        variant={recommended ? "default" : "outline"}
        size="sm"
        className="w-full"
        disabled={pending}
        onClick={() => {
          if (free && !confirm(`Switch this wing to ${tier.name}? Paid features on this wing stop immediately.`)) {
            return;
          }
          setError(null);
          start(async () => {
            const res = await chooseWingTier(wing, tier.id, "month");
            if (res?.error) setError(res.error);
          });
        }}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {label}
      </Button>
      {error ? <p className="mt-1.5 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
