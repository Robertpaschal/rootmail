"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, ChevronRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The settings index.
 *
 * Settings used to bounce you straight into Profile, so there was never a place
 * that answered "what can I change, and what is it set to right now?" Three
 * things follow from that, and this page exists to fix all three:
 *
 *  • **A map.** Every setting is listed once, including the ones that live in
 *    other sections (Team, Plan & usage, Client domains, API keys). Those are
 *    labelled with where they actually are rather than quietly omitted —
 *    people look for SSO in Settings whether or not we file it under Team.
 *  • **State, not just labels.** Each row carries its CURRENT value. Whether
 *    two-factor is on, how many senders are verified, where replies go — you
 *    read it here instead of opening three pages to find out.
 *  • **Search.** Nobody remembers which tab holds a toggle. Typing "reply",
 *    "2fa" or "unsubscribe" should find it.
 */

export type Tone = "ok" | "warn" | "muted";

export interface SettingRow {
  id: string;
  label: string;
  /** What it does, in one plain line. */
  blurb: string;
  href: string;
  /** The current value, phrased for a person. */
  value: string;
  tone?: Tone;
  /** Set when this is unfinished — the row floats to the top and says why. */
  attention?: string;
  /** Set when the setting lives OUTSIDE Settings, e.g. "in Team". */
  where?: string;
  /** Extra search terms that aren't in the label or blurb. */
  keywords?: string[];
}

export interface SettingGroup {
  label: string;
  hint?: string;
  rows: SettingRow[];
}

const TONE: Record<Tone, string> = {
  ok: "text-witnessed",
  warn: "text-acted",
  muted: "text-muted-foreground",
};

function matches(r: SettingRow, q: string): boolean {
  if (!q) return true;
  const hay = [r.label, r.blurb, r.value, r.where ?? "", ...(r.keywords ?? [])].join(" ").toLowerCase();
  return hay.includes(q);
}

function Row({ r, reduce }: { r: SettingRow; reduce: boolean | null }) {
  const external = Boolean(r.where);
  return (
    <motion.div layout={reduce ? false : "position"} transition={reduce ? { duration: 0 } : { duration: 0.2 }}>
      <Link
        href={r.href}
        className="group flex items-start gap-3 border-b px-4 py-3.5 transition-colors last:border-b-0 hover:bg-accent/50"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{r.label}</span>
            {r.where ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground">
                {r.where}
              </span>
            ) : null}
            {r.attention ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-acted/15 px-2 py-0.5 text-[12px] font-semibold text-acted">
                <AlertTriangle className="size-3" /> {r.attention}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{r.blurb}</span>
        </span>
        <span className={cn("hidden shrink-0 text-right text-xs sm:block", TONE[r.tone ?? "muted"])}>
          {r.value}
        </span>
        {external ? (
          <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
        )}
      </Link>
    </motion.div>
  );
}

export function SettingsIndex({ groups }: { groups: SettingGroup[] }) {
  const [query, setQuery] = useState("");
  const reduce = useReducedMotion();
  const q = query.trim().toLowerCase();

  const attention = useMemo(
    () => groups.flatMap((g) => g.rows).filter((r) => r.attention && matches(r, q)),
    [groups, q],
  );
  const visible = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, rows: g.rows.filter((r) => matches(r, q)) }))
        .filter((g) => g.rows.length > 0),
    [groups, q],
  );
  const total = visible.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings — try “reply”, “2fa”, “unsubscribe”"
          aria-label="Search settings"
          className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Anything unfinished, lifted out of its group so it can't hide in the
          middle of a list. Only ever shown when there IS something. */}
      <AnimatePresence initial={false}>
        {attention.length > 0 ? (
          <motion.section
            key="attention"
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
          >
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-acted">
              Worth finishing
            </h2>
            <div className="overflow-hidden rounded-lg border border-acted/40 bg-acted/[0.04]">
              {attention.map((r) => (
                <Row key={`att-${r.id}`} r={r} reduce={reduce} />
              ))}
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {total === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing matches “{query}”. Settings for your team, plan and API keys live in their own
          sections — they&apos;re listed here too, so try a broader word.
        </p>
      ) : null}

      {visible.map((g) => (
        <section key={g.label}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label}
          </h2>
          {g.hint ? <p className="mb-2 -mt-1 text-xs text-muted-foreground">{g.hint}</p> : null}
          <div className="overflow-hidden rounded-lg border bg-card">
            {g.rows.map((r) => (
              <Row key={r.id} r={r} reduce={reduce} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
