"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/app/submit-button";
import { resetPasswordAction, type ResetState } from "../actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={200} required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={200} required />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Save new password
      </SubmitButton>
    </form>
  );
}
