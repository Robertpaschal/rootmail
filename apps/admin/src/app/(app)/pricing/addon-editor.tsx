"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminAddon } from "@/lib/types";
import { clearAddonSale, type PlanState, setAddonSale, updateAddon } from "./actions";

function saleIsActive(a: AdminAddon): boolean {
  if (!a.sale_percent_off || a.sale_percent_off <= 0) return false;
  if (!a.sale_ends_at) return true;
  return new Date(a.sale_ends_at).getTime() > Date.now();
}

export function AddonEditor({ addon }: { addon: AdminAddon }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="border-b py-4 last:border-0">
      {editing ? (
        <AddonForm addon={addon} onClose={() => setEditing(false)} />
      ) : (
        <AddonSummary addon={addon} onEdit={() => setEditing(true)} />
      )}
    </div>
  );
}

function AddonSummary({ addon, onEdit }: { addon: AdminAddon; onEdit: () => void }) {
  const onSale = saleIsActive(addon);
  const discounted =
    onSale && addon.sale_percent_off
      ? Math.round(addon.unit_amount * (1 - addon.sale_percent_off / 100) * 100) / 100
      : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="min-w-[12rem] flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {addon.name}
          {!addon.active ? <Badge variant="muted">inactive</Badge> : null}
        </div>
        <div className="text-xs text-muted-foreground">{addon.description}</div>
      </div>
      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-xs text-muted-foreground">Price</span>{" "}
          {onSale ? (
            <>
              <span className="text-muted-foreground line-through">${addon.unit_amount}</span>{" "}
              <span className="font-medium text-emerald-600">${discounted}/mo</span>
            </>
          ) : (
            <span className="font-medium tabular-nums">${addon.unit_amount}/mo</span>
          )}
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Grant/unit</span>{" "}
          <span className="font-medium tabular-nums">{addon.grant}</span>
        </div>
        {onSale ? <Badge variant="success">{addon.sale_percent_off}% off</Badge> : null}
      </div>
      <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
        <Pencil className="size-3.5" /> Edit
      </Button>
    </div>
  );
}

function AddonForm({ addon, onClose }: { addon: AdminAddon; onClose: () => void }) {
  const [state, action] = useActionState<PlanState, FormData>(updateAddon, {});
  return (
    <div>
      <form action={action} className="flex flex-wrap items-end gap-4">
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
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {state.ok ? "Done" : "Cancel"}
          </Button>
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
      <AddonSaleControls addon={addon} />
    </div>
  );
}

function AddonSaleControls({ addon }: { addon: AdminAddon }) {
  const [state, action] = useActionState<PlanState, FormData>(setAddonSale, {});
  const onSale = saleIsActive(addon);
  const discounted =
    onSale && addon.sale_percent_off
      ? Math.round(addon.unit_amount * (1 - addon.sale_percent_off / 100) * 100) / 100
      : null;

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-dashed p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Sale</span>
        {onSale ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {addon.sale_percent_off}% off → ${discounted}/mo
            {addon.sale_ends_at ? ` · ends ${new Date(addon.sale_ends_at).toLocaleDateString()}` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">none</span>
        )}
      </div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={addon.id} />
        <div className="space-y-1">
          <Label htmlFor={`asale_pct_${addon.id}`} className="text-xs text-muted-foreground">
            % off
          </Label>
          <Input
            id={`asale_pct_${addon.id}`}
            name="percent_off"
            type="number"
            min={1}
            max={90}
            defaultValue={addon.sale_percent_off ?? ""}
            placeholder="20"
            className="w-20"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`asale_ends_${addon.id}`} className="text-xs text-muted-foreground">
            Ends (optional)
          </Label>
          <Input
            id={`asale_ends_${addon.id}`}
            name="ends_at"
            type="date"
            defaultValue={addon.sale_ends_at ? addon.sale_ends_at.slice(0, 10) : ""}
            className="w-36"
          />
        </div>
        <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">
          {onSale ? "Update" : "Start sale"}
        </SubmitButton>
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        {state.ok ? (
          <span className={`text-sm ${state.sync === "failed" ? "text-amber-600" : "text-emerald-600"}`}>
            {state.sync === "synced" ? "Sale live · synced" : state.sync === "failed" ? "Saved · sync failed" : "Sale live"}
          </span>
        ) : null}
      </form>
      {onSale ? (
        <form action={clearAddonSale}>
          <input type="hidden" name="id" value={addon.id} />
          <SubmitButton variant="outline" size="sm" pendingLabel="…">
            End sale
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
