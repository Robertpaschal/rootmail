"use client";

import { useState } from "react";
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

export function WingsPricing({ wings }: { wings: Wings }) {
  const [emails, setEmails] = useState("");
  const [contacts, setContacts] = useState("");
  const [team, setTeam] = useState("");
  const [rec, setRec] = useState<Record<WingId, string> | null>(null);

  function findPlan() {
    setRec({
      transactional: pick(wings.transactional.tiers, (t) => t.included_sends, Number(emails) || 0),
      marketing: pick(wings.marketing.tiers, (t) => t.included_contacts, Number(contacts) || 0),
      platform: pick(wings.platform.tiers, (t) => t.seats, Number(team) || 1),
    });
  }

  // Recommendation summary — the three chosen tiers + a rough monthly total.
  const chosen = rec
    ? ([
        ["Transactional", wings.transactional.tiers.find((t) => t.id === rec.transactional)],
        ["Marketing", wings.marketing.tiers.find((t) => t.id === rec.marketing)],
        ["Platform", wings.platform.tiers.find((t) => t.id === rec.platform)],
      ] as const)
    : null;
  const hasCustom = chosen?.some(([, t]) => t?.price_monthly == null);
  const total = chosen?.reduce((sum, [, t]) => sum + (t?.price_monthly ?? 0), 0) ?? 0;

  return (
    <div className="space-y-8">
      {/* "Find my plan" — the quiz from the pricing reference. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Wand2 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Not sure? Find my plan</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="q-emails" className="text-xs">Emails per month</Label>
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
          <Button size="sm" className="mt-3" onClick={findPlan}>
            <Sparkles className="size-4" /> Recommend my plan
          </Button>

          {chosen ? (
            <div className="mt-4 rounded-md border bg-background p-3 text-sm">
              <p className="font-medium">We&apos;d suggest:</p>
              <p className="mt-1 text-muted-foreground">
                {chosen.map(([label, t], i) => (
                  <span key={label}>
                    {i > 0 ? " · " : ""}
                    <span className="font-medium text-foreground">{label} {t?.name}</span>
                  </span>
                ))}
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

      <WingLadder wing="transactional" ladder={wings.transactional} recommendedId={rec?.transactional} />
      <WingLadder wing="marketing" ladder={wings.marketing} recommendedId={rec?.marketing} />
      <WingLadder wing="platform" ladder={wings.platform} recommendedId={rec?.platform} />
    </div>
  );
}
