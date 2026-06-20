"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type CreditState, grantCredit } from "./actions";

export function GrantCreditForm({ orgId }: { orgId: string }) {
  const [state, action] = useActionState<CreditState, FormData>(grantCredit, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="orgId" value={orgId} />
      <div className="space-y-1">
        <Label htmlFor="amount" className="text-xs text-muted-foreground">
          Amount (USD)
        </Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="5.00"
          className="w-28"
          required
        />
      </div>
      <div className="min-w-[12rem] flex-1 space-y-1">
        <Label htmlFor="reason" className="text-xs text-muted-foreground">
          Reason
        </Label>
        <Input id="reason" name="reason" placeholder="Goodwill / outage credit" />
      </div>
      <SubmitButton variant="outline" pendingLabel="Granting…">
        Grant credit
      </SubmitButton>
      {state.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
      {state.ok ? <p className="w-full text-sm text-emerald-600">Credit applied.</p> : null}
    </form>
  );
}
