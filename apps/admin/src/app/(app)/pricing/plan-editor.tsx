"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminPlan } from "@/lib/types";
import { clearPlanSale, type PlanState, setPlanSale, updatePlan } from "./actions";

// The gated capabilities a plan can include (value → label). Toggling these
// changes what the plan unlocks for customers immediately.
const FEATURE_CATALOG: [string, string][] = [
  ["audit", "Audit trail"],
  ["suppression", "Suppression & bounces"],
  ["threads", "Reply threads & inbox"],
  ["sequences", "Sequences & automation"],
  ["campaigns", "Campaigns & lists"],
  ["subtenants", "Sub-tenants (own domains)"],
  ["rbac", "Team roles (RBAC)"],
  ["proof", "Proof bundles"],
  ["dedicated_ip", "Dedicated IPs"],
  ["sso", "SSO / SAML"],
  ["residency", "Data residency"],
];
const FEATURE_LABEL: Record<string, string> = Object.fromEntries(FEATURE_CATALOG);

function saleIsActive(plan: AdminPlan): boolean {
  if (!plan.sale_percent_off || plan.sale_percent_off <= 0) return false;
  if (!plan.sale_ends_at) return true;
  return new Date(plan.sale_ends_at).getTime() > Date.now();
}

function cap(n: number): string {
  return n === -1 ? "∞" : n.toLocaleString();
}

/** Default to a clean, scannable read-only view; edit only when asked. */
export function PlanEditor({ plan }: { plan: AdminPlan }) {
  const [editing, setEditing] = useState(false);
  if (!editing) return <PlanSummary plan={plan} onEdit={() => setEditing(true)} />;
  return <PlanForm plan={plan} onClose={() => setEditing(false)} />;
}

function PlanSummary({ plan, onEdit }: { plan: AdminPlan; onEdit: () => void }) {
  const onSale = saleIsActive(plan);
  const discounted =
    onSale && plan.price != null
      ? Math.round(plan.price * (1 - plan.sale_percent_off! / 100) * 100) / 100
      : null;
  const money = plan.price == null ? "Custom" : plan.price === 0 ? "Free" : `$${plan.price}/mo`;

  const stats: [string, string][] = [
    ["Monthly emails", plan.monthly_quota.toLocaleString()],
    [
      "Overage",
      plan.overage_per_1000_cents ? `$${(plan.overage_per_1000_cents / 100).toFixed(2)}/1k` : "hard cap",
    ],
    ["Seats", cap(plan.seats)],
    ["Sub-tenants", cap(plan.included_sub_tenants)],
    ["Workspaces", cap(plan.workspace_limit)],
    ["AI credits", cap(plan.ai_credits)],
    ["Trial", plan.trial_days ? `${plan.trial_days} days` : "none"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xl font-semibold">{money}</span>
          {onSale ? (
            <span className="text-sm">
              <span className="text-muted-foreground line-through">${plan.price}</span>{" "}
              <span className="font-medium text-emerald-600">
                ${discounted} · {plan.sale_percent_off}% off
                {plan.sale_ends_at ? ` until ${new Date(plan.sale_ends_at).toLocaleDateString()}` : ""}
              </span>
            </span>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} className="shrink-0 gap-1.5">
          <Pencil className="size-3.5" /> Edit
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <div className="mb-1.5 text-xs text-muted-foreground">Included features</div>
        <div className="flex flex-wrap gap-1.5">
          {plan.features.length ? (
            plan.features.map((f) => (
              <Badge key={f} variant="secondary" className="font-normal">
                {FEATURE_LABEL[f] ?? f}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">Core only</span>
          )}
        </div>
      </div>
    </div>
  );
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

function PlanForm({ plan, onClose }: { plan: AdminPlan; onClose: () => void }) {
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
          <Field
            name="workspace_limit"
            label="Workspaces"
            defaultValue={plan.workspace_limit}
            hint="-1 = ∞"
          />
          <Field name="ai_credits" label="AI credits" defaultValue={plan.ai_credits} hint="-1 = ∞" />
          <Field name="trial_days" label="Trial days" defaultValue={plan.trial_days} hint="0 = none" />
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">
            Features — gated capabilities this plan unlocks
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {FEATURE_CATALOG.map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="features"
                  value={value}
                  defaultChecked={plan.features.includes(value)}
                  className="size-4"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

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
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {state.ok ? "Done" : "Cancel"}
            </Button>
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
