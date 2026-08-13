"use client";

import { useActionState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { joinWaitlist, type WaitlistState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const VOLUMES = [
  "Not sending yet",
  "Under 1,000 / month",
  "1,000–10,000 / month",
  "10,000–100,000 / month",
  "100,000+ / month",
];

export function WaitlistForm() {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, {});

  if (state.ok) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-10 text-primary" />
        <h2 className="mt-4 text-xl font-semibold">You&apos;re on the list.</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          We let people in a handful at a time, so the ones already inside get real attention. When
          it&apos;s your turn you&apos;ll get an email with your invite code.
        </p>
        {/* Nobody clicks an unexplained AWS email. Saying it is coming, and why,
            is the difference between a tester who gets in and one who never
            hears from us again — we cannot send them anything until they do. */}
        <div className="mx-auto mt-5 max-w-md rounded-xl border bg-muted/40 p-4 text-left">
          <p className="text-sm font-medium">One thing first — check for an email from Amazon</p>
          <p className="mt-1 text-sm text-muted-foreground">
            While we&apos;re in beta, our email provider asks each tester to confirm their address
            once. It arrives from <span className="font-medium">Amazon Web Services</span> with the
            subject &ldquo;Amazon SES Address Verification Request&rdquo;. Click the link inside and
            your invite follows — until you do, we&apos;re not able to email you at all.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      {/* Honeypot — off-screen for humans; bots that fill it are dropped server-side. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden"
      >
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input id="email" name="email" type="email" required placeholder="you@company.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="Ada Lovelace" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="volume">How much email do you send today?</Label>
        <Select id="volume" name="volume" defaultValue="">
          <option value="">Prefer not to say</option>
          {VOLUMES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      </div>

      {/* The question that actually decides who we invite next. A beta whose
          testers all send the same kind of mail only proves one path works. */}
      <div className="space-y-2">
        <Label htmlFor="use_case">What would you use rootmail for?</Label>
        <Textarea
          id="use_case"
          name="use_case"
          rows={3}
          placeholder="Receipts and password resets for a small storefront — and a monthly note to about 400 customers."
        />
        <p className="text-xs text-muted-foreground">
          A sentence is plenty. We read these to decide who to invite next, and what to fix first.
        </p>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Adding you…
          </>
        ) : (
          <>
            Request an invite <ArrowRight className="ml-2 size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        No card, no charge. We&apos;ll only email you about your invite.
      </p>
    </form>
  );
}
