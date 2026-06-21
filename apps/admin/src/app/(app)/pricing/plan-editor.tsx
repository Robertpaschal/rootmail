"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminPlan } from "@/lib/types";
import { clearPlanSale, type PlanState, setPlanSale, updatePlan } from "./actions";

function saleIsActive(plan: AdminPlan): boolean {
  if (!plan.sale_percent_off || plan.sale_percent_off <= 0) return false;
  if (!plan.sale_ends_at) return true;
  return new Date(plan.sale_ends_at).getTime() > Date.now();
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: string | number;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={name} name={name} type="number" defaultValue={defaultValue} placeholder={placeholder} />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function PlanEditor({ plan }: { plan: AdminPlan }) {
  const [state, action] = useActionState<PlanState, FormData>(updatePlan, {});
  return (
    <div className="space-y-4">
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={plan.id} />
      <input type="hidden" name="name" value={plan.name} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field
          name="price"
          label="Price (USD/mo)"
          defaultValue={plan.price ?? ""}
          placeholder="custom"
          hint="blank = custom"
        />
        <Field name="monthly_quota" label="Monthly emails" defaultValue={plan.monthly_quota} />
        <Field
          name="overage_per_1000_cents"
          label="Overage ¢/1k"
          defaultValue={plan.overage_per_1000_cents}
          hint="85 = $0.85"
        />
        <Field name="seats" label="Seats" defaultValue={plan.seats} hint="-1 = ∞" />
        <Field
          name="included_sub_tenants"
          label="Sub-tenants"
          defaultValue={plan.included_sub_tenants}
          hint="-1 = ∞"
        />
        <Field name="ai_credits" label="AI credits" defaultValue={plan.ai_credits} hint="-1 = ∞" />
        <Field name="trial_days" label="Trial days" defaultValue={plan.trial_days} hint="0 = none" />
      </div>

      {plan.features.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Features:</span>
          {plan.features.map((f) => (
            <Badge key={f} variant="secondary">
              {f}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={plan.active} className="size-4" />
          Active (offered to customers)
        </label>
        <div className="flex items-center gap-3">
          {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
          {state.ok ? (
            <span
              className={`text-sm ${state.sync === "failed" ? "text-amber-600" : "text-emerald-600"}`}
            >
              {state.sync === "synced"
                ? "Saved · Stripe price synced"
                : state.sync === "failed"
                  ? "Saved · Stripe sync failed"
                  : "Saved"}
            </span>
          ) : null}
          <SubmitButton variant="outline" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
      </div>
    </form>

    {plan.price != null && plan.price > 0 ? <SaleControls plan={plan} /> : null}
    </div>
  );
}

function SaleControls({ plan }: { plan: AdminPlan }) {
  const [state, action] = useActionState<PlanState, FormData>(setPlanSale, {});
  const onSale = saleIsActive(plan);
  const discounted = onSale ? Math.round(plan.price! * (1 - plan.sale_percent_off! / 100) * 100) / 100 : null;

  return (
    <div className="rounded-md border border-dashed p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Sale</span>
        {onSale ? (
          <Badge variant="success">
            {plan.sale_percent_off}% off → ${discounted}/mo
            {plan.sale_ends_at ? ` · ends ${new Date(plan.sale_ends_at).toLocaleDateString()}` : ""}
          </Badge>
        ) : (
          <Badge variant="muted">none</Badge>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <form action={action} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={plan.id} />
          <div className="space-y-1">
            <Label htmlFor={`sale_pct_${plan.id}`} className="text-xs text-muted-foreground">
              % off
            </Label>
            <Input
              id={`sale_pct_${plan.id}`}
              name="percent_off"
              type="number"
              min={1}
              max={90}
              defaultValue={plan.sale_percent_off ?? ""}
              placeholder="20"
              className="w-24"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`sale_ends_${plan.id}`} className="text-xs text-muted-foreground">
              Ends (optional)
            </Label>
            <Input
              id={`sale_ends_${plan.id}`}
              name="ends_at"
              type="date"
              defaultValue={plan.sale_ends_at ? plan.sale_ends_at.slice(0, 10) : ""}
              className="w-40"
            />
          </div>
          <SubmitButton variant="outline" pendingLabel="Saving…">
            {onSale ? "Update sale" : "Start sale"}
          </SubmitButton>
          {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
          {state.ok ? (
            <span className={`text-sm ${state.sync === "failed" ? "text-amber-600" : "text-emerald-600"}`}>
              {state.sync === "synced" ? "Sale live · coupon synced" : state.sync === "failed" ? "Saved · coupon sync failed" : "Sale live"}
            </span>
          ) : null}
        </form>
        {onSale ? (
          <form action={clearPlanSale}>
            <input type="hidden" name="id" value={plan.id} />
            <SubmitButton variant="outline" size="sm" pendingLabel="…">
              End sale
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
