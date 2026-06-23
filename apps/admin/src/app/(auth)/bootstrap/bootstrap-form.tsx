"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/app/submit-button";
import { bootstrapAction, type BootstrapState } from "./actions";

export function BootstrapForm() {
  const [state, action] = useActionState<BootstrapState, FormData>(bootstrapAction, {});
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" placeholder="Optional" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="secret">Bootstrap secret</Label>
        <Input id="secret" name="secret" type="password" required />
        <p className="text-xs text-muted-foreground">Your deployment&apos;s INTERNAL_API_SECRET. One-time use.</p>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <SubmitButton className="w-full" pendingLabel="Creating…">
        Create superadmin
      </SubmitButton>
    </form>
  );
}
