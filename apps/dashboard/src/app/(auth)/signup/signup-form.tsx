"use client";

import { useActionState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { signup, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthState | null, FormData>(signup, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" autoComplete="name" placeholder="Ada Lovelace" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="organization_name">Organization</Label>
        <Input id="organization_name" name="organization_name" placeholder="Ada Labs" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
        />
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {pending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
