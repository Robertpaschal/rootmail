"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Megaphone, Zap } from "lucide-react";
import { PillTabs } from "@/components/app/pill-tabs";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Wing = "transactional" | "marketing";

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

export function ComparePlans() {
  const [wing, setWing] = useState<Wing>("transactional");
  const p = PITCH[wing];

  return (
    <div>
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold tracking-tight">Two products, priced independently</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          Each wing is sized by what it actually uses and billed on its own — be Free on one side and scale the
          other. Add-ons work across both.
        </p>
      </div>

      <PillTabs
        options={[
          { value: "transactional", label: "Transactional", icon: Zap },
          { value: "marketing", label: "Marketing", icon: Megaphone },
        ]}
        value={wing}
        onChange={(v) => setWing(v as Wing)}
        size="lg"
        layoutId="compare-wing"
        className="mb-6"
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={wing}
          initial={{ opacity: 0, x: wing === "marketing" ? 24 : -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: wing === "marketing" ? -24 : 24 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
