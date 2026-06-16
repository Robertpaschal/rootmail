"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { resetPassword, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthState | null, FormData>(resetPassword, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        {pending ? "Saving…" : "Reset password"}
      </Button>
    </form>
  );
}
