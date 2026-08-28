"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BarChart3,
  ExternalLink,
  Inbox,
  LayoutTemplate,
  Loader2,
  Mail,
  Megaphone,
  Repeat,
  ShieldCheck,
  Users,
} from "lucide-react";
import { openOurWorkspace } from "./actions";
import { cn } from "@/lib/utils";

/**
 * Every door into the product, from the staff console.
 *
 * This grid is the answer to "we should be exposed to everything our customers
 * are exposed to". Rather than rebuild compose, campaigns and segments in here
 * — badly, twice — each tile hands the staff member into the REAL page of the
 * REAL dashboard, signed in as rootmail. What our customers use is what we use,
 * including the parts that annoy them.
 *
 * Each click mints its own one-time code. They expire in sixty seconds, so a
 * code fetched on page load would be dead by the time anyone clicked; fetching
 * per click also means a stale tab can't hand someone a working session.
 */

interface Door {
  path: string;
  label: string;
  hint: string;
  icon: typeof Mail;
}

const DOORS: Door[] = [
  { path: "/messages/new", label: "Write an email", hint: "One customer, right now", icon: Mail },
  { path: "/campaigns", label: "Campaigns", hint: "Feature drops, onboarding nudges", icon: Megaphone },
  { path: "/contacts", label: "Our audience", hint: "Every customer, segmentable", icon: Users },
  { path: "/inbox", label: "Replies", hint: "What they wrote back", icon: Inbox },
  { path: "/sequences", label: "Sequences", hint: "Multi-step follow-up", icon: Repeat },
  { path: "/templates", label: "Templates", hint: "The design studio", icon: LayoutTemplate },
  { path: "/analytics", label: "Analytics", hint: "Opens, clicks, delivery", icon: BarChart3 },
  { path: "/deliverability", label: "Deliverability", hint: "Our own bounce rate", icon: ShieldCheck },
];

const EASE = { type: "spring" as const, stiffness: 400, damping: 32 };

export function OpenDoor({ compact = false }: { compact?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [going, setGoing] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const go = (path: string) => {
    setError(null);
    setGoing(path);
    start(async () => {
      const res = await openOurWorkspace(path);
      if (res.error || !res.url) {
        setError(res.error ?? "Couldn't open our workspace.");
        setGoing(null);
        return;
      }
      // Same tab: this is a session handoff, and a background tab holding a
      // live rootmail session is exactly what nobody should forget about.
      window.location.href = res.url;
    });
  };

  if (compact) {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => go("/")}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy && going === "/" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ExternalLink className="size-4" />
          )}
          Open the dashboard as rootmail
        </button>
        {error ? <p className="max-w-xs text-right text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {DOORS.map((d, i) => {
          const active = busy && going === d.path;
          return (
            <motion.button
              key={d.path}
              type="button"
              onClick={() => go(d.path)}
              disabled={busy}
              // Transform only — these doors are always rendered, and a
              // staggered fade means a staff member with frozen frames sees an
              // empty panel where the links should be.
              initial={{ y: 6 }}
              animate={{ y: 0 }}
              transition={{ ...EASE, delay: i * 0.03 }}
              whileHover={busy ? undefined : { y: -2 }}
              className={cn(
                "group flex items-start gap-3 rounded-lg border bg-card p-3.5 text-left transition-colors",
                "hover:border-primary/40 hover:bg-accent/50 disabled:opacity-60",
                active && "border-primary/60",
              )}
            >
              <span className="mt-0.5 rounded-md bg-muted p-1.5 text-muted-foreground group-hover:text-foreground">
                {active ? <Loader2 className="size-4 animate-spin" /> : <d.icon className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-medium">
                  {d.label}
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{d.hint}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
