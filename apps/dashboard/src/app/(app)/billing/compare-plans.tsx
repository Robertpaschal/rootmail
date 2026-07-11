"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Megaphone, Package, Zap } from "lucide-react";
import { AddonCards } from "./addon-cards";
import { PillTabs } from "@/components/app/pill-tabs";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AddonCatalogItem } from "@/lib/types";

type Wing = "transactional" | "marketing";
type Segment = Wing | "addons";

const PITCH: Record<
  Wing,
  {
    icon: typeof Zap;
    title: string;
    tagline: string;
    sizedBy: string;
    points: string[];
    href: string;
    cta: string;
    from: string;
  }
> = {
  transactional: {
    icon: Zap,
    title: "Transactional",
    tagline: "Every email your product sends — receipts, resets, alerts, notifications.",
    sizedBy: "Priced by send volume",
    points: [
      "3,000 sends every month, free — no card",
      "Then blocks of 25,000 at rates that drop as you grow",
      "Overage never stops your sending",
      "Client sending domains & a dedicated IP when you need them",
      "The send API, templates, sandbox, audit trail & webhooks",
    ],
    href: "/billing/transactional",
    cta: "Size my send blocks",
    from: "Free, then from $6/block",
  },
  marketing: {
    icon: Megaphone,
    title: "Marketing",
    tagline: "Reach your audience — campaigns, sequences, and replies that come back to you.",
    sizedBy: "Priced by contact size",
    points: [
      "Pick your audience size — it sets your price and your volume",
      "Bigger plans turn the same audience into more monthly + daily sends",
      "Campaigns, sequences & a shared replies inbox",
      "Full analytics funnel: sent → delivered → opened → clicked",
      "Compliance handled — footers & one-click unsubscribe",
    ],
    href: "/billing/marketing",
    cta: "Choose my contact size",
    from: "Free up to 500 contacts",
  },
};

export function ComparePlans({
  addonCatalog,
  addonQty,
}: {
  addonCatalog: AddonCatalogItem[];
  addonQty: Record<string, number>;
}) {
  const [seg, setSeg] = useState<Segment>("transactional");

  return (
    <div>
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold tracking-tight">Two products, one set of add-ons</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          Each wing is sized by what it actually uses and billed on its own — be Free on one side and scale the
          other. Add-ons are wing-agnostic; buy them on their own any time.
        </p>
      </div>

      <PillTabs
        options={[
          { value: "transactional", label: "Transactional", icon: Zap },
          { value: "marketing", label: "Marketing", icon: Megaphone },
          { value: "addons", label: "Add-ons", icon: Package },
        ]}
        value={seg}
        onChange={(v) => setSeg(v as Segment)}
        size="lg"
        layoutId="compare-seg"
        className="mb-6"
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={seg}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {seg === "addons" ? (
            <div>
              <p className="mx-auto mb-4 max-w-xl text-center text-sm text-muted-foreground">
                Extras that work across both wings — add exactly what you need, each priced per one. No plan required.
              </p>
              <AddonCards catalog={addonCatalog} quantities={addonQty} />
            </div>
          ) : (
            <WingPitch wing={seg} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function WingPitch({ wing }: { wing: Wing }) {
  const p = PITCH[wing];
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
        <ul className="mx-auto max-w-md space-y-2.5">
          {p.points.map((pt) => (
            <li key={pt} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span>{pt}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col items-center gap-2">
          <Link href={p.href} className={cn(buttonVariants({ size: "lg" }), "w-full max-w-xs")}>
            {p.cta} <ArrowRight className="size-4" />
          </Link>
          <p className="text-xs text-muted-foreground">{p.from}</p>
        </div>
      </div>
    </div>
  );
}
