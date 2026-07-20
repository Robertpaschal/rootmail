"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Loader2, Sparkles, TrendingUp, UserPlus } from "lucide-react";
import { saveSignupSettings } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ContactList, ListGrowth } from "@/lib/types";

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

/**
 * "Grow this audience" — how customers get INTO this audience: share the hosted
 * signup page, embed the form on your own site, tune double opt-in / the signup
 * tag (your welcome-automation hook), and watch subs vs unsubs. Waitlisted
 * signups (no contact room) are surfaced with the honest fix.
 */
export function GrowAudience({ list, growth }: { list: ContactList; growth: ListGrowth }) {
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

  const max = Math.max(1, ...growth.days.map((d) => Math.max(d.subscribed, d.unsubscribed)));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4 text-primary" /> Grow this audience
          </CardTitle>
          <CardDescription>
            Let people subscribe themselves — share a page, or put the form on your own site. New subscribers can kick
            off a welcome sequence automatically.
          </CardDescription>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => toggle(!enabled)}
          disabled={pending}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            enabled ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        </button>
      </CardHeader>

      {enabled ? (
        <CardContent className="space-y-5">
          {/* Share it */}
          <div className="rounded-lg border p-3">
            <p className="mb-1.5 text-sm font-medium">Your signup page</p>
            <p className="break-all font-mono text-xs text-muted-foreground">{growth.hosted_url}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyBtn value={growth.hosted_url} label="Copy link" />
              <a
                href={growth.hosted_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                <ExternalLink className="size-3.5" /> Preview
              </a>
              <CopyBtn value={embedSnippet(growth.subscribe_endpoint, list.id)} label="Copy embed form" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Share the link anywhere (bio, posts, QR), or paste the embed form into your site or blog — style it however
              you like; only the field names matter.
            </p>
          </div>

          {/* Settings */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2.5 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                checked={doubleOptIn}
                onChange={(e) => setDoubleOptIn(e.target.checked)}
                className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="font-medium">Double opt-in</span>
                <span className="block text-xs text-muted-foreground">
                  Subscribers confirm from their inbox first — a branded email from your verified address. Keeps the list
                  clean; recommended.
                </span>
              </span>
            </label>
            <div className="space-y-2 rounded-lg border p-3">
              <div>
                <Label htmlFor="signup-tag" className="text-xs">Tag new subscribers</Label>
                <Input id="signup-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="newsletter" className="mt-1 h-8" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A sequence triggered by this tag becomes your welcome automation.
                </p>
              </div>
              <div>
                <Label htmlFor="signup-redirect" className="text-xs">After subscribing, send them to</Label>
                <Input id="signup-redirect" value={redirect} onChange={(e) => setRedirect(e.target.value)} placeholder="https://yoursite.com/thanks (optional)" className="mt-1 h-8" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={saveSettings} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save settings
            </Button>
            {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
            {error ? <span className="text-sm text-destructive">{error}</span> : null}
          </div>

          {/* Growth: subs vs unsubs, last 30 days */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-sm font-medium">Last 30 days</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-emerald-600">+{growth.totals.subscribed_30d}</span> subscribed ·{" "}
                <span className="font-semibold text-red-500">−{growth.totals.unsubscribed_30d}</span> unsubscribed
              </p>
            </div>
            <div className="flex h-16 items-end gap-[2px]" aria-hidden="true">
              {growth.days.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col justify-end gap-[1px]" title={`${d.day}: +${d.subscribed} / −${d.unsubscribed}`}>
                  <div className="w-full rounded-sm bg-emerald-500/80" style={{ height: `${(d.subscribed / max) * 100}%`, minHeight: d.subscribed ? 3 : 0 }} />
                  <div className="w-full rounded-sm bg-red-400/70" style={{ height: `${(d.unsubscribed / max) * 100}%`, minHeight: d.unsubscribed ? 3 : 0 }} />
                </div>
              ))}
            </div>
          </div>

          {/* Waitlist: never lost, honestly surfaced */}
          {growth.waitlisted > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/60 bg-amber-50/60 p-3 text-sm dark:bg-amber-500/10">
              <UserPlus className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {growth.waitlisted} {growth.waitlisted === 1 ? "person is" : "people are"} waiting to join
                </span>{" "}
                — they signed up while your audiences were at their contact limit. They're saved, and get added
                automatically the moment room opens up.
              </span>
              <Link href="/billing/marketing" className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600">
                Make room now
              </Link>
            </div>
          ) : null}
        </CardContent>
      ) : (
        <CardContent>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" /> Turn it on to get a shareable signup page, an embeddable form, and automatic
            welcome sequences for new subscribers.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
