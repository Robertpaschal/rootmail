"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Megaphone, Users, Zap } from "lucide-react";
import { chooseWingTier } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WingId, WingLadder as Ladder, WingTier } from "@/lib/types";

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
    blurb: "Automated app email — receipts, resets, alerts. Priced by how much you send.",
  },
  marketing: {
    label: "Marketing",
    icon: Megaphone,
    sizedBy: "by contacts",
    blurb: "Campaigns and sequences to your audience. Priced by how many contacts you keep.",
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
}: {
  wing: WingId;
  ladder: Ladder;
  recommendedId?: string;
}) {
  const meta = WING_META[wing];
  // Best plan first, Free last (per the pricing reference).
  const tiers = [...ladder.tiers].sort((a, b) => b.rank - a.rank);

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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {tiers.map((t) => {
          const isCurrent = ladder.current_tier_id === t.id;
          const isRecommended = recommendedId === t.id;
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
                {wing === "transactional" && t.allow_overage && t.overage_per_1000 > 0 ? (
                  <p className="text-[11px] text-muted-foreground">then ${t.overage_per_1000}/1,000</p>
                ) : null}
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

/** Choose a tier: paid → Stripe Checkout (redirect), Free → applied immediately,
 * custom → contact sales. The card's whole point of action. */
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
      <Button variant="outline" size="sm" className="mt-4 w-full" disabled>
        Current plan
      </Button>
    );
  }

  const custom = tier.price_monthly === null;
  const free = tier.price_monthly === 0;
  const label = custom ? "Contact sales" : free ? `Use ${tier.name}` : `Choose ${tier.name}`;

  return (
    <div className="mt-4">
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
