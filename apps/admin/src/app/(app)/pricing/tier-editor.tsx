"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, Pencil, Users, Zap } from "lucide-react";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminTier } from "@/lib/types";
import { type PlanState, updateTier } from "./actions";

const num = (n: number) => n.toLocaleString();
const cap = (n: number | null) => (n == null ? "—" : n === -1 ? "∞" : num(n));

const WING_META: Record<AdminTier["wing"], { label: string; icon: typeof Zap; note: string }> = {
  transactional: {
    label: "Transactional — priced by send volume",
    icon: Zap,
    note: "Blocks of 25k sends; the bracket rates live in code (BLOCK_BRACKETS). Editable here: the overage rate and what the tier includes.",
  },
  marketing: {
    label: "Marketing — priced by contact size",
    icon: Megaphone,
    note: "price = contacts × rate/1k contacts · volume = contacts × sends-per-contact. These multipliers ARE the product — a rate change re-mints the billed Stripe price (existing subscribers grandfathered).",
  },
  platform: {
    label: "Platform base (legacy shell)",
    icon: Users,
    note: "Platform-as-a-plan is retired — its offerings are add-ons now. Kept for the free base row.",
  },
};

/** The per-wing tier catalog: view-first rows grouped by wing, edit-in-place. */
export function TierEditor({ tiers }: { tiers: AdminTier[] }) {
  const wings: AdminTier["wing"][] = ["transactional", "marketing", "platform"];
  return (
    <div className="space-y-5">
      {wings.map((w) => {
        const rows = tiers.filter((t) => t.wing === w).sort((a, b) => a.rank - b.rank);
        if (rows.length === 0) return null;
        const meta = WING_META[w];
        return (
          <div key={w} className="rounded-xl border">
            <div className="flex items-start gap-2.5 border-b bg-secondary/30 px-4 py-3">
              <meta.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">{meta.label}</p>
                <p className="text-xs text-muted-foreground">{meta.note}</p>
              </div>
            </div>
            <div className="divide-y">
              {rows.map((t) => (
                <TierRow key={t.id} tier={t} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TierRow({ tier }: { tier: AdminTier }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <AnimatePresence initial={false}>
        <motion.div
          key="form"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="overflow-hidden"
        >
          <TierForm tier={tier} onClose={() => setEditing(false)} />
        </motion.div>
      </AnimatePresence>
    );
  }

  const isBlocks = tier.id === "tx_blocks";
  const isMkPaid = tier.wing === "marketing" && (tier.perThousandCents ?? 0) > 0;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3 text-sm">
      <span className="w-40 font-medium">
        {tier.name}
        <span className="block text-[11px] font-normal text-muted-foreground">{tier.id}</span>
      </span>

      <span className="min-w-32">
        {isBlocks ? (
          <>volume-tiered <span className="text-muted-foreground">· overage {(tier.overagePer1000Cents / 100).toFixed(2)}$/1k</span></>
        ) : isMkPaid ? (
          <>
            ${((tier.perThousandCents ?? 0) / 100).toFixed(2)}/1k contacts
            <span className="block text-[11px] text-muted-foreground">
              ×{tier.sendsPerContact ?? 0} sends/contact · ×{tier.dailyPerContact ?? 0}/day · {cap(tier.includedAudiences)} audiences
            </span>
          </>
        ) : tier.priceMonthly != null && tier.priceMonthly > 0 ? (
          <>${tier.priceMonthly}/mo</>
        ) : (
          <span className="text-muted-foreground">Free</span>
        )}
      </span>

      <span className="text-xs text-muted-foreground">
        AI {cap(tier.aiCredits)} · seats {cap(tier.seats)} · ws {cap(tier.workspaceLimit)}
        {tier.wing === "marketing" && !isMkPaid ? <> · audiences {cap(tier.includedAudiences)}</> : null}
      </span>

      <span className="ml-auto flex items-center gap-2">
        {!tier.active ? <Badge variant="muted">inactive</Badge> : null}
        {tier.stripePriceMonthId ? (
          <Badge variant="secondary">stripe ✓</Badge>
        ) : tier.priceMonthly || isBlocks || isMkPaid ? (
          <Badge variant="muted">no stripe price</Badge>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" /> Edit
        </Button>
      </span>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  hint,
  step,
}: {
  label: string;
  name: string;
  defaultValue: number | string | null;
  hint?: string;
  step?: string;
}) {
  return (
    <div>
      <Label htmlFor={`${name}-f`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`${name}-f`}
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue == null ? "" : defaultValue}
        className="mt-1 h-8"
      />
      {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function TierForm({ tier, onClose }: { tier: AdminTier; onClose: () => void }) {
  const [state, action] = useActionState<PlanState, FormData>(updateTier, {});
  const isMk = tier.wing === "marketing";
  const isBlocks = tier.id === "tx_blocks";
  const flatPriced = !isMk && !isBlocks;

  return (
    <form action={action} className="space-y-3 bg-secondary/20 px-4 py-3">
      <input type="hidden" name="id" value={tier.id} />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <Label htmlFor={`name-${tier.id}`} className="text-xs">
            Name
          </Label>
          <Input id={`name-${tier.id}`} name="name" defaultValue={tier.name} className="mt-1 h-8" />
        </div>
        {flatPriced ? (
          <Field label="Price $/mo (empty = free)" name="price_monthly" defaultValue={tier.priceMonthly} />
        ) : null}
        {isBlocks ? (
          <Field
            label="Overage ¢/1,000 sends"
            name="overage_per_1000_cents"
            defaultValue={tier.overagePer1000Cents}
            hint="Billed on the metered overage sub — price re-mints on change"
          />
        ) : null}
        {isMk ? (
          <>
            <Field
              label="Rate ¢/1k contacts/mo"
              name="per_thousand_cents"
              defaultValue={tier.perThousandCents}
              hint="THE price lever — re-mints the Stripe price"
            />
            <Field label="Sends per contact / mo" name="sends_per_contact" defaultValue={tier.sendsPerContact} />
            <Field label="Daily sends per contact" name="daily_per_contact" defaultValue={tier.dailyPerContact} />
            <Field label="Audiences (-1 = ∞)" name="included_audiences" defaultValue={tier.includedAudiences} />
          </>
        ) : null}
        <Field label="AI credits (-1 = ∞)" name="ai_credits" defaultValue={tier.aiCredits} />
        <Field label="Seats (-1 = ∞)" name="seats" defaultValue={tier.seats} />
        <Field label="Workspaces (-1 = ∞)" name="workspace_limit" defaultValue={tier.workspaceLimit} />
      </div>

      {state.error ? <p className="text-xs text-red-500">{state.error}</p> : null}
      {state.ok ? (
        <p className="text-xs text-emerald-500">
          Saved{state.sync === "synced" ? " — Stripe price re-minted" : state.sync === "failed" ? " — Stripe sync FAILED (check logs)" : ""}.
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <SubmitButton size="sm">Save tier</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </form>
  );
}
