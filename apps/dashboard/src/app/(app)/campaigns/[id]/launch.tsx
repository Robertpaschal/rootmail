"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Loader2, Send } from "lucide-react";
import { sendCampaign } from "../actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAMPAIGN_JOURNEY, type CampaignPhase } from "../phase";

/**
 * Everything between "I have a draft" and "it's gone out".
 *
 * The detail page previously offered a bare "Send now" that was always enabled
 * on a draft, and an action that swallowed its own errors — so pressing the most
 * consequential button in the product could do nothing at all, silently. Three
 * things missing, all of them context:
 *
 *  • WHAT'S LEFT. A campaign isn't sendable until it has an audience, something
 *    to say, and an address to say it from. Those were checked server-side and
 *    the failure was thrown away. They're checked here, named, and each links to
 *    the page that fixes it.
 *  • HOW MANY PEOPLE. "Send now" never said who it was about to email. A number
 *    is the difference between a button and a decision.
 *  • THAT IT'S FINAL. Mail can't be unsent. One confirm step, showing the count
 *    and the from-address one last time.
 */

export interface Blocker {
  what: string;
  fixHref: string;
  fixLabel: string;
}

const EASE = { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.7 };

export function LaunchPanel({
  campaignId,
  audienceSize,
  fromLabel,
  blockers,
}: {
  campaignId: string;
  /** How many people this send resolves to right now. */
  audienceSize: number;
  fromLabel: string;
  blockers: Blocker[];
}) {
  const reduce = useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = blockers.length === 0 && audienceSize > 0;

  // A local datetime-local value is wall-clock in the user's zone; the API wants
  // an instant. new Date(value) reads it as local, so toISOString is correct.
  const launch = (at?: string) =>
    start(async () => {
      setError(null);
      const res = await sendCampaign(campaignId, at ? new Date(at).toISOString() : undefined);
      if (res.error) {
        setError(res.error);
        setConfirming(false);
        setScheduling(false);
        return;
      }
      // Success: the page revalidates and this panel disappears with the draft.
    });

  return (
    <div className="mb-6 overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {ready ? "Ready to send" : "Not ready yet"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {audienceSize > 0 ? (
              <>
                This goes to{" "}
                <span className="font-medium text-foreground">
                  {audienceSize.toLocaleString()} {audienceSize === 1 ? "person" : "people"}
                </span>
                , from {fromLabel}.
              </>
            ) : (
              "Nobody matches this campaign's audience yet — nothing would be sent."
            )}
          </p>
        </div>

        {ready ? (
          <AnimatePresence mode="wait" initial={false}>
            {confirming ? (
              <motion.div
                key="confirm"
                initial={reduce ? false : { opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="text-xs text-muted-foreground">
                  Email {audienceSize.toLocaleString()} {audienceSize === 1 ? "person" : "people"}? This
                  can&apos;t be undone.
                </span>
                <Button size="sm" onClick={() => launch()} disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" />}
                  {pending ? "Sending…" : "Yes, send it"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    setScheduling(true);
                  }}
                  disabled={pending}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Schedule instead
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Not yet
                </button>
              </motion.div>
            ) : scheduling ? (
              <motion.div
                key="schedule"
                initial={reduce ? false : { opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-wrap items-center gap-2"
              >
                <label className="text-xs text-muted-foreground" htmlFor="cmp-when">
                  Send at
                </label>
                <input
                  id="cmp-when"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button size="sm" onClick={() => launch(when)} disabled={pending || !when}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-3.5" />}
                  {pending ? "Scheduling…" : "Schedule it"}
                </Button>
                <button
                  type="button"
                  onClick={() => setScheduling(false)}
                  disabled={pending}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
                <Button size="sm" onClick={() => setConfirming(true)}>
                  <Send className="size-3.5" /> Send this campaign
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <Button size="sm" disabled title="Finish the steps below first">
            <Send className="size-3.5" /> Send this campaign
          </Button>
        )}
      </div>

      {/* What's standing in the way, each with the door to fix it. */}
      <AnimatePresence initial={false}>
        {blockers.length > 0 ? (
          <motion.div
            key="blockers"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { height: EASE, opacity: { duration: 0.16 } }}
            className="overflow-hidden border-t bg-acted/[0.04]"
          >
            <ul className="divide-y divide-acted/20">
              {blockers.map((b) => (
                <li key={b.what} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="size-4 shrink-0 text-acted" />
                    {b.what}
                  </span>
                  <Link
                    href={b.fixHref}
                    className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    {b.fixLabel} <ArrowRight className="size-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* A send the API refused used to look exactly like one that worked. */}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="err"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t bg-destructive/5 text-sm text-destructive"
          >
            <span className="block px-5 py-3">
              <span className="font-medium">This send didn&apos;t start.</span> {error}
            </span>
          </motion.p>
        ) : null}
      </AnimatePresence>

      {ready && !confirming ? (
        <p className="flex items-center gap-1.5 border-t px-5 py-2.5 text-xs text-muted-foreground">
          <Check className="size-3.5 text-witnessed" />
          Audience, content and sending address all check out.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The whole life of a campaign, as one rail — used on BOTH the new-campaign
 * screen and the campaign itself.
 *
 * It used to start at "Draft", which quietly said that creating a campaign
 * happened somewhere outside the flow: you filled in a separate form, got
 * redirected, and only then saw a progress rail — as if the journey began after
 * the work. Building it IS the first half. One rail, six marks, shown from the
 * moment you start.
 */
export function CampaignJourney({ phase }: { phase: CampaignPhase }) {
  const reduce = useReducedMotion();
  const at = CAMPAIGN_JOURNEY.indexOf(phase);

  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
      {CAMPAIGN_JOURNEY.map((s, i) => {
        const done = i < at;
        const now = i === at;
        return (
          <li key={s} className="flex items-center gap-2">
            <motion.span
              initial={false}
              animate={{ scale: now && !reduce ? 1.04 : 1 }}
              transition={reduce ? { duration: 0 } : EASE}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
                now && "bg-primary text-primary-foreground",
                done && "bg-witnessed/15 text-witnessed",
                !now && !done && "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" /> : null}
              {s}
            </motion.span>
            {i < CAMPAIGN_JOURNEY.length - 1 ? <span className="text-muted-foreground/50">→</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
