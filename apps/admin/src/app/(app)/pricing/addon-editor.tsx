"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminAddon } from "@/lib/types";
import { type PlanState, updateAddon } from "./actions";

export function AddonEditor({ addon }: { addon: AdminAddon }) {
  const [state, action] = useActionState<PlanState, FormData>(updateAddon, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-4 border-b py-4 last:border-0">
      <input type="hidden" name="id" value={addon.id} />
      <input type="hidden" name="name" value={addon.name} />
      <div className="min-w-[12rem] flex-1">
        <div className="text-sm font-medium">{addon.name}</div>
        <div className="text-xs text-muted-foreground">{addon.description}</div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${addon.id}-amount`} className="text-xs text-muted-foreground">
          Price (USD/mo)
        </Label>
        <Input
          id={`${addon.id}-amount`}
          name="unit_amount"
          type="number"
          min="0"
          defaultValue={addon.unit_amount}
          className="w-28"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${addon.id}-grant`} className="text-xs text-muted-foreground">
          Grant / unit
        </Label>
        <Input
          id={`${addon.id}-grant`}
          name="grant"
          type="number"
          min="1"
          defaultValue={addon.grant}
          className="w-28"
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={addon.active} className="size-4" />
        Active
      </label>
      <div className="flex items-center gap-3 pb-1">
        <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        {state.ok ? (
          <span className={`text-sm ${state.sync === "failed" ? "text-amber-600" : "text-emerald-600"}`}>
            {state.sync === "synced"
              ? "Saved · Stripe synced"
              : state.sync === "failed"
                ? "Saved · sync failed"
                : "Saved"}
          </span>
        ) : null}
      </div>
    </form>
  );
}
