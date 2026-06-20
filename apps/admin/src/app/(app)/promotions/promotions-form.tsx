"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type PromoState, createPromotion } from "./actions";

export function CreatePromotionForm() {
  const [state, action] = useActionState<PromoState, FormData>(createPromotion, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="code" className="text-xs text-muted-foreground">
            Code
          </Label>
          <Input id="code" name="code" placeholder="LAUNCH20" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="type" className="text-xs text-muted-foreground">
            Type
          </Label>
          <select
            id="type"
            name="type"
            defaultValue="percent"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="percent">Percent off (%)</option>
            <option value="amount">Amount off ($)</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="value" className="text-xs text-muted-foreground">
            Value (% or $)
          </Label>
          <Input id="value" name="value" type="number" step="0.01" min="0.01" placeholder="20" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="duration" className="text-xs text-muted-foreground">
            Duration
          </Label>
          <select
            id="duration"
            name="duration"
            defaultValue="once"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="once">Once</option>
            <option value="repeating">Repeating (months)</option>
            <option value="forever">Forever</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="duration_in_months" className="text-xs text-muted-foreground">
            Months (if repeating)
          </Label>
          <Input id="duration_in_months" name="duration_in_months" type="number" min="1" placeholder="3" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="max_redemptions" className="text-xs text-muted-foreground">
            Max redemptions (optional)
          </Label>
          <Input id="max_redemptions" name="max_redemptions" type="number" min="1" placeholder="∞" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Creating…">Create promotion</SubmitButton>
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-emerald-600">Created.</span> : null}
      </div>
    </form>
  );
}
