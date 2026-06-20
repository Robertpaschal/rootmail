"use client";

import { useActionState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { submitLead, type ContactState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"];
const VOLUMES = [
  "Under 50k / month",
  "50k–250k / month",
  "250k–1M / month",
  "1M–10M / month",
  "10M+ / month",
];

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(submitLead, {});

  if (state.ok) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-10 text-primary" />
        <h2 className="mt-4 text-xl font-semibold">Thanks — we&apos;ve got it.</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Our team will reach out within one business day to scope a plan that fits. In the meantime
          you can start building on any tier — no card required.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <input type="hidden" name="source" value="contact_form" />
      {/* Honeypot — hidden from humans; bots that fill it are dropped server-side. */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company_fax">Company fax</label>
        <input id="company_fax" name="company_fax" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Your name *</Label>
          <Input id="name" name="name" required maxLength={120} placeholder="Ada Lovelace" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            maxLength={200}
            placeholder="ada@company.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company">Company</Label>
          <Input id="company" name="company" maxLength={160} placeholder="Acme Inc" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input id="website" name="website" maxLength={200} placeholder="acme.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company_size">Company size</Label>
          <Select id="company_size" name="company_size" defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="expected_volume">Expected email volume</Label>
          <Select id="expected_volume" name="expected_volume" defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {VOLUMES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="current_provider">Current email provider (if any)</Label>
          <Input
            id="current_provider"
            name="current_provider"
            maxLength={120}
            placeholder="SendGrid, Postmark, in-house…"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="message">What are you looking to do?</Label>
          <Textarea
            id="message"
            name="message"
            maxLength={4000}
            placeholder="Tell us about your use case, compliance needs (SSO, residency, SLA), and timeline."
          />
        </div>
      </div>

      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          We&apos;ll only use this to contact you about rootmail.
        </p>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "Sending…" : "Talk to sales"}
          {!pending ? <ArrowRight className="size-4" /> : null}
        </Button>
      </div>
    </form>
  );
}
