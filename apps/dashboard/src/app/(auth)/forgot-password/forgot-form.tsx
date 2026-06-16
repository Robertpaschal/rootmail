"use client";

import { useActionState } from "react";
import { Loader2, Mail } from "lucide-react";
import { forgotPassword, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotForm() {
  const [state, action, pending] = useActionState<AuthState | null, FormData>(forgotPassword, null);

  if (state?.sent) {
    return (
      <p className="text-sm text-muted-foreground">
        If an account exists for that email, a reset link is on its way. Check your inbox (and spam).
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required />
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
