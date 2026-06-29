"use client";

import { useActionState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { submitDashboardLead, type ContactState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm({
  topic,
  cta,
  showVolume,
  defaults,
}: {
  topic: string;
  cta: string;
  showVolume: boolean;
  defaults: { name: string; email: string };
}) {
  const [state, action, pending] = useActionState<ContactState, FormData>(submitDashboardLead, {});

  if (state.ok) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-primary" />
        <h2 className="mt-3 text-lg font-semibold">Thanks — message sent.</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          Our team will get back to you, usually within one business day.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="topic" value={topic} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" defaultValue={defaults.name} required maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={defaults.email} required maxLength={200} />
        </div>
      </div>
      {showVolume ? (
        <div className="space-y-1.5">
          <Label htmlFor="expected_volume">Expected monthly volume (optional)</Label>
          <Input id="expected_volume" name="expected_volume" maxLength={80} placeholder="e.g. 2M / month" />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="message">How can we help?</Label>
        <Textarea
          id="message"
          name="message"
          rows={5}
          required
          maxLength={4000}
          placeholder={
            showVolume
              ? "Tell us about your use case, volume, and any requirements (SSO, residency, SLA)…"
              : "Describe what's happening — include your workspace and a recent message id if it's a sending issue."
          }
        />
      </div>
      {state.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Sending…" : cta}
        {!pending ? <ArrowRight className="size-4" /> : null}
      </Button>
    </form>
  );
}
