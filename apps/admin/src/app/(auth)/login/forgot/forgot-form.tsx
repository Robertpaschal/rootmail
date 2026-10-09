"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/app/submit-button";
import { forgotPasswordAction, type ForgotState } from "../actions";

export function ForgotForm() {
  const [state, action] = useActionState<ForgotState, FormData>(forgotPasswordAction, {});
  if (state.message) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Staff email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <SubmitButton className="w-full" pendingLabel="Sending…">
        Email me a reset link
      </SubmitButton>
    </form>
  );
}
