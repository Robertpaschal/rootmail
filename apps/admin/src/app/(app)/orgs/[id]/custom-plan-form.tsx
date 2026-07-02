"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomPlan } from "@/lib/types";
import {
  billCustomPlan,
  type BillState,
  type CustomPlanState,
  deactivateCustomPlan,
  saveCustomPlan,
} from "./actions";

const fieldClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type OpenLead = { id: string; label: string };

/** Present an existing bespoke plan as data first, with an Edit toggle; creating a
 * new one goes straight to the form (there's nothing to view yet). */
export function CustomPlanForm({
  orgId,
  plan,
  openLeads,
  hasStripeCustomer,
}: {
  orgId: string;
  plan: CustomPlan | null;
  openLeads: OpenLead[];
  hasStripeCustomer: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-5">
      {plan && !editing ? (
        <CustomPlanSummary plan={plan} onEdit={() => setEditing(true)} />
      ) : (
        <CustomPlanFields
          orgId={orgId}
          plan={plan}
          openLeads={openLeads}
          onCancel={plan ? () => setEditing(false) : undefined}
        />
      )}

      {plan ? <BillingControls orgId={orgId} plan={plan} hasStripeCustomer={hasStripeCustomer} /> : null}
    </div>
  );
}

function CustomPlanSummary({ plan, onEdit }: { plan: CustomPlan; onEdit: () => void }) {
  const cap = (n: number) => (n === -1 ? "∞" : n.toLocaleString());
  const stats: [string, string][] = [
    ["Price", `$${(plan.price_cents / 100).toLocaleString()}/${plan.interval === "year" ? "yr" : "mo"}`],
    ["Included emails", plan.monthly_quota.toLocaleString()],
    ["Overage / 1k", `$${(plan.overage_per_1000_cents / 100).toFixed(2)}`],
    ["Sub-tenants", cap(plan.included_sub_tenants)],
    ["Seats", cap(plan.seats)],
    ["AI credits", cap(plan.ai_credits)],
    ["Overage", plan.allow_overage ? "billed" : "hard cap"],
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{plan.name}</div>
          <div className="text-xs text-muted-foreground">Bespoke plan · edits apply immediately on save</div>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} className="shrink-0 gap-1.5">
          <Pencil className="size-3.5" /> Edit
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CustomPlanFields({
  orgId,
  plan,
  openLeads,
  onCancel,
}: {
  orgId: string;
  plan: CustomPlan | null;
  openLeads: OpenLead[];
  onCancel?: () => void;
}) {
  const [state, action] = useActionState<CustomPlanState, FormData>(saveCustomPlan, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan name" htmlFor="name">
          <Input id="name" name="name" required maxLength={80} defaultValue={plan?.name ?? ""} placeholder="Acme Enterprise" />
        </Field>
        <Field label="Price (USD)" htmlFor="price">
          <Input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={plan ? (plan.price_cents / 100).toString() : ""}
            placeholder="2000"
          />
        </Field>
        <Field label="Billing interval" htmlFor="interval">
          <select id="interval" name="interval" defaultValue={plan?.interval ?? "month"} className={fieldClass}>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
        </Field>
        <Field label="Included emails / mo" htmlFor="monthly_quota">
          <Input
            id="monthly_quota"
            name="monthly_quota"
            type="number"
            min="0"
            required
            defaultValue={plan?.monthly_quota?.toString() ?? ""}
            placeholder="5000000"
          />
        </Field>
        <Field label="Overage / 1,000 (USD)" htmlFor="overage_per_1000">
          <Input
            id="overage_per_1000"
            name="overage_per_1000"
            type="number"
            step="0.01"
            min="0"
            defaultValue={plan ? (plan.overage_per_1000_cents / 100).toString() : "0.40"}
          />
        </Field>
        <Field label="Sub-tenants (-1 = ∞)" htmlFor="included_sub_tenants">
          <Input
            id="included_sub_tenants"
            name="included_sub_tenants"
            type="number"
            min="-1"
            defaultValue={plan?.included_sub_tenants?.toString() ?? "-1"}
          />
        </Field>
        <Field label="Seats (-1 = ∞)" htmlFor="seats">
          <Input id="seats" name="seats" type="number" min="-1" defaultValue={plan?.seats?.toString() ?? "-1"} />
        </Field>
        <Field label="AI credits / mo (-1 = ∞)" htmlFor="ai_credits">
          <Input id="ai_credits" name="ai_credits" type="number" min="-1" defaultValue={plan?.ai_credits?.toString() ?? "-1"} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="allow_overage"
          defaultChecked={plan ? plan.allow_overage : true}
          className="size-4 rounded border-input"
        />
        Allow overage (bill the excess instead of hard-capping)
      </label>

      {!plan && openLeads.length > 0 ? (
        <Field label="Convert from lead (optional)" htmlFor="lead_id">
          <select id="lead_id" name="lead_id" defaultValue="" className={fieldClass}>
            <option value="">— none —</option>
            {openLeads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">{plan ? "Update plan" : "Create custom plan"}</SubmitButton>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {state.ok ? "Done" : "Cancel"}
          </Button>
        ) : null}
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state.ok ? (
          <p className="text-sm text-emerald-600">
            Saved
            {state.stripeSync && state.stripeSync !== "skipped" ? ` · Stripe ${state.stripeSync}` : ""}.
          </p>
        ) : null}
      </div>
    </form>
  );
}

function BillingControls({
  orgId,
  plan,
  hasStripeCustomer,
}: {
  orgId: string;
  plan: CustomPlan;
  hasStripeCustomer: boolean;
}) {
  const [bill, billAction] = useActionState<BillState, FormData>(billCustomPlan, {});

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="text-sm font-medium">Billing</div>
      <p className="text-xs text-muted-foreground">
        {plan.stripe_price_id
          ? `Stripe price ${plan.stripe_price_id}`
          : "No Stripe price yet — set the Stripe keys, then re-save the plan to create one."}
        {hasStripeCustomer ? "" : " · org has no Stripe customer yet"}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <form action={billAction}>
          <input type="hidden" name="orgId" value={orgId} />
          <SubmitButton variant="outline" pendingLabel="Provisioning…" disabled={!plan.stripe_price_id}>
            Send invoice (provision subscription)
          </SubmitButton>
        </form>
        <form action={deactivateCustomPlan}>
          <input type="hidden" name="orgId" value={orgId} />
          <SubmitButton variant="outline" pendingLabel="…">
            Deactivate
          </SubmitButton>
        </form>
        {bill.error ? <p className="text-sm text-destructive">{bill.error}</p> : null}
        {bill.ok ? (
          <p className="text-sm text-emerald-600">
            Subscription provisioned{bill.subscriptionId ? ` (${bill.subscriptionId})` : ""}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
