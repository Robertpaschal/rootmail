"use client";

import { useEffect, useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WingId, WingTier, Wings } from "@/lib/types";
import { WingLadder } from "./wing-ladder";

/** Smallest tier (by rank) whose metric covers `need`; falls back to the top tier.
 * -1 = unlimited always covers. */
function pick(tiers: WingTier[], value: (t: WingTier) => number | null, need: number): string {
  const asc = [...tiers].sort((a, b) => a.rank - b.rank);
  for (const t of asc) {
    const v = value(t);
    if (v === -1 || (v != null && v >= need)) return t.id;
  }
  return asc[asc.length - 1]?.id ?? "";
}

const money = (n: number) => `$${n.toLocaleString()}`;

interface Rec {
  tiers: Record<WingId, string>;
  blocks: number;
}

export function WingsPricing({
  wings,
  prefill,
}: {
  wings: Wings;
  /** Onboarding handoff (?emails=&contacts=&team=) — pre-fills + auto-runs the quiz. */
  prefill?: { emails?: number; contacts?: number; team?: number };
}) {
  const [emails, setEmails] = useState(prefill?.emails ? String(prefill.emails) : "");
  const [contacts, setContacts] = useState(prefill?.contacts ? String(prefill.contacts) : "");
  const [team, setTeam] = useState(prefill?.team ? String(prefill.team) : "");
  const [rec, setRec] = useState<Rec | null>(null);

  function findPlan(e?: number, c?: number, t?: number) {
    const sends = e ?? Number(emails) ?? 0;
    const tx = wings.transactional;
    // Within the free allowance → Free; past self-serve blocks → Enterprise;
    // otherwise exactly the blocks that cover the volume.
    const blocks = Math.max(1, Math.ceil((sends || 0) / tx.block_size));
    const txTier =
      (sends || 0) <= tx.free_sends ? "tx_free" : blocks > tx.max_blocks ? "tx_enterprise" : "tx_blocks";
    setRec({
      tiers: {
        transactional: txTier,
        marketing: pick(wings.marketing.tiers, (x) => x.included_contacts, c ?? Number(contacts) ?? 0),
        platform: pick(wings.platform.tiers, (x) => x.seats, t ?? Number(team) ?? 1),
      },
      blocks: txTier === "tx_blocks" ? blocks : 0,
    });
  }

  // Auto-run when arriving with onboarding answers.
  useEffect(() => {
    if (prefill && (prefill.emails || prefill.contacts || prefill.team)) {
      findPlan(prefill.emails ?? 0, prefill.contacts ?? 0, prefill.team ?? 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recommendation summary — the chosen tiers + a real monthly total.
  const chosen = rec
    ? ([
        ["Transactional", wings.transactional.tiers.find((t) => t.id === rec.tiers.transactional)],
        ["Marketing", wings.marketing.tiers.find((t) => t.id === rec.tiers.marketing)],
        ["Platform", wings.platform.tiers.find((t) => t.id === rec.tiers.platform)],
      ] as const)
    : null;
  const txMonthly = rec?.blocks
    ? rec.blocks *
      (wings.transactional.brackets.find((b) => rec.blocks <= b.up_to_blocks)?.per_block ??
        wings.transactional.brackets.at(-1)?.per_block ??
        0)
    : 0;
  const hasCustom = chosen?.some(([, t]) => t?.price_monthly == null);
  const total =
    (chosen?.reduce((sum, [label, t]) => (label === "Transactional" ? sum : sum + (t?.price_monthly ?? 0)), 0) ?? 0) +
    txMonthly;

  return (
    <div className="space-y-8">
      {/* "Find my plan" — three questions, one honest answer per wing. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Wand2 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Not sure? Find my plan</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="q-emails" className="text-xs">Transactional emails / month</Label>
              <Input id="q-emails" type="number" min={0} inputMode="numeric" placeholder="e.g. 40000"
                value={emails} onChange={(e) => setEmails(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-contacts" className="text-xs">Contacts you'll email</Label>
              <Input id="q-contacts" type="number" min={0} inputMode="numeric" placeholder="e.g. 5000"
                value={contacts} onChange={(e) => setContacts(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-team" className="text-xs">People on your team</Label>
              <Input id="q-team" type="number" min={1} inputMode="numeric" placeholder="e.g. 4"
                value={team} onChange={(e) => setTeam(e.target.value)} />
            </div>
          </div>
          <Button size="sm" className="mt-3" onClick={() => findPlan()}>
            <Sparkles className="size-4" /> Recommend my plan
          </Button>

          {chosen && rec ? (
            <div className="mt-4 rounded-md border bg-background p-3 text-sm">
              <p className="font-medium">We&apos;d suggest:</p>
              <p className="mt-1 text-muted-foreground">
                <span className="font-medium text-foreground">
                  Transactional{" "}
                  {rec.blocks > 0
                    ? `${rec.blocks} block${rec.blocks === 1 ? "" : "s"} (${(rec.blocks * wings.transactional.block_size).toLocaleString()} emails/mo)`
                    : (chosen[0][1]?.name ?? "Free")}
                </span>
                {" · "}
                <span className="font-medium text-foreground">Marketing {chosen[1][1]?.name}</span>
                {" · "}
                <span className="font-medium text-foreground">Platform {chosen[2][1]?.name}</span>
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                About <span className="font-semibold text-foreground">{money(total)}/mo</span>
                {hasCustom ? " + custom pricing on the Enterprise piece" : ""} — each wing billed on its own,
                so you only pay for the sides you use. Highlighted below.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <WingLadder
        wing="transactional"
        ladder={wings.transactional}
        recommendedId={rec?.tiers.transactional}
        recommendedBlocks={rec?.blocks || undefined}
      />
      <WingLadder wing="marketing" ladder={wings.marketing} recommendedId={rec?.tiers.marketing} />
      <WingLadder wing="platform" ladder={wings.platform} recommendedId={rec?.tiers.platform} />
    </div>
  );
}
