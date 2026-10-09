"use client";

import { useActionState, useId } from "react";
import { Loader2 } from "lucide-react";
import { resendConfirmation, type ResendState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "Didn't get Amazon's email, or the link expired?" — the way back for a
 * tester whose 24-hour confirmation link lapsed. Before this, the only way in
 * left to them was signing in with Google or GitHub.
 */
export function ResendConfirmation({ email }: { email?: string }) {
  const [state, action, pending] = useActionState<ResendState, FormData>(resendConfirmation, {});
  // This form can be on the page twice (success panel and the bottom row), so
  // every id is per instance.
  const uid = useId();
  const honeypotId = `resend-website-${uid}`;
  const emailId = `resend-email-${uid}`;

  if (state.message) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden"
      >
        <label htmlFor={honeypotId}>Website</label>
        <input id={honeypotId} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {email ? (
        <input type="hidden" name="email" value={email} />
      ) : (
        <>
          <Label htmlFor={emailId}>The address you joined the waitlist with</Label>
          <Input id={emailId} name="email" type="email" required placeholder="you@company.com" />
        </>
      )}
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Sending…
          </>
        ) : (
          "Send a new confirmation link"
        )}
      </Button>
    </form>
  );
}
