"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Minus,
  Sparkles,
  TrendingUp,
  UserPlus,
  Workflow,
} from "lucide-react";
import { saveSignupSettings } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ContactList, ListGrowth } from "@/lib/types";

/** A properly-animated switch — Framer springs the knob (Tailwind's transform-var
 * transition didn't animate reliably). */
function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <motion.span
        className="size-5 rounded-full bg-white shadow-sm"
        animate={{ x: checked ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 550, damping: 32 }}
      />
    </button>
  );
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />} {label}
    </Button>
  );
}

function embedSnippet(endpoint: string, listId: string): string {
  return `<!-- rootmail signup form -->
<form action="${endpoint}" method="post">
  <input type="hidden" name="list_id" value="${listId}">
  <input type="email" name="email" placeholder="you@example.com" required>
  <input type="text" name="name" placeholder="Your name">
  <input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Subscribe</button>
</form>`;
}

function Stat({ label, value, tone, icon }: { label: string; value: string; tone?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className={cn("mt-0.5 text-xl font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

/**
 * "Grow this audience" — how customers get INTO this audience: read the growth at
 * a glance (net flow, joins vs leaves, a diverging 30-day chart), share the hosted
 * page / embed form, wire the signup tag to its welcome SEQUENCE, and see anyone
 * waitlisted (no contact room) with the honest fix.
 */
export function GrowAudience({
  list,
  growth,
  welcome,
}: {
  list: ContactList;
  growth: ListGrowth;
  welcome: { id: string; name: string; status: string } | null;
}) {
  const [enabled, setEnabled] = useState(list.signup_enabled);
  const [doubleOptIn, setDoubleOptIn] = useState(list.double_opt_in);
  const [tag, setTag] = useState(list.signup_tag ?? "");
  const [redirect, setRedirect] = useState(list.signup_redirect_url ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (next: boolean) => {
    setEnabled(next);
    setError(null);
    start(async () => {
      const res = await saveSignupSettings(list.id, { signup_enabled: next });
      if (res.error) {
        setEnabled(!next);
        setError(res.error);
      }
    });
  };

  const saveSettings = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await saveSignupSettings(list.id, {
        double_opt_in: doubleOptIn,
        signup_tag: tag.trim() || null,
        signup_redirect_url: redirect.trim() || null,
      });
      if (res.error) return setError(res.error);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const sub = growth.totals.subscribed_30d;
  const unsub = growth.totals.unsubscribed_30d;
  const net = sub - unsub;
  const max = Math.max(1, ...growth.days.map((d) => Math.max(d.subscribed, d.unsubscribed)));

  const insight =
    net > 0
      ? { text: `Growing — ${net} net new ${net === 1 ? "contact" : "contacts"} in the last 30 days.`, tone: "text-emerald-600" }
      : net < 0
        ? { text: `Down ${Math.abs(net)} this month — more people left than joined. Worth a look at your content or cadence.`, tone: "text-red-500" }
        : sub > 0
          ? { text: "Steady — joins and unsubscribes balanced out this month.", tone: "text-muted-foreground" }
          : { text: "No signups yet — share your page below to get the first ones.", tone: "text-muted-foreground" };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4 text-primary" /> Grow this audience
          </CardTitle>
          <CardDescription>
            Let people subscribe themselves — share a page or embed the form. New subscribers can kick off a welcome
            sequence automatically.
          </CardDescription>
        </div>
        <Switch checked={enabled} onChange={toggle} disabled={pending} />
      </CardHeader>

      {enabled ? (
        <CardContent className="space-y-6">
          {/* At a glance — the numbers first, made obvious */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="Net (30d)"
                value={net > 0 ? `+${net}` : `${net}`}
                tone={net > 0 ? "text-emerald-600" : net < 0 ? "text-red-500" : undefined}
                icon={net > 0 ? <ArrowUpRight className="size-3" /> : net < 0 ? <ArrowDownRight className="size-3" /> : <Minus className="size-3" />}
              />
              <Stat label="Joined" value={`${sub}`} tone="text-emerald-600" />
              <Stat label="Unsubscribed" value={`${unsub}`} tone="text-red-500" />
              <Stat label="Waiting" value={`${growth.waitlisted}`} tone={growth.waitlisted ? "text-amber-600" : undefined} />
            </div>

            {/* Diverging chart: joins up, leaves down, from a shared zero line */}
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500/80" /> Joined</span>
                  <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-red-400/70" /> Unsubscribed</span>
                </span>
                <span>Last 30 days</span>
              </div>
              <div className="relative">
                <div className="flex h-24 items-stretch gap-[2px]">
                  {growth.days.map((d) => (
                    <div key={d.day} className="flex flex-1 flex-col" title={`${d.day}: +${d.subscribed} joined / −${d.unsubscribed} left`}>
                      <div className="flex flex-1 flex-col justify-end pb-px">
                        <div className="rounded-t-sm bg-emerald-500/80" style={{ height: `${(d.subscribed / max) * 100}%`, minHeight: d.subscribed ? 2 : 0 }} />
                      </div>
                      <div className="flex flex-1 flex-col justify-start pt-px">
                        <div className="rounded-b-sm bg-red-400/70" style={{ height: `${(d.unsubscribed / max) * 100}%`, minHeight: d.unsubscribed ? 2 : 0 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>30 days ago</span>
                <span>Today</span>
              </div>
            </div>

            <p className={cn("text-sm", insight.tone)}>{insight.text}</p>
          </div>

          {/* Waitlist: never lost, honestly surfaced */}
          {growth.waitlisted > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/60 bg-amber-50/60 p-3 text-sm dark:bg-amber-500/10">
              <UserPlus className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {growth.waitlisted} {growth.waitlisted === 1 ? "person is" : "people are"} waiting to join
                </span>{" "}
                — they signed up while your audiences were at their contact limit. They're saved, and added automatically
                the moment room opens up.
              </span>
              <Link href="/billing/marketing" className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600">
                Make room now
              </Link>
            </div>
          ) : null}

          {/* Share it */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Share your signup page</p>
            <div className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">{growth.hosted_url}</p>
                <a
                  href={growth.hosted_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
                >
                  <ExternalLink className="size-3.5" /> Preview
                </a>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyBtn value={growth.hosted_url} label="Copy link" />
                <CopyBtn value={embedSnippet(growth.subscribe_endpoint, list.id)} label="Copy embed form" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Share the link anywhere (bio, posts, QR), or paste the embed form into your own site — style it however
                you like; only the field names matter.
              </p>
            </div>
          </div>

          {/* How new subscribers are handled */}
          <div className="space-y-3">
            <p className="text-sm font-medium">When someone subscribes</p>

            <label className="flex items-start gap-2.5 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                checked={doubleOptIn}
                onChange={(e) => setDoubleOptIn(e.target.checked)}
                className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="font-medium">Confirm by email first (double opt-in)</span>
                <span className="block text-xs text-muted-foreground">
                  A branded confirmation from your verified address before they join — keeps the list clean. Recommended.
                </span>
              </span>
            </label>

            <div className="rounded-lg border p-3">
              <Label htmlFor="signup-tag" className="text-xs">Tag new subscribers</Label>
              <Input id="signup-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="newsletter" className="mt-1 h-8" />
              {/* Integration: the tag → its welcome sequence, live */}
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs">
                <Workflow className="size-3.5 shrink-0 text-primary" />
                {welcome ? (
                  <span className="min-w-0 flex-1">
                    New subscribers start{" "}
                    <Link href={`/sequences/${welcome.id}`} className="font-medium text-foreground hover:underline">
                      {welcome.name}
                    </Link>
                    <span className="text-muted-foreground"> · {welcome.status}</span>
                  </span>
                ) : tag.trim() ? (
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    No welcome sequence runs on “{tag.trim()}” yet.
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    Set a tag, then a sequence triggered by it greets subscribers automatically.
                  </span>
                )}
                {!welcome ? (
                  <Link
                    href="/sequences/new"
                    className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Create welcome sequence <ArrowRight className="size-3" />
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <Label htmlFor="signup-redirect" className="text-xs">After subscribing, send them to</Label>
              <Input id="signup-redirect" value={redirect} onChange={(e) => setRedirect(e.target.value)} placeholder="https://yoursite.com/thanks (optional)" className="mt-1 h-8" />
              <p className="mt-1 text-[11px] text-muted-foreground">Your own thank-you or welcome page. Leave blank to show ours.</p>
            </div>

            <div className="flex items-center gap-3">
              <Button size="sm" onClick={saveSettings} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save settings
              </Button>
              {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
              {error ? <span className="text-sm text-destructive">{error}</span> : null}
            </div>
          </div>
        </CardContent>
      ) : (
        <CardContent className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 shrink-0 text-primary" /> Turn it on to get a shareable signup page, an embeddable
            form, subscribe/unsubscribe tracking, and automatic welcome sequences for new subscribers.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      )}
    </Card>
  );
}
